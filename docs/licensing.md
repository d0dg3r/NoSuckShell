# Licensing, Ko-fi, and keys

This document describes how **offline-signed licenses** work in NoSuckShell, what **“lifetime”** should mean in product terms, how **personal data** from webhooks is handled, and how to **rotate** signing keys.

## Technical model

- The desktop app stores an **Ed25519 public key** (or uses the built-in development key). It never sees the private key.
- A small **license server** ([`services/license-server`](../services/license-server/)) holds the **private seed** (`LICENSE_SIGNING_SEED_HEX`) and mints tokens. For deploy, Ko-fi webhook, and trials, see **[license-server-runbook.md](license-server-runbook.md)**.
- Token format: `BASE64URL(JSON_payload).BASE64URL(raw_64_byte_signature)` where the signature is over the exact UTF-8 JSON of the payload (see `LicensePayload` in `apps/desktop/src-tauri/src/license.rs`).
- The app saves a verified copy under the active SSH directory as `nosuckshell.license.json` and checks **entitlement strings** before enabling paid plugin hooks.

## “Lifetime” (product language)

Define explicitly in your terms of sale, for example:

- **Lifetime** means access for the **major version** the customer purchased, or for as long as you **maintain and distribute** the product, not necessarily forever if the product is discontinued.
- **Support** and **updates** may be time-limited even when the license is perpetual.

Avoid promising “lifetime updates” unless you intend to honor that.

## Privacy and Ko-fi webhooks

Ko-fi webhook payloads may include **email addresses**, names, and payment metadata. If your license server logs full JSON:

- Treat logs as **personal data** under GDPR-style rules where applicable.
- Prefer logging **hashed** identifiers or opaque transaction IDs.
- Document in your privacy policy what you store and for how long.

The reference server returns `licenseToken` in the HTTP response for convenience; in production you typically **do not** expose that publicly—use it only in a trusted backend and deliver the token to the buyer by **email or DM**.

## Rotating signing keys

1. Generate a new Ed25519 seed; deploy it as the new `LICENSE_SIGNING_SEED_HEX` on the license server.
2. Ship a new app build with `NOSUCKSHELL_LICENSE_PUBKEY_HEX` set at **runtime** (environment) or embedded at **compile time** for that release.
3. Old tokens remain valid for old builds; new tokens require the new public key. Optionally run a short overlap period where the app accepts **two** public keys (not implemented in the minimal version—add a second env var or file if you need this).

## Plugin entitlements

Use stable entitlement strings (for example `dev.nosuckshell.plugin.vault`) in `LicensePayload.entitlements`. Built-in plugins can call `required_entitlement()` to gate hooks until the license includes that string.

The **file workspace** plugin uses `dev.nosuckshell.addon.file-workspace` (see the in-app **Plugin store** catalog and `plugin-store-catalog.ts`).

The **demo plugin** does not require an entitlement so the pipeline can be tested without a purchase.
