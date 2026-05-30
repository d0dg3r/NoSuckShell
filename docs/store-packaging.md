# Store packaging and distribution channels

This document tracks the **distribution channels** for NoSuckShell and the artefacts each one needs. The desktop binary itself is built once (per-OS) by [`release.yml`](../.github/workflows/release.yml); each channel below repacks or wraps that binary.

> **Status legend:** Shipping = already in the release pipeline · Prepared = artefact in repo, submission to do · Planned = not yet started.

| Channel | Status | Repo path | Notes |
| --- | --- | --- | --- |
| GitHub Releases (DEB, AppImage, MSI, DMG) | **Shipping** | `.github/workflows/release.yml` | Primary download for all platforms. |
| AUR (`nosuckshell-bin`) | **Shipping** | [`aur/`](../aur/) | Auto-published on each GitHub Release when `AUR_SSH_PRIVATE_KEY` is set. |
| Local Flatpak (developer) | **Shipping** | [`flatpak/`](../flatpak/) | Repacks the Tauri `.deb` for `flatpak --user install --bundle …`. **Not** the same artefact as a Flathub build. |
| **Flathub** | **Prepared** | [`flatpak/dev.nosuckshell.desktop.metainfo.xml`](../flatpak/dev.nosuckshell.desktop.metainfo.xml) | AppStream metainfo refreshed for 1.0; Flathub manifest still to write (see below). |
| **Microsoft Store (MSIX)** | **Planned** | — | Requires the MSI signed (Authenticode) → wrapped via `MSIX Packaging Tool` or `Advanced Installer`. |
| **Snap (Snapcraft)** | **Planned** | — | A `snapcraft.yaml` is on the roadmap; classic confinement may be needed for full SSH UX. |

## AppStream metainfo (Flathub-quality)

The metainfo XML at [`flatpak/dev.nosuckshell.desktop.metainfo.xml`](../flatpak/dev.nosuckshell.desktop.metainfo.xml) has been brought up to **Flathub validation level**:

- `metadata_license: CC0-1.0`, `project_license: MIT` (Flathub requires both).
- Long-form `<description>` with a feature list.
- Seven `<screenshots>` entries pointing at `docs/media/screenshots/flathub/*.png` on `raw.githubusercontent.com`.
- `<categories>`, `<keywords>`, `<provides>`, `<content_rating type="oars-1.1"/>`.
- `<releases>` covering `0.3.0 → 0.3.6` (extend before each tag).

Validate locally:

```bash
flatpak install -y flathub org.freedesktop.appstream-glib
flatpak run --command=appstream-util org.freedesktop.appstream-glib validate-relax \
  flatpak/dev.nosuckshell.desktop.metainfo.xml
```

## Submitting to Flathub

The current [`flatpak/dev.nosuckshell.desktop.yml`](../flatpak/dev.nosuckshell.desktop.yml) is a **local repack** of the Tauri `.deb`, not a Flathub-style buildable manifest. For the Flathub submission a separate manifest is needed that:

1. Pins the Flathub runtime (`org.gnome.Platform // 47` or later) and SDK.
2. Builds NoSuckShell **from source** in the sandbox (`cargo` extension, Node SDK extension), or reuses the released `.tar.gz` of the Tauri DEB extracted in a `simple` build module — Flathub prefers source builds.
3. Restricts `finish-args` to the smallest viable permission set (avoid `--filesystem=home`; prefer `--filesystem=~/.ssh:rw` and the document portal).
4. Lives in a **separate** Flathub repository (`flathub/dev.nosuckshell.desktop`), not in this repo. The metainfo and the desktop file remain authoritative here and are vendored into the Flathub repo.

See <https://docs.flathub.org/docs/for-app-authors/submission> for the current submission flow.

## Microsoft Store (MSIX)

1. Sign the MSI / EXE produced by `tauri:build` with an Authenticode certificate (configured via `TAURI_WINDOWS_SIGN_COMMAND`; see [releases.md](releases.md#code-signing-and-notarization)).
2. Convert the signed MSI to MSIX with one of:
   - **MSIX Packaging Tool** (Microsoft, GUI).
   - **Advanced Installer** or **InstallAware** (commercial CI).
   - `wapproj` / `MakeAppx.exe` for fully scripted CI.
3. Publish via [Partner Center → Apps and games](https://partner.microsoft.com/dashboard) under the official publisher account. Reuse the screenshots in [`docs/media/screenshots/store-ms-snap/`](media/screenshots/) (already sized for store listings).

Store-listing fields needed (English-only per project rules):

- **Title:** `NoSuckShell`
- **Tagline:** `Cross-platform SSH manager with split workspaces and file panes`
- **Description:** Reuse the `<description>` block from the AppStream metainfo above (drop the XML tags).
- **Categories:** Developer tools → Network / Utilities.
- **Privacy policy URL:** Link to [`SECURITY.md`](../SECURITY.md) on GitHub.

## Snap

Drafting a `snapcraft.yaml` at the repo root is the next concrete step. A first iteration likely needs `confinement: classic` to keep SSH agent forwarding and arbitrary identity-file paths working; this requires a manual review by the Snap Store team.

## Marketing copy (canonical)

Single source of truth that all stores re-use. **English only** per [`.cursor/rules/english-ui-copy.mdc`](../.cursor/rules/english-ui-copy.mdc).

- **Tagline (≤ 60 chars):** Cross-platform SSH manager with split workspaces.
- **Short description (≤ 160 chars):** Tabbed and split SSH terminals, layout profiles, encrypted backups, and SFTP file panes — all working with your existing `~/.ssh/config`.
- **Long description:** see the `<description>` block in [`flatpak/dev.nosuckshell.desktop.metainfo.xml`](../flatpak/dev.nosuckshell.desktop.metainfo.xml).
- **Privacy / data handling:** see [`SECURITY.md`](../SECURITY.md).
- **Terms (paid plugins only):** see [`docs/terms-of-sale.md`](terms-of-sale.md).
- **Support:** [GitHub Issues](https://github.com/d0dg3r/NoSuckShell/issues) and the Ko-fi page linked from the in-app **About** tab.

## Checklist before submitting to a store

1. Final SemVer tag pushed; release workflow uploaded signed binaries.
2. `<releases>` block in the metainfo includes the new version with `date="YYYY-MM-DD"`.
3. Marketing screenshots in `docs/media/screenshots/<channel>/` are current.
4. Privacy + security text on the store listing matches [`SECURITY.md`](../SECURITY.md).
5. Listing is reviewed for English-only copy (no German strings leaked from earlier branches).
