# Documentation

Index of maintained documentation for NoSuckShell.

## In the app

- **Help** (Settings → Help, or the Help tab in app settings): chaptered in-app reference—interactions, SSH/host keys, Identity Store, settings tabs, **keyboard shortcuts**, data locations, and known limitations. Source: [`apps/desktop/src/components/HelpPanel.tsx`](../apps/desktop/src/components/HelpPanel.tsx) (keep in sync when behavior changes).

## In this folder

| Doc | Description |
| --- | --- |
| [architecture.md](architecture.md) | Stack, modules, SSH vs SFTP paths, IPC, events, on-disk artifacts. |
| [licensing.md](licensing.md) | Offline licenses, Ed25519 tokens, Ko-fi webhooks, entitlements, key rotation. |
| [license-server-runbook.md](license-server-runbook.md) | Deploy `services/license-server`, Ko-fi webhook, trials (`exp`), plugin store entitlements. |
| [roadmap.md](roadmap.md) | Planned plugin-shaped work (GitHub sync, Bitwarden, Vault, NSS-Commander). |
| [releases.md](releases.md) | Release tagging and GitHub releases. |
| [CHANGELOG.md](CHANGELOG.md) | User-facing release notes per version. |
| [backup-security.md](backup-security.md) | Encrypted backup format and security notes. |
| [plans/2026-03-17-ssh-manager-design.md](plans/2026-03-17-ssh-manager-design.md) | Historical MVP / design notes (SSH manager). |
| [refactoring-app-roadmap.md](refactoring-app-roadmap.md) | Notes on splitting or hardening `App.tsx`. |
| [media/screenshots/README.md](media/screenshots/README.md) | Store screenshots, sizes, captions, and `npm run screenshots`. |

Project overview, local run, and validation commands: [README.md](../README.md) at the repository root.

## Community

- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [SECURITY.md](../SECURITY.md)
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
