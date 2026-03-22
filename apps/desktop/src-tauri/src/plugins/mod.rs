//! Built-in plugin registry and host-config enrichment hooks.
mod demo;
mod file_workspace;
mod proxmux;

use crate::license;
use crate::ssh_config::HostConfig;
use crate::ssh_home::effective_ssh_dir;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginCapability {
    CredentialProvider,
    SettingsUi,
    HostMetadataEnricher,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub version: String,
    pub display_name: String,
    pub capabilities: Vec<PluginCapability>,
}

pub struct HostEnrichContext<'a> {
    pub original: &'a HostConfig,
}

pub trait NssPlugin: Send + Sync {
    fn manifest(&self) -> PluginManifest;
    /// If set, `license::has_entitlement` must be true for hooks to run.
    fn required_entitlement(&self) -> Option<&'static str> {
        None
    }
    fn enrich_host_config(&self, host: &mut HostConfig, ctx: &HostEnrichContext) -> Result<()>;
    fn invoke(&self, method: &str, _arg: &serde_json::Value) -> Result<serde_json::Value> {
        anyhow::bail!("unknown plugin method: {method}");
    }
}

static REGISTRY: OnceLock<Vec<&'static dyn NssPlugin>> = OnceLock::new();

pub fn register_builtin_plugins() {
    let _ = REGISTRY.set(vec![
        &file_workspace::FileWorkspacePlugin as &dyn NssPlugin,
        &demo::DemoPlugin as &dyn NssPlugin,
        &proxmux::ProxmuxPlugin as &dyn NssPlugin,
    ]);
}

fn all_plugins() -> &'static [&'static dyn NssPlugin] {
    REGISTRY.get().map(|v| v.as_slice()).unwrap_or(&[])
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct PluginsFile {
    #[serde(default)]
    enabled: HashMap<String, bool>,
}

fn plugins_state_path() -> Result<PathBuf> {
    Ok(effective_ssh_dir()?.join("nosuckshell.plugins.json"))
}

fn load_plugins_file() -> Result<PluginsFile> {
    let path = plugins_state_path()?;
    if !path.exists() {
        return Ok(PluginsFile::default());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&raw).context("parse nosuckshell.plugins.json")
}

fn save_plugins_file(state: &PluginsFile) -> Result<()> {
    let path = plugins_state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(state)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn is_plugin_enabled(plugin_id: &str) -> Result<bool> {
    let state = load_plugins_file()?;
    Ok(state
        .enabled
        .get(plugin_id)
        .copied()
        .unwrap_or(true))
}

pub fn set_plugin_enabled_backend(plugin_id: &str, enabled: bool) -> Result<()> {
    let mut state = load_plugins_file()?;
    state.enabled.insert(plugin_id.to_string(), enabled);
    save_plugins_file(&state)
}

/// Runs after store resolution; may adjust `HostConfig` for SSH/SFTP.
pub fn enrich_resolved_host(resolved: &mut HostConfig, original: &HostConfig) -> Result<()> {
    let ctx = HostEnrichContext { original };
    let state = load_plugins_file()?;
    for plugin in all_plugins() {
        let id = plugin.manifest().id.clone();
        if !state.enabled.get(&id).copied().unwrap_or(true) {
            continue;
        }
        if let Some(ent) = plugin.required_entitlement() {
            if !license::has_entitlement(ent) {
                continue;
            }
        }
        plugin.enrich_host_config(resolved, &ctx)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginListEntry {
    pub manifest: PluginManifest,
    pub enabled: bool,
    pub entitlement_ok: bool,
}

pub fn list_plugins_backend() -> Result<Vec<PluginListEntry>> {
    let mut out = Vec::new();
    for plugin in all_plugins() {
        let manifest = plugin.manifest();
        let enabled = is_plugin_enabled(&manifest.id)?;
        let entitlement_ok = plugin
            .required_entitlement()
            .map(license::has_entitlement)
            .unwrap_or(true);
        out.push(PluginListEntry {
            manifest,
            enabled,
            entitlement_ok,
        });
    }
    Ok(out)
}

pub fn plugin_invoke_backend(plugin_id: &str, method: String, arg: serde_json::Value) -> Result<serde_json::Value> {
    let plugin = all_plugins()
        .iter()
        .find(|p| p.manifest().id == plugin_id)
        .with_context(|| format!("unknown plugin: {plugin_id}"))?;
    if !is_plugin_enabled(plugin_id)? {
        anyhow::bail!("plugin is disabled: {plugin_id}");
    }
    if let Some(ent) = plugin.required_entitlement() {
        if !license::has_entitlement(ent) {
            anyhow::bail!("missing license entitlement for plugin: {plugin_id}");
        }
    }
    plugin.invoke(&method, &arg)
}
