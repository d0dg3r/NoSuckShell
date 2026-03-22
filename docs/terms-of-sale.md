# Terms of sale (template)

**Important:** This file is a **project-maintainer template** for plain-language terms. It is **not legal advice**. Adapt it for your jurisdiction, payment provider, and business name; have a qualified lawyer review before you rely on it with customers.

NoSuckShell’s **source code** is under the [MIT License](../LICENSE). **Purchases** (for example via Ko-fi) buy a **license token** that unlocks specific **built-in add-ons** in **official binaries** we distribute, as described below.

## What you are buying

A **signed license token** (offline Ed25519) that lists **entitlement strings**. When you paste and activate the token in the app (**Settings → Plugins & license**), the desktop verifies the signature and enables matching built-in plugins.

**Currently sellable entitlement (example — keep in sync with the plugin store catalog):**

| Add-on (catalog id) | Entitlement string |
| --- | --- |
| File workspace (premium) (`file-workspace-addon`) | `dev.nosuckshell.addon.file-workspace` |
| Bitwarden (`bitwarden-integration`) | `dev.nosuckshell.addon.bitwarden` |
| GitHub sync (`github-sync`) | `dev.nosuckshell.addon.github-sync` |
| GitLab sync (`gitlab-sync`) | `dev.nosuckshell.addon.gitlab-sync` |
| Gitea sync (`gitea-sync`) | `dev.nosuckshell.addon.gitea-sync` |
| HashiCorp Vault (`hashicorp-vault-integration`) | `dev.nosuckshell.addon.hashicorp-vault` |
| Proxmox (`proxmox-integration`) | `dev.nosuckshell.addon.proxmox` |

Free catalog rows (for example the **demo plugin**) do not require a purchase. The canonical list of rows and entitlements is in [`apps/desktop/src/features/plugin-store-catalog.ts`](../apps/desktop/src/features/plugin-store-catalog.ts).

If you add new paid rows, update this table and the catalog **before** you sell them.

## Lifetime and updates

- **Lifetime** for a purchased add-on means use of that entitlement for the **major version** line you bought, or for as long as we **maintain and distribute** NoSuckShell with that add-on, consistent with [licensing.md](licensing.md#lifetime-product-language).
- **Updates** and **support** may be limited in time or scope even when the license is perpetual, unless we state otherwise at purchase.

## Trials and expiry

The license payload may include an **`exp`** time (Unix seconds). After that time, the app stops accepting that token until you activate a new one. Trials are described in [license-server-runbook.md](license-server-runbook.md).

## Refunds and support

Replace this bullet with your policy, for example:

- **Refunds:** Request within **N** days of purchase if the token was never activated, or per Ko-fi / your platform rules.
- **Support:** Best-effort via [your contact / issue tracker]. A purchase does not guarantee a specific response time unless you publish one.

## Privacy

Purchase flows (Ko-fi, webhooks, email) may process **personal data** (email, name, payment metadata). See [licensing.md](licensing.md#privacy-and-ko-fi-webhooks). **Publish a privacy policy** and link it here when available: `https://example.com/privacy` (placeholder — replace).

## Building from source

The MIT license allows building and modifying the software yourself. **Commercial tokens** apply to **official builds** we sign with our production key; self-built binaries are outside this sale scope. See [licensing.md](licensing.md#open-source-mit-vs-commercial-add-on-tokens).
