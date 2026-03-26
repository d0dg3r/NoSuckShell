//! HETZNER: Hetzner Cloud inventory using the Hetzner Cloud API (Bear Token auth).
//! Storage lives next to other NoSuckShell SSH-dir files; API secrets use the app master key when set.

use super::{HostEnrichContext, NssPlugin, PluginCapability, PluginManifest};
use crate::secure_store::{decrypt_with_app_master, try_encrypt_with_app_master};
use crate::ssh_config::HostConfig;
use crate::ssh_home::effective_ssh_dir;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;

pub const HETZNER_PLUGIN_ID: &str = "dev.nosuckshell.plugin.hetzner";

pub struct HetznerPlugin;

impl NssPlugin for HetznerPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: HETZNER_PLUGIN_ID.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            display_name: "Hetzner Cloud".to_string(),
            capabilities: vec![PluginCapability::SettingsUi, PluginCapability::HostMetadataEnricher],
        }
    }

    fn required_entitlement(&self) -> Option<&'static str> {
        Some("dev.nosuckshell.addon.hetzner")
    }

    fn enrich_host_config(&self, _host: &mut HostConfig, _ctx: &HostEnrichContext) -> Result<()> {
        Ok(())
    }

    fn invoke(&self, method: &str, arg: &Value) -> Result<Value> {
        match method {
            "listState" => Ok(list_state()?),
            "saveProject" => Ok(save_project(arg)?),
            "removeProject" => Ok(remove_project(arg)?),
            "setActiveProject" => Ok(set_active_project(arg)?),
            "fetchResources" => Ok(fetch_resources(arg)?),
            "serverAction" => Ok(server_action(arg)?),
            _ => anyhow::bail!("unknown method: {method}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ApiSecretEncrypted {
    ciphertext: String,
    salt: String,
    nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProject {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_token_plain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_token_encrypted: Option<ApiSecretEncrypted>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HetznerState {
    #[serde(default)]
    active_project_id: Option<String>,
    #[serde(default)]
    projects: HashMap<String, StoredProject>,
}

fn state_path() -> Result<std::path::PathBuf> {
    Ok(effective_ssh_dir()?.join("nosuckshell.hetzner.v1.json"))
}

fn load_state() -> Result<HetznerState> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(HetznerState::default());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let state: HetznerState = serde_json::from_str(&raw).context("parse hetzner state")?;
    Ok(state)
}

fn save_state(state: &HetznerState) -> Result<()> {
    let path = state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(state)?;
    fs::write(&path, &raw)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)?;
    }
    Ok(())
}

fn list_state() -> Result<Value> {
    let state = load_state()?;
    let mut projects_ui = Vec::new();
    for p in state.projects.values() {
        projects_ui.push(json!({
            "id": p.id,
            "name": p.name,
        }));
    }
    Ok(json!({
        "activeProjectId": state.active_project_id,
        "projects": projects_ui,
    }))
}

fn save_project(arg: &Value) -> Result<Value> {
    let mut state = load_state()?;
    let name = arg.get("name").and_then(|v| v.as_str()).unwrap_or("New Project").to_string();
    let token = arg.get("apiToken").and_then(|v| v.as_str()).unwrap_or("");
    let id = arg.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let (plain, encrypted) = if !token.is_empty() {
        match try_encrypt_with_app_master(token) {
            Some(Ok((ciphertext, salt, nonce))) => (None, Some(ApiSecretEncrypted { ciphertext, salt, nonce })),
            Some(Err(e)) => return Err(e),
            None => (Some(token.to_string()), None),
        }
    } else if let Some(existing) = state.projects.get(&id) {
        (existing.api_token_plain.clone(), existing.api_token_encrypted.clone())
    } else {
        anyhow::bail!("API token is required for new project");
    };

    state.projects.insert(id.clone(), StoredProject {
        id: id.clone(),
        name,
        api_token_plain: plain,
        api_token_encrypted: encrypted,
    });

    if state.active_project_id.is_none() {
        state.active_project_id = Some(id);
    }

    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

fn remove_project(arg: &Value) -> Result<Value> {
    let mut state = load_state()?;
    let id = arg.get("id").and_then(|v| v.as_str()).context("missing id")?;
    state.projects.remove(id);
    if state.active_project_id.as_deref() == Some(id) {
        state.active_project_id = state.projects.keys().next().cloned();
    }
    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

fn set_active_project(arg: &Value) -> Result<Value> {
    let mut state = load_state()?;
    let id = arg.get("id").and_then(|v| v.as_str()).context("missing id")?;
    if state.projects.contains_key(id) {
        state.active_project_id = Some(id.to_string());
        save_state(&state)?;
    }
    Ok(json!({ "ok": true }))
}

fn read_project_token(p: &StoredProject) -> Result<String> {
    if let Some(enc) = &p.api_token_encrypted {
        return decrypt_with_app_master(&enc.ciphertext, &enc.salt, &enc.nonce);
    }
    if let Some(t) = &p.api_token_plain {
        return Ok(t.clone());
    }
    anyhow::bail!("Missing API token for project {}", p.name)
}

fn fetch_resources(arg: &Value) -> Result<Value> {
    let state = load_state()?;
    let project_id = arg.get("projectId").and_then(|v| v.as_str())
        .or(state.active_project_id.as_deref());
    
    let Some(project_id) = project_id else {
        return Ok(json!({ "resources": [] }));
    };

    let project = state.projects.get(project_id).context("Project not found")?;
    let token = read_project_token(project)?;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let url = "https://api.hetzner.cloud/v1/servers";
    let response = client.get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::bail!("Hetzner API error: {} - {}", status, text);
    }

    let body: Value = response.json()?;
    let servers = body.get("servers").cloned().unwrap_or(json!([]));

    // Map Hetzner servers into a common resource format for the sidebar
    let mut resources = Vec::new();
    if let Some(arr) = servers.as_array() {
        for s in arr {
            let id = s.get("id").and_then(|v| v.as_u64()).unwrap_or(0).to_string();
            let name = s.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let status = s.get("status").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let ipv4 = s.get("public_net").and_then(|v| v.get("ipv4")).and_then(|v| v.get("ip")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let ipv6 = s.get("public_net").and_then(|v| v.get("ipv6")).and_then(|v| v.get("ip")).and_then(|v| v.as_str()).unwrap_or("").to_string();

            resources.push(json!({
                "type": "server",
                "id": id,
                "name": name,
                "status": status,
                "ip4": ipv4,
                "ip6": ipv6,
            }));
        }
    }

    Ok(json!({ "resources": resources }))
}

fn server_action(arg: &Value) -> Result<Value> {
    let state = load_state()?;
    let project_id = arg.get("projectId").and_then(|v| v.as_str())
        .or(state.active_project_id.as_deref())
        .context("no active project")?;
    
    let server_id = arg.get("serverId").and_then(|v| v.as_str()).context("missing serverId")?;
    let action = arg.get("action").and_then(|v| v.as_str()).context("missing action")?;

    let project = state.projects.get(project_id).context("Project not found")?;
    let token = read_project_token(project)?;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    // Hetzner actions: poweron, poweroff, reboot, reset, shutdown, ...
    let url = format!("https://api.hetzner.cloud/v1/servers/{server_id}/actions/{action}");
    let response = client.post(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::bail!("Hetzner API error: {} - {}", status, text);
    }

    Ok(json!({ "ok": true }))
}
