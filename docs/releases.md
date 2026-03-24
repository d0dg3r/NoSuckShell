# Release Process

This repository publishes desktop releases from Git tags via GitHub Actions.

## Tag convention

- Final release: `vMAJOR.MINOR.PATCH` (example: `v1.2.3`)
- Pre-release: `vMAJOR.MINOR.PATCH-<prerelease>` (example: `v1.2.3-rc.1`, `v0.1.0-beta.7`)
- Accepted prerelease token format: dot-separated `[0-9A-Za-z-]+` parts.

Validation regex in workflow:

`^v([0-9]+)\.([0-9]+)\.([0-9]+)(-([0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*))?$`

Rules:

- If the tag has no suffix (`v1.2.3`), GitHub release is published as final (`prerelease: false`).
- If the tag contains a suffix (`v1.2.3-beta.1`, `v1.2.3-rc.1`, ...), GitHub release is published as prerelease (`prerelease: true`).

## Build and publish workflow

Workflow file: `.github/workflows/release.yml`

Trigger:

- Push tag matching `v*`

Pipeline order:

1. **Validate tag** — SemVer format and prerelease flag.
2. **Test (Ubuntu only)** — `npm test` (Vitest) and `cargo test` in `apps/desktop/src-tauri`. If this job fails, **no** platform builds or GitHub release are produced.
3. **Build matrix** — only runs after tests pass.

Build matrix:

- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

For each platform:

1. Checkout repository.
2. Setup Node.js and Rust toolchain.
3. Install Linux build dependencies (Linux only).
4. Install npm dependencies (`apps/desktop`).
5. Sync app version from tag into:
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/tauri.conf.json`
   - `apps/desktop/src-tauri/Cargo.toml`
6. Run `npm run tauri:build` with optional **`NOSUCKSHELL_LICENSE_PUBKEY_HEX`** (64 hex chars) in the environment so the binary **embeds** your production Ed25519 verify key at compile time (`option_env!` in `apps/desktop/src-tauri/src/license.rs`).
7. Upload generated bundles as build artifacts.

### Production license public key (GitHub Actions)

For **official** release binaries, configure a repository secret:

- **Name:** `NOSUCKSHELL_LICENSE_PUBKEY_HEX`
- **Value:** 64-character hex string (32-byte Ed25519 **public** key) matching your deployed `LICENSE_SIGNING_SEED_HEX`.

The [release workflow](../.github/workflows/release.yml) passes this secret into the Tauri build step. If the secret is **missing** (for example on a fork), builds still succeed but use the **development** verify key—fine for experimentation, **not** for selling tokens to end users.

Local release-style build:

```bash
export NOSUCKSHELL_LICENSE_PUBKEY_HEX="<your-64-hex-public-key>"
cd apps/desktop && npm run tauri:build
```

Release job:

1. Download all uploaded platform artifacts.
2. Create GitHub release for the tag.
3. Mark release as final/prerelease based on parsed tag.
4. Attach all built artifacts to the release.

## Creating a release

Create and push a tag:

```bash
# final release
git tag v0.2.0
git push origin v0.2.0

# prerelease
git tag v0.3.0-rc.1
git push origin v0.3.0-rc.1

# beta prerelease (current line)
git tag v0.1.0-beta.11
git push origin v0.1.0-beta.11
```

## Current beta (planned)

- **Target tag:** `v0.1.0-beta.11` — push when you are ready; in-repo versions in `package.json`, `tauri.conf.json`, and `Cargo.toml` match this prerelease.
- **What ships:** see [CHANGELOG.md](CHANGELOG.md) for `0.1.0-beta.11`.
- The release workflow still **overwrites** those files from the tag at build time; keeping them in sync avoids drift before the tag lands.

## Common pitfalls checklist

- Ensure workflow has `permissions: contents: write` (required for release upload).
- Ensure Linux runner installs Tauri system dependencies.
- Keep version source single: tag is the source of truth.
- Use tag-based trigger only (avoid releasing on every commit).
- Keep asset names/platform artifacts separated by matrix job.
- Keep workflow `concurrency` enabled to prevent duplicate runs for the same tag.

## Follow-up: code signing and notarization

Current workflow builds and publishes unsigned artifacts. For production distribution, add platform signing:

- Windows:
  - Sign `.exe`/`.msi` with a trusted code-signing certificate.
  - Store certificate material and passwords in GitHub Secrets.
- macOS:
  - Sign app with Apple Developer ID certificate.
  - Notarize with Apple notary service.
  - Staple notarization ticket to distributables (`.app`/`.dmg`).
- Linux:
  - AppImage generally works unsigned, but optional signature/provenance can be added in a hardened pipeline.

Recommended next step:

1. Add secrets for signing credentials.
2. Add conditional signing steps in `.github/workflows/release.yml`.
3. Verify signed artifacts on each platform before public rollout.
