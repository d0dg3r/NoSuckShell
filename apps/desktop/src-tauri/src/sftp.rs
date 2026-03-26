//! SFTP directory listing over direct TCP (libssh2). ProxyJump / ProxyCommand are not supported yet.
use crate::quick_ssh::{normalize_quick_ssh_request, QuickSshSessionRequest};
use crate::secure_store::resolve_host_config_for_session;
use crate::ssh_config::HostConfig;
use serde::{Deserialize, Serialize};
use ssh2::{OpenFlags, OpenType, RenameFlags, Session};
use std::fs;
use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Cap in-memory upload size (remote file browser transfer).
const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;

/// Max UTF-8 byte length for in-app text editor read/write (local + SFTP).
pub const MAX_EDITOR_TEXT_BYTES: u64 = 5 * 1024 * 1024;

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
    let user = stat.uid.map_or_else(|| "-".into(), |u| u.to_string());
    let group = stat.gid.map_or_else(|| "-".into(), |g| g.to_string());
    (mode, user, group, octal)
}

#[cfg(unix)]
fn uid_to_name(uid: u32) -> String {
    use std::ffi::CStr;
    let mut buf = vec![0u8; 1024];
    let mut pwd: libc::passwd = unsafe { std::mem::zeroed() };
    let mut result: *mut libc::passwd = std::ptr::null_mut();
    let rc = unsafe {
        libc::getpwuid_r(uid, &mut pwd, buf.as_mut_ptr() as *mut libc::c_char, buf.len(), &mut result)
    };
    if rc == 0 && !result.is_null() {
        if let Ok(name) = unsafe { CStr::from_ptr(pwd.pw_name) }.to_str() {
            return name.to_owned();
        }
    }
    uid.to_string()
}

#[cfg(unix)]
fn gid_to_name(gid: u32) -> String {
    use std::ffi::CStr;
    let mut buf = vec![0u8; 1024];
    let mut grp: libc::group = unsafe { std::mem::zeroed() };
    let mut result: *mut libc::group = std::ptr::null_mut();
    let rc = unsafe {
        libc::getgrgid_r(gid, &mut grp, buf.as_mut_ptr() as *mut libc::c_char, buf.len(), &mut result)
    };
    if rc == 0 && !result.is_null() {
        if let Ok(name) = unsafe { CStr::from_ptr(grp.gr_name) }.to_str() {
            return name.to_owned();
        }
    }
    gid.to_string()
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
    let user = uid_to_name(meta.uid());
    let group = gid_to_name(meta.gid());
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

/// Loads the same host key sources OpenSSH uses by default: user `known_hosts` (+ legacy
/// `known_hosts2`), then system `ssh_known_hosts` (+ `ssh_known_hosts2` on Unix, or
/// `%ProgramData%\ssh\ssh_known_hosts` on Windows). Multiple `read_file` calls merge into one set.
fn load_known_hosts_for_verify(kh: &mut ssh2::KnownHosts) {
    let mut load = |path: &Path| {
        if path.is_file() {
            let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
        }
    };

    load(&effective_known_hosts_path());
    if let Ok(dir) = crate::ssh_home::effective_ssh_dir() {
        load(&dir.join("known_hosts2"));
    }
    #[cfg(unix)]
    {
        load(Path::new("/etc/ssh/ssh_known_hosts"));
        load(Path::new("/etc/ssh/ssh_known_hosts2"));
    }
    #[cfg(windows)]
    {
        if let Ok(pd) = std::env::var("ProgramData") {
            let t = pd.trim();
            if !t.is_empty() {
                load(&Path::new(t).join("ssh").join("ssh_known_hosts"));
            }
        }
    }
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

/// Host name variants to try against OpenSSH `known_hosts` (order matters).
fn known_hosts_check_candidates(host_name: &str, host_alias: &str, connected_ip: &str) -> Vec<String> {
    let hn = host_name.trim().to_string();
    let al = host_alias.trim().to_string();
    let ip = connected_ip.trim().to_string();
    let mut out: Vec<String> = Vec::new();
    if !hn.is_empty() {
        out.push(hn);
    }
    if !al.is_empty() && !out.contains(&al) {
        out.push(al);
    }
    if !ip.is_empty() && !out.contains(&ip) {
        let is_v6 = ip
            .parse::<std::net::IpAddr>()
            .map(|a| a.is_ipv6())
            .unwrap_or(false);
        out.push(ip.clone());
        if is_v6 {
            let bracketed = format!("[{ip}]");
            if !out.contains(&bracketed) {
                out.push(bracketed);
            }
        }
    }
    out
}

/// Prefix for structured host-key mismatch errors; the frontend detects this and offers interactive
/// resolution. Everything after the prefix is a JSON `KnownHostMismatchPayload`.
const KNOWN_HOST_MISMATCH_PREFIX: &str = "KNOWN_HOST_MISMATCH:";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostConflictLine {
    pub host_label: String,
    pub line_number: usize,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostMismatchPayload {
    pub mismatched_hosts: Vec<String>,
    pub known_hosts_path: String,
    pub conflicting_lines: Vec<KnownHostConflictLine>,
}

/// Searches user + global `known_hosts` files for lines matching the given hostnames. Runs
/// `ssh-keygen -F <host>` for each name to support both plain-text and hashed entries.
fn find_conflicting_known_host_lines(hosts: &[String]) -> Vec<KnownHostConflictLine> {
    let mut out: Vec<KnownHostConflictLine> = Vec::new();
    for host in hosts {
        let Ok(output) = std::process::Command::new("ssh-keygen")
            .args(["-F", host.as_str()])
            .output()
        else {
            continue;
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut pending_line_number: Option<usize> = None;
        for raw_line in stdout.lines() {
            if let Some(rest) = raw_line.strip_prefix("# Host ") {
                if let Some(pos) = rest.rfind(" found: line ") {
                    if let Ok(n) = rest[pos + " found: line ".len()..].trim().parse::<usize>() {
                        pending_line_number = Some(n);
                    }
                }
                continue;
            }
            if raw_line.starts_with('#') || raw_line.trim().is_empty() {
                continue;
            }
            out.push(KnownHostConflictLine {
                host_label: host.clone(),
                line_number: pending_line_number.unwrap_or(0),
                content: raw_line.to_string(),
            });
            pending_line_number = None;
        }
    }
    out
}

/// Verifies the server host key like OpenSSH: loads user + system known-hosts files, then tries
/// `HostName`, the config `Host` alias when distinct, and the resolved peer IP (and `[ipv6]` form).
fn verify_known_host(
    sess: &Session,
    host_name: &str,
    port: u16,
    host_alias: &str,
    connected_peer_ip: &str,
) -> Result<(), String> {
    let Some((key_data, _key_type)) = sess.host_key() else {
        return Err("Server sent no host key.".to_string());
    };
    let mut known_hosts = sess.known_hosts().map_err(|e| format!("known_hosts: {e}"))?;
    load_known_hosts_for_verify(&mut known_hosts);
    let host_to_check = host_name.trim();
    let candidates = known_hosts_check_candidates(host_name, host_alias, connected_peer_ip);
    let mut mismatch_labels: Vec<String> = Vec::new();

    for name in &candidates {
        match known_hosts.check_port(name.as_str(), port, key_data) {
            ssh2::CheckResult::Match => {
                return Ok(());
            }
            ssh2::CheckResult::Mismatch => {
                mismatch_labels.push(name.clone());
            }
            ssh2::CheckResult::Failure => {
                return Err("Host key verification failed.".to_string());
            }
            ssh2::CheckResult::NotFound => {}
        }
    }

    if !mismatch_labels.is_empty() {
        let kh_path = effective_known_hosts_path()
            .to_string_lossy()
            .into_owned();
        let conflicting_lines = find_conflicting_known_host_lines(&mismatch_labels);
        let payload = KnownHostMismatchPayload {
            mismatched_hosts: mismatch_labels,
            known_hosts_path: kh_path,
            conflicting_lines,
        };
        if let Ok(json) = serde_json::to_string(&payload) {
            return Err(format!("{KNOWN_HOST_MISMATCH_PREFIX}{json}"));
        }
        return Err("Host key mismatch. Remove stale entries from known_hosts.".to_string());
    }
    Err(format!(
        "Host key for {host_to_check} is not in known_hosts. Connect once in the terminal and accept the key, then try again."
    ))
}

/// Removes entries for each hostname from every known_hosts file OpenSSH would consult.
pub fn remove_known_host_entries(hosts: Vec<String>) -> Result<(), String> {
    let kh_path = effective_known_hosts_path();
    let mut paths_to_clean: Vec<std::path::PathBuf> = vec![kh_path];
    if let Ok(dir) = crate::ssh_home::effective_ssh_dir() {
        let kh2 = dir.join("known_hosts2");
        if kh2.is_file() {
            paths_to_clean.push(kh2);
        }
    }
    #[cfg(unix)]
    {
        let g = Path::new("/etc/ssh/ssh_known_hosts");
        if g.is_file() {
            paths_to_clean.push(g.to_path_buf());
        }
    }
    let mut errors: Vec<String> = Vec::new();
    for host in &hosts {
        for kh in &paths_to_clean {
            let res = std::process::Command::new("ssh-keygen")
                .args([
                    "-R",
                    host.as_str(),
                    "-f",
                    &kh.to_string_lossy(),
                ])
                .output();
            match res {
                Ok(out) if !out.status.success() => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    if !stderr.trim().is_empty() {
                        errors.push(format!("{host} ({}): {}", kh.display(), stderr.trim()));
                    }
                }
                Err(e) => {
                    errors.push(format!("{host}: {e}"));
                }
                _ => {}
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
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
    let peer_ip = addr.ip().to_string();
    let tcp = TcpStream::connect_timeout(&addr, crate::app_prefs::connect_timeout_duration())
        .map_err(|e| format!("TCP connect to {addr_label}: {e}"))?;
    let _ = tcp.set_read_timeout(Some(std::time::Duration::from_secs(60)));
    let _ = tcp.set_write_timeout(Some(std::time::Duration::from_secs(60)));

    let mut sess = Session::new().map_err(|e| format!("SSH session: {e}"))?;
    sess.set_tcp_stream(tcp);
    sess.set_timeout(crate::app_prefs::libssh2_session_timeout_ms());
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {e}"))?;
    verify_known_host(&sess, host_name, host.port, &host.host, &peer_ip)?;
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

/// How aggressively to remove a file or directory tree (used by file-pane recovery flows).
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeleteEntryMode {
    Strict,
    BestEffort,
    ChmodOwnerWritableThenStrict,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePathFailure {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTreeResult {
    pub completed_fully: bool,
    pub failures: Vec<DeletePathFailure>,
    pub had_permission_denied: bool,
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

fn resolve_local_delete_target(parent_path_key: &str, name: &str) -> Result<PathBuf, String> {
    validate_entry_name(name)?;
    let dir = resolve_local_browser_path(parent_path_key.to_string())?;
    let target = dir.join(name.trim());
    let target = target
        .canonicalize()
        .map_err(|e| format!("Path: {e}"))?;
    if !target.starts_with(&dir) {
        return Err("Invalid path.".to_string());
    }
    Ok(target)
}

fn local_io_delete_err(e: io::Error, target: &Path) -> String {
    let p = target.to_string_lossy();
    if e.kind() == io::ErrorKind::PermissionDenied {
        format!(
            "Permission denied while deleting '{p}'. Use “Delete all I can” or “Make writable and retry” when offered."
        )
    } else {
        format!("Delete '{p}': {e}")
    }
}

fn delete_local_at_path_strict(target: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(target).map_err(|e| format!("Metadata: {e}"))?;
    if meta.is_dir() {
        fs::remove_dir_all(target)
            .map_err(|e| local_io_delete_err(e, target))?;
    } else {
        fs::remove_file(target)
            .map_err(|e| local_io_delete_err(e, target))?;
    }
    Ok(())
}

#[cfg(unix)]
fn local_chmod_tree_owner_rw(root: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fn chmod_path(path: &Path, meta: &fs::Metadata) -> io::Result<()> {
        let mut perms = meta.permissions();
        let mode = perms.mode();
        let new_mode = if meta.is_dir() {
            mode | 0o700
        } else {
            mode | 0o600
        };
        perms.set_mode(new_mode);
        fs::set_permissions(path, perms)
    }
    fn walk(path: &Path) -> io::Result<()> {
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Ok(());
        }
        if meta.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                walk(&entry.path())?;
            }
        }
        let meta = fs::symlink_metadata(path)?;
        chmod_path(path, &meta)
    }
    walk(root)
}

fn delete_local_tree_best_effort(target: &Path) -> DeleteTreeResult {
    let mut failures: Vec<DeletePathFailure> = Vec::new();
    let mut had_permission_denied = false;
    remove_local_best_effort(target, &mut failures, &mut had_permission_denied);
    DeleteTreeResult {
        completed_fully: failures.is_empty(),
        failures,
        had_permission_denied,
    }
}

fn remove_local_best_effort(path: &Path, failures: &mut Vec<DeletePathFailure>, had_perm: &mut bool) {
    let path_str = path.to_string_lossy().into_owned();
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) => {
            if e.kind() == io::ErrorKind::PermissionDenied {
                *had_perm = true;
            }
            failures.push(DeletePathFailure {
                path: path_str,
                message: e.to_string(),
            });
            return;
        }
    };
    if meta.file_type().is_symlink() {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(e) => {
                if e.kind() == io::ErrorKind::PermissionDenied {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: e.to_string(),
                });
            }
        }
        return;
    }
    if meta.is_dir() {
        let read_dir = match fs::read_dir(path) {
            Ok(r) => r,
            Err(e) => {
                if e.kind() == io::ErrorKind::PermissionDenied {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: e.to_string(),
                });
                return;
            }
        };
        for entry in read_dir.flatten() {
            remove_local_best_effort(&entry.path(), failures, had_perm);
        }
        match fs::remove_dir(path) {
            Ok(()) => {}
            Err(e) => {
                if e.kind() == io::ErrorKind::PermissionDenied {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: e.to_string(),
                });
            }
        }
        return;
    }
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(e) => {
            if e.kind() == io::ErrorKind::PermissionDenied {
                *had_perm = true;
            }
            failures.push(DeletePathFailure {
                path: path_str,
                message: e.to_string(),
            });
        }
    }
}

pub fn delete_local_entry_with_mode(
    parent_path_key: String,
    name: String,
    mode: DeleteEntryMode,
) -> Result<DeleteTreeResult, String> {
    let target = resolve_local_delete_target(&parent_path_key, &name)?;
    match mode {
        DeleteEntryMode::Strict => {
            delete_local_at_path_strict(&target)?;
            Ok(DeleteTreeResult {
                completed_fully: true,
                failures: vec![],
                had_permission_denied: false,
            })
        }
        DeleteEntryMode::BestEffort => Ok(delete_local_tree_best_effort(&target)),
        DeleteEntryMode::ChmodOwnerWritableThenStrict => {
            #[cfg(unix)]
            {
                local_chmod_tree_owner_rw(&target).map_err(|e| format!("Could not adjust permissions: {e}"))?;
                delete_local_at_path_strict(&target)?;
                Ok(DeleteTreeResult {
                    completed_fully: true,
                    failures: vec![],
                    had_permission_denied: false,
                })
            }
            #[cfg(not(unix))]
            {
                Err("Adjusting Unix permissions for delete recovery is not supported on this platform.".to_string())
            }
        }
    }
}

pub fn delete_local_entry(parent_path_key: String, name: String) -> Result<(), String> {
    delete_local_entry_with_mode(parent_path_key, name, DeleteEntryMode::Strict).map(|_| ())
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

fn check_editor_text_content(content: &str) -> Result<(), String> {
    let n = content.len() as u64;
    if n > MAX_EDITOR_TEXT_BYTES {
        return Err(format!(
            "Content is larger than {} MiB; use an external editor for this file.",
            MAX_EDITOR_TEXT_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

fn resolve_local_file_under_parent(parent_path_key: &str, name: &str) -> Result<PathBuf, String> {
    validate_entry_name(name)?;
    let dir = resolve_local_browser_path(parent_path_key.to_string())?;
    if !dir.is_dir() {
        return Err("Parent is not a directory.".to_string());
    }
    let target = dir.join(name.trim());
    let target = target
        .canonicalize()
        .map_err(|e| format!("Path: {e}"))?;
    if !target.starts_with(&dir) {
        return Err("Invalid path.".to_string());
    }
    Ok(target)
}

/// Reads a regular file as UTF-8 text for the in-app editor. Rejects directories, oversize files, and invalid UTF-8.
pub fn read_local_text_file(parent_path_key: String, name: String) -> Result<String, String> {
    let target = resolve_local_file_under_parent(&parent_path_key, &name)?;
    let meta = fs::metadata(&target).map_err(|e| format!("Metadata: {e}"))?;
    if !meta.is_file() {
        return Err("Not a regular file.".to_string());
    }
    let len = meta.len();
    if len > MAX_EDITOR_TEXT_BYTES {
        return Err(format!(
            "File is larger than {} MiB; open it in an external editor.",
            MAX_EDITOR_TEXT_BYTES / 1024 / 1024
        ));
    }
    let cap = len as usize;
    let mut buf = Vec::with_capacity(cap.max(4096));
    let mut f = fs::File::open(&target).map_err(|e| format!("Open file: {e}"))?;
    f.read_to_end(&mut buf).map_err(|e| format!("Read file: {e}"))?;
    if buf.len() as u64 > MAX_EDITOR_TEXT_BYTES {
        return Err(format!(
            "File is larger than {} MiB; open it in an external editor.",
            MAX_EDITOR_TEXT_BYTES / 1024 / 1024
        ));
    }
    String::from_utf8(buf).map_err(|_| "File is not valid UTF-8 text.".to_string())
}

/// Overwrites an existing regular file with UTF-8 text.
pub fn write_local_text_file(parent_path_key: String, name: String, content: String) -> Result<(), String> {
    check_editor_text_content(&content)?;
    let target = resolve_local_file_under_parent(&parent_path_key, &name)?;
    let meta = fs::metadata(&target).map_err(|e| format!("Metadata: {e}"))?;
    if !meta.is_file() {
        return Err("Not a regular file.".to_string());
    }
    fs::write(&target, content.as_bytes()).map_err(|e| format!("Write file: {e}"))?;
    Ok(())
}

/// Creates a new regular file with UTF-8 text (fails if the name already exists).
pub fn create_local_text_file(parent_path_key: String, name: String, content: String) -> Result<(), String> {
    validate_entry_name(&name)?;
    check_editor_text_content(&content)?;
    let dir = resolve_local_browser_path(parent_path_key)?;
    if !dir.is_dir() {
        return Err("Parent is not a directory.".to_string());
    }
    let path = dir.join(name.trim());
    if path.exists() {
        return Err("A file or folder with that name already exists.".to_string());
    }
    fs::write(&path, content.as_bytes()).map_err(|e| format!("Create file: {e}"))?;
    Ok(())
}

fn sftp_error_suggests_permission_denied(msg: &str) -> bool {
    let m = msg.to_lowercase();
    m.contains("permission denied")
        || m.contains("permission_denied")
        || m.contains("eacces")
}

/// Deletes a remote file, symlink, or directory tree (`path` is absolute on the server).
fn sftp_remove_remote_tree_strict(sftp: &ssh2::Sftp, path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let stat = sftp
        .lstat(path)
        .map_err(|e| format!("Stat remote path '{path_str}': {e}"))?;

    if stat.file_type().is_symlink() {
        sftp
            .unlink(path)
            .map_err(|e| format!("Remove remote symlink '{path_str}': {e}"))?;
        return Ok(());
    }
    if stat.is_dir() {
        let rows = sftp
            .readdir(path)
            .map_err(|e| format!("Read remote directory '{path_str}': {e}"))?;
        for (full_path, _) in rows {
            let name = full_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name.is_empty() || name == "." || name == ".." {
                continue;
            }
            sftp_remove_remote_tree_strict(sftp, &full_path)?;
        }
        sftp
            .rmdir(path)
            .map_err(|e| format!("Remove remote directory '{path_str}': {e}"))?;
        return Ok(());
    }

    sftp
        .unlink(path)
        .map_err(|e| format!("Remove remote file '{path_str}': {e}"))?;
    Ok(())
}

fn sftp_remove_remote_tree_best_effort(sftp: &ssh2::Sftp, path: &Path) -> DeleteTreeResult {
    let mut failures = Vec::new();
    let mut had_permission_denied = false;
    sftp_remove_remote_tree_best_rec(sftp, path, &mut failures, &mut had_permission_denied);
    DeleteTreeResult {
        completed_fully: failures.is_empty(),
        failures,
        had_permission_denied,
    }
}

fn sftp_remove_remote_tree_best_rec(
    sftp: &ssh2::Sftp,
    path: &Path,
    failures: &mut Vec<DeletePathFailure>,
    had_perm: &mut bool,
) {
    let path_str = path.to_string_lossy().into_owned();
    let stat = match sftp.lstat(path) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("Stat remote path '{path_str}': {e}");
            if sftp_error_suggests_permission_denied(&msg) {
                *had_perm = true;
            }
            failures.push(DeletePathFailure {
                path: path_str,
                message: msg,
            });
            return;
        }
    };

    if stat.file_type().is_symlink() {
        match sftp.unlink(path) {
            Ok(()) => {}
            Err(e) => {
                let msg = format!("Remove remote symlink '{path_str}': {e}");
                if sftp_error_suggests_permission_denied(&msg) {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: msg,
                });
            }
        }
        return;
    }
    if stat.is_dir() {
        let rows = match sftp.readdir(path) {
            Ok(r) => r,
            Err(e) => {
                let msg = format!("Read remote directory '{path_str}': {e}");
                if sftp_error_suggests_permission_denied(&msg) {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: msg,
                });
                return;
            }
        };
        for (full_path, _) in rows {
            let name = full_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name.is_empty() || name == "." || name == ".." {
                continue;
            }
            sftp_remove_remote_tree_best_rec(sftp, &full_path, failures, had_perm);
        }
        match sftp.rmdir(path) {
            Ok(()) => {}
            Err(e) => {
                let msg = format!("Remove remote directory '{path_str}': {e}");
                if sftp_error_suggests_permission_denied(&msg) {
                    *had_perm = true;
                }
                failures.push(DeletePathFailure {
                    path: path_str,
                    message: msg,
                });
            }
        }
        return;
    }

    match sftp.unlink(path) {
        Ok(()) => {}
        Err(e) => {
            let msg = format!("Remove remote file '{path_str}': {e}");
            if sftp_error_suggests_permission_denied(&msg) {
                *had_perm = true;
            }
            failures.push(DeletePathFailure {
                path: path_str,
                message: msg,
            });
        }
    }
}

fn sftp_chmod_remote_tree(sftp: &ssh2::Sftp, path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let stat = sftp
        .lstat(path)
        .map_err(|e| format!("Stat remote path '{path_str}': {e}"))?;

    if stat.file_type().is_symlink() {
        return Ok(());
    }

    if stat.is_dir() {
        let rows = sftp
            .readdir(path)
            .map_err(|e| format!("Read remote directory '{path_str}': {e}"))?;
        for (full_path, _) in rows {
            let name = full_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name.is_empty() || name == "." || name == ".." {
                continue;
            }
            sftp_chmod_remote_tree(sftp, &full_path)?;
        }
    }

    let mode = if stat.is_dir() { 0o700_u32 } else { 0o600_u32 };
    let st = ssh2::FileStat {
        size: None,
        uid: None,
        gid: None,
        perm: Some(mode),
        mtime: None,
        atime: None,
    };
    sftp
        .setstat(path, st)
        .map_err(|e| format!("chmod remote '{path_str}': {e}"))?;
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

pub fn sftp_delete_entry_with_mode(
    spec: RemoteSshSpec,
    parent_path: String,
    name: String,
    mode: DeleteEntryMode,
) -> Result<DeleteTreeResult, String> {
    let remote_path = remote_child_path(&parent_path, &name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let path_ref = Path::new(&remote_path);

    match mode {
        DeleteEntryMode::Strict => {
            sftp_remove_remote_tree_strict(&sftp, path_ref)?;
            Ok(DeleteTreeResult {
                completed_fully: true,
                failures: vec![],
                had_permission_denied: false,
            })
        }
        DeleteEntryMode::BestEffort => Ok(sftp_remove_remote_tree_best_effort(&sftp, path_ref)),
        DeleteEntryMode::ChmodOwnerWritableThenStrict => {
            sftp_chmod_remote_tree(&sftp, path_ref)?;
            sftp_remove_remote_tree_strict(&sftp, path_ref).map_err(|e| {
                format!("{e} Remote chmod (owner read/write) was applied first; delete still failed.")
            })?;
            Ok(DeleteTreeResult {
                completed_fully: true,
                failures: vec![],
                had_permission_denied: false,
            })
        }
    }
}

pub fn sftp_delete_entry(spec: RemoteSshSpec, parent_path: String, name: String) -> Result<(), String> {
    sftp_delete_entry_with_mode(spec, parent_path, name, DeleteEntryMode::Strict).map(|_| ())
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

/// Reads a remote regular file as UTF-8 text for the in-app editor.
pub fn sftp_read_text_file(spec: RemoteSshSpec, parent_path: String, name: String) -> Result<String, String> {
    let remote_path = remote_child_path(&parent_path, &name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let remote_ref = Path::new(&remote_path);
    let mut remote_file = sftp
        .open(remote_ref)
        .map_err(|e| format!("Open remote file: {e}"))?;
    let stat = remote_file
        .stat()
        .map_err(|e| format!("Stat remote file: {e}"))?;
    if stat.is_dir() {
        return Err("Cannot edit a directory.".to_string());
    }
    let size = stat.size.unwrap_or(0);
    if size > MAX_EDITOR_TEXT_BYTES {
        return Err(format!(
            "File is larger than {} MiB; open it in an external editor.",
            MAX_EDITOR_TEXT_BYTES / 1024 / 1024
        ));
    }
    let cap = size as usize;
    let mut buf = Vec::with_capacity(cap.max(4096));
    let mut chunk = [0u8; 256 * 1024];
    loop {
        let n = remote_file
            .read(&mut chunk)
            .map_err(|e| format!("Read remote file: {e}"))?;
        if n == 0 {
            break;
        }
        if buf.len() as u64 + n as u64 > MAX_EDITOR_TEXT_BYTES {
            return Err(format!(
                "File is larger than {} MiB; open it in an external editor.",
                MAX_EDITOR_TEXT_BYTES / 1024 / 1024
            ));
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    String::from_utf8(buf).map_err(|_| "File is not valid UTF-8 text.".to_string())
}

/// Creates a new remote file with UTF-8 text (fails if the path already exists).
pub fn sftp_create_text_file(
    spec: RemoteSshSpec,
    parent_path: String,
    name: String,
    content: String,
) -> Result<(), String> {
    check_editor_text_content(&content)?;
    let remote_path = remote_child_path(&parent_path, &name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let remote_ref = Path::new(&remote_path);
    if sftp.lstat(remote_ref).is_ok() {
        return Err("A file or folder with that name already exists.".to_string());
    }
    let mut remote_file = sftp
        .open_mode(
            remote_ref,
            OpenFlags::WRITE | OpenFlags::EXCLUSIVE,
            0o644,
            OpenType::File,
        )
        .map_err(|e| format!("Create remote file: {e}"))?;
    remote_file
        .write_all(content.as_bytes())
        .map_err(|e| format!("Write remote file: {e}"))?;
    Ok(())
}

/// Overwrites an existing remote regular file with UTF-8 text.
pub fn sftp_write_text_file(
    spec: RemoteSshSpec,
    parent_path: String,
    name: String,
    content: String,
) -> Result<(), String> {
    check_editor_text_content(&content)?;
    let remote_path = remote_child_path(&parent_path, &name)?;
    let host = resolve_remote_spec(spec)?;
    let sess = connect_session(&host)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP subsystem: {e}"))?;
    let remote_ref = Path::new(&remote_path);
    let stat = sftp
        .lstat(remote_ref)
        .map_err(|e| format!("Stat remote file: {e}"))?;
    if stat.is_dir() {
        return Err("Cannot overwrite a directory.".to_string());
    }
    let mut remote_file = sftp
        .open_mode(
            remote_ref,
            OpenFlags::WRITE | OpenFlags::TRUNCATE,
            0o644,
            OpenType::File,
        )
        .map_err(|e| format!("Open remote file for write: {e}"))?;
    remote_file
        .write_all(content.as_bytes())
        .map_err(|e| format!("Write remote file: {e}"))?;
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
