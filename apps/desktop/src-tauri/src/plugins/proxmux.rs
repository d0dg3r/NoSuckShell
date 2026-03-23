//! PROXMUX: Proxmox VE cluster inventory using the Proxmox API (token auth).
//! Storage lives next to other NoSuckShell SSH-dir files; API secrets use the app master key when set, else plain text in a user-only file.

use super::{HostEnrichContext, NssPlugin, PluginCapability, PluginManifest};
use crate::secure_store::{decrypt_with_app_master, try_encrypt_with_app_master};
use crate::ssh_config::HostConfig;
use crate::ssh_home::effective_ssh_dir;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;
use std::time::Duration;

pub const PROXMUX_PLUGIN_ID: &str = "dev.nosuckshell.plugin.proxmux";

pub struct ProxmuxPlugin;

impl NssPlugin for ProxmuxPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: PROXMUX_PLUGIN_ID.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            display_name: "PROXMUX".to_string(),
            capabilities: vec![PluginCapability::SettingsUi, PluginCapability::HostMetadataEnricher],
        }
    }

    fn required_entitlement(&self) -> Option<&'static str> {
        Some("dev.nosuckshell.addon.proxmox")
    }

    fn enrich_host_config(&self, _host: &mut HostConfig, _ctx: &HostEnrichContext) -> Result<()> {
        Ok(())
    }

    fn invoke(&self, method: &str, arg: &Value) -> Result<Value> {
        match method {
            "listState" => Ok(list_state()?),
            "saveCluster" => Ok(save_cluster(arg)?),
            "removeCluster" => Ok(remove_cluster(arg)?),
            "setActiveCluster" => Ok(set_active_cluster(arg)?),
            "testConnection" => Ok(test_connection(arg)?),
            "testConnectionDraft" => Ok(test_connection_draft(arg)?),
            "fetchResources" => Ok(fetch_resources(arg)?),
            "guestStatus" => Ok(guest_status(arg)?),
            "guestPower" => Ok(guest_power(arg)?),
            "toggleProxmuxFavorite" => Ok(toggle_proxmux_favorite(arg)?),
            "fetchSpiceProxy" => Ok(fetch_spice_proxy(arg)?),
            "fetchQemuVncProxy" => Ok(fetch_qemu_vnc_proxy(arg)?),
            "fetchLxcTermProxy" => Ok(fetch_lxc_term_proxy(arg)?),
            "qemuSpiceCapable" => Ok(qemu_spice_capable(arg)?),
            _ => anyhow::bail!("unknown method: {method}"),
        }
    }
}

fn default_true() -> bool {
    true
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
struct StoredCluster {
    id: String,
    name: String,
    proxmox_url: String,
    api_user: String,
    api_token_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_secret_plain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_secret_encrypted: Option<ApiSecretEncrypted>,
    #[serde(default)]
    failover_urls: Vec<String>,
    #[serde(default = "default_true")]
    is_enabled: bool,
    #[serde(default)]
    allow_insecure_tls: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxmuxState {
    #[serde(default)]
    active_cluster_id: Option<String>,
    #[serde(default)]
    clusters: HashMap<String, StoredCluster>,
    /// Per cluster: stable resource keys (`node:{name}` or `qemu|lxc:{node}:{vmid}`).
    #[serde(default)]
    favorites: HashMap<String, Vec<String>>,
}

fn state_path() -> Result<std::path::PathBuf> {
    Ok(effective_ssh_dir()?.join("nosuckshell.proxmux.v1.json"))
}

fn load_state() -> Result<ProxmuxState> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(ProxmuxState::default());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&raw).context("parse proxmux state")
}

fn save_state(state: &ProxmuxState) -> Result<()> {
    let path = state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(state)?;
    fs::write(&path, &raw)?;
    #[cfg(unix)]
    {
        let mut perms = fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms)?;
    }
    Ok(())
}

fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn pve_api_token_header(user: &str, token_id: &str, secret: &str) -> String {
    format!("PVEAPIToken={user}!{token_id}={secret}")
}

fn read_api_secret(c: &StoredCluster) -> Result<String> {
    if let Some(enc) = &c.api_secret_encrypted {
        return decrypt_with_app_master(&enc.ciphertext, &enc.salt, &enc.nonce);
    }
    if let Some(p) = &c.api_secret_plain {
        if !p.is_empty() {
            return Ok(p.clone());
        }
    }
    anyhow::bail!("Missing API token secret for this cluster")
}

fn write_api_secret_fields(secret: &str) -> Result<(Option<String>, Option<ApiSecretEncrypted>)> {
    if secret.is_empty() {
        anyhow::bail!("empty API secret");
    }
    match try_encrypt_with_app_master(secret) {
        Some(Ok((ciphertext, salt, nonce))) => Ok((
            None,
            Some(ApiSecretEncrypted {
                ciphertext,
                salt,
                nonce,
            }),
        )),
        Some(Err(e)) => Err(e),
        None => Ok((Some(secret.to_string()), None)),
    }
}

fn merge_stored_secret(new_secret: &str, existing: &StoredCluster) -> Result<(Option<String>, Option<ApiSecretEncrypted>)> {
    if new_secret.is_empty() {
        Ok((existing.api_secret_plain.clone(), existing.api_secret_encrypted.clone()))
    } else {
        write_api_secret_fields(new_secret)
    }
}

fn build_cluster_slug(name: &str, used: &HashSet<String>) -> String {
    let base: String = name
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .fold(String::new(), |mut acc, ch| {
            if ch == '-' && acc.ends_with('-') {
                return acc;
            }
            acc.push(ch);
            acc
        });
    let base = if base.is_empty() { "cluster".to_string() } else { base };
    if !used.contains(&base) {
        return base;
    }
    let mut n = 2u32;
    loop {
        let id = format!("{base}-{n}");
        if !used.contains(&id) {
            return id;
        }
        n += 1;
    }
}

fn http_client(allow_insecure_tls: bool) -> Result<reqwest::blocking::Client> {
    let mut b = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("NoSuckShell-PROXMUX/", env!("CARGO_PKG_VERSION")));
    if allow_insecure_tls {
        b = b.danger_accept_invalid_certs(true);
    }
    b.build().context("build HTTP client")
}

fn try_fetch_version(
    client: &reqwest::blocking::Client,
    base_url: &str,
    auth_header: &str,
) -> Result<serde_json::Value> {
    let url = format!("{}/api2/json/version", normalize_base_url(base_url));
    let response = client
        .get(&url)
        .header("Authorization", auth_header)
        .header("Accept", "application/json")
        .send()
        .with_context(|| format!("GET {url}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().unwrap_or_default();
        anyhow::bail!("{status}: {text}");
    }
    let body: serde_json::Value = response.json().context("parse version JSON")?;
    body.get("data")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("missing data in version response"))
}

fn with_failover<T, F>(primary: &str, failover: &[String], mut f: F) -> Result<T>
where
    F: FnMut(&str) -> Result<T>,
{
    let mut last_err = None;
    for base in std::iter::once(primary.to_string()).chain(failover.iter().cloned()) {
        let base = normalize_base_url(&base);
        if base.is_empty() {
            continue;
        }
        match f(&base) {
            Ok(v) => return Ok(v),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("no base URL to try")))
}

/// Best-effort GET returning the Proxmox `data` JSON value; used for inventory IP enrichment only.
fn try_pve_get_json_data_optional(
    client: &reqwest::blocking::Client,
    auth: &str,
    primary: &str,
    failover: &[String],
    path_tail: &str,
) -> Option<Value> {
    for base in std::iter::once(primary.to_string()).chain(failover.iter().cloned()) {
        let base = normalize_base_url(&base);
        if base.is_empty() {
            continue;
        }
        let url = format!("{base}{path_tail}");
        let Ok(response) = client
            .get(&url)
            .header("Authorization", auth)
            .header("Accept", "application/json")
            .send()
        else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(body) = response.json::<Value>() else {
            continue;
        };
        if let Some(d) = body.get("data") {
            return Some(d.clone());
        }
    }
    None
}

fn normalize_ip_candidate(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let base = t.split('/').next()?.trim();
    if base.is_empty() {
        return None;
    }
    let ip: IpAddr = base.parse().ok()?;
    Some(match ip {
        IpAddr::V4(a) => a.to_string(),
        IpAddr::V6(a) => a.to_string(),
    })
}

fn append_ips_from_text(s: &str, v4: &mut Vec<String>, v6: &mut Vec<String>) {
    for token in s.split(|c| c == ' ' || c == ',' || c == ';') {
        let t = token.trim();
        if t.is_empty() {
            continue;
        }
        let Some(canonical) = normalize_ip_candidate(t) else {
            continue;
        };
        match IpAddr::from_str(&canonical) {
            Ok(IpAddr::V4(a)) => v4.push(a.to_string()),
            Ok(IpAddr::V6(a)) => v6.push(a.to_string()),
            Err(_) => {}
        }
    }
}

fn collect_ips_from_node_network(data: &Value) -> (Vec<String>, Vec<String>) {
    let mut v4 = Vec::new();
    let mut v6 = Vec::new();
    let Some(arr) = data.as_array() else {
        return (v4, v6);
    };
    for item in arr {
        if let Some(s) = item.get("address").and_then(|x| x.as_str()) {
            append_ips_from_text(s, &mut v4, &mut v6);
        }
        if let Some(s) = item.get("address6").and_then(|x| x.as_str()) {
            append_ips_from_text(s, &mut v4, &mut v6);
        }
    }
    (v4, v6)
}

fn collect_ips_from_qemu_agent(data: &Value) -> (Vec<String>, Vec<String>) {
    let mut v4 = Vec::new();
    let mut v6 = Vec::new();
    let ifaces = data
        .get("result")
        .and_then(|r| r.as_array())
        .or_else(|| data.as_array());
    let Some(ifaces) = ifaces else {
        return (v4, v6);
    };
    for iface in ifaces {
        let Some(addr_list) = iface.get("ip-addresses").and_then(|x| x.as_array()) else {
            continue;
        };
        for a in addr_list {
            let typ = a
                .get("ip-address-type")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_lowercase();
            let Some(ip_raw) = a.get("ip-address").and_then(|i| i.as_str()) else {
                continue;
            };
            let Some(canonical) = normalize_ip_candidate(ip_raw) else {
                continue;
            };
            match typ.as_str() {
                "ipv4" => {
                    if let Ok(IpAddr::V4(addr)) = IpAddr::from_str(&canonical) {
                        v4.push(addr.to_string());
                    }
                }
                "ipv6" => {
                    if let Ok(IpAddr::V6(addr)) = IpAddr::from_str(&canonical) {
                        v6.push(addr.to_string());
                    }
                }
                _ => match IpAddr::from_str(&canonical) {
                    Ok(IpAddr::V4(a)) => v4.push(a.to_string()),
                    Ok(IpAddr::V6(a)) => v6.push(a.to_string()),
                    Err(_) => {}
                },
            }
        }
    }
    (v4, v6)
}

fn scrape_lxc_inet_field(v: Option<&Value>, v4: &mut Vec<String>, v6: &mut Vec<String>) {
    match v {
        Some(Value::String(s)) => append_ips_from_text(s, v4, v6),
        Some(Value::Array(arr)) => {
            for x in arr {
                if let Some(s) = x.as_str() {
                    append_ips_from_text(s, v4, v6);
                }
            }
        }
        _ => {}
    }
}

fn collect_ips_from_lxc_interfaces(data: &Value) -> (Vec<String>, Vec<String>) {
    let mut v4 = Vec::new();
    let mut v6 = Vec::new();
    let items: Vec<&Value> = if let Some(a) = data.as_array() {
        a.iter().collect()
    } else {
        return (v4, v6);
    };
    for item in items {
        scrape_lxc_inet_field(item.get("inet"), &mut v4, &mut v6);
        scrape_lxc_inet_field(item.get("inet6"), &mut v4, &mut v6);
    }
    (v4, v6)
}

fn ipv4_priority(addr: Ipv4Addr) -> u8 {
    if addr.is_loopback() || addr.is_unspecified() || addr.is_broadcast() {
        return 0;
    }
    if addr.is_link_local() {
        return 1;
    }
    if addr.is_private() {
        return 2;
    }
    3
}

fn ipv6_priority(addr: Ipv6Addr) -> u8 {
    if addr.is_loopback() || addr.is_unspecified() || addr.is_multicast() {
        return 0;
    }
    if addr.is_unicast_link_local() {
        return 1;
    }
    if addr.is_unique_local() {
        return 2;
    }
    3
}

fn pick_primary_ipv4(candidates: &[String]) -> Option<String> {
    let mut best: Option<(u8, String)> = None;
    for c in candidates {
        let Ok(ip) = c.parse::<Ipv4Addr>() else {
            continue;
        };
        let p = ipv4_priority(ip);
        if p == 0 {
            continue;
        }
        let s = ip.to_string();
        let better = match &best {
            None => true,
            Some((bp, bs)) => p > *bp || (p == *bp && s < *bs),
        };
        if better {
            best = Some((p, s));
        }
    }
    best.map(|(_, s)| s)
}

fn pick_primary_ipv6(candidates: &[String]) -> Option<String> {
    let mut best: Option<(u8, String)> = None;
    for c in candidates {
        let Ok(ip) = c.parse::<Ipv6Addr>() else {
            continue;
        };
        let p = ipv6_priority(ip);
        if p == 0 {
            continue;
        }
        let s = ip.to_string();
        let better = match &best {
            None => true,
            Some((bp, bs)) => p > *bp || (p == *bp && s < *bs),
        };
        if better {
            best = Some((p, s));
        }
    }
    best.map(|(_, s)| s)
}

fn map_vmid_string(map: &Map<String, Value>) -> Option<String> {
    map.get("vmid").and_then(|v| match v {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}

fn cluster_to_public(c: &StoredCluster) -> Value {
    json!({
        "id": c.id,
        "name": c.name,
        "proxmoxUrl": normalize_base_url(&c.proxmox_url),
        "apiUser": c.api_user,
        "apiTokenId": c.api_token_id,
        "hasApiSecret": c.api_secret_plain.as_ref().is_some_and(|s| !s.is_empty()) || c.api_secret_encrypted.is_some(),
        "failoverUrls": c.failover_urls.iter().map(|u| normalize_base_url(u)).collect::<Vec<_>>(),
        "isEnabled": c.is_enabled,
        "allowInsecureTls": c.allow_insecure_tls,
    })
}

fn list_state() -> Result<Value> {
    let s = load_state()?;
    let clusters: Vec<Value> = s
        .clusters
        .values()
        .filter(|c| c.is_enabled)
        .map(cluster_to_public)
        .collect();
    let mut favorites_by_cluster = serde_json::Map::new();
    for (cid, keys) in &s.favorites {
        favorites_by_cluster.insert(cid.clone(), json!(keys));
    }
    Ok(json!({
        "activeClusterId": s.active_cluster_id,
        "clusters": clusters,
        "usesEncryptedSecrets": s.clusters.values().any(|c| c.api_secret_encrypted.is_some()),
        "usesPlainSecrets": s.clusters.values().any(|c| c.api_secret_plain.as_ref().is_some_and(|p| !p.is_empty())),
        "favoritesByCluster": favorites_by_cluster,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveClusterPayload {
    id: Option<String>,
    name: String,
    proxmox_url: String,
    #[serde(default)]
    api_user: String,
    #[serde(default)]
    api_token_id: String,
    #[serde(default)]
    api_secret: String,
    #[serde(default)]
    failover_urls: Vec<String>,
    #[serde(default = "default_true")]
    is_enabled: bool,
    #[serde(default)]
    allow_insecure_tls: bool,
}

fn save_cluster(arg: &Value) -> Result<Value> {
    let payload: SaveClusterPayload = serde_json::from_value(
        arg.get("cluster")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing cluster"))?,
    )
    .context("parse cluster")?;

    let mut state = load_state()?;
    let used_ids: HashSet<String> = state.clusters.keys().cloned().collect();

    let id = if let Some(ref rid) = payload.id {
        if used_ids.contains(rid) {
            rid.clone()
        } else if !rid.is_empty() {
            rid.clone()
        } else {
            build_cluster_slug(&payload.name, &used_ids)
        }
    } else {
        build_cluster_slug(&payload.name, &used_ids)
    };

    let proxmox_url = normalize_base_url(&payload.proxmox_url);
    if proxmox_url.is_empty() {
        anyhow::bail!("proxmoxUrl is required");
    }

    let (plain, enc) = if let Some(existing) = state.clusters.get(&id) {
        merge_stored_secret(&payload.api_secret, existing)?
    } else {
        if payload.api_secret.is_empty() {
            anyhow::bail!("apiSecret is required for a new cluster");
        }
        write_api_secret_fields(&payload.api_secret)?
    };

    let failover_urls: Vec<String> = payload
        .failover_urls
        .iter()
        .map(|u| normalize_base_url(u))
        .filter(|u| !u.is_empty())
        .collect();

    let cluster = StoredCluster {
        id: id.clone(),
        name: payload.name.trim().to_string(),
        proxmox_url,
        api_user: payload.api_user.trim().to_string(),
        api_token_id: payload.api_token_id.trim().to_string(),
        api_secret_plain: plain,
        api_secret_encrypted: enc,
        failover_urls,
        is_enabled: payload.is_enabled,
        allow_insecure_tls: payload.allow_insecure_tls,
    };

    state.clusters.insert(id.clone(), cluster);
    if state.active_cluster_id.is_none() {
        state.active_cluster_id = Some(id.clone());
    }
    save_state(&state)?;
    Ok(json!({ "ok": true, "clusterId": id }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClusterIdArg {
    cluster_id: String,
}

fn remove_cluster(arg: &Value) -> Result<Value> {
    let ClusterIdArg { cluster_id } = serde_json::from_value(arg.clone()).context("parse removeCluster")?;
    let mut state = load_state()?;
    state.clusters.remove(&cluster_id);
    state.favorites.remove(&cluster_id);
    if state.active_cluster_id.as_deref() == Some(cluster_id.as_str()) {
        state.active_cluster_id = state.clusters.keys().next().cloned();
    }
    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

fn set_active_cluster(arg: &Value) -> Result<Value> {
    let ClusterIdArg { cluster_id } = serde_json::from_value(arg.clone()).context("parse setActiveCluster")?;
    let mut state = load_state()?;
    if !state.clusters.contains_key(&cluster_id) {
        anyhow::bail!("unknown cluster: {cluster_id}");
    }
    state.active_cluster_id = Some(cluster_id);
    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

fn test_connection(arg: &Value) -> Result<Value> {
    let ClusterIdArg { cluster_id } = serde_json::from_value(arg.clone()).context("parse testConnection")?;
    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    test_cluster_core(c)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftClusterArg {
    proxmox_url: String,
    #[serde(default)]
    api_user: String,
    #[serde(default)]
    api_token_id: String,
    api_secret: String,
    #[serde(default)]
    failover_urls: Vec<String>,
    #[serde(default)]
    allow_insecure_tls: bool,
}

fn test_connection_draft(arg: &Value) -> Result<Value> {
    let d: DraftClusterArg = serde_json::from_value(arg.clone()).context("parse testConnectionDraft")?;
    if d.api_secret.is_empty() {
        return Ok(json!({
            "ok": false,
            "message": "API token secret is required."
        }));
    }
    let c = StoredCluster {
        id: "draft".to_string(),
        name: String::new(),
        proxmox_url: normalize_base_url(&d.proxmox_url),
        api_user: d.api_user,
        api_token_id: d.api_token_id,
        api_secret_plain: Some(d.api_secret),
        api_secret_encrypted: None,
        failover_urls: d.failover_urls,
        is_enabled: true,
        allow_insecure_tls: d.allow_insecure_tls,
    };
    test_cluster_core(&c)
}

fn test_cluster_core(c: &StoredCluster) -> Result<Value> {
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);
    if primary.is_empty() {
        return Ok(json!({ "ok": false, "message": "Proxmox URL is empty." }));
    }
    match with_failover(&primary, &c.failover_urls, |base| try_fetch_version(&client, base, &auth)) {
        Ok(data) => Ok(json!({
            "ok": true,
            "version": data,
            "baseUrl": primary,
        })),
        Err(e) => Ok(json!({
            "ok": false,
            "message": format!("{e:#}")
        })),
    }
}

fn fetch_resources(arg: &Value) -> Result<Value> {
    let ClusterIdArg { cluster_id } = serde_json::from_value(arg.clone()).context("parse fetchResources")?;
    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let data = with_failover(&primary, &c.failover_urls, |base| {
        let url = format!("{}/api2/json/cluster/resources", normalize_base_url(base));
        let response = client
            .get(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("GET {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{status}: {text}");
        }
        let body: Value = response.json().context("parse resources")?;
        body.get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data"))
    })?;

    let arr = data.as_array().cloned().unwrap_or_default();
    let mut filtered: Vec<Value> = arr
        .into_iter()
        .filter(|row| {
            row.get("type")
                .and_then(|t| t.as_str())
                .is_some_and(|t| matches!(t, "node" | "qemu" | "lxc"))
        })
        .collect();

    let mut unique_nodes: HashSet<String> = HashSet::new();
    for row in &filtered {
        if let Some(n) = row.get("node").and_then(|x| x.as_str()) {
            if !n.is_empty() {
                unique_nodes.insert(n.to_string());
            }
        }
    }

    let mut node_ip_cache: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    for node in &unique_nodes {
        let path = format!("/api2/json/nodes/{node}/network");
        let pair = if let Some(net_data) =
            try_pve_get_json_data_optional(&client, &auth, &primary, &c.failover_urls, &path)
        {
            let (v4s, v6s) = collect_ips_from_node_network(&net_data);
            (pick_primary_ipv4(&v4s), pick_primary_ipv6(&v6s))
        } else {
            (None, None)
        };
        node_ip_cache.insert(node.clone(), pair);
    }

    let mut guest_ip_cache: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    for row in &filtered {
        let typ = row.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if typ != "qemu" && typ != "lxc" {
            continue;
        }
        let status = row
            .get("status")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_lowercase();
        if status != "running" {
            continue;
        }
        let Some(node) = row.get("node").and_then(|n| n.as_str()) else {
            continue;
        };
        let Some(map) = row.as_object() else {
            continue;
        };
        let Some(vmid) = map_vmid_string(map) else {
            continue;
        };
        let cache_key = format!("{typ}:{node}:{vmid}");
        if guest_ip_cache.contains_key(&cache_key) {
            continue;
        }
        let path = if typ == "qemu" {
            format!("/api2/json/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces")
        } else {
            format!("/api2/json/nodes/{node}/lxc/{vmid}/interfaces")
        };
        let pair = if let Some(guest_data) =
            try_pve_get_json_data_optional(&client, &auth, &primary, &c.failover_urls, &path)
        {
            let (v4s, v6s) = if typ == "qemu" {
                collect_ips_from_qemu_agent(&guest_data)
            } else {
                collect_ips_from_lxc_interfaces(&guest_data)
            };
            (pick_primary_ipv4(&v4s), pick_primary_ipv6(&v6s))
        } else {
            (None, None)
        };
        guest_ip_cache.insert(cache_key, pair);
    }

    for row in &mut filtered {
        let Value::Object(map) = row else {
            continue;
        };
        let typ = map.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let node = map.get("node").and_then(|n| n.as_str()).unwrap_or("");

        let (ip4, ip6) = match typ {
            "node" => node_ip_cache.get(node).cloned().unwrap_or((None, None)),
            "qemu" | "lxc" => {
                let vmid = map_vmid_string(map);
                if let Some(vmid) = vmid {
                    let k = format!("{typ}:{node}:{vmid}");
                    guest_ip_cache.get(&k).cloned().unwrap_or((None, None))
                } else {
                    (None, None)
                }
            }
            _ => (None, None),
        };
        if let Some(s) = ip4 {
            map.insert("ip4".to_string(), json!(s));
        }
        if let Some(s) = ip6 {
            map.insert("ip6".to_string(), json!(s));
        }
    }

    Ok(json!({ "ok": true, "resources": filtered }))
}

/// Actions allowed for `POST .../status/{action}`. Unknown values are rejected before any HTTP call.
const GUEST_POWER_ACTIONS: &[&str] = &[
    "start",
    "stop",
    "shutdown",
    "reboot",
    "reset",
    "suspend",
    "resume",
    "pause",
];

fn validate_pve_node_segment(node: &str) -> Result<()> {
    if node.is_empty() {
        anyhow::bail!("invalid node: empty");
    }
    if node.contains('/') {
        anyhow::bail!("invalid node: path characters are not allowed");
    }
    if node.chars().any(|c| {
        !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    }) {
        anyhow::bail!("invalid node: unsupported characters");
    }
    Ok(())
}

fn validate_pve_vmid(vmid: &str) -> Result<()> {
    if vmid.is_empty() {
        anyhow::bail!("invalid vmid: empty");
    }
    if vmid.len() > 12 {
        anyhow::bail!("invalid vmid: too long");
    }
    if !vmid.chars().all(|c| c.is_ascii_digit()) {
        anyhow::bail!("invalid vmid: must be numeric");
    }
    Ok(())
}

fn normalize_guest_type(raw: &str) -> Result<&'static str> {
    match raw {
        "qemu" => Ok("qemu"),
        "lxc" => Ok("lxc"),
        _ => anyhow::bail!("guestType must be \"qemu\" or \"lxc\""),
    }
}

fn pve_error_hint(status: u16, body: &str) -> String {
    if status == 403 {
        return format!(
            "Permission denied (HTTP 403). Ensure the API token has power-management rights for this guest. {body}"
        );
    }
    format!("HTTP {status}: {body}")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuestClusterArg {
    cluster_id: String,
    node: String,
    guest_type: String,
    vmid: serde_json::Value,
}

fn guest_arg_vmid_string(vmid: &serde_json::Value) -> Result<String> {
    match vmid {
        Value::String(s) => Ok(s.trim().to_string()),
        Value::Number(n) => Ok(n.to_string()),
        _ => anyhow::bail!("vmid must be a string or number"),
    }
}

fn guest_status(arg: &Value) -> Result<Value> {
    let GuestClusterArg {
        cluster_id,
        node,
        guest_type,
        vmid,
    } = serde_json::from_value(arg.clone()).context("parse guestStatus")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/{typ}/{vmid}/status/current");
    let data = with_failover(&primary, &c.failover_urls, |base| {
        let url = format!("{}{}", normalize_base_url(base), path_tail);
        let response = client
            .get(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("GET {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse guest status JSON")?;
        body.get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data in guest status response"))
    })?;

    Ok(json!({ "ok": true, "data": data }))
}

fn fetch_spice_proxy(arg: &Value) -> Result<Value> {
    let GuestClusterArg {
        cluster_id,
        node,
        guest_type,
        vmid,
    } = serde_json::from_value(arg.clone()).context("parse fetchSpiceProxy")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;
    if typ != "qemu" {
        anyhow::bail!("fetchSpiceProxy only supports guestType \"qemu\"");
    }

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/{typ}/{vmid}/spiceproxy");
    let data = with_failover(&primary, &c.failover_urls, |base| {
        let url = format!("{}{}", normalize_base_url(base), path_tail);
        let response = client
            .post(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("POST {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse spiceproxy JSON")?;
        body.get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data in spiceproxy response"))
    })?;

    Ok(json!({ "ok": true, "data": data }))
}

fn fetch_qemu_vnc_proxy(arg: &Value) -> Result<Value> {
    let GuestClusterArg {
        cluster_id,
        node,
        guest_type,
        vmid,
    } = serde_json::from_value(arg.clone()).context("parse fetchQemuVncProxy")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;
    if typ != "qemu" {
        anyhow::bail!("fetchQemuVncProxy only supports guestType \"qemu\"");
    }

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/qemu/{vmid}/vncproxy");
    let (api_origin, data) = with_failover(&primary, &c.failover_urls, |base| {
        let norm = normalize_base_url(base);
        let url = format!("{norm}{path_tail}");
        let response = client
            .post(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("POST {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse vncproxy JSON")?;
        let data = body
            .get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data in vncproxy response"))?;
        Ok((norm, data))
    })?;

    Ok(json!({ "ok": true, "apiOrigin": api_origin, "authHeader": auth, "data": data }))
}

fn fetch_lxc_term_proxy(arg: &Value) -> Result<Value> {
    let GuestClusterArg {
        cluster_id,
        node,
        guest_type,
        vmid,
    } = serde_json::from_value(arg.clone()).context("parse fetchLxcTermProxy")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;
    if typ != "lxc" {
        anyhow::bail!("fetchLxcTermProxy only supports guestType \"lxc\"");
    }

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let api_user = c.api_user.clone();
    let path_tail = format!("/api2/json/nodes/{node}/lxc/{vmid}/termproxy");
    let (api_origin, data) = with_failover(&primary, &c.failover_urls, |base| {
        let norm = normalize_base_url(base);
        let url = format!("{norm}{path_tail}");
        let response = client
            .post(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("POST {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse termproxy JSON")?;
        let data = body
            .get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data in termproxy response"))?;
        Ok((norm, data))
    })?;

    Ok(json!({ "ok": true, "apiOrigin": api_origin, "apiUser": api_user, "authHeader": auth, "data": data }))
}

/// Matches PROXMUX-Manager `isSpiceEnabled`: SPICE is meaningful when display uses QXL, virtio-gpu, or explicit spice.
fn spice_capable_from_qemu_config_data(data: &Value) -> bool {
    let vga = match data.get("vga") {
        Some(Value::String(s)) => s.to_lowercase(),
        Some(Value::Number(n)) => n.to_string().to_lowercase(),
        _ => String::new(),
    };
    vga.contains("qxl") || vga.contains("spice") || vga.contains("virtio")
}

fn qemu_spice_capable(arg: &Value) -> Result<Value> {
    let GuestClusterArg {
        cluster_id,
        node,
        guest_type,
        vmid,
    } = serde_json::from_value(arg.clone()).context("parse qemuSpiceCapable")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;
    if typ != "qemu" {
        anyhow::bail!("qemuSpiceCapable only supports guestType \"qemu\"");
    }

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/qemu/{vmid}/config");
    let data = with_failover(&primary, &c.failover_urls, |base| {
        let url = format!("{}{}", normalize_base_url(base), path_tail);
        let response = client
            .get(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("GET {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse qemu config JSON")?;
        body.get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("missing data in qemu config response"))
    })?;

    let spice_capable = spice_capable_from_qemu_config_data(&data);
    Ok(json!({ "ok": true, "spiceCapable": spice_capable }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuestPowerArg {
    cluster_id: String,
    node: String,
    guest_type: String,
    vmid: serde_json::Value,
    action: String,
}

fn guest_power(arg: &Value) -> Result<Value> {
    let GuestPowerArg {
        cluster_id,
        node,
        guest_type,
        vmid,
        action,
    } = serde_json::from_value(arg.clone()).context("parse guestPower")?;
    let vmid = guest_arg_vmid_string(&vmid)?;
    validate_pve_node_segment(&node)?;
    validate_pve_vmid(&vmid)?;
    let typ = normalize_guest_type(guest_type.trim())?;
    let action_trim = action.trim();
    if !GUEST_POWER_ACTIONS.iter().any(|a| *a == action_trim) {
        anyhow::bail!("unsupported power action: {action_trim}");
    }

    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    let secret = read_api_secret(c)?;
    let auth = pve_api_token_header(&c.api_user, &c.api_token_id, &secret);
    let client = http_client(c.allow_insecure_tls)?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!(
        "/api2/json/nodes/{node}/{typ}/{vmid}/status/{action_trim}"
    );
    with_failover(&primary, &c.failover_urls, |base| {
        let url = format!("{}{}", normalize_base_url(base), path_tail);
        let response = client
            .post(&url)
            .header("Authorization", &auth)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("POST {url}"))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        Ok(())
    })?;

    Ok(json!({ "ok": true }))
}

fn validate_proxmux_resource_segment(s: &str) -> Result<()> {
    if s.is_empty() || s.contains('/') {
        anyhow::bail!("invalid resource key segment");
    }
    if s.chars().any(|c| {
        !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    }) {
        anyhow::bail!("invalid resource key segment");
    }
    Ok(())
}

fn validate_proxmux_resource_key(key: &str) -> Result<()> {
    if let Some(node) = key.strip_prefix("node:") {
        validate_proxmux_resource_segment(node)?;
        return Ok(());
    }
    let first = key.find(':');
    let last = key.rfind(':');
    let (Some(f), Some(l)) = (first, last) else {
        anyhow::bail!("invalid resource key");
    };
    if f == l {
        anyhow::bail!("invalid resource key");
    }
    let typ = &key[..f];
    if typ != "qemu" && typ != "lxc" {
        anyhow::bail!("invalid resource key");
    }
    let node = &key[f + 1..l];
    let vmid = &key[l + 1..];
    validate_proxmux_resource_segment(node)?;
    validate_pve_vmid(vmid)?;
    Ok(())
}

fn toggle_favorite_set(current: &[String], key: &str) -> Vec<String> {
    let mut set: HashSet<String> = current.iter().cloned().collect();
    if set.contains(key) {
        set.remove(key);
    } else {
        set.insert(key.to_string());
    }
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort();
    v
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToggleFavoriteArg {
    cluster_id: String,
    resource_key: String,
}

fn toggle_proxmux_favorite(arg: &Value) -> Result<Value> {
    let ToggleFavoriteArg {
        cluster_id,
        resource_key,
    } = serde_json::from_value(arg.clone()).context("parse toggleProxmuxFavorite")?;
    validate_proxmux_resource_key(&resource_key)?;
    let mut state = load_state()?;
    if !state.clusters.contains_key(&cluster_id) {
        anyhow::bail!("unknown cluster");
    }
    let current: Vec<String> = state
        .favorites
        .get(&cluster_id)
        .cloned()
        .unwrap_or_default();
    let updated = toggle_favorite_set(&current, &resource_key);
    if updated.is_empty() {
        state.favorites.remove(&cluster_id);
    } else {
        state.favorites.insert(cluster_id.clone(), updated.clone());
    }
    save_state(&state)?;
    Ok(json!({ "ok": true, "favorites": updated }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_base_url_trims_slashes() {
        assert_eq!(normalize_base_url(" https://pve:8006/ "), "https://pve:8006");
    }

    #[test]
    fn pve_api_token_header_format() {
        let h = pve_api_token_header("root@pam", "tok", "secret");
        assert_eq!(h, "PVEAPIToken=root@pam!tok=secret");
    }

    #[test]
    fn build_cluster_slug_unique() {
        let mut used = HashSet::new();
        used.insert("homelab".to_string());
        assert_eq!(build_cluster_slug("Homelab", &used), "homelab-2");
    }

    #[test]
    fn guest_power_rejects_disallowed_action() {
        let arg = json!({
            "clusterId": "any",
            "node": "pve",
            "guestType": "qemu",
            "vmid": 100,
            "action": "destroy"
        });
        let err = guest_power(&arg).expect_err("destroy must be rejected");
        let s = format!("{err:#}");
        assert!(
            s.contains("unsupported power action"),
            "unexpected error: {s}"
        );
    }

    #[test]
    fn validate_pve_node_rejects_path_chars() {
        assert!(validate_pve_node_segment("a/b").is_err());
    }

    #[test]
    fn validate_proxmux_resource_key_accepts_node_and_guests() {
        validate_proxmux_resource_key("node:px01").unwrap();
        validate_proxmux_resource_key("qemu:pve:100").unwrap();
        validate_proxmux_resource_key("lxc:host:12").unwrap();
    }

    #[test]
    fn validate_proxmux_resource_key_rejects_invalid() {
        assert!(validate_proxmux_resource_key("").is_err());
        assert!(validate_proxmux_resource_key("node:").is_err());
        assert!(validate_proxmux_resource_key("node:a/b").is_err());
        assert!(validate_proxmux_resource_key("foo").is_err());
        assert!(validate_proxmux_resource_key("qemu:only").is_err());
    }

    #[test]
    fn toggle_favorite_set_twice_restores() {
        let a = toggle_favorite_set(&[], "node:p");
        assert_eq!(a, vec!["node:p".to_string()]);
        let b = toggle_favorite_set(&a, "node:p");
        assert!(b.is_empty());
        let c = toggle_favorite_set(&b, "node:p");
        assert_eq!(c, vec!["node:p".to_string()]);
    }

    #[test]
    fn spice_capable_from_qemu_config_detects_qxl_spice_virtio() {
        assert!(spice_capable_from_qemu_config_data(&json!({ "vga": "qxl" })));
        assert!(spice_capable_from_qemu_config_data(&json!({ "vga": "type=qxl" })));
        assert!(spice_capable_from_qemu_config_data(&json!({ "vga": "virtio-vga" })));
        assert!(spice_capable_from_qemu_config_data(&json!({ "vga": "SPICE" })));
        assert!(!spice_capable_from_qemu_config_data(&json!({ "vga": "std" })));
        assert!(!spice_capable_from_qemu_config_data(&json!({})));
    }

    #[test]
    fn pick_primary_ipv4_prefers_global_over_private() {
        let c = vec![
            "10.0.0.5".to_string(),
            "203.0.113.10".to_string(),
            "192.168.1.1".to_string(),
        ];
        assert_eq!(pick_primary_ipv4(&c).as_deref(), Some("203.0.113.10"));
    }

    #[test]
    fn pick_primary_ipv4_skips_loopback_and_link_local() {
        let c = vec![
            "127.0.0.1".to_string(),
            "169.254.1.2".to_string(),
            "10.1.2.3".to_string(),
        ];
        assert_eq!(pick_primary_ipv4(&c).as_deref(), Some("10.1.2.3"));
    }

    #[test]
    fn pick_primary_ipv4_tie_break_lexicographic() {
        let c = vec!["10.0.0.9".to_string(), "10.0.0.10".to_string()];
        assert_eq!(pick_primary_ipv4(&c).as_deref(), Some("10.0.0.10"));
    }

    #[test]
    fn pick_primary_ipv6_prefers_global_over_ula() {
        let c = vec![
            "fd00::1".to_string(),
            "2001:db8::1".to_string(),
            "fe80::1".to_string(),
        ];
        assert_eq!(pick_primary_ipv6(&c).as_deref(), Some("2001:db8::1"));
    }

    #[test]
    fn normalize_ip_candidate_strips_cidr() {
        assert_eq!(
            normalize_ip_candidate("192.0.2.4/24").as_deref(),
            Some("192.0.2.4")
        );
    }
}
