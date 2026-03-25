# NoSuckShell license server

Small HTTP service that:

- Answers Ko-fi’s webhook **verification** handshake (`verification_token`).
- On supported Ko-fi event types (`Donation`, `Subscription`, `Shop Order`, `Commission`), builds a **signed license token** in the same format the desktop app accepts in **Settings → Plugins** (Activate).

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `LICENSE_SIGNING_SEED_HEX` | yes | 64 hex characters (32 bytes), Ed25519 seed. Must correspond to the **public** key the desktop trusts (`NOSUCKSHELL_LICENSE_PUBKEY_HEX` or the built-in dev pubkey). |
| `ADMIN_SECRET` | recommended | Bearer token for `POST /admin/issue-license`. |
| `KOFI_VERIFICATION_TOKEN` | recommended | Paste the verification token Ko-fi shows when you create the webhook so the handshake succeeds. |
| `DEFAULT_LICENSE_ENTITLEMENTS` | no | JSON array of strings, e.g. `["dev.nosuckshell.plugin.vault"]`, applied to Ko-fi-issued tokens. |
| `BIND_ADDR` | no | Default `127.0.0.1:8787`. |

## Development vs. production

- **Production:** Generate a **new** random 32-byte Ed25519 seed; keep `LICENSE_SIGNING_SEED_HEX` secret. Publish only the matching **public** key to desktop builds (`NOSUCKSHELL_LICENSE_PUBKEY_HEX` at compile or runtime). **Do not** reuse the dev seed below for paying customers.
- **Development:** The seed and hex below match the desktop **dev** verifying key baked into [`apps/desktop/src-tauri/src/license.rs`](../../apps/desktop/src-tauri/src/license.rs). They are **public on purpose** so anyone can run the stack locally; that is **not** a leak of production material.

## Endpoints

- `GET /health` — liveness.
- `POST /admin/issue-license` — header `Authorization: Bearer <ADMIN_SECRET>`, JSON body `{ "entitlements": ["..."], "licenseId"?: "...", "exp"?: 1234567890 }`. Response body is the raw **license token** string.
- `POST /webhooks/kofi` — Ko-fi JSON payload. Returns JSON with `licenseToken` on paid-like events.

## Development (shared dev seed only)

Use the same 32-byte seed as the desktop **dev** fallback (`nosuckshell-dev-1-license-seed!!` → hex-encode for `LICENSE_SIGNING_SEED_HEX`), **or** generate a new pair and set `NOSUCKSHELL_LICENSE_PUBKEY_HEX` when running the app so the desktop trusts your temporary key instead.

Run the server from **`services/license-server`**, or from the **repository root** (root `Cargo.toml` is a virtual workspace with `default-members` pointing at this crate, so plain `cargo run` at the repo root starts the license server).

```bash
# Optional: cd services/license-server  (not needed if you are already at the repo root)
# 32-byte dev seed used by the desktop app in development (see `license.rs`).
export LICENSE_SIGNING_SEED_HEX=6e6f7375636b7368656c6c2d6465762d312d6c6963656e73652d736565642121
export ADMIN_SECRET=dev-admin
cargo run
```

Issue a test token:

```bash
curl -sS -X POST http://127.0.0.1:8787/admin/issue-license \
  -H "Authorization: Bearer dev-admin" \
  -H "Content-Type: application/json" \
  -d '{"entitlements":["dev.nosuckshell.tier.demo"],"licenseId":"manual-test"}'
```

Paste the response into the desktop **License token** field and click **Activate**.

## Ko-fi

Point your Ko-fi webhook URL at `https://<your-host>/webhooks/kofi`. This server does **not** send email; you still deliver `licenseToken` to buyers (email automation, manual DM, etc.). See [Ko-fi](https://ko-fi.com/) for webhook setup.
