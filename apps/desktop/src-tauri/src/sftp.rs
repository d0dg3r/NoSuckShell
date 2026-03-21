//! SFTP directory listing over direct TCP (libssh2). ProxyJump / ProxyCommand are not supported yet.
use crate::quick_ssh::{normalize_quick_ssh_request, QuickSshSessionRequest};
use crate::secure_store::resolve_host_config_for_session;
use crate::ssh_config::HostConfig;
use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::fs;
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Cap in-memory download size (remote file browser transfer).
const MAX_DOWNLOAD_BYTES: u64 = 50 * 1024 * 1024;

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

fn normalize_remote_path(raw: &str) -> Result<String, String> {
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

fn connect_session(host: &HostConfig) -> Result<Session, String> {
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum RemoteSshSpec {
    Saved { host: HostConfig },
    Quick { request: QuickSshSessionRequest },
}

fn resolve_remote_spec(spec: RemoteSshSpec) -> Result<HostConfig, String> {
    match spec {
        RemoteSshSpec::Saved { host } => resolve_host_config_for_session(&host).map_err(|e| e.to_string()),
        RemoteSshSpec::Quick { request } => normalize_quick_ssh_request(request),
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
        out.push(SftpDirEntry {
            name,
            is_dir,
            size,
            mtime,
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

/// Copies a remote regular file into a directory under the user home (e.g. `Downloads`).
pub fn download_remote_file(
    spec: RemoteSshSpec,
    remote_file_path: String,
    dest_dir_under_home: String,
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

    let home = home_dir_strict()?;
    let home_canon = home.canonicalize().map_err(|e| format!("Home: {e}"))?;
    let sub = dest_dir_under_home.trim();
    let combined = if sub.is_empty() {
        home.clone()
    } else {
        let p = Path::new(sub);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            home.join(sub)
        }
    };
    if !combined.exists() {
        fs::create_dir_all(&combined).map_err(|e| format!("Create destination dir: {e}"))?;
    }
    let dest_dir = combined
        .canonicalize()
        .map_err(|e| format!("Destination directory: {e}"))?;
    if !dest_dir.starts_with(&home_canon) {
        return Err("Destination must stay inside your home directory.".to_string());
    }

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
    let size = stat.size.unwrap_or(0);
    if size > MAX_DOWNLOAD_BYTES {
        return Err(format!(
            "File is larger than {} MiB; download not supported in the browser yet.",
            MAX_DOWNLOAD_BYTES / 1024 / 1024
        ));
    }
    let cap = size as usize;
    let mut buf = Vec::with_capacity(cap.max(4096));
    remote_file
        .read_to_end(&mut buf)
        .map_err(|e| format!("Read remote file: {e}"))?;

    let local_path = dest_dir.join(file_name);
    fs::write(&local_path, &buf).map_err(|e| format!("Write local file: {e}"))?;
    Ok(local_path.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<i64>,
}

fn home_dir_strict() -> Result<PathBuf, String> {
    home::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())
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
        out.push(LocalDirEntry {
            name,
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
            mtime,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}
