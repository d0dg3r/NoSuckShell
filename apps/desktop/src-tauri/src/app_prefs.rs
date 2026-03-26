//! App-wide preferences stored beside the SSH directory (not in the encrypted entity store).
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

pub const DEFAULT_CONNECT_TIMEOUT_SECS: u32 = 3;
pub const DEFAULT_HTTP_REQUEST_TIMEOUT_SECS: u32 = 30;
pub const MIN_CONNECT_TIMEOUT_SECS: u32 = 1;
pub const MAX_CONNECT_TIMEOUT_SECS: u32 = 120;
pub const MIN_HTTP_REQUEST_TIMEOUT_SECS: u32 = 5;
pub const MAX_HTTP_REQUEST_TIMEOUT_SECS: u32 = 600;

const PREFS_FILENAME: &str = "nosuckshell.app_prefs.v1.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default = "default_connect_timeout_secs")]
    pub connect_timeout_secs: u32,
    #[serde(default = "default_http_request_timeout_secs")]
    pub http_request_timeout_secs: u32,
    #[serde(default)]
    pub nss_commander_use_classic_gutter: bool,
}

fn default_connect_timeout_secs() -> u32 {
    DEFAULT_CONNECT_TIMEOUT_SECS
}

fn default_http_request_timeout_secs() -> u32 {
    DEFAULT_HTTP_REQUEST_TIMEOUT_SECS
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            connect_timeout_secs: DEFAULT_CONNECT_TIMEOUT_SECS,
            http_request_timeout_secs: DEFAULT_HTTP_REQUEST_TIMEOUT_SECS,
            nss_commander_use_classic_gutter: false,
        }
    }
}

pub fn clamp_preferences(p: AppPreferences) -> AppPreferences {
    AppPreferences {
        connect_timeout_secs: p
            .connect_timeout_secs
            .clamp(MIN_CONNECT_TIMEOUT_SECS, MAX_CONNECT_TIMEOUT_SECS),
        http_request_timeout_secs: p
            .http_request_timeout_secs
            .clamp(MIN_HTTP_REQUEST_TIMEOUT_SECS, MAX_HTTP_REQUEST_TIMEOUT_SECS),
        nss_commander_use_classic_gutter: p.nss_commander_use_classic_gutter,
    }
}

fn prefs_path() -> Result<std::path::PathBuf, String> {
    crate::ssh_home::effective_ssh_dir()
        .map(|d| d.join(PREFS_FILENAME))
        .map_err(|e| e.to_string())
}

fn load_from_disk_merged() -> AppPreferences {
    let Ok(path) = prefs_path() else {
        return AppPreferences::default();
    };
    if !path.exists() {
        return AppPreferences::default();
    }
    let Ok(raw) = fs::read_to_string(&path) else {
        return AppPreferences::default();
    };
    let Ok(parsed) = serde_json::from_str::<AppPreferences>(&raw) else {
        return AppPreferences::default();
    };
    clamp_preferences(parsed)
}

static PREFS_CACHE: OnceLock<RwLock<AppPreferences>> = OnceLock::new();

fn cache() -> &'static RwLock<AppPreferences> {
    PREFS_CACHE.get_or_init(|| RwLock::new(load_from_disk_merged()))
}

pub fn current_preferences() -> AppPreferences {
    cache()
        .read()
        .map(|g| g.clone())
        .unwrap_or_else(|_| AppPreferences::default())
}

pub fn connect_timeout_duration() -> Duration {
    Duration::from_secs(u64::from(current_preferences().connect_timeout_secs))
}

/// libssh2 blocks indefinitely by default (`set_timeout(0)`). Use the same seconds budget as TCP
/// `ConnectTimeout` so handshake, known-host checks, and auth cannot hang the SFTP UI forever.
pub fn libssh2_session_timeout_ms() -> u32 {
    let secs = u64::from(current_preferences().connect_timeout_secs);
    let ms = secs.saturating_mul(1000);
    ms.clamp(1_000, 120_000) as u32
}

pub fn http_request_timeout_duration() -> Duration {
    Duration::from_secs(u64::from(current_preferences().http_request_timeout_secs))
}

/// Replace on-disk preferences and refresh the in-process cache.
pub fn save_preferences(p: AppPreferences) -> Result<AppPreferences, String> {
    let clamped = clamp_preferences(p);
    let path = prefs_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&clamped).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    if let Ok(mut w) = cache().write() {
        *w = clamped.clone();
    }
    Ok(clamped)
}

/// Read merged file from disk into cache (e.g. after SSH dir override changes).
pub fn reload_from_disk() -> AppPreferences {
    let merged = load_from_disk_merged();
    if let Ok(mut w) = cache().write() {
        *w = merged.clone();
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_connect_and_http_bounds() {
        let p = AppPreferences {
            connect_timeout_secs: 0,
            http_request_timeout_secs: 99999,
            nss_commander_use_classic_gutter: false,
        };
        let c = clamp_preferences(p);
        assert_eq!(c.connect_timeout_secs, MIN_CONNECT_TIMEOUT_SECS);
        assert_eq!(c.http_request_timeout_secs, MAX_HTTP_REQUEST_TIMEOUT_SECS);
    }
}
