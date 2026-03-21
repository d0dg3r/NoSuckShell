# Changelog

All notable changes to **NoSuckShell** are documented here. Version numbers follow the desktop app (`apps/desktop`); GitHub releases are created from `v*` tags (see [releases.md](releases.md)).

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
