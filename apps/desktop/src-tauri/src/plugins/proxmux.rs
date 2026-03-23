//! PROXMUX: Proxmox VE cluster inventory using the Proxmox API (ticket session auth).
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
use reqwest::Proxy;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

pub const PROXMUX_PLUGIN_ID: &str = "dev.nosuckshell.plugin.proxmux";

/// Stored in `proxy_id` to force a direct HTTPS connection (no proxy).
const PROXY_DIRECT_ID: &str = "direct";

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
            "saveProxySettings" => Ok(save_proxy_settings(arg)?),
            "saveProxyProfiles" => Ok(save_proxy_profiles(arg)?),
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
    #[serde(default)]
    totp_code: String,
    #[serde(default)]
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
    /// `None`/empty = use global default proxy (`ProxmuxState.http_proxy_url`); `Some("direct")` = no proxy; `Some(profile id)` = named profile.
    #[serde(default)]
    proxy_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyProfile {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    url: String,
    /// Extra comma-separated bypass hosts for this profile (merged with global + cluster hosts).
    #[serde(default)]
    no_proxy_extra: String,
    #[serde(default = "default_true")]
    is_enabled: bool,
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
    /// Corporate HTTP(S) proxy for Proxmox API traffic, e.g. `http://proxy.example:8080` (optional).
    #[serde(default)]
    http_proxy_url: String,
    /// Comma-separated bypass list (same idea as `NO_PROXY`), e.g. `localhost,127.0.0.1,.lan,*.internal`.
    #[serde(default)]
    no_proxy: String,
    #[serde(default)]
    proxy_profiles: Vec<ProxyProfile>,
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
    let mut state: ProxmuxState = serde_json::from_str(&raw).context("parse proxmux state")?;
    if migrate_legacy_token_clusters(&mut state) > 0 {
        save_state(&state)?;
    }
    Ok(state)
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

#[derive(Debug, Clone)]
struct ProxmoxSessionAuth {
    cookie_header: String,
    csrf_prevention_token: String,
}

#[derive(Debug, Clone)]
struct CachedSession {
    auth: ProxmoxSessionAuth,
    created_at_unix_secs: u64,
}

const SESSION_CACHE_TTL_SECS: u64 = 60 * 60;

fn session_cache() -> &'static std::sync::Mutex<HashMap<String, CachedSession>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<HashMap<String, CachedSession>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProxmuxCacheBucket {
    FetchResources,
    GuestStatus,
}

#[derive(Debug, Clone)]
struct ProxmuxCacheEntry {
    value: Value,
    cached_at_ms: u64,
    expires_at_ms: u64,
}

impl ProxmuxCacheEntry {
    fn is_fresh_at(&self, now_ms: u64) -> bool {
        now_ms < self.expires_at_ms
    }
}

#[derive(Debug, Default, Clone)]
struct ProxmuxCacheStats {
    hits: u64,
    misses: u64,
    stores: u64,
    deduped_waits: u64,
    invalidations: u64,
}

#[derive(Debug, Default)]
struct ProxmuxCacheState {
    entries: HashMap<String, ProxmuxCacheEntry>,
    in_flight: HashSet<String>,
    stats: ProxmuxCacheStats,
}

impl ProxmuxCacheState {
    fn invalidate_prefix(&mut self, prefix: &str) -> usize {
        let before = self.entries.len();
        self.entries.retain(|k, _| !k.starts_with(prefix));
        let removed = before.saturating_sub(self.entries.len());
        if removed > 0 {
            self.stats.invalidations = self.stats.invalidations.saturating_add(removed as u64);
        }
        removed
    }

    fn purge_expired(&mut self, now_ms: u64) {
        self.entries.retain(|_, entry| entry.is_fresh_at(now_ms));
    }

    fn evict_if_needed(&mut self) {
        if self.entries.len() <= PROXMUX_CACHE_MAX_ENTRIES {
            return;
        }
        let mut by_age: Vec<(String, u64)> = self
            .entries
            .iter()
            .map(|(k, v)| (k.clone(), v.cached_at_ms))
            .collect();
        by_age.sort_by_key(|(_, ts)| *ts);
        let drop_count = self.entries.len().saturating_sub(PROXMUX_CACHE_MAX_ENTRIES);
        for (key, _) in by_age.into_iter().take(drop_count) {
            self.entries.remove(&key);
        }
    }
}

const PROXMUX_CACHE_TTL_FETCH_RESOURCES_MS: u64 = 9_000;
const PROXMUX_CACHE_TTL_GUEST_STATUS_MS: u64 = 5_000;
const PROXMUX_CACHE_MAX_ENTRIES: usize = 96;

fn proxmux_cache_ttl_ms(bucket: ProxmuxCacheBucket) -> u64 {
    match bucket {
        ProxmuxCacheBucket::FetchResources => PROXMUX_CACHE_TTL_FETCH_RESOURCES_MS,
        ProxmuxCacheBucket::GuestStatus => PROXMUX_CACHE_TTL_GUEST_STATUS_MS,
    }
}

fn proxmux_cache_key_for_fetch_resources(cluster_id: &str) -> String {
    format!("fetchResources:{cluster_id}")
}

fn proxmux_cache_key_for_guest_status(
    cluster_id: &str,
    node: &str,
    guest_type: &str,
    vmid: &str,
) -> String {
    format!("guestStatus:{cluster_id}:{node}:{guest_type}:{vmid}")
}

fn proxmux_cache_sync() -> &'static (Mutex<ProxmuxCacheState>, Condvar) {
    static CACHE: OnceLock<(Mutex<ProxmuxCacheState>, Condvar)> = OnceLock::new();
    CACHE.get_or_init(|| (Mutex::new(ProxmuxCacheState::default()), Condvar::new()))
}

fn now_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn proxmux_cache_debug_enabled() -> bool {
    matches!(std::env::var("NSS_PROXMUX_CACHE_DEBUG").ok().as_deref(), Some("1"))
}

fn proxmux_cache_debug_log(message: &str) {
    if proxmux_cache_debug_enabled() {
        eprintln!("[proxmux-cache] {message}");
    }
}

fn proxmux_cache_invalidate_prefix(prefix: &str) {
    let (lock, cv) = proxmux_cache_sync();
    if let Ok(mut state) = lock.lock() {
        let removed = state.invalidate_prefix(prefix);
        if removed > 0 {
            proxmux_cache_debug_log(&format!("invalidate prefix={prefix} removed={removed}"));
        }
    }
    cv.notify_all();
}

fn proxmux_cache_invalidate_cluster(cluster_id: &str) {
    proxmux_cache_invalidate_prefix(&format!("fetchResources:{cluster_id}"));
    proxmux_cache_invalidate_prefix(&format!("guestStatus:{cluster_id}:"));
}

fn proxmux_cache_invalidate_exact(key: &str) {
    let (lock, cv) = proxmux_cache_sync();
    if let Ok(mut state) = lock.lock() {
        if state.entries.remove(key).is_some() {
            state.stats.invalidations = state.stats.invalidations.saturating_add(1);
            proxmux_cache_debug_log(&format!("invalidate exact key={key}"));
        }
    }
    cv.notify_all();
}

fn proxmux_cache_invalidate_after_guest_power(
    cluster_id: &str,
    node: &str,
    guest_type: &str,
    vmid: &str,
) {
    proxmux_cache_invalidate_exact(&proxmux_cache_key_for_guest_status(
        cluster_id,
        node,
        guest_type,
        vmid,
    ));
    proxmux_cache_invalidate_exact(&proxmux_cache_key_for_fetch_resources(cluster_id));
}

fn proxmux_cache_invalidate_after_toggle_favorite(cluster_id: &str) {
    proxmux_cache_invalidate_exact(&proxmux_cache_key_for_fetch_resources(cluster_id));
}

fn proxmux_cached_json<F>(cache_key: String, bucket: ProxmuxCacheBucket, fetcher: F) -> Result<Value>
where
    F: FnOnce() -> Result<Value>,
{
    let ttl_ms = proxmux_cache_ttl_ms(bucket);
    let (lock, cv) = proxmux_cache_sync();
    loop {
        let now_ms = now_unix_millis();
        let mut state = lock
            .lock()
            .map_err(|_| anyhow::anyhow!("proxmux cache lock poisoned"))?;
        state.purge_expired(now_ms);
        if let Some(value) = state
            .entries
            .get(&cache_key)
            .filter(|entry| entry.is_fresh_at(now_ms))
            .map(|entry| entry.value.clone())
        {
            state.stats.hits = state.stats.hits.saturating_add(1);
            proxmux_cache_debug_log(&format!("hit key={cache_key}"));
            return Ok(value);
        }
        if !state.in_flight.contains(&cache_key) {
            state.in_flight.insert(cache_key.clone());
            state.stats.misses = state.stats.misses.saturating_add(1);
            drop(state);
            let fetched = fetcher();
            let mut state = lock
                .lock()
                .map_err(|_| anyhow::anyhow!("proxmux cache lock poisoned"))?;
            state.in_flight.remove(&cache_key);
            if let Ok(value) = &fetched {
                let cached_at_ms = now_unix_millis();
                state.entries.insert(
                    cache_key.clone(),
                    ProxmuxCacheEntry {
                        value: value.clone(),
                        cached_at_ms,
                        expires_at_ms: cached_at_ms.saturating_add(ttl_ms),
                    },
                );
                state.evict_if_needed();
                state.stats.stores = state.stats.stores.saturating_add(1);
                proxmux_cache_debug_log(&format!("store key={cache_key} ttl_ms={ttl_ms}"));
            } else {
                proxmux_cache_debug_log(&format!("fetch error key={cache_key}"));
            }
            cv.notify_all();
            return fetched;
        }
        state.stats.deduped_waits = state.stats.deduped_waits.saturating_add(1);
        let _guard = cv
            .wait(state)
            .map_err(|_| anyhow::anyhow!("proxmux cache wait poisoned"))?;
    }
}

#[allow(dead_code)]
fn pve_api_token_header(user: &str, token_id: &str, secret: &str) -> String {
    format!("PVEAPIToken={user}!{token_id}={secret}")
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn session_cache_key(cluster_id: &str, base_url: &str) -> String {
    format!("{cluster_id}|{}", normalize_base_url(base_url))
}

fn read_cluster_password(c: &StoredCluster) -> Result<String> {
    if let Some(enc) = &c.api_secret_encrypted {
        return decrypt_with_app_master(&enc.ciphertext, &enc.salt, &enc.nonce);
    }
    if let Some(p) = &c.api_secret_plain {
        if !p.is_empty() {
            return Ok(p.clone());
        }
    }
    anyhow::bail!("Missing password for this cluster")
}

fn invalidate_cached_session(cluster_id: &str, base_url: &str) {
    let key = session_cache_key(cluster_id, base_url);
    if let Ok(mut cache) = session_cache().lock() {
        cache.remove(&key);
    }
}

fn parse_json_data_field(body: Value, context: &str) -> Result<Value> {
    body.get("data")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("missing data in {context} response"))
}

fn parse_ticket_session_auth(body: &Value) -> Result<ProxmoxSessionAuth> {
    let data = body
        .get("data")
        .and_then(|v| v.as_object())
        .ok_or_else(|| anyhow::anyhow!("missing data in access/ticket response"))?;
    let ticket = data
        .get("ticket")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| anyhow::anyhow!("missing ticket in access/ticket response"))?;
    let csrf = data
        .get("CSRFPreventionToken")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    Ok(ProxmoxSessionAuth {
        cookie_header: format!("PVEAuthCookie={ticket}"),
        csrf_prevention_token: csrf,
    })
}

fn login_ticket_session(client: &reqwest::blocking::Client, base_url: &str, c: &StoredCluster) -> Result<ProxmoxSessionAuth> {
    let password = read_cluster_password(c)?;
    if c.api_user.trim().is_empty() {
        anyhow::bail!("apiUser is required");
    }
    let url = format!("{}/api2/json/access/ticket", normalize_base_url(base_url));
    let mut form: Vec<(&str, String)> = vec![
        ("username", c.api_user.trim().to_string()),
        ("password", password),
    ];
    if !c.totp_code.trim().is_empty() {
        form.push(("otp", c.totp_code.trim().to_string()));
    }
    let response = client
        .post(&url)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .with_context(|| format!("POST {url}"))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().unwrap_or_default();
        anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
    }
    let body: Value = response.json().context("parse access/ticket JSON")?;
    parse_ticket_session_auth(&body)
}

fn session_auth_for_base(client: &reqwest::blocking::Client, c: &StoredCluster, base_url: &str, force_refresh: bool) -> Result<ProxmoxSessionAuth> {
    let normalized = normalize_base_url(base_url);
    if normalized.is_empty() {
        anyhow::bail!("empty base URL");
    }
    let key = session_cache_key(&c.id, &normalized);
    if !force_refresh {
        if let Ok(cache) = session_cache().lock() {
            if let Some(entry) = cache.get(&key) {
                let age = now_unix_secs().saturating_sub(entry.created_at_unix_secs);
                if age < SESSION_CACHE_TTL_SECS {
                    return Ok(entry.auth.clone());
                }
            }
        }
    }
    let auth = login_ticket_session(client, &normalized, c)?;
    if let Ok(mut cache) = session_cache().lock() {
        cache.insert(
            key,
            CachedSession {
                auth: auth.clone(),
                created_at_unix_secs: now_unix_secs(),
            },
        );
    }
    Ok(auth)
}

fn pve_get_json_data(client: &reqwest::blocking::Client, c: &StoredCluster, base_url: &str, path_tail: &str) -> Result<Value> {
    let normalized = normalize_base_url(base_url);
    let url = format!("{normalized}{path_tail}");
    for attempt in 0..2 {
        let auth = session_auth_for_base(client, c, &normalized, attempt > 0)?;
        let response = client
            .get(&url)
            .header("Cookie", &auth.cookie_header)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("GET {url}"))?;
        let status = response.status();
        if status.as_u16() == 401 && attempt == 0 {
            invalidate_cached_session(&c.id, &normalized);
            continue;
        }
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse Proxmox JSON")?;
        return parse_json_data_field(body, "Proxmox GET");
    }
    anyhow::bail!("Proxmox GET failed after retry")
}

fn pve_post_json_data(
    client: &reqwest::blocking::Client,
    c: &StoredCluster,
    base_url: &str,
    path_tail: &str,
    form_fields: &[(&str, String)],
) -> Result<Value> {
    let normalized = normalize_base_url(base_url);
    let url = format!("{normalized}{path_tail}");
    for attempt in 0..2 {
        let auth = session_auth_for_base(client, c, &normalized, attempt > 0)?;
        let mut req = client
            .post(&url)
            .header("Cookie", &auth.cookie_header)
            .header("Accept", "application/json");
        if !auth.csrf_prevention_token.is_empty() {
            req = req.header("CSRFPreventionToken", &auth.csrf_prevention_token);
        }
        if !form_fields.is_empty() {
            req = req.form(form_fields);
        }
        let response = req.send().with_context(|| format!("POST {url}"))?;
        let status = response.status();
        if status.as_u16() == 401 && attempt == 0 {
            invalidate_cached_session(&c.id, &normalized);
            continue;
        }
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            anyhow::bail!("{}", pve_error_hint(status.as_u16(), &text));
        }
        let body: Value = response.json().context("parse Proxmox JSON")?;
        return parse_json_data_field(body, "Proxmox POST");
    }
    anyhow::bail!("Proxmox POST failed after retry")
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

/// Host part of a Proxmox base URL (`https://px01.lan:8006` → `px01.lan`).
fn host_from_proxmox_base(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let with_scheme = if t.contains("://") {
        t.to_string()
    } else {
        format!("https://{t}")
    };
    let u = url::Url::parse(&with_scheme).ok()?;
    u.host_str().map(|h| h.to_string())
}

/// User-configured `no_proxy` plus every Proxmox cluster host (and optional `cluster` for draft tests).
/// When a corporate HTTP proxy is set, internal hostnames like `px01.lan` must bypass the proxy or
/// connections time out.
fn effective_no_proxy(
    state: &ProxmuxState,
    cluster: Option<&StoredCluster>,
    profile_no_proxy_extra: Option<&str>,
) -> String {
    let mut seen = HashSet::<String>::new();
    let mut out: Vec<String> = Vec::new();
    let mut push_host = |h: String| {
        let key = h.to_lowercase();
        if seen.insert(key) {
            out.push(h);
        }
    };
    for part in state.no_proxy.split(',') {
        let p = part.trim();
        if !p.is_empty() {
            push_host(p.to_string());
        }
    }
    if let Some(extra) = profile_no_proxy_extra {
        for part in extra.split(',') {
            let p = part.trim();
            if !p.is_empty() {
                push_host(p.to_string());
            }
        }
    }
    for c in state.clusters.values() {
        for url in std::iter::once(c.proxmox_url.as_str()).chain(c.failover_urls.iter().map(|s| s.as_str())) {
            if let Some(h) = host_from_proxmox_base(url) {
                push_host(h);
            }
        }
    }
    if let Some(c) = cluster {
        for url in std::iter::once(c.proxmox_url.as_str()).chain(c.failover_urls.iter().map(|s| s.as_str())) {
            if let Some(h) = host_from_proxmox_base(url) {
                push_host(h);
            }
        }
    }
    out.join(",")
}

fn resolve_proxy_http_url(state: &ProxmuxState, cluster: &StoredCluster) -> Option<String> {
    let raw = cluster.proxy_id.as_deref().map(str::trim).unwrap_or("");
    if raw.is_empty() {
        let u = state.http_proxy_url.trim();
        return if u.is_empty() {
            None
        } else {
            Some(u.to_string())
        };
    }
    if raw.eq_ignore_ascii_case(PROXY_DIRECT_ID) {
        return None;
    }
    state
        .proxy_profiles
        .iter()
        .find(|p| p.id == raw && p.is_enabled)
        .and_then(|p| {
            let u = p.url.trim();
            if u.is_empty() {
                None
            } else {
                Some(u.to_string())
            }
        })
}

fn profile_no_proxy_extra_line(state: &ProxmuxState, cluster: &StoredCluster) -> Option<String> {
    let raw = cluster.proxy_id.as_deref().map(str::trim).unwrap_or("");
    if raw.is_empty() || raw.eq_ignore_ascii_case(PROXY_DIRECT_ID) {
        return None;
    }
    state
        .proxy_profiles
        .iter()
        .find(|p| p.id == raw && p.is_enabled)
        .map(|p| p.no_proxy_extra.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn http_client(allow_insecure_tls: bool, state: &ProxmuxState, cluster: Option<&StoredCluster>) -> Result<reqwest::blocking::Client> {
    let mut b = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("NoSuckShell-PROXMUX/", env!("CARGO_PKG_VERSION")));
    if allow_insecure_tls {
        b = b.danger_accept_invalid_certs(true);
    }
    let proxy_url = cluster
        .and_then(|c| resolve_proxy_http_url(state, c))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(ref url) = proxy_url {
        let prof_extra_owned = cluster.and_then(|c| profile_no_proxy_extra_line(state, c));
        let no_proxy_eff = effective_no_proxy(state, cluster, prof_extra_owned.as_deref());
        let mut p = Proxy::all(url).context("parse HTTP proxy URL")?;
        if !no_proxy_eff.is_empty() {
            p = p.no_proxy(reqwest::NoProxy::from_string(&no_proxy_eff));
        }
        b = b.proxy(p);
    }
    b.build().context("build HTTP client")
}

fn try_fetch_version(
    client: &reqwest::blocking::Client,
    base_url: &str,
    cluster: &StoredCluster,
) -> Result<serde_json::Value> {
    pve_get_json_data(client, cluster, base_url, "/api2/json/version")
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
    cluster: &StoredCluster,
    primary: &str,
    failover: &[String],
    path_tail: &str,
) -> Option<Value> {
    for base in std::iter::once(primary.to_string()).chain(failover.iter().cloned()) {
        let base = normalize_base_url(&base);
        if base.is_empty() {
            continue;
        }
        if let Ok(data) = pve_get_json_data(client, cluster, &base, path_tail) {
            return Some(data);
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

fn legacy_api_user_from_token_id(api_token_id: &str) -> Option<String> {
    let trimmed = api_token_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    let user = trimmed.split('!').next().unwrap_or("").trim();
    if user.is_empty() {
        None
    } else {
        Some(user.to_string())
    }
}

/// Migrates token-based clusters to direct-login semantics.
/// Token secrets are dropped so UI can request a real password.
fn migrate_legacy_token_clusters(state: &mut ProxmuxState) -> usize {
    let mut changed = 0usize;
    for cluster in state.clusters.values_mut() {
        if cluster.api_token_id.trim().is_empty() {
            continue;
        }
        let mut cluster_changed = false;
        if cluster.api_user.trim().is_empty() {
            if let Some(legacy_user) = legacy_api_user_from_token_id(&cluster.api_token_id) {
                cluster.api_user = legacy_user;
                cluster_changed = true;
            }
        }
        if cluster.api_secret_plain.as_ref().is_some_and(|s| !s.is_empty()) || cluster.api_secret_encrypted.is_some() {
            cluster.api_secret_plain = None;
            cluster.api_secret_encrypted = None;
            cluster_changed = true;
        }
        if cluster_changed {
            changed += 1;
        }
    }
    changed
}

fn cluster_to_public(c: &StoredCluster) -> Value {
    let has_password = c.api_secret_plain.as_ref().is_some_and(|s| !s.is_empty()) || c.api_secret_encrypted.is_some();
    let requires_reauth = !c.api_token_id.trim().is_empty();
    json!({
        "id": c.id,
        "name": c.name,
        "proxmoxUrl": normalize_base_url(&c.proxmox_url),
        "apiUser": c.api_user,
        "totpCode": c.totp_code,
        "hasPassword": has_password,
        "requiresReauth": requires_reauth,
        "failoverUrls": c.failover_urls.iter().map(|u| normalize_base_url(u)).collect::<Vec<_>>(),
        "isEnabled": c.is_enabled,
        "allowInsecureTls": c.allow_insecure_tls,
        "proxyId": c.proxy_id,
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
        "legacyTokenClusters": s.clusters.values().filter(|c| !c.api_token_id.trim().is_empty()).count(),
        "favoritesByCluster": favorites_by_cluster,
        "httpProxyUrl": s.http_proxy_url,
        "noProxy": s.no_proxy,
        "proxyProfiles": s.proxy_profiles.iter().map(|p| json!({
            "id": p.id,
            "name": p.name,
            "url": p.url,
            "noProxyExtra": p.no_proxy_extra,
            "isEnabled": p.is_enabled,
        })).collect::<Vec<_>>(),
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProxySettingsPayload {
    #[serde(default)]
    http_proxy_url: String,
    #[serde(default)]
    no_proxy: String,
}

fn save_proxy_settings(arg: &Value) -> Result<Value> {
    let p: SaveProxySettingsPayload = serde_json::from_value(arg.clone()).context("parse saveProxySettings")?;
    let mut state = load_state()?;
    state.http_proxy_url = p.http_proxy_url.trim().to_string();
    state.no_proxy = p.no_proxy.trim().to_string();
    if !state.http_proxy_url.is_empty() {
        Proxy::all(&state.http_proxy_url).context("invalid HTTP proxy URL")?;
    }
    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyProfileWire {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    no_proxy_extra: String,
    #[serde(default = "default_true")]
    is_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProxyProfilesPayload {
    profiles: Vec<ProxyProfileWire>,
}

fn save_proxy_profiles(arg: &Value) -> Result<Value> {
    let p: SaveProxyProfilesPayload = serde_json::from_value(arg.clone()).context("parse saveProxyProfiles")?;
    let mut state = load_state()?;
    let mut out: Vec<ProxyProfile> = Vec::new();
    let mut seen_ids = HashSet::<String>::new();
    for w in p.profiles {
        let id = w.id.trim();
        if id.is_empty() {
            continue;
        }
        if id.eq_ignore_ascii_case(PROXY_DIRECT_ID) {
            anyhow::bail!("proxy profile id \"{PROXY_DIRECT_ID}\" is reserved");
        }
        if !seen_ids.insert(id.to_string()) {
            anyhow::bail!("duplicate proxy profile id: {id}");
        }
        let url = w.url.trim();
        if !url.is_empty() {
            Proxy::all(url).context("invalid proxy profile URL")?;
        }
        out.push(ProxyProfile {
            id: id.to_string(),
            name: w.name.trim().to_string(),
            url: url.to_string(),
            no_proxy_extra: w.no_proxy_extra.trim().to_string(),
            is_enabled: w.is_enabled,
        });
    }
    let valid: HashSet<String> = out.iter().map(|p| p.id.clone()).collect();
    for c in state.clusters.values_mut() {
        if let Some(pid) = c.proxy_id.clone() {
            let t = pid.trim();
            if t.is_empty() || t.eq_ignore_ascii_case(PROXY_DIRECT_ID) {
                continue;
            }
            if !valid.contains(t) {
                c.proxy_id = None;
            }
        }
    }
    state.proxy_profiles = out;
    save_state(&state)?;
    Ok(json!({ "ok": true }))
}

fn normalize_cluster_proxy_id(raw: Option<String>) -> Option<String> {
    let s = raw?.trim().to_string();
    if s.is_empty() {
        None
    } else if s.eq_ignore_ascii_case(PROXY_DIRECT_ID) {
        Some(PROXY_DIRECT_ID.to_string())
    } else {
        Some(s)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveClusterPayload {
    id: Option<String>,
    name: String,
    #[serde(default)]
    proxmox_url: String,
    #[serde(default)]
    api_user: String,
    #[serde(default)]
    totp_code: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    failover_urls: Vec<String>,
    #[serde(default = "default_true")]
    is_enabled: bool,
    #[serde(default)]
    allow_insecure_tls: bool,
    #[serde(default)]
    proxy_id: Option<String>,
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
        anyhow::bail!("Proxmox URL is required.");
    }
    let api_user = payload.api_user.trim().to_string();
    if api_user.is_empty() {
        anyhow::bail!("Username is required.");
    }

    let (plain, enc) = if let Some(existing) = state.clusters.get(&id) {
        merge_stored_secret(&payload.password, existing)?
    } else {
        if payload.password.is_empty() {
            anyhow::bail!("Password is required for a new cluster.");
        }
        write_api_secret_fields(&payload.password)?
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
        api_user,
        totp_code: payload.totp_code.trim().to_string(),
        api_token_id: String::new(),
        api_secret_plain: plain,
        api_secret_encrypted: enc,
        failover_urls,
        is_enabled: payload.is_enabled,
        allow_insecure_tls: payload.allow_insecure_tls,
        proxy_id: normalize_cluster_proxy_id(payload.proxy_id),
    };

    state.clusters.insert(id.clone(), cluster);
    if state.active_cluster_id.is_none() {
        state.active_cluster_id = Some(id.clone());
    }
    save_state(&state)?;
    proxmux_cache_invalidate_cluster(&id);
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
    proxmux_cache_invalidate_cluster(&cluster_id);
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
    proxmux_cache_debug_log("active cluster changed");
    Ok(json!({ "ok": true }))
}

fn test_connection(arg: &Value) -> Result<Value> {
    let ClusterIdArg { cluster_id } = serde_json::from_value(arg.clone()).context("parse testConnection")?;
    let state = load_state()?;
    let c = state
        .clusters
        .get(&cluster_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cluster"))?;
    test_cluster_core(c, &state)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftClusterArg {
    #[serde(default)]
    proxmox_url: String,
    #[serde(default)]
    api_user: String,
    #[serde(default)]
    totp_code: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    failover_urls: Vec<String>,
    #[serde(default)]
    allow_insecure_tls: bool,
    #[serde(default)]
    proxy_id: Option<String>,
}

fn test_connection_draft(arg: &Value) -> Result<Value> {
    let d: DraftClusterArg = serde_json::from_value(arg.clone()).context("parse testConnectionDraft")?;
    let proxmox_url = normalize_base_url(&d.proxmox_url);
    if proxmox_url.is_empty() {
        return Ok(json!({
            "ok": false,
            "message": "Proxmox URL is required."
        }));
    }
    let api_user = d.api_user.trim().to_string();
    if api_user.is_empty() {
        return Ok(json!({
            "ok": false,
            "message": "Username is required."
        }));
    }
    if d.password.is_empty() {
        return Ok(json!({
            "ok": false,
            "message": "Password is required to test a connection."
        }));
    }
    let c = StoredCluster {
        id: "draft".to_string(),
        name: String::new(),
        proxmox_url,
        api_user,
        totp_code: d.totp_code.trim().to_string(),
        api_token_id: String::new(),
        api_secret_plain: Some(d.password),
        api_secret_encrypted: None,
        failover_urls: d.failover_urls,
        is_enabled: true,
        allow_insecure_tls: d.allow_insecure_tls,
        proxy_id: normalize_cluster_proxy_id(d.proxy_id),
    };
    let state = load_state()?;
    test_cluster_core(&c, &state)
}

fn test_cluster_core(c: &StoredCluster, state: &ProxmuxState) -> Result<Value> {
    let client = http_client(c.allow_insecure_tls, state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);
    if primary.is_empty() {
        return Ok(json!({ "ok": false, "message": "Proxmox URL is empty." }));
    }
    match with_failover(&primary, &c.failover_urls, |base| try_fetch_version(&client, base, c)) {
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
    let cache_key = proxmux_cache_key_for_fetch_resources(&cluster_id);
    proxmux_cached_json(cache_key, ProxmuxCacheBucket::FetchResources, || {
        let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
        let primary = normalize_base_url(&c.proxmox_url);

        let data = with_failover(&primary, &c.failover_urls, |base| {
            pve_get_json_data(&client, c, base, "/api2/json/cluster/resources")
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
                try_pve_get_json_data_optional(&client, c, &primary, &c.failover_urls, &path)
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
                try_pve_get_json_data_optional(&client, c, &primary, &c.failover_urls, &path)
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
    })
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
            "Permission denied (HTTP 403). Ensure this account has power-management rights for this guest. {body}"
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
    let cache_key = proxmux_cache_key_for_guest_status(&cluster_id, &node, typ, &vmid);
    proxmux_cached_json(cache_key, ProxmuxCacheBucket::GuestStatus, || {
        let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
        let primary = normalize_base_url(&c.proxmox_url);

        let path_tail = format!("/api2/json/nodes/{node}/{typ}/{vmid}/status/current");
        let data = with_failover(&primary, &c.failover_urls, |base| {
            pve_get_json_data(&client, c, base, &path_tail)
        })?;

        Ok(json!({ "ok": true, "data": data }))
    })
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
    let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/{typ}/{vmid}/spiceproxy");
    let data = with_failover(&primary, &c.failover_urls, |base| {
        pve_post_json_data(&client, c, base, &path_tail, &[])
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
    let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/qemu/{vmid}/vncproxy");
    let (api_origin, data, auth_cookie) = with_failover(&primary, &c.failover_urls, |base| {
        let norm = normalize_base_url(base);
        let data = pve_post_json_data(&client, c, &norm, &path_tail, &[])?;
        let auth = session_auth_for_base(&client, c, &norm, false)?;
        Ok((norm, data, auth.cookie_header))
    })?;

    Ok(json!({ "ok": true, "apiOrigin": api_origin, "authCookie": auth_cookie, "data": data }))
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
    let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);

    let api_user = c.api_user.clone();
    let path_tail = format!("/api2/json/nodes/{node}/lxc/{vmid}/termproxy");
    let (api_origin, data, auth_cookie) = with_failover(&primary, &c.failover_urls, |base| {
        let norm = normalize_base_url(base);
        let data = pve_post_json_data(&client, c, &norm, &path_tail, &[])?;
        let auth = session_auth_for_base(&client, c, &norm, false)?;
        Ok((norm, data, auth.cookie_header))
    })?;

    Ok(json!({ "ok": true, "apiOrigin": api_origin, "apiUser": api_user, "authCookie": auth_cookie, "data": data }))
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
    let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!("/api2/json/nodes/{node}/qemu/{vmid}/config");
    let data = with_failover(&primary, &c.failover_urls, |base| {
        pve_get_json_data(&client, c, base, &path_tail)
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
    let client = http_client(c.allow_insecure_tls, &state, Some(c))?;
    let primary = normalize_base_url(&c.proxmox_url);

    let path_tail = format!(
        "/api2/json/nodes/{node}/{typ}/{vmid}/status/{action_trim}"
    );
    with_failover(&primary, &c.failover_urls, |base| {
        pve_post_json_data(&client, c, base, &path_tail, &[])?;
        Ok(())
    })?;

    proxmux_cache_invalidate_after_guest_power(&cluster_id, &node, typ, &vmid);

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
    proxmux_cache_invalidate_after_toggle_favorite(&cluster_id);
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
    fn parse_ticket_session_auth_extracts_cookie_and_csrf() {
        let body = json!({
            "data": {
                "ticket": "PVE:user:abc",
                "CSRFPreventionToken": "csrf-123"
            }
        });
        let auth = parse_ticket_session_auth(&body).expect("ticket auth should parse");
        assert_eq!(auth.cookie_header, "PVEAuthCookie=PVE:user:abc");
        assert_eq!(auth.csrf_prevention_token, "csrf-123");
    }

    #[test]
    fn parse_ticket_session_auth_requires_ticket() {
        let body = json!({
            "data": {
                "CSRFPreventionToken": "csrf-123"
            }
        });
        let err = parse_ticket_session_auth(&body).expect_err("missing ticket must fail");
        let msg = format!("{err:#}");
        assert!(
            msg.contains("missing ticket in access/ticket response"),
            "unexpected error: {msg}"
        );
    }

    #[test]
    fn legacy_api_user_from_token_id_extracts_user() {
        assert_eq!(
            legacy_api_user_from_token_id("root@pam!mytoken"),
            Some("root@pam".to_string())
        );
        assert_eq!(
            legacy_api_user_from_token_id("  alice@pve!ops  "),
            Some("alice@pve".to_string())
        );
        assert_eq!(legacy_api_user_from_token_id(""), None);
        assert_eq!(legacy_api_user_from_token_id("!tok"), None);
    }

    #[test]
    fn migrate_legacy_token_clusters_drops_secret_and_preserves_metadata() {
        let mut state = ProxmuxState::default();
        state.active_cluster_id = Some("lab".to_string());
        state.clusters.insert(
            "lab".to_string(),
            StoredCluster {
                id: "lab".to_string(),
                name: "Lab".to_string(),
                proxmox_url: "https://pve.example.com:8006".to_string(),
                api_user: String::new(),
                totp_code: String::new(),
                api_token_id: "root@pam!legacy".to_string(),
                api_secret_plain: Some("legacy-token-secret".to_string()),
                api_secret_encrypted: None,
                failover_urls: vec!["https://pve2.example.com:8006".to_string()],
                is_enabled: true,
                allow_insecure_tls: true,
                proxy_id: None,
            },
        );
        state.favorites.insert(
            "lab".to_string(),
            vec!["node:pve".to_string(), "qemu:pve:100".to_string()],
        );

        let changed = migrate_legacy_token_clusters(&mut state);
        assert_eq!(changed, 1);

        let migrated = state.clusters.get("lab").expect("cluster must exist");
        assert_eq!(migrated.api_user, "root@pam");
        assert_eq!(migrated.api_token_id, "root@pam!legacy");
        assert!(migrated.api_secret_plain.is_none());
        assert!(migrated.api_secret_encrypted.is_none());
        assert_eq!(migrated.failover_urls, vec!["https://pve2.example.com:8006".to_string()]);
        assert!(migrated.allow_insecure_tls);
        assert_eq!(state.active_cluster_id.as_deref(), Some("lab"));
        assert_eq!(
            state.favorites.get("lab").cloned().unwrap_or_default(),
            vec!["node:pve".to_string(), "qemu:pve:100".to_string()]
        );
    }

    #[test]
    fn migrate_legacy_token_clusters_skips_non_legacy_entries() {
        let mut state = ProxmuxState::default();
        state.clusters.insert(
            "new".to_string(),
            StoredCluster {
                id: "new".to_string(),
                name: "New".to_string(),
                proxmox_url: "https://pve.example.com:8006".to_string(),
                api_user: "root@pam".to_string(),
                totp_code: "123456".to_string(),
                api_token_id: String::new(),
                api_secret_plain: Some("real-password".to_string()),
                api_secret_encrypted: None,
                failover_urls: vec![],
                is_enabled: true,
                allow_insecure_tls: false,
                proxy_id: None,
            },
        );

        let changed = migrate_legacy_token_clusters(&mut state);
        assert_eq!(changed, 0);
        let cluster = state.clusters.get("new").expect("cluster must exist");
        assert_eq!(cluster.api_user, "root@pam");
        assert_eq!(cluster.api_secret_plain.as_deref(), Some("real-password"));
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

    #[test]
    fn cache_key_for_fetch_resources_includes_cluster() {
        assert_eq!(
            proxmux_cache_key_for_fetch_resources("homelab"),
            "fetchResources:homelab"
        );
    }

    #[test]
    fn cache_key_for_guest_status_is_stable() {
        assert_eq!(
            proxmux_cache_key_for_guest_status("a", "pve1", "qemu", "100"),
            "guestStatus:a:pve1:qemu:100"
        );
    }

    #[test]
    fn proxmux_ttl_matrix_defaults_are_balanced() {
        assert_eq!(
            proxmux_cache_ttl_ms(ProxmuxCacheBucket::FetchResources),
            9_000
        );
        assert_eq!(
            proxmux_cache_ttl_ms(ProxmuxCacheBucket::GuestStatus),
            5_000
        );
    }

    #[test]
    fn proxmux_cache_entry_freshness_checks_expiry() {
        let entry = ProxmuxCacheEntry {
            value: json!({"ok": true}),
            cached_at_ms: 1_000,
            expires_at_ms: 2_000,
        };
        assert!(entry.is_fresh_at(1_999));
        assert!(!entry.is_fresh_at(2_000));
    }

    #[test]
    fn proxmux_cache_state_invalidation_by_prefix_removes_matching_keys() {
        let mut state = ProxmuxCacheState::default();
        state.entries.insert(
            "fetchResources:a".to_string(),
            ProxmuxCacheEntry {
                value: json!({"ok": true}),
                cached_at_ms: 1,
                expires_at_ms: 2,
            },
        );
        state.entries.insert(
            "guestStatus:a:n1:qemu:100".to_string(),
            ProxmuxCacheEntry {
                value: json!({"ok": true}),
                cached_at_ms: 1,
                expires_at_ms: 2,
            },
        );
        state.entries.insert(
            "fetchResources:b".to_string(),
            ProxmuxCacheEntry {
                value: json!({"ok": true}),
                cached_at_ms: 1,
                expires_at_ms: 2,
            },
        );
        let removed = state.invalidate_prefix("fetchResources:a");
        assert_eq!(removed, 1);
        assert!(state.entries.contains_key("guestStatus:a:n1:qemu:100"));
        assert!(state.entries.contains_key("fetchResources:b"));
        assert!(!state.entries.contains_key("fetchResources:a"));
    }

    #[test]
    fn guest_power_invalidation_removes_targeted_keys_only() {
        let (lock, _) = proxmux_cache_sync();
        {
            let mut state = lock.lock().expect("cache lock");
            state.entries.clear();
            state.in_flight.clear();
            state.entries.insert(
                "fetchResources:a".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
            state.entries.insert(
                "guestStatus:a:n1:qemu:100".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
            state.entries.insert(
                "guestStatus:a:n1:qemu:200".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
            state.entries.insert(
                "fetchResources:b".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
        }

        proxmux_cache_invalidate_after_guest_power("a", "n1", "qemu", "100");

        let state = lock.lock().expect("cache lock");
        assert!(!state.entries.contains_key("fetchResources:a"));
        assert!(!state.entries.contains_key("guestStatus:a:n1:qemu:100"));
        assert!(state.entries.contains_key("guestStatus:a:n1:qemu:200"));
        assert!(state.entries.contains_key("fetchResources:b"));
    }

    #[test]
    fn toggle_favorite_invalidation_removes_only_cluster_resources_cache() {
        let (lock, _) = proxmux_cache_sync();
        {
            let mut state = lock.lock().expect("cache lock");
            state.entries.clear();
            state.in_flight.clear();
            state.entries.insert(
                "fetchResources:a".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
            state.entries.insert(
                "guestStatus:a:n1:qemu:100".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
            state.entries.insert(
                "fetchResources:b".to_string(),
                ProxmuxCacheEntry {
                    value: json!({"ok": true}),
                    cached_at_ms: 1,
                    expires_at_ms: 10_000,
                },
            );
        }

        proxmux_cache_invalidate_after_toggle_favorite("a");

        let state = lock.lock().expect("cache lock");
        assert!(!state.entries.contains_key("fetchResources:a"));
        assert!(state.entries.contains_key("guestStatus:a:n1:qemu:100"));
        assert!(state.entries.contains_key("fetchResources:b"));
    }
}
