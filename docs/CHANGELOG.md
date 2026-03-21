# Changelog

All notable changes to **NoSuckShell** are documented here. Version numbers follow the desktop app (`apps/desktop`); GitHub releases are created from `v*` tags (see [releases.md](releases.md)).

## [1.0.0-beta.1] - 2026-03-21

**Pre-release.** Binaries are published only after you push tag `v1.0.0-beta.1` and the [release workflow](../.github/workflows/release.yml) completes.

### Changed

- **Settings:** Floating settings window can be resized (`resize`); **Docked** mode fills the right-hand terminal column (grid-aligned), with a stacked-mobile override for safe areas and the bottom tab bar.
- **CI:** CodeQL for Rust uses `build-mode: none` (Rust does not support CodeQL `manual` build mode).

### Notes

- Installers remain **unsigned**; see [releases.md](releases.md) for signing / notarization follow-up.

[1.0.0-beta.1]: https://github.com/d0dg3r/NoSuckShell/releases
