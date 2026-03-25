# Changelog

All notable changes to **NoSuckShell** are documented here. Version numbers follow the desktop app (`apps/desktop`); GitHub releases are created from `v*` tags (see [releases.md](releases.md)).

## [0.2.2] - 2026-03-25

**Stable release.** Binaries are published after you push tag [`v0.2.2`][v0.2.2] and the [release workflow](../.github/workflows/release.yml) completes.

### Added

- **File Pane** — Persistent **column sizing** for the file browser; **RemoteFilePane** component for Proxmox/SFTP views; enhanced **SFTP** and **Proxmox** file management.
- **Documentation** — New **User Help** (`docs/USER_HELP.md`) and in-app **Help** tab updates; updated **Architecture**, **Roadmap**, and **Licensing** documentation.
- **Utility** — New **repo links** feature for quick access to project resources.

### Changed

- **Settings** — Major UI overhaul of the **Proxmox** tab with better layout and confirmation flows.
- **Visuals** — Refined **CSS** polish for modals, toolbars, and file pane components for a more premium look.
- **Core** — Re-implemented table resizing to use centralized column width persistence.

### Fixed

- **Stability** — Improved **workspace snapshot** reliability and saved state persistence.
- **UI** — Fixed terminal dock layout and general CSS refinements.

## [0.2.1] - 2026-03-24

**Stable release.** Binaries are published after you push tag [`v0.2.1`][v0.2.1] and the [release workflow](../.github/workflows/release.yml) completes (`prerelease: false`).

### Added

- **PROXMUX** — Optional **trusted cluster certificate PEM** with stored leaf **SHA-256** fingerprint and confirmation when it changes; **native-tls** (`reqwest`) for Proxmox API traffic; embedded **QEMU noVNC** and **LXC** consoles use **`proxmux_ws_proxy`** (local `ws://` → upstream `wss://`) with the same TLS relaxation when **Allow insecure TLS** is enabled or a non-empty PEM is stored.
- **Documentation** — Architecture, roadmap, README, in-app Help, and [`nosuckshell_ops`](../.agents/skills/nosuckshell_ops/SKILL.md) updated for PROXMUX behavior and **release/version discipline**.

### Fixed

- **CI / release** — Arch Linux **PKGBUILD** bundle discovery across workflow refactors; GitHub **release** job limits attachable **asset extensions**; desktop **`npm run build`** clears `dist` before `tsc` + Vite for reproducible output.

### Changed

- **Versioning** — Product line advances to **0.2.1** across `package.json`, `package-lock.json`, `tauri.conf.json`, and `Cargo.toml` (keep aligned before every tag).

## [0.1.0-beta.17] - 2026-03-24

**Pre-release.** Some intermediate tags may not exist on GitHub; this entry records `main` before **0.2.1**.

### Changed

- **Marketing screenshots** — Regenerated for the latest UI layout (#76).
- **Chore** — `package.json` advanced to **0.1.0-beta.17** while other manifests still tracked **beta.11**; superseded by **0.2.1** sync.

## [0.1.0-beta.15] - 2026-03-24

**Pre-release.**

### Changed

- **Chore** — Version bump to **0.1.0-beta.15**.

### Fixed

- **CI** — Arch **PKGBUILD** resolves the Debian bundle directory more reliably; GitHub **release** upload filters allowed **file extensions** for matrix artifacts (#74, #75).

## [0.1.0-beta.14] - 2026-03-24

**Pre-release.**

### Changed

- **Chore** — Version bump to **0.1.0-beta.14**.

## [0.1.0-beta.13] - 2026-03-24

**Pre-release.**

### Fixed

- **Code scanning** — TLS verification adjustments in development/test utilities (#68).

### Changed

- **Build** — Desktop production build removes `dist` before TypeScript + Vite (#69).
- **Chore** — Ignore **root** `Cargo.lock` to reduce accidental version noise (#70).

## [0.1.0-beta.12] - 2026-03-24

**Pre-release.**

### Added

- **PROXMUX** — **Allow insecure TLS** for Proxmox API and console paths when clusters use self-signed or private PKI (#66).

### Fixed

- **CI** — **Arch Linux** packaging moved to a dedicated job; corrected **artifact** paths and **PKGBUILD** robustness (#66, #67).

## [0.1.0-beta.11] - 2026-03-24

### Added
- **Version bump** — Official beta 11 release.
- **Documentation** — Updated changelog with missing version details from beta 8, 9, and 10; synchronized `releases.md`.
- **Marketing screenshots** — Updated high-resolution screenshots for Proxmox, SFTP, and local files; added Proxmox VNC view.

## [0.1.0-beta.10] - 2026-03-24

### Added
- **Screenshots automation** — GitHub Actions workflow for automated store screenshot generation (`screenshots.yml`).
- **Visuals** — Refined marketing screenshots with hybrid Proxmox views (terminal + noVNC).

## [0.1.0-beta.9] - 2026-03-23

### Added
- **Manual builds** — `manual-build.yml` workflow with platform selection (Linux, macOS, Windows) for targeted testing outside the release cycle.

## [0.1.0-beta.8] - 2026-03-23

### Fixed
- **Arch Linux build** — Corrected file paths and dependencies in the CI workflow for Arch Linux workspace builds.
- **Security** — Addressed code scanning alerts related to TLS certificate checks in development/test utilities.

## [0.1.0-beta.7] - 2026-03-23

**Pre-release.** Binaries are published after you push tag [`v0.1.0-beta.7`][v0.1.0-beta.7] and the [release workflow](../.github/workflows/release.yml) completes.

### Added

- **PROXMUX integration** — Built-in plugin `dev.nosuckshell.plugin.proxmox`: Proxmox cluster configuration, guest/resource browsing in the sidebar when entitled, **Connection** → **PROXMUX** for credentials and options (including opening Proxmox web consoles in an embedded pane vs the system browser), adaptive polling and startup warmup behavior.
- **App settings** — Restructured **Settings** with clearer sub-tabs; **Plugins** for built-in plugins and license; **Visual style** reset for appearance.
- **Contributor documentation** — [STYLE_GUIDE.md](STYLE_GUIDE.md), [CODE_GUIDE.md](CODE_GUIDE.md), and [AGENTS.md](../AGENTS.md); linked from [CONTRIBUTING.md](../CONTRIBUTING.md).

### Changed

- **Tests / DOM** — E2E selectors updated for the sidebar host row (`.proxmux-sidebar-row-main`).

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.
- In-app **Help** should stay aligned with Settings and PROXMUX behavior; update [`HelpPanel.tsx`](../apps/desktop/src/components/HelpPanel.tsx) when UX changes.

## [0.1.0-beta.6] - 2026-03-22

**Pre-release.** Binaries are published after you push tag [`v0.1.0-beta.6`][v0.1.0-beta.6] and the [release workflow](../.github/workflows/release.yml) completes.

### Added

- **Keyboard:** Settings → **Keyboard** to record shortcuts (physical `KeyboardEvent.code`); configurable **leader key** and follow-up bindings; conflict hints; persisted in `localStorage`. Global shortcuts respect terminal focus (modifier chords and Escape when a modal is open).
- **Help:** In-app Help includes a **Keyboard shortcuts** table (from the same source as runtime) and replaces static “-” keys for mapped actions when opened from Settings.
- **Plugins:** **Plugin store** section with a static catalog (paid **NSS-Commander** add-on via entitlement `dev.nosuckshell.addon.file-workspace`, plus planned integrations). Reference **license server** at [`services/license-server`](../services/license-server/) and operator guide [`license-server-runbook.md`](license-server-runbook.md).
- **SSH / host keys:** Per-host **host key policy** in the sidebar host settings (interactive, auto-accept new keys, or accept any key with warning). OpenSSH `StrictHostKeyChecking` is set from app metadata on session start so ProxyJump hops do not stall on unseen yes/no prompts.
- **Metadata:** `trustHostDefault` and `strictHostKeyPolicy` are persisted end-to-end in Rust (no silent loss on `save_host_metadata`).
- **Quick Connect:** Optional `strictHostKeyPolicy`; **Auto-trust** in settings maps to `accept-new` for quick sessions.
- **Identity Store:** **ProxyJump** alias picker (saved hosts + custom string) for store users and host bindings; **ProxyCommand** presets plus custom field in the host form and store host binding.

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.
- **SFTP** file browser still uses its own host-key path; terminal SSH behavior above does not apply there yet.
- **NSS-Commander** (file-workspace add-on) requires a license that includes `dev.nosuckshell.addon.file-workspace` (or a dev token from the license server). See [license-server-runbook.md](license-server-runbook.md) § Local development.

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
[v0.1.0-beta.7]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.7
[v0.1.0-beta.8]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.8
[v0.1.0-beta.9]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.9
[v0.1.0-beta.10]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.10
[v0.1.0-beta.11]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.1.0-beta.11
[v0.2.1]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.2.1
[v0.2.2]: https://github.com/d0dg3r/NoSuckShell/releases/tag/v0.2.2
