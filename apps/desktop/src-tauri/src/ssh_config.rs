use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostConfig {
    pub host: String,
    #[serde(rename = "hostName")]
    pub host_name: String,
    pub user: String,
    pub port: u16,
    #[serde(rename = "identityFile")]
    pub identity_file: String,
    #[serde(rename = "proxyJump")]
    pub proxy_jump: String,
    #[serde(rename = "proxyCommand")]
    pub proxy_command: String,
}

fn empty_host(alias: String) -> HostConfig {
    HostConfig {
        host: alias,
        host_name: String::new(),
        user: String::new(),
        port: 22,
        identity_file: String::new(),
        proxy_jump: String::new(),
        proxy_command: String::new(),
    }
}

pub fn parse_hosts(content: &str) -> Vec<HostConfig> {
    let mut result = Vec::new();
    let mut current: Option<HostConfig> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("Host ").or_else(|| trimmed.strip_prefix("host ")) {
            if let Some(host) = current.take() {
                result.push(host);
            }
            let alias = rest.split_whitespace().next().unwrap_or("").trim();
            if alias.is_empty() || alias.contains('*') || alias.contains('?') {
                current = None;
                continue;
            }
            current = Some(empty_host(alias.to_string()));
            continue;
        }

        let Some(host) = current.as_mut() else {
            continue;
        };

        let mut parts = trimmed.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").trim().to_ascii_lowercase();
        let value = parts.next().unwrap_or("").trim().to_string();
        match key.as_str() {
            "hostname" => host.host_name = value,
            "user" => host.user = value,
            "port" => host.port = value.parse::<u16>().unwrap_or(22),
            "identityfile" => host.identity_file = value,
            "proxyjump" => host.proxy_jump = value,
            "proxycommand" => host.proxy_command = value,
            _ => {}
        }
    }

    if let Some(host) = current.take() {
        result.push(host);
    }
    result
}

/// Renders one `Host` stanza. Each `extra_line` should include its own newline or be a full logical line (e.g. `  # comment\n`).
pub fn render_single_host_stanza(host: &HostConfig, extra_lines: &[String]) -> String {
    let mut output = format!("Host {}\n", host.host);
    if !host.host_name.is_empty() {
        output.push_str(&format!("  HostName {}\n", host.host_name));
    }
    if !host.user.is_empty() {
        output.push_str(&format!("  User {}\n", host.user));
    }
    output.push_str(&format!("  Port {}\n", host.port));
    if !host.identity_file.is_empty() {
        output.push_str(&format!("  IdentityFile {}\n", host.identity_file));
    }
    if !host.proxy_jump.is_empty() {
        output.push_str(&format!("  ProxyJump {}\n", host.proxy_jump));
    }
    if !host.proxy_command.is_empty() {
        output.push_str(&format!("  ProxyCommand {}\n", host.proxy_command));
    }
    for line in extra_lines {
        output.push_str(line);
        if !line.ends_with('\n') {
            output.push('\n');
        }
    }
    output.push('\n');
    output
}

pub fn render_hosts(hosts: &[HostConfig]) -> String {
    let mut output = String::from("# Managed by NoSuckShell\n\n");
    for host in hosts {
        output.push_str(&render_single_host_stanza(host, &[]));
    }
    output
}

fn ssh_dir() -> anyhow::Result<PathBuf> {
    crate::ssh_home::effective_ssh_dir()
}

fn ssh_config_path() -> anyhow::Result<PathBuf> {
    Ok(ssh_dir()?.join("config"))
}

pub fn load_ssh_config_raw() -> anyhow::Result<String> {
    let path = ssh_config_path()?;
    if !path.exists() {
        return Ok(String::new());
    }
    Ok(fs::read_to_string(path)?)
}

pub fn load_hosts() -> anyhow::Result<Vec<HostConfig>> {
    let path = ssh_config_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path)?;
    Ok(parse_hosts(&content))
}

fn backup_existing_config(path: &PathBuf) -> anyhow::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .as_secs();
    let backup_name = format!("config.bak.{ts}");
    let backup_path = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("invalid config path"))?
        .join(backup_name);
    fs::copy(path, backup_path)?;
    Ok(())
}

fn write_hosts(hosts: &[HostConfig]) -> anyhow::Result<()> {
    let dir = ssh_dir()?;
    fs::create_dir_all(&dir)?;
    let path = ssh_config_path()?;
    backup_existing_config(&path)?;
    fs::write(path, render_hosts(hosts))?;
    Ok(())
}

pub fn write_ssh_config_raw(content: &str) -> anyhow::Result<()> {
    let dir = ssh_dir()?;
    fs::create_dir_all(&dir)?;
    let path = ssh_config_path()?;
    backup_existing_config(&path)?;
    fs::write(path, content)?;
    Ok(())
}

pub fn save_host_to_file(host: &HostConfig) -> anyhow::Result<()> {
    if host.host.trim().is_empty() {
        return Err(anyhow::anyhow!("Host alias is required"));
    }
    if host.host_name.trim().is_empty() {
        return Err(anyhow::anyhow!("HostName is required"));
    }

    let mut hosts = load_hosts()?;
    if let Some(existing) = hosts.iter_mut().find(|item| item.host == host.host) {
        *existing = host.clone();
    } else {
        hosts.push(host.clone());
    }
    hosts.sort_by(|a, b| a.host.cmp(&b.host));
    write_hosts(&hosts)?;
    Ok(())
}

pub fn delete_host_from_file(alias: &str) -> anyhow::Result<()> {
    let mut hosts = load_hosts()?;
    hosts.retain(|item| item.host != alias);
    write_hosts(&hosts)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_hosts, render_hosts, HostConfig};

    #[test]
    fn parses_basic_ssh_host_block() {
        let content = r#"
Host prod
  HostName 10.0.1.25
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  ProxyJump bastion
"#;

        let hosts = parse_hosts(content);
        assert_eq!(hosts.len(), 1);
        assert_eq!(
            hosts[0],
            HostConfig {
                host: "prod".to_string(),
                host_name: "10.0.1.25".to_string(),
                user: "deploy".to_string(),
                port: 2222,
                identity_file: "~/.ssh/id_ed25519".to_string(),
                proxy_jump: "bastion".to_string(),
                proxy_command: String::new(),
            }
        );
    }

    #[test]
    fn render_roundtrip_keeps_host_fields() {
        let hosts = vec![HostConfig {
            host: "db".to_string(),
            host_name: "db.internal".to_string(),
            user: "postgres".to_string(),
            port: 22,
            identity_file: "~/.ssh/id_db".to_string(),
            proxy_jump: String::new(),
            proxy_command: "ssh -W %h:%p jump".to_string(),
        }];

        let rendered = render_hosts(&hosts);
        let reparsed = parse_hosts(&rendered);
        assert_eq!(reparsed, hosts);
    }
}
