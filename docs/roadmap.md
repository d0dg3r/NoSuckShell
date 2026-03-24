# Product roadmap (plugins)

These items are **planned as built-in plugins** on top of the Phase 1 plugin API ([`architecture.md`](architecture.md) — `plugins` module, `NssPlugin`, license entitlements). This file records **intent**, **stable IDs** for licensing, and what is already wired in the app.

## Shipped built-in plugins

| Plugin | Purpose | Plugin ID |
| --- | --- | --- |
| **NSS-Commander** | Per-pane **terminal** vs **remote files (SFTP)** vs **local files**; toolbar + context menu + panes are hidden when the plugin is disabled under **Settings → Plugins & license** (default: on). Plugin ID remains `dev.nosuckshell.plugin.file-workspace`. | `dev.nosuckshell.plugin.file-workspace` |
| **PROXMUX (Proxmox)** | Cluster config under **Settings → Integrations → PROXMUX**, guest/resource sidebar, Proxmox API via Rust (`plugins/proxmux.rs`), embedded **QEMU noVNC** / **LXC** shells via local WebSocket bridge (`proxmux_ws_proxy.rs`), optional system-browser consoles. Gated by license entitlement where configured. | `dev.nosuckshell.plugin.proxmux` |

## Planned plugins

| Planned plugin | Purpose (high level) | Plugin ID (proposed) | Entitlement ID (proposed) |
| --- | --- | --- | --- |
| **GitHub settings sync** | Sync selected app settings and/or host metadata with GitHub (e.g. gist or repo), with explicit user consent and tokens stored securely in Rust. | `dev.nosuckshell.plugin.github-settings-sync` | `dev.nosuckshell.plugin.github-settings-sync` |
| **Bitwarden** | Use Bitwarden as a credential / secret source for SSH (e.g. inject identity or secrets into `HostConfig` via `enrich_host_config`, plus settings UI in-repo). | `dev.nosuckshell.plugin.bitwarden` | `dev.nosuckshell.plugin.bitwarden` |
| **HashiCorp Vault** | Read secrets or SSH material from Vault (KV, PKI paths, etc.) and apply during session resolution; configuration and auth handled in the plugin layer. | `dev.nosuckshell.plugin.hashicorp-vault` | `dev.nosuckshell.plugin.hashicorp-vault` |
| **Command palette** | Deeper command/automation surface for power users (e.g. global command palette, scripted actions, or bridge to external tooling — scope TBD when implementation starts). Distinct from the **NSS-Commander** product name used for the shipped file-workspace add-on. | `dev.nosuckshell.plugin.command-palette` | `dev.nosuckshell.plugin.command-palette` |
| **AWS** | Proxmux-style **resource discovery and connect** for Amazon Web Services (e.g. EC2): list resources, power or lifecycle actions where the API allows, **SSH** or provider flows (e.g. SSM). IAM and regions vary; scope TBD. | `dev.nosuckshell.plugin.aws` | `dev.nosuckshell.plugin.aws` |
| **Azure** | Same pattern for Microsoft Azure VMs and related resources; connect via SSH or Azure-specific paths. | `dev.nosuckshell.plugin.azure` | `dev.nosuckshell.plugin.azure` |
| **Hetzner Cloud** | Same pattern for Hetzner Cloud servers via their API. | `dev.nosuckshell.plugin.hetzner` | `dev.nosuckshell.plugin.hetzner` |
| **GCP** | Same pattern for Google Cloud (e.g. Compute Engine); OAuth/service accounts and projects vary. | `dev.nosuckshell.plugin.gcp` | `dev.nosuckshell.plugin.gcp` |
| **DigitalOcean** | Same pattern for Droplets and related resources. | `dev.nosuckshell.plugin.digitalocean` | `dev.nosuckshell.plugin.digitalocean` |

## Notes

- **IDs** can be adjusted before the first public release of each plugin; once customers receive license entitlements, treat IDs as **stable** or document migrations (see [licensing.md](licensing.md)).
- **Paid add-ons:** Each row can be tied to a Ko-fi (or other) offering via the license server’s `DEFAULT_LICENSE_ENTITLEMENTS` / per-product entitlements ([`services/license-server`](../services/license-server/)).
- **Implementation order** is not fixed; secret backends (Bitwarden, Vault) likely share patterns (HTTP APIs, token storage, `CredentialProvider` capability).
- **Public clouds:** The store and licensing use **per-provider** catalog rows and entitlements (`dev.nosuckshell.addon.<provider>`). Future built-in plugins may use matching `dev.nosuckshell.plugin.<provider>` IDs; each vendor has a different API and auth model (API tokens vs IAM).

## See also

- [architecture.md](architecture.md) — plugins and licensing in the stack
- [licensing.md](licensing.md) — tokens, entitlements, rotation
