use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct HostMetadata {
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "lastUsedAt", default)]
    pub last_used_at: Option<u64>,
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
