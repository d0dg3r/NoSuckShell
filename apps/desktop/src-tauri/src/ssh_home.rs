//! Central resolution of the SSH config directory (`config`, store, profiles, known_hosts).
//! Default: `home::home_dir()/.ssh` (on Windows typically `%USERPROFILE%\.ssh`).
//! Optional override persisted under `data_local_dir()/NoSuckShell/ssh-path.json`.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDirInfo {
    pub default_path: String,
    pub effective_path: String,
    pub override_path: Option<String>,
    pub user_profile: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct SshPathFile {
    #[serde(rename = "sshDirOverride")]
    ssh_dir_override: Option<String>,
}

fn settings_file_path() -> anyhow::Result<PathBuf> {
    let base = dirs::data_local_dir().ok_or_else(|| anyhow::anyhow!("data local directory not found"))?;
    Ok(base.join("NoSuckShell").join("ssh-path.json"))
}

/// `~/.ssh` (or `%USERPROFILE%\.ssh` on Windows).
pub fn default_ssh_dir() -> anyhow::Result<PathBuf> {
    let home = home::home_dir().ok_or_else(|| anyhow::anyhow!("home directory not found"))?;
    Ok(home.join(".ssh"))
}

pub fn load_ssh_dir_override() -> anyhow::Result<Option<PathBuf>> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let parsed: SshPathFile = serde_json::from_str(&raw).unwrap_or_default();
    Ok(parsed.ssh_dir_override.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(PathBuf::from(t))
        }
    }))
}

/// Active SSH root: override if set and absolute, else default.
pub fn effective_ssh_dir() -> anyhow::Result<PathBuf> {
    if let Some(p) = load_ssh_dir_override()? {
        if p.is_absolute() {
            return Ok(p);
        }
    }
    default_ssh_dir()
}

pub fn set_ssh_dir_override(path: Option<PathBuf>) -> anyhow::Result<()> {
    let file = settings_file_path()?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let payload = SshPathFile {
        ssh_dir_override: path.map(|p| p.to_string_lossy().into_owned()),
    };
    let raw = serde_json::to_string_pretty(&payload)?;
    fs::write(&file, raw)?;
    Ok(())
}

pub fn get_ssh_dir_info_for_ipc() -> anyhow::Result<SshDirInfo> {
    let default_path = default_ssh_dir()?.display().to_string();
    let effective_path = effective_ssh_dir()?.display().to_string();
    let override_path = load_ssh_dir_override()?.map(|p| p.display().to_string());
    let user_profile = env::var("USERPROFILE").ok().filter(|s| !s.trim().is_empty());
    Ok(SshDirInfo {
        default_path,
        effective_path,
        override_path,
        user_profile,
    })
}

/// Validate and persist override. `None` or empty clears override.
pub fn apply_ssh_dir_override_from_ipc(path: Option<String>) -> anyhow::Result<()> {
    let opt = match path {
        None => None,
        Some(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                let p = PathBuf::from(t);
                if !p.is_absolute() {
                    anyhow::bail!("SSH directory must be an absolute path");
                }
                Some(p)
            }
        }
    };
    set_ssh_dir_override(opt)
}
