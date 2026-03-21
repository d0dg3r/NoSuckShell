# Screenshots for README and app stores

This folder holds **marketing screenshots** for [README.md](../../../README.md), [Flathub](https://docs.flathub.org/docs/for-app-authors/metainfo-guidelines/quality-guidelines), [Microsoft Store](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images), and [Snapcraft](https://snapcraft.io/docs/store-icon-and-screenshot-requirements).

## Size matrix

| Target | Window (logical) | Notes |
| --- | --- | --- |
| **Flathub (recommended)** | **≤ 1000 × 700** | Smaller window keeps UI readable when the store scales thumbnails; on HiDPI aim for **≤ 2000 × 1400** physical pixels with the same *logical* size |
| **Microsoft Store** | Any, but exported image **≥ 1366 × 768** | PNG; put primary UI in the **upper two thirds** (store may overlay text) |
| **Snap Store** | Match **16∶9** canvas where possible | Commonly **1920 × 1080**; confirm in the publisher UI when you submit |

**Workflow:** Take **two passes** — resize the app window for the Flathub set, then resize larger (e.g. **1400 × 900** default from `tauri.conf.json`, or wider) and capture again for Microsoft/Snap. Do **not** upscale a tiny PNG for MS Store; capture at sufficient resolution.

## Shot list (order: hero first)

1. **`01-main`** — Sidebar + host table + one embedded session (SSH or local shell) with readable terminal content.
2. **`02-split`** — Split workspace: two panes, different sessions; divider visible.
3. **`03-layout-profiles`** — Layout profile save/load or layout command center; “with hosts” vs “layout only” visible if possible.
4. **`04-quick-connect`** — Quick connect flow or connection toolbar.
5. **`05-backup`** — Settings: encrypted backup export/import (placeholder paths/passwords only).
6. **`06-organization`** — Favorites, tag filter, or custom view profile in the sidebar.
7. **`07-broadcast`** (optional) — Broadcast mode or host editor, if it tells a strong story.

Use **demo data** only (e.g. `demo-server`, `staging.example.com`, generic `uname`/`neofetch`-style output). Avoid empty states.

## Captions (Flathub / AppStream)

One short sentence per image, **no trailing period**, for `<caption>` in metainfo. Suggested English captions:

| File | Caption |
| --- | --- |
| `01-main.png` | Host list and embedded terminal in one workspace |
| `02-split.png` | Split panes with independent sessions and resizable dividers |
| `03-layout-profiles.png` | Save and restore layout profiles with or without host mappings |
| `04-quick-connect.png` | Quick connect and session tooling from the toolbar |
| `05-backup.png` | Password-protected encrypted backup export and import |
| `06-organization.png` | Favorites, tags, and custom views in the sidebar |
| `07-broadcast.png` | Broadcast input to multiple sessions when enabled |

**Localized store listings:** If you ship screenshots where the on-screen UI is not English, set `xml:lang` on those `<screenshot>` elements in AppStream metainfo to match the locale and translate captions. Flathub curation still expects at least one screenshot whose visible chrome and caption are English.

## Language policy (screenshots & stores)

**Target:** README and store screenshots should show **English UI** with the English captions above (aligned with in-app copy). Regenerate or re-capture after UI string changes so assets stay consistent. The Playwright screenshot pipeline renders the same React UI as the desktop build.

See [metainfo-captions.xml](metainfo-captions.xml) for a copy-paste snippet.

## Automated generation (recommended)

Uses a **Chromium + Playwright** run against the **e2e Vite build** (stubbed Tauri IPC with demo hosts and terminal output). Output matches the real React UI closely; window **title bar and native shadow are not included** — for strict Flathub window-only shots on Linux, re-capture with a system window tool using the same window size.

From the repository root (after `npm run desktop:install`):

```bash
npm run screenshots
```

This runs `npm run build:e2e` and [generate.spec.ts](../../../apps/desktop/e2e/screenshots/generate.spec.ts), then writes:

- `store-ms-snap/*.png` — **1920×1080** (`.app-shell` bounds; suitable for Microsoft Store / Snap)
- `flathub/*.png` — same scenes downscaled to max **1000×700** with ImageMagick `magick` when available (otherwise a copy of the store file)

Requires Playwright’s browser: `cd apps/desktop && npx playwright install chromium` (once per machine).

On **GitHub Releases** (tag `v*`), the [Release workflow](../../../.github/workflows/release.yml) runs the same `npm run screenshots` step and attaches **`marketing-screenshots.zip`** (contains `flathub/` and `store-ms-snap/` PNGs) to the release. Copy those into this folder if you want committed assets to match the published release.

## Manual capture (Linux, native window)

1. Build/run the desktop app: from repo root `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev` (if needed on your GPU/WebKit stack).
2. **Do not maximize** the window (Flathub: keep shadow and rounded corners).
3. Use the system **window screenshot** tool (e.g. **GNOME**: capture window; **KDE**: Spectacle window mode; **Hyprland**: `grim -g "…"`) so **title bar + shadow** are included where possible.
4. Save into `flathub/` or `store-ms-snap/` as listed above.

Helper script (requires `xdotool`, `gnome-screenshot`; X11/Wayland behavior varies):

```bash
# Capture a single shot (e.g. 01-main for Flathub):
./scripts/capture-store-screenshots.sh flathub 01-main

# Interactive mode — prompts you to prepare each scene in turn:
./scripts/capture-store-screenshots.sh interactive flathub
```

The script focuses the NoSuckShell window and saves PNGs; you still arrange each **scene** (split, backup screen, etc.) manually between delay windows, or run it once per prepared state.

## Video

Short **screen recordings** (30–90 s) work well for README links, release posts, or Microsoft Store trailers.

- **Linux:** [OBS Studio](https://obsproject.com/), [Kooha](https://github.com/SeaDve/Kooha), or SimpleScreenRecorder.
- **README:** Link to an MP4 on **Releases** or **YouTube**; GitHub markdown does not embed autoplay video like a store page.
- **Microsoft Store:** Upload a trailer separately in Partner Center; check current **resolution/codec/length** requirements in [Microsoft’s publisher docs](https://learn.microsoft.com/en-us/windows/apps/publish/).

Storyboard alignment: host → terminal → split → layout save → backup screen (same demo data as screenshots).

See [VIDEO.md](VIDEO.md) for a concise checklist.
