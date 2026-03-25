use super::{HostEnrichContext, NssPlugin, PluginCapability, PluginManifest};
use crate::ssh_config::HostConfig;
use anyhow::Result;

pub const NSS_COMMANDER_PLUGIN_ID: &str = "dev.nosuckshell.plugin.nss-commander";

pub struct FileWorkspacePlugin;

impl NssPlugin for FileWorkspacePlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: NSS_COMMANDER_PLUGIN_ID.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            display_name: "NSS-Commander".to_string(),
            capabilities: vec![PluginCapability::SettingsUi],
        }
    }

    fn required_entitlement(&self) -> Option<&'static str> {
        Some("dev.nosuckshell.addon.file-workspace")
    }

    fn enrich_host_config(&self, _host: &mut HostConfig, _ctx: &HostEnrichContext) -> Result<()> {
        Ok(())
    }

    fn invoke(&self, method: &str, arg: &serde_json::Value) -> Result<serde_json::Value> {
        match method {
            "ping" => Ok(serde_json::json!({ "ok": true, "message": "pong", "echo": arg })),
            _ => anyhow::bail!("unknown method: {method}"),
        }
    }
}
