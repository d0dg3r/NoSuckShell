use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutPaneSnapshot {
    pub width: i64,
    pub height: i64,
    #[serde(rename = "hostAlias", default)]
    pub host_alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutProfile {
    pub id: String,
    pub name: String,
    #[serde(rename = "withHosts", default)]
    pub with_hosts: bool,
    #[serde(default)]
    pub panes: Vec<LayoutPaneSnapshot>,
    #[serde(rename = "splitTree", default)]
    pub split_tree: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

fn now_unix_seconds() -> anyhow::Result<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .as_secs())
}

fn profiles_dir() -> anyhow::Result<PathBuf> {
    let home = home::home_dir().ok_or_else(|| anyhow::anyhow!("home directory not found"))?;
    Ok(home.join(".ssh"))
}

fn profiles_path() -> anyhow::Result<PathBuf> {
    Ok(profiles_dir()?.join("nosuckshell.layouts.json"))
}

pub fn load_layout_profiles() -> anyhow::Result<Vec<LayoutProfile>> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    let parsed = serde_json::from_str::<Vec<LayoutProfile>>(&raw)?;
    Ok(parsed)
}

pub fn save_layout_profile(profile: &LayoutProfile) -> anyhow::Result<()> {
    let mut profiles = load_layout_profiles()?;
    let now = now_unix_seconds()?;
    let mut normalized = profile.clone();
    normalized.updated_at = now;

    match profiles.iter().position(|entry| entry.id == normalized.id) {
        Some(index) => {
            if normalized.created_at == 0 {
                normalized.created_at = profiles[index].created_at;
            }
            profiles[index] = normalized;
        }
        None => {
            if normalized.created_at == 0 {
                normalized.created_at = now;
            }
            profiles.push(normalized);
        }
    }

    let dir = profiles_dir()?;
    fs::create_dir_all(&dir)?;
    let path = profiles_path()?;
    let raw = serde_json::to_string_pretty(&profiles)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn delete_layout_profile(profile_id: &str) -> anyhow::Result<()> {
    let mut profiles = load_layout_profiles()?;
    profiles.retain(|entry| entry.id != profile_id);
    let dir = profiles_dir()?;
    fs::create_dir_all(&dir)?;
    let path = profiles_path()?;
    let raw = serde_json::to_string_pretty(&profiles)?;
    fs::write(path, raw)?;
    Ok(())
}
