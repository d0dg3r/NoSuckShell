# In-app Help — Maintainer guide

This document describes the rebuilt Help surface in Settings → **Help & info** → **Help**, how it stays aligned with **About**, and what to update when behavior changes.

## Where the content lives

| File | Role |
| --- | --- |
| [`apps/desktop/src/components/HelpPanel.tsx`](../apps/desktop/src/components/HelpPanel.tsx) | All chapters, TOC, keyboard cheatsheet block, and Get support — authoritative in-app copy. |
| [`apps/desktop/src/features/help-app-copy.ts`](../apps/desktop/src/features/help-app-copy.ts) | Shared one-line product description and support blurbs used by Help and About. |
| [`apps/desktop/src/features/repo-links.ts`](../apps/desktop/src/features/repo-links.ts) | GitHub URLs (repo, issues, security, changelog, releases). Keep in sync with root `package.json` `bugs.url` / `homepage`. |
| [`apps/desktop/src/components/settings/tabs/AppSettingsHelpTab.tsx`](../apps/desktop/src/components/settings/tabs/AppSettingsHelpTab.tsx) | Lazy-loads `HelpPanel`, visible Suspense fallback, passes `openExternalUrl` as `onOpenUrl`. |
| [`apps/desktop/src/components/settings/tabs/AppSettingsAboutTab.tsx`](../apps/desktop/src/components/settings/tabs/AppSettingsAboutTab.tsx) | Short About page; uses `repo-links` + `help-app-copy` for consistency with Help. |
| [`docs/architecture.md`](architecture.md) | Technical source for paths and modules (mirror user-facing facts in Help where relevant). |
| [`docs/backup-security.md`](backup-security.md) | Backup threat model (summarized in Help “Data, secrets, and privacy”). |
| [`docs/licensing.md`](licensing.md) | License token model (summarized in Help “Plugins and license”). |

## Information architecture (current)

Order in the UI:

1. **Keyboard shortcuts** — anchor `#help-shortcuts`. Cheatsheet rows come from `shortcutCheatsheetLines` (built in `App.tsx` from `KEYBOARD_SHORTCUT_DEFINITIONS` + leader chord).
2. **Welcome** — `#help-welcome`: short intro + “Finding settings” table.
3. **Interactions** — `#help-interactions`: hosts, panes, broadcast, DnD, file colors, NSS-Commander file actions.
4. **SSH and Identity** — `#help-ssh-identity`: OpenSSH session behavior, trust/proxies, Identity Store.
5. **PROXMUX** — `#help-proxmux`.
6. **Data, secrets, and privacy** — `#help-data`.
7. **Plugins and license** — `#help-plugins`.
8. **FAQ** — `#help-faq`.
9. **Limitations** — `#help-limits`.
10. **Get support** — `#help-support`: copy from `HELP_SUPPORT_INTRO`, buttons use `REPO_ISSUES_URL` / `REPO_SECURITY_URL`.

The table of contents lists shortcuts (if present), then each chapter title, then Get support.

## Keyboard column in chapter tables

`resolveHelpShortcutLabel(action)` matches `KeyboardShortcutDefinition.helpAction` in [`keyboard-shortcuts-registry.ts`](../apps/desktop/src/features/keyboard-shortcuts-registry.ts). Row `action` strings in `HelpPanel` must match `helpAction` exactly (for example `Open Settings`, `New local terminal / Quick connect`, `Copy to other pane (file browser)`).

## When to update

- **New or renamed settings tabs** — edit the “Finding settings” table under `welcomeSections` in `HelpPanel.tsx`.
- **New on-disk artifacts** — update `dataPrivacySections`; confirm against `docs/architecture.md`.
- **Plugin / entitlement behavior** — update `pluginsLicenseSections` and FAQ rows; align with `plugin-store-catalog.ts` and `licensing.md`.
- **PROXMUX UX** — update `proxmuxSections`; align with `AppSettingsProxmuxTab` and architecture.
- **SFTP / proxy limitations** — update `limitationsSections` and SSH/FAQ rows.
- **Repository URL** — change `repo-links.ts` and root `package.json` together.

## Language

All user-visible Help and About strings are **English** (see `.cursor/rules/english-ui-copy.mdc`). Keep copy practical: what it is, where to click, what to expect.
