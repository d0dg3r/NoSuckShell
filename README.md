# NoSuckShell

![NoSuckShell](img/logo_terminal.png)

Cross-platform SSH manager desktop app (Tauri + React) focused on fast host management and clean terminal workflows.

## Panel workspace

- Split workspace starts with one full-size panel.
- You can split the focused panel recursively (`Split left` / `Split bottom`) with default ratio `60/40`.
- Split dividers are mouse-resizable (horizontal + vertical).
- Panels can be reordered via drag and drop (swap behavior).
- Layout profiles can be saved/loaded/deleted with:
  - `with hosts` enabled: geometry + host/session mapping
  - `with hosts` disabled: geometry/layout only

## Run locally

From the repository root, the first `npm run tauri:dev` / `desktop:build` will install dependencies under `apps/desktop` automatically if they are missing. You can still install explicitly:

```bash
npm run desktop:install
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
```

Or from `apps/desktop`:

```bash
cd apps/desktop
npm install
npm run tauri:dev
```

## Validate locally

```bash
cd apps/desktop
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

## Backup security

- Backup export/import is password protected and encrypted.
- Unencrypted legacy JSON backups are intentionally rejected.
- Backup path handling supports `~` expansion and cross-platform host path normalization.

Details: [docs/backup-security.md](docs/backup-security.md)

## Release via Git tags

GitHub releases are created by pushing a SemVer tag:

- Final release: `vMAJOR.MINOR.PATCH` (example: `v1.2.3`)
- Pre-release: `vMAJOR.MINOR.PATCH-<suffix>` (example: `v1.2.4-rc.1`, `v1.2.4-beta.1`)

```bash
# Final release
git tag v0.1.0
git push origin v0.1.0

# Pre-release
git tag v0.1.1-rc.1
git push origin v0.1.1-rc.1

# Current beta example
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

Detailed release docs: [docs/releases.md](docs/releases.md)

Troubleshooting: if the workflow fails with an invalid tag format, use `vMAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH-prerelease` (example: `v2.0.0` or `v2.0.0-rc.1`).
