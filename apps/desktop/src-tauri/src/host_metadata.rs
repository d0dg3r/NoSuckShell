use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Matches OpenSSH `StrictHostKeyChecking` modes used by NoSuckShell (kebab-case in JSON).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum StrictHostKeyPolicy {
    #[default]
    Ask,
    AcceptNew,
    No,
}

impl StrictHostKeyPolicy {
    pub fn as_ssh_value(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::AcceptNew => "accept-new",
            Self::No => "no",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct HostMetadata {
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "lastUsedAt", default)]
    pub last_used_at: Option<u64>,
    #[serde(rename = "trustHostDefault", default)]
    pub trust_host_default: bool,
    /// When absent, `trust_host_default` still selects `accept-new` vs `ask` for migration.
    #[serde(rename = "strictHostKeyPolicy", default, skip_serializing_if = "Option::is_none")]
    pub strict_host_key_policy: Option<StrictHostKeyPolicy>,
    /// Bastion / jump host: offered in ProxyJump shortcut lists when any host has this set.
    #[serde(rename = "isJumpHost", default)]
    pub is_jump_host: bool,
}

/// Effective `StrictHostKeyChecking` for `ssh -o` (no interactive prompts when not `ask`).
pub fn resolved_strict_host_key_checking(meta: Option<&HostMetadata>) -> &'static str {
    let Some(m) = meta else {
        return "ask";
    };
    match m.strict_host_key_policy {
        Some(StrictHostKeyPolicy::AcceptNew) => "accept-new",
        Some(StrictHostKeyPolicy::No) => "no",
        Some(StrictHostKeyPolicy::Ask) => "ask",
        None => {
            if m.trust_host_default {
                "accept-new"
            } else {
                "ask"
            }
        }
    }
}

pub fn resolved_strict_host_key_for_alias(alias: &str) -> &'static str {
    if alias.trim().is_empty() {
        return "ask";
    }
    let Ok(store) = load_metadata() else {
        return "ask";
    };
    resolved_strict_host_key_checking(store.hosts.get(alias))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostMetadataStore {
    #[serde(rename = "defaultUser", default)]
    pub default_user: String,
    #[serde(default)]
    pub hosts: HashMap<String, HostMetadata>,
}

impl Default for HostMetadataStore {
    fn default() -> Self {
        Self {
            default_user: String::new(),
            hosts: HashMap::new(),
        }
    }
}

fn metadata_dir() -> anyhow::Result<PathBuf> {
    crate::ssh_home::effective_ssh_dir()
}

fn metadata_path() -> anyhow::Result<PathBuf> {
    Ok(metadata_dir()?.join("nosuckshell.metadata.json"))
}

pub fn load_metadata() -> anyhow::Result<HostMetadataStore> {
    let path = metadata_path()?;
    if !path.exists() {
        return Ok(HostMetadataStore::default());
    }
    let raw = fs::read_to_string(path)?;
    let parsed = serde_json::from_str::<HostMetadataStore>(&raw)?;
    Ok(parsed)
}

pub fn save_metadata(store: &HostMetadataStore) -> anyhow::Result<()> {
    let dir = metadata_dir()?;
    fs::create_dir_all(&dir)?;
    let path = metadata_path()?;
    let raw = serde_json::to_string_pretty(store)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn touch_host_last_used(host_alias: &str) -> anyhow::Result<()> {
    let mut store = load_metadata()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .as_secs();
    let entry = store
        .hosts
        .entry(host_alias.to_string())
        .or_insert_with(HostMetadata::default);
    entry.last_used_at = Some(now);
    save_metadata(&store)?;
    Ok(())
}
