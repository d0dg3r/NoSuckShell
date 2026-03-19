use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ViewProfile {
    pub id: String,
    pub name: String,
    pub order: i64,
    #[serde(rename = "filterGroup", default)]
    pub filter_group: serde_json::Value,
    #[serde(rename = "sortRules", default)]
    pub sort_rules: Vec<serde_json::Value>,
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
    Ok(profiles_dir()?.join("nosuckshell.views.json"))
}

pub fn load_view_profiles() -> anyhow::Result<Vec<ViewProfile>> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    let mut parsed = serde_json::from_str::<Vec<ViewProfile>>(&raw)?;
    parsed.sort_by_key(|entry| entry.order);
    Ok(parsed)
}

pub fn save_view_profile(profile: &ViewProfile) -> anyhow::Result<()> {
    let mut profiles = load_view_profiles()?;
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
            if normalized.order < 0 {
                normalized.order = profiles.len() as i64;
            }
            profiles.push(normalized);
        }
    }

    profiles.sort_by_key(|entry| entry.order);
    for (index, entry) in profiles.iter_mut().enumerate() {
        entry.order = index as i64;
    }

    let dir = profiles_dir()?;
    fs::create_dir_all(&dir)?;
    let path = profiles_path()?;
    let raw = serde_json::to_string_pretty(&profiles)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn delete_view_profile(profile_id: &str) -> anyhow::Result<()> {
    let mut profiles = load_view_profiles()?;
    profiles.retain(|entry| entry.id != profile_id);
    profiles.sort_by_key(|entry| entry.order);
    for (index, entry) in profiles.iter_mut().enumerate() {
        entry.order = index as i64;
    }
    let dir = profiles_dir()?;
    fs::create_dir_all(&dir)?;
    let path = profiles_path()?;
    let raw = serde_json::to_string_pretty(&profiles)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn reorder_view_profiles(ids: &[String]) -> anyhow::Result<()> {
    let profiles = load_view_profiles()?;
    let mut next = Vec::<ViewProfile>::new();
    for id in ids {
        if let Some(profile) = profiles.iter().find(|entry| entry.id == *id) {
            next.push(profile.clone());
        }
    }
    for profile in profiles {
        if !next.iter().any(|entry| entry.id == profile.id) {
            next.push(profile);
        }
    }
    for (index, entry) in next.iter_mut().enumerate() {
        entry.order = index as i64;
    }

    let dir = profiles_dir()?;
    fs::create_dir_all(&dir)?;
    let path = profiles_path()?;
    let raw = serde_json::to_string_pretty(&next)?;
    fs::write(path, raw)?;
    Ok(())
}
