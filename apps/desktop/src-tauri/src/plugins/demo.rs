use super::{HostEnrichContext, NssPlugin, PluginCapability, PluginManifest};
use crate::ssh_config::HostConfig;
use anyhow::Result;

pub const DEMO_PLUGIN_ID: &str = "dev.nosuckshell.plugin.demo";

pub struct DemoPlugin;

impl NssPlugin for DemoPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: DEMO_PLUGIN_ID.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            display_name: "Demo plugin".to_string(),
            capabilities: vec![
                PluginCapability::CredentialProvider,
                PluginCapability::SettingsUi,
            ],
        }
    }

    fn enrich_host_config(&self, host: &mut HostConfig, ctx: &HostEnrichContext) -> Result<()> {
        if ctx.original.host.starts_with("demo:") {
            // Visible when running `tauri dev` from a terminal; does not alter SSH wire behavior.
            eprintln!(
                "[NoSuckShell demo plugin] enrich_host_config for host alias {:?}",
                ctx.original.host
            );
        }
        let _ = host;
        Ok(())
    }

    fn invoke(&self, method: &str, arg: &serde_json::Value) -> Result<serde_json::Value> {
        match method {
            "ping" => Ok(serde_json::json!({ "ok": true, "message": "pong", "echo": arg })),
            _ => anyhow::bail!("unknown method: {method}"),
        }
    }
}
