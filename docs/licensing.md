# Licensing, Ko-fi, and keys

This document describes how **offline-signed licenses** work in NoSuckShell, how that relates to the **MIT** open-source license, what **“lifetime”** should mean in product terms, how **personal data** from webhooks is handled, and how to **rotate** signing keys.

## Open source (MIT) vs. commercial add-on tokens

- **Source code:** The repository is under the [MIT License](../LICENSE). You may use, modify, and redistribute the software under those terms.
- **Optional paid add-ons:** A **small set** of built-in plugins is gated by **entitlement strings** checked at runtime. In **official release binaries**, those entitlements are unlocked with an **Ed25519-signed license token** you sell or issue (for example after a Ko-fi purchase). Tokens are **not** the same thing as the MIT license: they are a separate **commercial unlock** for the listed entitlements in **binaries we distribute**.
- **What you get for free:** All functionality that ships in the repo is inspectable under MIT. Gated plugins remain **in source**; some features may require a valid token in **official builds** so that buyers support the project for those add-ons.
- **Technical limits:** Anyone who builds from source can change the app or use the **development** signing keypair used for local testing. Official releases should be built with a **production** public key (embedded at compile time or overridden at runtime) so customer-issued tokens match **your** signing key. See [terms-of-sale.md](terms-of-sale.md) for buyer-facing scope (template, not legal advice).

## Technical model

- The desktop app trusts an **Ed25519 public key** resolved in this order: runtime `NOSUCKSHELL_LICENSE_PUBKEY_HEX`, then a **compile-time** value if the binary was built with `NOSUCKSHELL_LICENSE_PUBKEY_HEX` in the environment, then the **built-in development** public key for local work. It never sees the private signing key.
- A small **license server** ([`services/license-server`](../services/license-server/)) holds the **private seed** (`LICENSE_SIGNING_SEED_HEX`) and mints tokens. For deploy, Ko-fi webhook, and trials, see **[license-server-runbook.md](license-server-runbook.md)**.
- Token format: `BASE64URL(JSON_payload).BASE64URL(raw_64_byte_signature)` where the signature is over the exact UTF-8 JSON of the payload (see `LicensePayload` in `apps/desktop/src-tauri/src/license.rs`).
- The app saves a verified copy under the active SSH directory as `nosuckshell.license.json` and checks **entitlement strings** before enabling paid plugin hooks.

Commercial scope for paid rows is listed in **[terms-of-sale.md](terms-of-sale.md)** and must stay aligned with [`apps/desktop/src/features/plugin-store-catalog.ts`](../apps/desktop/src/features/plugin-store-catalog.ts).

## “Lifetime” (product language)

Define explicitly in your terms of sale, for example:

- **Lifetime** means access for the **major version** the customer purchased, or for as long as you **maintain and distribute** the product, not necessarily forever if the product is discontinued.
- **Support** and **updates** may be time-limited even when the license is perpetual.

Avoid promising “lifetime updates” unless you intend to honor that. Template wording: [terms-of-sale.md](terms-of-sale.md).

## Privacy and Ko-fi webhooks

Ko-fi webhook payloads may include **email addresses**, names, and payment metadata. If your license server logs full JSON:

- Treat logs as **personal data** under GDPR-style rules where applicable.
- Prefer logging **hashed** identifiers or opaque transaction IDs.
- Publish a **privacy policy** that states what you store, why, and retention; link it from your shop and from [terms-of-sale.md](terms-of-sale.md) when you have a URL.

The reference server returns `licenseToken` in the HTTP response for convenience; in production you typically **do not** expose that publicly—use it only in a trusted backend and deliver the token to the buyer by **email or DM**.

## Rotating signing keys

1. Generate a new Ed25519 seed; deploy it as the new `LICENSE_SIGNING_SEED_HEX` on the license server.
2. Ship a new app build with `NOSUCKSHELL_LICENSE_PUBKEY_HEX` set at **compile time** (release CI secret) or **runtime** (environment) for that release. See [releases.md](releases.md).
3. Old tokens remain valid for old builds; new tokens require the new public key. Optionally run a short overlap period where the app accepts **two** public keys (not implemented in the minimal version—add a second env var or file if you need this).

## Plugin entitlements

Use stable entitlement strings (for example `dev.nosuckshell.plugin.vault`) in `LicensePayload.entitlements`. Built-in plugins can call `required_entitlement()` to gate hooks until the license includes that string.

The **file workspace** plugin uses `dev.nosuckshell.addon.file-workspace` (see the in-app **Plugin store** catalog and `plugin-store-catalog.ts`).

Additional **catalog-only** paid rows (integrations not yet shipped as built-in plugins) use `dev.nosuckshell.addon.bitwarden`, `dev.nosuckshell.addon.github-sync`, `dev.nosuckshell.addon.gitlab-sync`, `dev.nosuckshell.addon.gitea-sync`, `dev.nosuckshell.addon.hashicorp-vault`, and `dev.nosuckshell.addon.proxmox`.

The **demo plugin** does not require an entitlement so the pipeline can be tested without a purchase.
