//! Shared quick-connect request shape and normalization for SSH/SFTP.
use crate::host_metadata::StrictHostKeyPolicy;
use crate::ssh_config::HostConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickSshSessionRequest {
    #[serde(rename = "hostName")]
    pub host_name: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(rename = "identityFile", default)]
    pub identity_file: String,
    #[serde(rename = "proxyJump", default)]
    pub proxy_jump: String,
    #[serde(rename = "proxyCommand", default)]
    pub proxy_command: String,
    /// When set, overrides host-metadata `StrictHostKeyChecking` (Quick Connect has no saved host entry).
    #[serde(rename = "strictHostKeyPolicy", default)]
    pub strict_host_key_policy: Option<StrictHostKeyPolicy>,
}

pub fn normalize_quick_ssh_request(
    request: QuickSshSessionRequest,
) -> Result<(HostConfig, Option<StrictHostKeyPolicy>), String> {
    let host_name = request.host_name.trim();
    if host_name.is_empty() {
        return Err("HostName is required for quick connect.".to_string());
    }
    let port = request.port.unwrap_or(22);
    if port == 0 {
        return Err("Port must be between 1 and 65535.".to_string());
    }
    let user = request.user.trim();
    let host = HostConfig {
        host: format!("quick-{host_name}"),
        host_name: host_name.to_string(),
        user: user.to_string(),
        port,
        identity_file: request.identity_file.trim().to_string(),
        proxy_jump: request.proxy_jump.trim().to_string(),
        proxy_command: request.proxy_command.trim().to_string(),
    };
    Ok((host, request.strict_host_key_policy))
}
