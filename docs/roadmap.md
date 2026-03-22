# Product roadmap (plugins)

These items are **planned as built-in plugins** on top of the Phase 1 plugin API ([`architecture.md`](architecture.md) — `plugins` module, `NssPlugin`, license entitlements). This file records **intent**, **stable IDs** for licensing, and what is already wired in the app.

## Shipped built-in plugins

| Plugin | Purpose | Plugin ID |
| --- | --- | --- |
| **File workspace** | Per-pane **terminal** vs **remote files (SFTP)** vs **local files**; toolbar + context menu + panes are hidden when the plugin is disabled under **Settings → Plugins & license** (default: on). | `dev.nosuckshell.plugin.file-workspace` |
| **Demo** | Reference implementation (`ping`, optional enrich logging for `demo:` host prefix). | `dev.nosuckshell.plugin.demo` |

## Planned plugins

| Planned plugin | Purpose (high level) | Plugin ID (proposed) | Entitlement ID (proposed) |
| --- | --- | --- | --- |
| **GitHub settings sync** | Sync selected app settings and/or host metadata with GitHub (e.g. gist or repo), with explicit user consent and tokens stored securely in Rust. | `dev.nosuckshell.plugin.github-settings-sync` | `dev.nosuckshell.plugin.github-settings-sync` |
| **Bitwarden** | Use Bitwarden as a credential / secret source for SSH (e.g. inject identity or secrets into `HostConfig` via `enrich_host_config`, plus settings UI in-repo). | `dev.nosuckshell.plugin.bitwarden` | `dev.nosuckshell.plugin.bitwarden` |
| **HashiCorp Vault** | Read secrets or SSH material from Vault (KV, PKI paths, etc.) and apply during session resolution; configuration and auth handled in the plugin layer. | `dev.nosuckshell.plugin.hashicorp-vault` | `dev.nosuckshell.plugin.hashicorp-vault` |
| **NSS-Commander** | Deeper command/automation surface for power users (e.g. command palette, scripted actions, or bridge to external tooling — scope TBD when implementation starts). | `dev.nosuckshell.plugin.nss-commander` | `dev.nosuckshell.plugin.nss-commander` |

## Notes

- **IDs** can be adjusted before the first public release of each plugin; once customers receive license entitlements, treat IDs as **stable** or document migrations (see [licensing.md](licensing.md)).
- **Paid add-ons:** Each row can be tied to a Ko-fi (or other) offering via the license server’s `DEFAULT_LICENSE_ENTITLEMENTS` / per-product entitlements ([`services/license-server`](../services/license-server/)).
- **Implementation order** is not fixed; secret backends (Bitwarden, Vault) likely share patterns (HTTP APIs, token storage, `CredentialProvider` capability).

## See also

- [architecture.md](architecture.md) — plugins and licensing in the stack
- [licensing.md](licensing.md) — tokens, entitlements, rotation
