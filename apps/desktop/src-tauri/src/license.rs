//! Offline Ed25519 license verification and local license file storage.
use crate::ssh_home::effective_ssh_dir;
use anyhow::{Context, Result};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

#[cfg(test)]
/// Development-only seed; must match `services/license-server` default (`LICENSE_SIGNING_SEED_HEX`).
const DEV_LICENSE_SEED: [u8; 32] = *b"nosuckshell-dev-1-license-seed!!";

/// Hex-encoded verifying key for `DEV_LICENSE_SEED` (64 hex chars = 32 bytes).
const DEV_LICENSE_VERIFYING_KEY_HEX: &str =
    "1190c7277b2d5bf268179b4286c2232ed656d27ba9917481d797f0098eec3efe";

/// Compile-time public key for official release builds (64 hex chars = 32 bytes).
/// Set in the build environment, e.g. `NOSUCKSHELL_LICENSE_PUBKEY_HEX=... cargo build`.
/// When unset, only runtime env and the dev fallback apply.
const EMBEDDED_LICENSE_PUBKEY_HEX: Option<&str> = option_env!("NOSUCKSHELL_LICENSE_PUBKEY_HEX");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub v: u8,
    pub license_id: String,
    pub entitlements: Vec<String>,
    pub iat: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseFile {
    payload: LicensePayload,
    /// Hex-encoded Ed25519 signature (128 hex chars) over UTF-8 `license_message(&payload)`.
    signature_hex: String,
}

fn license_path() -> Result<PathBuf> {
    Ok(effective_ssh_dir()?.join("nosuckshell.license.json"))
}

fn license_message(payload: &LicensePayload) -> Result<String> {
    Ok(serde_json::to_string(payload)?)
}

fn verifying_key_from_hex_64(trimmed: &str) -> Result<VerifyingKey> {
    let bytes = hex::decode(trimmed).context("decode license public key hex")?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("public key must be 32 bytes"))?;
    VerifyingKey::from_bytes(&arr).map_err(|_| anyhow::anyhow!("invalid Ed25519 public key"))
}

/// Resolution order: runtime `NOSUCKSHELL_LICENSE_PUBKEY_HEX`, then compile-time embed, then dev key.
fn verifying_key_from_env_or_dev() -> Result<VerifyingKey> {
    if let Ok(hex_str) = std::env::var("NOSUCKSHELL_LICENSE_PUBKEY_HEX") {
        let trimmed = hex_str.trim();
        if trimmed.len() == 64 {
            return verifying_key_from_hex_64(trimmed);
        }
    }
    if let Some(embedded) = EMBEDDED_LICENSE_PUBKEY_HEX {
        let trimmed = embedded.trim();
        if trimmed.len() == 64 {
            return verifying_key_from_hex_64(trimmed);
        }
    }
    let bytes = hex::decode(DEV_LICENSE_VERIFYING_KEY_HEX.trim()).context("decode dev license pubkey")?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("dev public key must be 32 bytes"))?;
    VerifyingKey::from_bytes(&arr).map_err(|_| anyhow::anyhow!("invalid dev Ed25519 public key"))
}

fn verify_payload(payload: &LicensePayload, signature_hex: &str) -> Result<()> {
    if payload.v != 1 {
        anyhow::bail!("unsupported license version: {}", payload.v);
    }
    let msg = license_message(payload)?;
    let sig_bytes = hex::decode(signature_hex.trim()).context("decode signature hex")?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("signature must be 64 bytes"))?;
    let sig = Signature::from_bytes(&sig_arr);
    let vk = verifying_key_from_env_or_dev()?;
    vk.verify(msg.as_bytes(), &sig)
        .map_err(|_| anyhow::anyhow!("invalid license signature"))
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn validate_time(payload: &LicensePayload) -> Result<()> {
    let now = now_unix();
    if payload.iat > now + 300 {
        anyhow::bail!("license issued in the future");
    }
    if let Some(exp) = payload.exp {
        if now > exp {
            anyhow::bail!("license expired");
        }
    }
    Ok(())
}

pub fn load_license_from_disk() -> Result<Option<LicensePayload>> {
    let path = license_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let file: LicenseFile = serde_json::from_str(&raw).context("parse license file")?;
    verify_payload(&file.payload, &file.signature_hex)?;
    validate_time(&file.payload)?;
    Ok(Some(file.payload))
}

use std::sync::Mutex;

static LICENSE_STATE: OnceLock<Mutex<Option<LicensePayload>>> = OnceLock::new();

fn license_mutex() -> &'static Mutex<Option<LicensePayload>> {
    LICENSE_STATE.get_or_init(|| {
        let initial = load_license_from_disk().ok().flatten();
        Mutex::new(initial)
    })
}

pub fn current_license_payload() -> Option<LicensePayload> {
    license_mutex()
        .lock()
        .ok()
        .and_then(|g| g.clone())
}

pub fn has_entitlement(entitlement: &str) -> bool {
    current_license_payload()
        .map(|p| p.entitlements.iter().any(|e| e == entitlement))
        .unwrap_or(false)
}

pub fn activate_license_token(token: String) -> Result<LicensePayload> {
    let trimmed = token.trim();
    let (payload_part, sig_part) = trimmed
        .split_once('.')
        .context("license token must be `base64url(payload).base64url(signature)` or use import_license_json")?;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    let payload_json = URL_SAFE_NO_PAD
        .decode(payload_part.as_bytes())
        .context("decode payload base64url")?;
    let sig_raw = URL_SAFE_NO_PAD
        .decode(sig_part.as_bytes())
        .context("decode signature base64url")?;
    let payload: LicensePayload =
        serde_json::from_slice(&payload_json).context("parse license payload JSON")?;
    let sig_hex = hex::encode(&sig_raw);
    verify_payload(&payload, &sig_hex)?;
    validate_time(&payload)?;
    let path = license_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = LicenseFile {
        payload: payload.clone(),
        signature_hex: sig_hex,
    };
    fs::write(path, serde_json::to_string_pretty(&file)?)?;
    if let Ok(mut guard) = license_mutex().lock() {
        *guard = Some(payload.clone());
    }
    Ok(payload)
}

pub fn clear_license_backend() -> Result<()> {
    let path = license_path()?;
    if path.exists() {
        fs::remove_file(&path).ok();
    }
    if let Ok(mut guard) = license_mutex().lock() {
        *guard = None;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatusDto {
    pub active: bool,
    pub license_id: Option<String>,
    pub entitlements: Vec<String>,
    pub exp: Option<u64>,
}

pub fn license_status_backend() -> Result<LicenseStatusDto> {
    let Some(p) = current_license_payload() else {
        return Ok(LicenseStatusDto {
            active: false,
            license_id: None,
            entitlements: vec![],
            exp: None,
        });
    };
    Ok(LicenseStatusDto {
        active: true,
        license_id: Some(p.license_id.clone()),
        entitlements: p.entitlements.clone(),
        exp: p.exp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use ed25519_dalek::Signer;

    #[test]
    fn round_trip_sign_verify() {
        let sk = SigningKey::from_bytes(&DEV_LICENSE_SEED);
        let vk = sk.verifying_key();
        assert_eq!(
            hex::encode(vk.as_bytes()),
            DEV_LICENSE_VERIFYING_KEY_HEX,
            "update DEV_LICENSE_VERIFYING_KEY_HEX if DEV_LICENSE_SEED changes"
        );
        let payload = LicensePayload {
            v: 1,
            license_id: "test-1".into(),
            entitlements: vec!["dev.nosuckshell.tier.demo".into()],
            iat: now_unix(),
            exp: None,
        };
        let msg = license_message(&payload).unwrap();
        let sig = sk.sign(msg.as_bytes());
        verify_payload(&payload, &hex::encode(sig.to_bytes())).unwrap();
    }
}
