//! SFTP directory listing over direct TCP (libssh2). ProxyJump / ProxyCommand are not supported yet.
use crate::quick_ssh::{normalize_quick_ssh_request, QuickSshSessionRequest};
use crate::secure_store::resolve_host_config_for_session;
use crate::ssh_config::HostConfig;
use serde::{Deserialize, Serialize};
use ssh2::{OpenFlags, OpenType, RenameFlags, Session};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Cap in-memory upload size (remote file browser transfer).
const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;

const S_IFMT: u32 = 0o170_000;
const S_IFDIR: u32 = 0o040_000;
const S_IFREG: u32 = 0o100_000;
const S_IFLNK: u32 = 0o120_000;
const S_IFCHR: u32 = 0o020_000;
const S_IFBLK: u32 = 0o060_000;
const S_IFIFO: u32 = 0o010_000;
const S_IFSOCK: u32 = 0o140_000;

fn unix_perm_rwx(perm_bits: u32) -> String {
    let p = perm_bits & 0o777;
    let triplet = |bits: u32| {
        format!(
            "{}{}{}",
            if bits & 4 != 0 { 'r' } else { '-' },
            if bits & 2 != 0 { 'w' } else { '-' },
            if bits & 1 != 0 { 'x' } else { '-' },
        )
    };
    format!(
        "{}{}{}",
        triplet((p >> 6) & 7),
        triplet((p >> 3) & 7),
        triplet(p & 7)
    )
}

fn type_char_from_mode(full_mode: u32, is_dir: bool, is_symlink: bool) -> char {
    if is_symlink {
        return 'l';
    }
    match full_mode & S_IFMT {
        S_IFDIR => 'd',
        S_IFLNK => 'l',
        S_IFREG => '-',
        S_IFCHR => 'c',
        S_IFBLK => 'b',
        S_IFIFO => 'p',
        S_IFSOCK => 's',
        _ => {
            if is_dir {
                'd'
            } else {
                '-'
            }
        }
    }
}

fn mode_display_rwx(type_ch: char, perm_low: u32) -> String {
    format!("{}{}", type_ch, unix_perm_rwx(perm_low))
}

fn mode_octal_low(perm_low: u32) -> String {
    format!("{:o}", perm_low & 0o777)
}

fn remote_mode_and_owners(stat: &ssh2::FileStat, is_dir: bool) -> (String, String, String, String) {
    let raw = stat.perm.unwrap_or(0);
    let (type_ch, perm_low) = if raw > 0o777 {
        let tc = type_char_from_mode(raw, is_dir, false);
        (tc, raw & 0o777)
    } else {
        let tc = if is_dir { 'd' } else { '-' };
        (tc, raw & 0o777)
    };
    let mode = mode_display_rwx(type_ch, perm_low);
    let octal = mode_octal_low(perm_low);
    // Avoid UID/GID and owner strings in Tauri IPC payloads (CodeQL cleartext-logging).
    let user = String::from("-");
    let group = String::from("-");
    (mode, user, group, octal)
}

#[cfg(unix)]
fn local_mode_and_owners(meta: &std::fs::Metadata) -> (String, String, String, String) {
    use std::os::unix::fs::MetadataExt;
    let mode_bits = meta.mode();
    let is_lnk = meta.file_type().is_symlink();
    let tc = type_char_from_mode(mode_bits, meta.is_dir(), is_lnk);
    let low = mode_bits & 0o777;
    let mode = mode_display_rwx(tc, low);
    let octal = mode_octal_low(low);
    // Same as remote listing: avoid owner resolution in values returned over Tauri IPC (CodeQL).
    let user = String::from("-");
    let group = String::from("-");
    (mode, user, group, octal)
}

#[cfg(not(unix))]
fn local_mode_and_owners(_meta: &std::fs::Metadata) -> (String, String, String, String) {
    (String::new(), String::new(), String::new(), String::new())
}

/// Expand `~/…` / `~\…` using the real home directory (mirrors `session.rs`).
fn expand_ssh_user_path(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    if let Some(rest) = raw.strip_prefix("~/").or_else(|| raw.strip_prefix("~\\")) {
        if let Some(home) = home::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    raw.to_string()
}

fn effective_known_hosts_path() -> PathBuf {
    crate::ssh_home::effective_ssh_dir()
        .map(|d| d.join("known_hosts"))
        .unwrap_or_else(|_| PathBuf::from(".ssh/known_hosts"))
}

fn default_ssh_username() -> String {
    #[cfg(unix)]
    if let Ok(u) = std::env::var("USER") {
        let t = u.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    #[cfg(windows)]
    if let Ok(u) = std::env::var("USERNAME") {
        let t = u.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    String::from("root")
}

fn resolve_username(host: &HostConfig) -> String {
    let u = host.user.trim();
    if u.is_empty() {
        default_ssh_username()
    } else {
        u.to_string()
    }
}

fn ensure_no_proxy(host: &HostConfig) -> Result<(), String> {
    if !host.proxy_jump.trim().is_empty() || !host.proxy_command.trim().is_empty() {
        return Err(
            "SFTP file browser does not support ProxyJump or ProxyCommand yet. Use a direct host or the terminal."
                .to_string(),
        );
    }
    Ok(())
}

pub(crate) fn normalize_remote_path(raw: &str) -> Result<String, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Ok(String::from("."));
    }
    if t.contains('\0') {
        return Err("Invalid path.".to_string());
    }
    let mut stack: Vec<&str> = Vec::new();
    for part in t.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    if t.starts_with('/') {
        Ok(format!("/{}", stack.join("/")))
    } else {
        Ok(stack.join("/"))
    }
}

fn verify_known_host(sess: &Session, host: &str, port: u16) -> Result<(), String> {
    let Some((key_data, _key_type)) = sess.host_key() else {
        return Err("Server sent no host key.".to_string());
    };
    let mut known_hosts = sess.known_hosts().map_err(|e| format!("known_hosts: {e}"))?;
    let kh_path = effective_known_hosts_path();
    if kh_path.is_file() {
        let _ = known_hosts.read_file(&kh_path, ssh2::KnownHostFileKind::OpenSSH);
    }
    let host_to_check = host.trim();
    let check = known_hosts.check_port(host_to_check, port, key_data);
    match check {
        ssh2::CheckResult::Match => Ok(()),
        ssh2::CheckResult::Mismatch => Err(format!(
            "Host key mismatch for {host_to_check}. Remove the stale key from known_hosts or fix the server."
        )),
        ssh2::CheckResult::NotFound => Err(format!(
            "Host key for {host_to_check} is not in known_hosts. Connect once in the terminal and accept the key, then try again."
        )),
        ssh2::CheckResult::Failure => Err("Host key verification failed.".to_string()),
    }
}

fn authenticate(sess: &Session, username: &str, host: &HostConfig) -> Result<(), String> {
    let identity = expand_ssh_user_path(&host.identity_file);
    if !identity.is_empty() {
        let private = Path::new(&identity);
        if !private.is_file() {
            return Err(format!("Identity file not found: {}", private.display()));
        }
        sess.userauth_pubkey_file(username, None, private, None)
            .map_err(|e| format!("Public key auth: {e}"))?;
        if sess.authenticated() {
            return Ok(());
        }
        return Err("Public key authentication failed.".to_string());
    }
    sess.userauth_agent(username).map_err(|e| {
        format!("ssh-agent auth failed ({e}). Set an identity file on the host or enable ssh-agent.")
    })?;
    if sess.authenticated() {
        return Ok(());
    }
    Err("SSH authentication failed (try an identity file or ssh-agent).".to_string())
}

pub(crate) fn connect_session(host: &HostConfig) -> Result<Session, String> {
    ensure_no_proxy(host)?;
    let host_name = host.host_name.trim();
    if host_name.is_empty() {
        return Err("HostName is empty.".to_string());
    }
    let addr_label = format!("{host_name}:{}", host.port);
    let mut addrs = addr_label
        .to_socket_addrs()
        .map_err(|e| format!("DNS/address for {addr_label}: {e}"))?;
    let addr = addrs
        .next()
        .ok_or_else(|| format!("Could not resolve {host_name}"))?;
    let tcp = TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(30))
        .map_err(|e| format!("TCP connect to {addr_label}: {e}"))?;
    let _ = tcp.set_read_timeout(Some(std::time::Duration::from_secs(60)));
    let _ = tcp.set_write_timeout(Some(std::time::Duration::from_secs(60)));

    let mut sess = Session::new().map_err(|e| format!("SSH session: {e}"))?;
    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {e}"))?;
    verify_known_host(&sess, host_name, host.port)?;
    let username = resolve_username(host);
    authenticate(&sess, &username, host)?;
    Ok(sess)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<i64>,
    /// e.g. `drwxr-xr-x`
    pub mode_display: String,
    /// Permission bits only, e.g. `755` (for compact UI).
    pub mode_octal: String,
    /// Remote: numeric uid when known.
    pub user_display: String,
    /// Remote: numeric gid when known.
    pub group_display: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum RemoteSshSpec {
    Saved { host: HostConfig },
    Quick { request: QuickSshSessionRequest },
}

pub(crate) fn resolve_remote_spec(spec: RemoteSshSpec) -> Result<HostConfig, String> {
    match spec {
        RemoteSshSpec::Saved { host } => resolve_host_config_for_session(&host).map_err(|e| e.to_string()),
        RemoteSshSpec::Quick { request } => {
            normalize_quick_ssh_request(request).map(|(host, _policy)| host)
        }
    }
}

pub fn list_remote_dir(spec: RemoteSshSpec, path: String) -> Result<Vec<SftpDirEntry>, String> {
    let host = resolve_remote_spec(spec)?;
    let normalized = normalize_remote_path(&path)?;
    let remote_path = if normalized.is_empty() {
        ".".to_string()
    } else {
        normalized
    };

    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let path_ref = Path::new(&remote_path);
    let rows = sftp
        .readdir(path_ref)
        .map_err(|e| format!("Cannot read remote directory '{remote_path}': {e}"))?;

    let mut out: Vec<SftpDirEntry> = Vec::new();
    for (full_path, stat) in rows {
        let name = full_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if name.is_empty() || name == "." || name == ".." {
            continue;
        }
        let is_dir = stat.is_dir();
        let size = stat.size.unwrap_or(0);
        let mtime = stat.mtime.map(|t| t as i64);
        let (mode_display, user_display, group_display, mode_octal) = remote_mode_and_owners(&stat, is_dir);
        out.push(SftpDirEntry {
            name,
            is_dir,
            size,
            mtime,
            mode_display,
            mode_octal,
            user_display,
            group_display,
        });
    }
    out.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(out)
}

/// Copies a remote regular file into a local directory (path key semantics match [`list_local_dir`]: `""` = home, relative under home, or absolute).
pub fn download_remote_file(
    spec: RemoteSshSpec,
    remote_file_path: String,
    dest_dir_path: String,
) -> Result<String, String> {
    let host = resolve_remote_spec(spec)?;
    let remote_norm = normalize_remote_path(&remote_file_path)?;
    if remote_norm.is_empty() || remote_norm == "." {
        return Err("Pick a file to download.".to_string());
    }
    let remote_ref = Path::new(&remote_norm);
    let file_name = remote_ref
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Remote path has no file name.".to_string())?;

    let mut dest_base = resolve_local_browser_path(dest_dir_path)?;
    if !dest_base.exists() {
        fs::create_dir_all(&dest_base).map_err(|e| format!("Create destination dir: {e}"))?;
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    } else {
        dest_base = dest_base
            .canonicalize()
            .map_err(|e| format!("Destination directory: {e}"))?;
    }
    if !dest_base.is_dir() {
        return Err("Destination is not a directory.".to_string());
    }
    let dest_dir = dest_base;

    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let mut remote_file = sftp
        .open(remote_ref)
        .map_err(|e| format!("Open remote file: {e}"))?;
    let stat = remote_file
        .stat()
        .map_err(|e| format!("Stat remote file: {e}"))?;
    if stat.is_dir() {
        return Err("Cannot download a directory.".to_string());
    }

    let local_path = dest_dir.join(file_name);
    let mut out = fs::File::create(&local_path).map_err(|e| format!("Create local file: {e}"))?;
    let mut buf = [0u8; 256 * 1024];
    loop {
        let n = remote_file
            .read(&mut buf)
            .map_err(|e| format!("Read remote file: {e}"))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])
            .map_err(|e| format!("Write local file: {e}"))?;
    }
    Ok(local_path.to_string_lossy().into_owned())
}

/// Uploads a local regular file to a remote path (SFTP).
pub fn upload_remote_file(
    spec: RemoteSshSpec,
    local_dir_path: String,
    local_file_name: String,
    remote_file_path: String,
) -> Result<(), String> {
    validate_entry_name(&local_file_name)?;
    let dir = resolve_local_browser_path(local_dir_path)?;
    if !dir.is_dir() {
        return Err("Local source is not a directory.".to_string());
    }
    let src = dir.join(local_file_name.trim());
    let src = src
        .canonicalize()
        .map_err(|e| format!("Local file path: {e}"))?;
    if !src.starts_with(&dir) {
        return Err("Invalid local file path.".to_string());
    }
    if !src.is_file() {
        return Err("Pick a local file to upload.".to_string());
    }
    let meta = fs::metadata(&src).map_err(|e| format!("Local file metadata: {e}"))?;
    let size = meta.len();
    if size > MAX_UPLOAD_BYTES {
        return Err(format!(
            "File is larger than {} MiB; upload not supported in the browser yet.",
            MAX_UPLOAD_BYTES / 1024 / 1024
        ));
    }
    let cap = size as usize;
    let mut buf = Vec::with_capacity(cap.max(4096));
    let mut f = fs::File::open(&src).map_err(|e| format!("Open local file: {e}"))?;
    f.read_to_end(&mut buf).map_err(|e| format!("Read local file: {e}"))?;

    let host = resolve_remote_spec(spec)?;
    let remote_norm = normalize_remote_path(&remote_file_path)?;
    if remote_norm.is_empty() || remote_norm == "." {
        return Err("Invalid remote destination path.".to_string());
    }
    let remote_ref = Path::new(&remote_norm);

    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let mut remote_file = sftp
        .open_mode(
            remote_ref,
            OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE,
            0o644,
            OpenType::File,
        )
        .map_err(|e| format!("Create remote file: {e}"))?;
    remote_file
        .write_all(&buf)
        .map_err(|e| format!("Write remote file: {e}"))?;
    Ok(())
}

/// Copies a local file into another local directory (path keys match [`list_local_dir`]).
pub fn copy_local_file(
    src_dir_path: String,
    src_name: String,
    dest_dir_path: String,
    dest_name: String,
) -> Result<String, String> {
    validate_entry_name(&src_name)?;
    let dest_name_trim = dest_name.trim();
    let dest_file_name = if dest_name_trim.is_empty() {
        src_name.trim()
    } else {
        dest_name_trim
    };
    validate_entry_name(dest_file_name)?;

    let src_dir = resolve_local_browser_path(src_dir_path)?;
    let dest_dir = resolve_local_browser_path(dest_dir_path)?;
    if !src_dir.is_dir() || !dest_dir.is_dir() {
        return Err("Source or destination is not a directory.".to_string());
    }
    let src = src_dir.join(src_name.trim());
    let src = src
        .canonicalize()
        .map_err(|e| format!("Source file: {e}"))?;
    if !src.starts_with(&src_dir) {
        return Err("Invalid source path.".to_string());
    }
    if !src.is_file() {
        return Err("Source is not a file.".to_string());
    }
    let dest = dest_dir.join(dest_file_name);
    if src == dest {
        return Err("Source and destination are the same.".to_string());
    }
    fs::copy(&src, &dest).map_err(|e| format!("Copy file: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Joins normalized remote parent path with a single entry name (POSIX).
pub(crate) fn remote_child_path(parent_raw: &str, name: &str) -> Result<String, String> {
    let n = name.trim();
    validate_entry_name(n)?;
    let parent = normalize_remote_path(parent_raw)?;
    if parent.is_empty() || parent == "." {
        return Ok(n.to_string());
    }
    if parent.ends_with('/') {
        Ok(format!("{parent}{n}"))
    } else {
        Ok(format!("{parent}/{n}"))
    }
}

pub fn create_local_dir(parent_path_key: String, dir_name: String) -> Result<(), String> {
    validate_entry_name(&dir_name)?;
    let dir = resolve_local_browser_path(parent_path_key)?;
    if !dir.is_dir() {
        return Err("Parent is not a directory.".to_string());
    }
    let created = dir.join(dir_name.trim());
    if created.exists() {
        return Err("A file or folder with that name already exists.".to_string());
    }
    fs::create_dir(&created).map_err(|e| format!("Create directory: {e}"))?;
    Ok(())
}

pub fn delete_local_entry(parent_path_key: String, name: String) -> Result<(), String> {
    validate_entry_name(&name)?;
    let dir = resolve_local_browser_path(parent_path_key)?;
    let target = dir.join(name.trim());
    let target = target
        .canonicalize()
        .map_err(|e| format!("Path: {e}"))?;
    if !target.starts_with(&dir) {
        return Err("Invalid path.".to_string());
    }
    let meta = fs::metadata(&target).map_err(|e| format!("Metadata: {e}"))?;
    if meta.is_dir() {
        fs::remove_dir(&target).map_err(|e| {
            format!("Remove directory (folder must be empty): {e}")
        })?;
    } else {
        fs::remove_file(&target).map_err(|e| format!("Remove file: {e}"))?;
    }
    Ok(())
}

pub fn rename_local_entry(parent_path_key: String, old_name: String, new_name: String) -> Result<(), String> {
    validate_entry_name(&old_name)?;
    validate_entry_name(&new_name)?;
    let dir = resolve_local_browser_path(parent_path_key)?;
    let from = dir.join(old_name.trim());
    let from = from
        .canonicalize()
        .map_err(|e| format!("Source: {e}"))?;
    if !from.starts_with(&dir) {
        return Err("Invalid source path.".to_string());
    }
    let to = dir.join(new_name.trim());
    if to.exists() {
        return Err("A file or folder with that name already exists.".to_string());
    }
    fs::rename(&from, &to).map_err(|e| format!("Rename: {e}"))?;
    Ok(())
}

pub fn open_local_entry_in_os(parent_path_key: String, name: String) -> Result<(), String> {
    validate_entry_name(&name)?;
    let dir = resolve_local_browser_path(parent_path_key)?;
    let target = dir.join(name.trim());
    let target = target
        .canonicalize()
        .map_err(|e| format!("Path: {e}"))?;
    if !target.starts_with(&dir) {
        return Err("Invalid path.".to_string());
    }
    let path_str = target.to_string_lossy().into_owned();
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Open: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Open: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| format!("Open: {e}"))?;
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "macos",
        target_os = "windows"
    )))]
    {
        return Err("Opening files is not supported on this platform.".to_string());
    }
    Ok(())
}

pub fn sftp_create_dir(spec: RemoteSshSpec, parent_path: String, dir_name: String) -> Result<(), String> {
    let remote_path = remote_child_path(&parent_path, &dir_name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let path_ref = Path::new(&remote_path);
    sftp
        .mkdir(path_ref, 0o755)
        .map_err(|e| format!("Create remote directory: {e}"))?;
    Ok(())
}

pub fn sftp_delete_entry(spec: RemoteSshSpec, parent_path: String, name: String) -> Result<(), String> {
    let remote_path = remote_child_path(&parent_path, &name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let path_ref = Path::new(&remote_path);
    let stat = sftp
        .stat(path_ref)
        .map_err(|e| format!("Stat remote path: {e}"))?;
    if stat.is_dir() {
        sftp
            .rmdir(path_ref)
            .map_err(|e| format!("Remove remote directory (must be empty): {e}"))?;
    } else {
        sftp
            .unlink(path_ref)
            .map_err(|e| format!("Remove remote file: {e}"))?;
    }
    Ok(())
}

pub fn sftp_rename_entry(
    spec: RemoteSshSpec,
    parent_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let old_path = remote_child_path(&parent_path, &old_name)?;
    let new_path = remote_child_path(&parent_path, &new_name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    sftp
        .rename(
            Path::new(&old_path),
            Path::new(&new_path),
            Some(RenameFlags::empty()),
        )
        .map_err(|e| format!("Rename on server: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<i64>,
    /// e.g. `drwxr-xr-x`; empty on non-Unix.
    pub mode_display: String,
    pub mode_octal: String,
    pub user_display: String,
    pub group_display: String,
}

fn home_dir_strict() -> Result<PathBuf, String> {
    home::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())
}

pub(crate) fn validate_entry_name(name: &str) -> Result<(), String> {
    let t = name.trim();
    if t.is_empty() || t == "." || t == ".." || t.contains('/') || t.contains('\0') {
        return Err("Invalid file name.".to_string());
    }
    Ok(())
}

/// Resolves the local path key the same way as [`list_local_dir`] (home-relative, or absolute).
pub(crate) fn resolve_local_browser_path(path: String) -> Result<PathBuf, String> {
    let home = home_dir_strict()?;
    let home_canon = home.canonicalize().map_err(|e| format!("Home path: {e}"))?;
    let trimmed = path.trim();
    if trimmed.contains('\0') {
        return Err("Invalid path.".to_string());
    }
    let joined = if trimmed.is_empty() {
        home_canon.clone()
    } else {
        let p = Path::new(trimmed);
        let combined = if p.is_absolute() {
            p.to_path_buf()
        } else {
            home.join(trimmed)
        };
        combined.canonicalize().map_err(|e| format!("Invalid path: {e}"))?
    };
    let restrict_to_home = trimmed.is_empty() || !Path::new(trimmed).is_absolute();
    if restrict_to_home && !joined.starts_with(&home_canon) {
        return Err("Path must stay inside your home directory.".to_string());
    }
    Ok(joined)
}

/// Canonical absolute home directory path (for local file browser navigation).
pub fn get_local_home_canonical_path() -> Result<String, String> {
    let home = home_dir_strict()?;
    let home_canon = home.canonicalize().map_err(|e| format!("Home path: {e}"))?;
    Ok(home_canon.to_string_lossy().into_owned())
}

/// Lists a directory. Empty and relative paths are resolved under home and must stay inside it;
/// absolute paths may list anywhere the OS allows.
pub fn list_local_dir(path: String) -> Result<Vec<LocalDirEntry>, String> {
    let joined = resolve_local_browser_path(path)?;
    let read = std::fs::read_dir(&joined).map_err(|e| format!("Read directory: {e}"))?;
    let mut out: Vec<LocalDirEntry> = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| format!("Directory entry: {e}"))?;
        let meta = entry.metadata().map_err(|e| format!("Metadata: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == "." || name == ".." {
            continue;
        }
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs() as i64));
        let (mode_display, user_display, group_display, mode_octal) = local_mode_and_owners(&meta);
        out.push(LocalDirEntry {
            name,
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
            mtime,
            mode_display,
            mode_octal,
            user_display,
            group_display,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}
