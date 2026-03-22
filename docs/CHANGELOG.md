# Changelog

All notable changes to **NoSuckShell** are documented here. Version numbers follow the desktop app (`apps/desktop`); GitHub releases are created from `v*` tags (see [releases.md](releases.md)).

## [0.1.0-beta.6] - 2026-03-22

**Pre-release.** Binaries are published after you push tag [`v0.1.0-beta.6`][v0.1.0-beta.6] and the [release workflow](../.github/workflows/release.yml) completes.

### Added

- **Keyboard:** Settings → **Keyboard** to record shortcuts (physical `KeyboardEvent.code`); configurable **leader key** and follow-up bindings; conflict hints; persisted in `localStorage`. Global shortcuts respect terminal focus (modifier chords and Escape when a modal is open).
- **Help:** In-app Help includes a **Keyboard shortcuts** table (from the same source as runtime) and replaces static “-” keys for mapped actions when opened from Settings.
- **Plugins & license:** **Plugin store** section with a static catalog (free **Demo plugin**, paid **File workspace** via entitlement `dev.nosuckshell.addon.file-workspace`). Reference **license server** at [`services/license-server`](../services/license-server/) and operator guide [`license-server-runbook.md`](license-server-runbook.md).
- **SSH / host keys:** Per-host **host key policy** in the sidebar host settings (interactive, auto-accept new keys, or accept any key with warning). OpenSSH `StrictHostKeyChecking` is set from app metadata on session start so ProxyJump hops do not stall on unseen yes/no prompts.
- **Metadata:** `trustHostDefault` and `strictHostKeyPolicy` are persisted end-to-end in Rust (no silent loss on `save_host_metadata`).
- **Quick Connect:** Optional `strictHostKeyPolicy`; **Auto-trust** in settings maps to `accept-new` for quick sessions.
- **Identity Store:** **ProxyJump** alias picker (saved hosts + custom string) for store users and host bindings; **ProxyCommand** presets plus custom field in the host form and store host binding.

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.
- **SFTP** file browser still uses its own host-key path; terminal SSH behavior above does not apply there yet.
- **File workspace** requires a license that includes `dev.nosuckshell.addon.file-workspace` (or a dev token from the license server). See [license-server-runbook.md](license-server-runbook.md) § Local development.

## [0.1.0-beta.5] - 2026-03-21

**Pre-release.** Binaries are published after you push tag [`v0.1.0-beta.5`][v0.1.0-beta.5] and the [release workflow](../.github/workflows/release.yml) completes.

### Changed

- **Code scanning (Rust):** Avoid hard-coded test passphrases and `[0u8; N]` crypto-buffer patterns flagged by CodeQL — `testutil::random_password()`, `rand::random` for backup salt/nonce and key buffers, aligned with `rand` 0.10.
- **Code scanning (JS):** `createId` prefers `crypto.getRandomValues` for the random suffix (Tauri webview); `Math.random` only as a rare fallback.
- **Code scanning:** In-source suppression for a **false positive** on `tauri::generate_handler!` (IPC command registration is not a literal password).

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.

## [0.1.0-beta.4] - 2026-03-21

**Pre-release.** Binaries are published after you push tag [`v0.1.0-beta.4`][v0.1.0-beta.4] and the [release workflow](../.github/workflows/release.yml) completes.

### Changed

- **Settings:** Floating settings window can be resized (`resize`); **Docked** mode fills the right-hand terminal column (grid-aligned), with a stacked-mobile override for safe areas and the bottom tab bar.
- **CI:** CodeQL for Rust uses `build-mode: none` (Rust does not support CodeQL `manual` build mode).

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.

## [0.1.0-beta.3] - 2026-03-20

Pre-release [`v0.1.0-beta.3`][v0.1.0-beta.3].

### Changed

- **Empty panes:** Branding artwork (repo `img/logo_tranparent.png`), lighter framing (less border / dark slab).
- **Terminal:** Dynamic top inset; key-repeat throttling for smoother input.
- **Backend / IPC:** Per-session `sendInput` queue with coalescing to avoid flooding the PTY.
- **App:** Internal drag-and-drop payload fallback; toolbar and layout tweaks.
- **Styles:** Right-dock and pane theming, empty-pane layout.

## [0.1.0-beta.2] - 2026-03-19

Pre-release [`v0.1.0-beta.2`][v0.1.0-beta.2].

### Changed

- **Views:** Custom **view profiles** (filters, sorting) in the host list flow.
- **UI:** **List tone** and **frame mode** presets; refined host/session row and chip styling.
- **Sidebar:** Clearer layout, hover behavior, and session/host management polish.
- **Accessibility:** Stronger `aria-label`s / titles on pane and action buttons; interaction cleanup.

## [0.1.0-beta.1] - 2026-03-18

Pre-release [`v0.1.0-beta.1`][v0.1.0-beta.1].

### Fixed

- **Release CI:** [Release workflow](../.github/workflows/release.yml) now sets the Tauri **bundle icon list** during version sync so platform installers pick up the correct icons (PR #5, `fix/release-set-bundle-icon-list`).

[v0.1.0-beta.1]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.1
[v0.1.0-beta.2]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.2
[v0.1.0-beta.3]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.3
[v0.1.0-beta.4]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.4
[v0.1.0-beta.5]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.5
[v0.1.0-beta.6]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.6
