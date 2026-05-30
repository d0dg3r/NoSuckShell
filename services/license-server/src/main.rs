//! HTTP service: Ko-fi webhook verification + admin license issuance.
//! Token format matches the desktop `activate_license` command (`payload_b64url.sig_b64url`).

use axum::{
    extract::State,
    http::{header::AUTHORIZATION, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::sync::Arc;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
struct AppState {
    signing_key: SigningKey,
    admin_secret: String,
    kofi_verification: Option<String>,
    default_entitlements: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LicensePayload {
    v: u8,
    license_id: String,
    entitlements: Vec<String>,
    iat: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    exp: Option<u64>,
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn sign_license_token(sk: &SigningKey, payload: &LicensePayload) -> Result<String, String> {
    let json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let sig = sk.sign(json.as_bytes());
    let p = URL_SAFE_NO_PAD.encode(json.as_bytes());
    let s = URL_SAFE_NO_PAD.encode(sig.to_bytes());
    Ok(format!("{p}.{s}"))
}

fn load_signing_key() -> Result<SigningKey, String> {
    let hex_seed = env::var("LICENSE_SIGNING_SEED_HEX").map_err(|_| {
        "LICENSE_SIGNING_SEED_HEX is required (64 hex chars = 32-byte Ed25519 seed)".to_string()
    })?;
    let bytes = hex::decode(hex_seed.trim()).map_err(|e| e.to_string())?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "seed must decode to exactly 32 bytes".to_string())?;
    Ok(SigningKey::from_bytes(&arr))
}

fn parse_entitlements_list() -> Vec<String> {
    env::var("DEFAULT_LICENSE_ENTITLEMENTS")
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

#[derive(Deserialize)]
struct AdminIssueBody {
    #[serde(default)]
    license_id: Option<String>,
    entitlements: Vec<String>,
    #[serde(default)]
    exp: Option<u64>,
}

async fn health() -> &'static str {
    "ok"
}

async fn admin_issue(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<AdminIssueBody>,
) -> impl IntoResponse {
    let auth = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let expected = format!("Bearer {}", state.admin_secret);
    if !state.admin_secret.is_empty() && auth != expected {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    if state.admin_secret.is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "ADMIN_SECRET not configured",
        )
            .into_response();
    }
    let license_id = body
        .license_id
        .unwrap_or_else(|| format!("lic-{}", uuid::Uuid::new_v4()));
    let payload = LicensePayload {
        v: 1,
        license_id,
        entitlements: body.entitlements,
        iat: now_unix(),
        exp: body.exp,
    };
    match sign_license_token(&state.signing_key, &payload) {
        Ok(tok) => (StatusCode::OK, tok).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// Ko-fi sends a one-time `verification_token` when the webhook is created; respond 200 if it matches.
/// For shop/donation events, returns a JSON body with `licenseToken` for logging or your own email pipeline.
async fn kofi_webhook(State(state): State<Arc<AppState>>, Json(v): Json<Value>) -> impl IntoResponse {
    if let Some(token) = v.get("verification_token").and_then(|t| t.as_str()) {
        if state
            .kofi_verification
            .as_ref()
            .is_some_and(|exp| exp == token)
        {
            return StatusCode::OK.into_response();
        }
        tracing::warn!("Ko-fi verification_token mismatch or KOFI_VERIFICATION_TOKEN unset");
        return StatusCode::OK.into_response();
    }

    let type_str = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let is_paid_like = matches!(
        type_str,
        "Donation" | "Subscription" | "Shop Order" | "Commission"
    );
    if !is_paid_like {
        return StatusCode::OK.into_response();
    }

    let license_id = v
        .pointer("/data/message_id")
        .or_else(|| v.pointer("/data/messageId"))
        .or_else(|| v.pointer("/data/kofi_transaction_id"))
        .and_then(|x| x.as_str())
        .map(|s| format!("kofi-{s}"))
        .unwrap_or_else(|| format!("kofi-{}", uuid::Uuid::new_v4()));

    let payload = LicensePayload {
        v: 1,
        license_id,
        entitlements: state.default_entitlements.clone(),
        iat: now_unix(),
        exp: None,
    };

    match sign_license_token(&state.signing_key, &payload) {
        Ok(tok) => Json(json!({
            "ok": true,
            "licenseToken": tok,
            "note": "Deliver this token to the customer out-of-band (email, Ko-fi DM, etc.)."
        }))
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let signing_key = load_signing_key()?;
    let admin_secret = env::var("ADMIN_SECRET").unwrap_or_default();
    let kofi_verification = env::var("KOFI_VERIFICATION_TOKEN").ok();
    let default_entitlements = parse_entitlements_list();

    let state = Arc::new(AppState {
        signing_key,
        admin_secret,
        kofi_verification,
        default_entitlements,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/admin/issue-license", post(admin_issue))
        .route("/webhooks/kofi", post(kofi_webhook))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: std::net::SocketAddr = env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8787".into())
        .parse()?;
    tracing::info!(%addr, "license server listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Verifier, VerifyingKey};

    /// Mirrors `DEV_LICENSE_SEED` in `apps/desktop/src-tauri/src/license.rs`. Keep in sync.
    const DEV_LICENSE_SEED: [u8; 32] = *b"nosuckshell-dev-1-license-seed!!";

    fn dev_signing_key() -> SigningKey {
        SigningKey::from_bytes(&DEV_LICENSE_SEED)
    }

    #[test]
    fn sign_license_token_produces_two_base64url_parts() {
        let sk = dev_signing_key();
        let payload = LicensePayload {
            v: 1,
            license_id: "test-1".into(),
            entitlements: vec!["dev.nosuckshell.tier.demo".into()],
            iat: now_unix(),
            exp: None,
        };
        let token = sign_license_token(&sk, &payload).expect("signs");

        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 2, "token must have exactly one '.' separator");
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(parts[0].as_bytes())
            .expect("payload decodes");
        let sig_bytes = URL_SAFE_NO_PAD
            .decode(parts[1].as_bytes())
            .expect("signature decodes");
        assert_eq!(sig_bytes.len(), 64, "Ed25519 sig is exactly 64 bytes");

        // The encoded payload must round-trip back to the same struct.
        let parsed: LicensePayload =
            serde_json::from_slice(&payload_bytes).expect("payload JSON parses");
        assert_eq!(parsed.license_id, payload.license_id);
        assert_eq!(parsed.entitlements, payload.entitlements);
        assert_eq!(parsed.v, payload.v);
    }

    #[test]
    fn issued_token_signature_verifies_with_corresponding_verifying_key() {
        let sk = dev_signing_key();
        let vk: VerifyingKey = sk.verifying_key();
        let payload = LicensePayload {
            v: 1,
            license_id: "verify-1".into(),
            entitlements: vec![],
            iat: now_unix(),
            exp: Some(now_unix() + 3_600),
        };
        let token = sign_license_token(&sk, &payload).expect("signs");
        let (p64, s64) = token.split_once('.').expect("two parts");

        let payload_bytes = URL_SAFE_NO_PAD
            .decode(p64.as_bytes())
            .expect("payload decodes");
        let sig_bytes = URL_SAFE_NO_PAD
            .decode(s64.as_bytes())
            .expect("signature decodes");
        let sig_arr: [u8; 64] = sig_bytes.try_into().expect("64-byte signature");
        let sig = ed25519_dalek::Signature::from_bytes(&sig_arr);

        // The signature is over the UTF-8 JSON, not over the base64url-encoded form.
        vk.verify(&payload_bytes, &sig)
            .expect("issued token must verify with the matching verifying key");
    }

    #[test]
    fn parse_entitlements_list_handles_missing_or_invalid_json() {
        // Snapshot env state, mutate, restore. Each test owns its env scope.
        let prev = env::var("DEFAULT_LICENSE_ENTITLEMENTS").ok();

        // Safety: tests in this module are run sequentially via `cargo test --test-threads=1` in CI;
        // here we accept the standard library warning because the surface is tiny.
        unsafe {
            env::remove_var("DEFAULT_LICENSE_ENTITLEMENTS");
        }
        assert!(parse_entitlements_list().is_empty());

        unsafe {
            env::set_var("DEFAULT_LICENSE_ENTITLEMENTS", "not-json");
        }
        assert!(parse_entitlements_list().is_empty());

        unsafe {
            env::set_var(
                "DEFAULT_LICENSE_ENTITLEMENTS",
                r#"["dev.tier.demo","dev.plugin.proxmux"]"#,
            );
        }
        assert_eq!(
            parse_entitlements_list(),
            vec![
                "dev.tier.demo".to_string(),
                "dev.plugin.proxmux".to_string()
            ]
        );

        unsafe {
            match prev {
                Some(v) => env::set_var("DEFAULT_LICENSE_ENTITLEMENTS", v),
                None => env::remove_var("DEFAULT_LICENSE_ENTITLEMENTS"),
            }
        }
    }
}
