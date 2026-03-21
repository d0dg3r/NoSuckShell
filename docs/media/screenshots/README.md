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

German UI shots: tag screenshots with `xml:lang="de"` in metainfo and use German captions (same meaning).

## Language policy (Flathub)

Flathub recommends **at least one screenshot in English**. The app UI may be partially German; options:

- Add **one English-forward** screenshot (e.g. terminal-heavy view where chrome is minimal), **or**
- Provide a **dedicated English screenshot set** once UI localization exists, **or**
- Ship **German** screenshots with `xml:lang="de"` and add **at least one** separate English image for curation.

See [metainfo-captions.xml](metainfo-captions.xml) for a copy-paste snippet.

## How to capture (Linux)

1. Build/run the desktop app: from repo root `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev` (if needed on your GPU/WebKit stack).
2. **Do not maximize** the window (Flathub: keep shadow and rounded corners).
3. Use the system **window screenshot** tool (e.g. **GNOME**: capture window; **KDE**: Spectacle window mode) so **title bar + shadow** are included.
4. Save into `flathub/` or `store-ms-snap/` as listed above.

Helper script (requires `xdotool`, `gnome-screenshot`; X11/Wayland behavior varies):

```bash
./scripts/capture-store-screenshots.sh
```

The script focuses the NoSuckShell window and saves PNGs; you still arrange each **scene** (split, backup screen, etc.) manually between delay windows, or run it once per prepared state.

## Video

Short **screen recordings** (30–90 s) work well for README links, release posts, or Microsoft Store trailers.

- **Linux:** [OBS Studio](https://obsproject.com/), [Kooha](https://github.com/SeaDve/Kooha), or SimpleScreenRecorder.
- **README:** Link to an MP4 on **Releases** or **YouTube**; GitHub markdown does not embed autoplay video like a store page.
- **Microsoft Store:** Upload a trailer separately in Partner Center; check current **resolution/codec/length** requirements in [Microsoft’s publisher docs](https://learn.microsoft.com/en-us/windows/apps/publish/).

Storyboard alignment: host → terminal → split → layout save → backup screen (same demo data as screenshots).

See [VIDEO.md](VIDEO.md) for a concise checklist.
