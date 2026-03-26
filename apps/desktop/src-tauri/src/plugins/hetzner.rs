//! HETZNER: Hetzner Cloud inventory using the Hetzner Cloud API (Bearer Token auth).
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

const HETZNER_SERVER_ACTIONS: &[&str] = &[
    "poweron",
    "poweroff",
    "shutdown",
    "reboot",
    "reset",
    "rebuild",
    "enable_rescue",
    "disable_rescue",
    "request_console",
];

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
            "serverStatus" => Ok(server_status(arg)?),
            "serverAction" => Ok(server_action(arg)?),
            "requestConsole" => Ok(request_console(arg)?),
            "toggleFavorite" => Ok(toggle_favorite(arg)?),
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
    /// Per project: server IDs that are favorited.
    #[serde(default)]
    favorites: HashMap<String, Vec<String>>,
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
    let mut favorites_by_project = serde_json::Map::new();
    for (pid, keys) in &state.favorites {
        favorites_by_project.insert(pid.clone(), json!(keys));
    }
    Ok(json!({
        "activeProjectId": state.active_project_id,
        "projects": projects_ui,
        "favoritesByProject": favorites_by_project,
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
    state.favorites.remove(id);
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

fn hetzner_client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .context("build HTTP client")
}

fn map_server_json(s: &Value) -> Value {
    let id = s.get("id").and_then(|v| v.as_u64()).unwrap_or(0).to_string();
    let name = s.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
    let status = s.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
    let ipv4 = s.get("public_net")
        .and_then(|v| v.get("ipv4"))
        .and_then(|v| v.get("ip"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let ipv6 = s.get("public_net")
        .and_then(|v| v.get("ipv6"))
        .and_then(|v| v.get("ip"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let st = s.get("server_type");
    let server_type = st.and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("");
    let cores = st.and_then(|v| v.get("cores")).and_then(|v| v.as_u64()).unwrap_or(0);
    let memory_gb = st.and_then(|v| v.get("memory")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let disk_gb = st.and_then(|v| v.get("disk")).and_then(|v| v.as_u64()).unwrap_or(0);

    let datacenter = s.get("datacenter")
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let image = s.get("image")
        .and_then(|v| v.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let created = s.get("created").and_then(|v| v.as_str()).unwrap_or("");

    json!({
        "type": "server",
        "id": id,
        "name": name,
        "status": status,
        "ip4": ipv4,
        "ip6": ipv6,
        "serverType": server_type,
        "cores": cores,
        "memoryGb": memory_gb,
        "diskGb": disk_gb,
        "datacenter": datacenter,
        "image": image,
        "created": created,
    })
}

fn resolve_project<'a>(state: &'a HetznerState, arg: &Value) -> Result<(&'a StoredProject, String)> {
    let project_id = arg.get("projectId").and_then(|v| v.as_str())
        .or(state.active_project_id.as_deref())
        .context("no active project")?;
    let project = state.projects.get(project_id).context("Project not found")?;
    Ok((project, project_id.to_string()))
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
    let client = hetzner_client()?;

    let mut all_servers = Vec::new();
    let mut page = 1u32;
    loop {
        let url = format!("https://api.hetzner.cloud/v1/servers?page={page}&per_page=50");
        let response = client.get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .send()?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_default();
            anyhow::bail!("Hetzner API error: {} - {}", status, text);
        }

        let body: Value = response.json()?;
        let servers = body.get("servers").cloned().unwrap_or(json!([]));
        if let Some(arr) = servers.as_array() {
            if arr.is_empty() {
                break;
            }
            for s in arr {
                all_servers.push(map_server_json(s));
            }
        } else {
            break;
        }

        let last_page = body.get("meta")
            .and_then(|m| m.get("pagination"))
            .and_then(|p| p.get("last_page"))
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;
        if page >= last_page {
            break;
        }
        page += 1;
    }

    Ok(json!({ "resources": all_servers }))
}

fn server_status(arg: &Value) -> Result<Value> {
    let state = load_state()?;
    let (project, _pid) = resolve_project(&state, arg)?;
    let token = read_project_token(project)?;
    let server_id = arg.get("serverId").and_then(|v| v.as_str()).context("missing serverId")?;
    let client = hetzner_client()?;

    let url = format!("https://api.hetzner.cloud/v1/servers/{server_id}");
    let response = client.get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::bail!("Hetzner API error: {} - {}", status, text);
    }

    let body: Value = response.json()?;
    let server = body.get("server").context("missing server in response")?;
    Ok(json!({ "ok": true, "server": map_server_json(server) }))
}

fn server_action(arg: &Value) -> Result<Value> {
    let state = load_state()?;
    let (project, _pid) = resolve_project(&state, arg)?;
    let token = read_project_token(project)?;
    let server_id = arg.get("serverId").and_then(|v| v.as_str()).context("missing serverId")?;
    let action = arg.get("action").and_then(|v| v.as_str()).context("missing action")?;

    if !HETZNER_SERVER_ACTIONS.contains(&action) {
        anyhow::bail!("unsupported server action: {action}");
    }

    let client = hetzner_client()?;
    let url = format!("https://api.hetzner.cloud/v1/servers/{server_id}/actions/{action}");
    let response = client.post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::bail!("Hetzner API error: {} - {}", status, text);
    }

    Ok(json!({ "ok": true }))
}

fn request_console(arg: &Value) -> Result<Value> {
    let state = load_state()?;
    let (project, _pid) = resolve_project(&state, arg)?;
    let token = read_project_token(project)?;
    let server_id = arg.get("serverId").and_then(|v| v.as_str()).context("missing serverId")?;
    let client = hetzner_client()?;

    let url = format!("https://api.hetzner.cloud/v1/servers/{server_id}/actions/request_console");
    let response = client.post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::bail!("Hetzner API error: {} - {}", status, text);
    }

    let body: Value = response.json()?;
    let wss_url = body.get("wss_url").and_then(|v| v.as_str()).unwrap_or("");
    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("");

    if wss_url.is_empty() {
        anyhow::bail!("Hetzner API did not return a console WebSocket URL");
    }

    Ok(json!({
        "ok": true,
        "wssUrl": wss_url,
        "password": password,
    }))
}

fn toggle_favorite(arg: &Value) -> Result<Value> {
    let project_id = arg.get("projectId").and_then(|v| v.as_str()).context("missing projectId")?;
    let server_id = arg.get("serverId").and_then(|v| v.as_str()).context("missing serverId")?;

    let mut state = load_state()?;
    if !state.projects.contains_key(project_id) {
        anyhow::bail!("unknown project");
    }

    let current = state.favorites.get(project_id).cloned().unwrap_or_default();
    let updated: Vec<String> = if current.contains(&server_id.to_string()) {
        current.into_iter().filter(|k| k != server_id).collect()
    } else {
        let mut v = current;
        v.push(server_id.to_string());
        v
    };

    if updated.is_empty() {
        state.favorites.remove(project_id);
    } else {
        state.favorites.insert(project_id.to_string(), updated.clone());
    }
    save_state(&state)?;
    Ok(json!({ "ok": true, "favorites": updated }))
}
