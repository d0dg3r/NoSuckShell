# License server runbook (Ko-fi, trials, plugin store)

Operator guide for pairing the desktop **Plugin store** tab with [`services/license-server`](../services/license-server/).

## What runs where

| Component | Role |
| --- | --- |
| Desktop app | Verifies Ed25519-signed tokens, stores `nosuckshell.license.json`, checks **entitlements** for gated plugins (e.g. file workspace → `dev.nosuckshell.addon.file-workspace`). |
| `services/license-server` | Holds the **private** signing seed; mints tokens via `POST /admin/issue-license` or Ko-fi **`POST /webhooks/kofi`**. |
| Ko-fi | Shop, memberships, donations; webhook hits your deployed license server. |

The app **does not** download plugin binaries from the store. Add-ons are **built into the release**; the store is a **catalog + purchase link + token activation** flow.

## Deploy the license server

1. Generate a production **32-byte Ed25519 seed** (keep secret). Derive the public key and set:
   - Server: `LICENSE_SIGNING_SEED_HEX` (64 hex chars).
   - Desktop builds / installs: `NOSUCKSHELL_LICENSE_PUBKEY_HEX` (64 hex chars) so the app trusts **your** key instead of the dev default (see [`docs/licensing.md`](licensing.md)).
2. Set `ADMIN_SECRET` and use it as `Authorization: Bearer …` for admin endpoints.
3. Set `BIND_ADDR` (e.g. `0.0.0.0:8787` behind a reverse proxy with TLS).
4. Run the binary from the `services/license-server` crate (see its README for `cargo run` / container).

## Ko-fi webhook

1. In Ko-fi, create a webhook pointing to `https://<your-host>/webhooks/kofi`.
2. Set `KOFI_VERIFICATION_TOKEN` on the server to the verification token Ko-fi shows (handshake).
3. **Do not** expose raw `licenseToken` in a public response in production; deliver tokens by **email or DM** (see [`docs/licensing.md`](licensing.md) privacy section).

Use `DEFAULT_LICENSE_ENTITLEMENTS` for a single global entitlement on all paid events, or extend the server to map **shop item / tier** → entitlement list (product-specific tokens).

## Trials (time-limited licenses)

Issue a token with an **`exp`** field (Unix **seconds**):

```bash
curl -sS -X POST https://<host>/admin/issue-license \
  -H "Authorization: Bearer <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "licenseId": "trial-user-123",
    "entitlements": ["dev.nosuckshell.addon.file-workspace"],
    "exp": 1735689600
  }'
```

After `exp`, the desktop rejects the license until the user activates a new token.

## Plugin store catalog (desktop)

Sellable rows and entitlement strings are defined in [`apps/desktop/src/features/plugin-store-catalog.ts`](../apps/desktop/src/features/plugin-store-catalog.ts). Update:

- `purchaseUrl` per item (your Ko-fi shop or tier link).
- `requiredEntitlements` — must match both Rust `required_entitlement()` on the plugin and what the license server puts in `LicensePayload.entitlements`.

## Local development (contributors)

Without an activated license, **file workspace** is off until the license includes `dev.nosuckshell.addon.file-workspace`. With the dev license server from [`services/license-server`](../services/license-server/README.md):

```bash
curl -sS -X POST http://127.0.0.1:8787/admin/issue-license \
  -H "Authorization: Bearer dev-admin" \
  -H "Content-Type: application/json" \
  -d '{"entitlements":["dev.nosuckshell.addon.file-workspace"],"licenseId":"dev-local"}'
```

Paste the returned token into **Settings → Plugins & license → Activate**.

## Quick health checks

- `GET /health` on the license server.
- Desktop: **Settings → Plugins & license** shows license status, entitlements, and **Expires** when `exp` is set.
- Issue a dev token with the **same** pubkey the app uses, paste into **License token → Activate**.
