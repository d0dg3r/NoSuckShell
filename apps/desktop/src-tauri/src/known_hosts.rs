//! Known-hosts file management: list, add, remove entries, and fingerprint calculation.

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostEntry {
    pub line_number: usize,
    pub hostnames: String,
    pub key_type: String,
    pub key_fingerprint: String,
    pub is_hashed: bool,
    pub raw_line: String,
}

fn effective_known_hosts_path() -> PathBuf {
    crate::ssh_home::effective_ssh_dir()
        .map(|d| d.join("known_hosts"))
        .unwrap_or_else(|_| PathBuf::from(".ssh/known_hosts"))
}

fn sha256_fingerprint(key_b64: &str) -> String {
    let Ok(raw) = BASE64.decode(key_b64.trim()) else {
        return String::from("(invalid base64)");
    };
    let hash = Sha256::digest(&raw);
    let encoded = BASE64.encode(hash).trim_end_matches('=').to_string();
    format!("SHA256:{encoded}")
}

fn parse_known_hosts_line(line_number: usize, raw: &str) -> Option<KnownHostEntry> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    // Marker lines: @cert-authority / @revoked prefix
    let working = if trimmed.starts_with('@') {
        trimmed.splitn(2, ' ').nth(1).unwrap_or(trimmed)
    } else {
        trimmed
    };
    let parts: Vec<&str> = working.splitn(3, ' ').collect();
    if parts.len() < 3 {
        return None;
    }
    let hostnames = parts[0].to_string();
    let key_type = parts[1].to_string();
    let key_b64 = parts[2].split_whitespace().next().unwrap_or("");
    let is_hashed = hostnames.starts_with("|1|");
    let key_fingerprint = sha256_fingerprint(key_b64);

    Some(KnownHostEntry {
        line_number,
        hostnames,
        key_type,
        key_fingerprint,
        is_hashed,
        raw_line: raw.to_string(),
    })
}

pub fn list_entries() -> Result<(String, Vec<KnownHostEntry>), String> {
    let path = effective_known_hosts_path();
    let path_display = path.to_string_lossy().into_owned();
    if !path.is_file() {
        return Ok((path_display, Vec::new()));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let entries: Vec<KnownHostEntry> = content
        .lines()
        .enumerate()
        .filter_map(|(i, line)| parse_known_hosts_line(i + 1, line))
        .collect();
    Ok((path_display, entries))
}

pub fn remove_line(line_number: usize) -> Result<(), String> {
    let path = effective_known_hosts_path();
    if !path.is_file() {
        return Err(format!("File not found: {}", path.display()));
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let lines: Vec<&str> = content.lines().collect();
    if line_number == 0 || line_number > lines.len() {
        return Err(format!(
            "Line {line_number} out of range (file has {} lines).",
            lines.len()
        ));
    }
    let mut out: Vec<&str> = Vec::with_capacity(lines.len());
    for (i, line) in lines.iter().enumerate() {
        if i + 1 != line_number {
            out.push(line);
        }
    }
    let mut result = out.join("\n");
    if content.ends_with('\n') && !result.is_empty() {
        result.push('\n');
    }
    fs::write(&path, &result)
        .map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

/// Removes entries by hostname using `ssh-keygen -R` across user and system known_hosts files.
pub fn remove_by_host(hosts: Vec<String>) -> Result<(), String> {
    let kh_path = effective_known_hosts_path();
    let mut paths_to_clean: Vec<PathBuf> = vec![kh_path];
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
                .args(["-R", host.as_str(), "-f", &kh.to_string_lossy()])
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

/// Appends a properly formatted entry to the user's known_hosts file.
pub fn add_entry(hostname: &str, port: u16, key_type: &str, key_base64: &str) -> Result<(), String> {
    let path = effective_known_hosts_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create directory {}: {e}", parent.display()))?;
    }
    let host_field = if port == 22 {
        hostname.to_string()
    } else {
        format!("[{hostname}]:{port}")
    };
    let line = format!("{host_field} {key_type} {key_base64}\n");
    let mut content = if path.is_file() {
        fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read {}: {e}", path.display()))?
    } else {
        String::new()
    };
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&line);
    fs::write(&path, &content)
        .map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_entry() {
        let line = "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
        let entry = parse_known_hosts_line(1, line).expect("should parse");
        assert_eq!(entry.hostnames, "github.com");
        assert_eq!(entry.key_type, "ssh-ed25519");
        assert!(!entry.is_hashed);
        assert!(entry.key_fingerprint.starts_with("SHA256:"));
        assert_eq!(entry.line_number, 1);
    }

    #[test]
    fn parses_hashed_entry() {
        let line = "|1|abc=|def= ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQ==";
        let entry = parse_known_hosts_line(5, line).expect("should parse");
        assert!(entry.is_hashed);
        assert_eq!(entry.key_type, "ssh-rsa");
        assert_eq!(entry.line_number, 5);
    }

    #[test]
    fn skips_comments_and_empty() {
        assert!(parse_known_hosts_line(1, "").is_none());
        assert!(parse_known_hosts_line(1, "# comment").is_none());
        assert!(parse_known_hosts_line(1, "   ").is_none());
    }

    #[test]
    fn fingerprint_matches_known_format() {
        let fp = sha256_fingerprint("AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl");
        assert!(fp.starts_with("SHA256:"));
        assert!(!fp.contains('='));
    }

    #[test]
    fn parses_multi_hostname_entry() {
        let line = "host1,host2,192.168.1.1 ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY=";
        let entry = parse_known_hosts_line(3, line).expect("should parse");
        assert_eq!(entry.hostnames, "host1,host2,192.168.1.1");
        assert_eq!(entry.key_type, "ecdsa-sha2-nistp256");
    }

    #[test]
    fn parses_marker_line() {
        let line = "@cert-authority *.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
        let entry = parse_known_hosts_line(1, line).expect("should parse marker line");
        assert_eq!(entry.hostnames, "*.example.com");
        assert_eq!(entry.key_type, "ssh-ed25519");
    }
}
