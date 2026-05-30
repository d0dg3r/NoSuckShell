# Release Process

This repository publishes desktop releases from Git tags via GitHub Actions.

## Tag convention

- Final release: `vMAJOR.MINOR.PATCH` (example: `v1.2.3`)
- Pre-release: `vMAJOR.MINOR.PATCH-<prerelease>` (example: `v1.2.3-rc.1`, `v0.1.0-beta.11`)
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
   - (Not rewritten by CI — keep in sync locally when you prepare a release PR: `apps/desktop/package-lock.json` top-level `version` fields, and `apps/desktop/src-tauri/Cargo.lock` `[[package]] name = "src-tauri"` version line.)
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

### AUR (`nosuckshell-bin`)

When a GitHub **Release** is **published** (not only tag push), [`.github/workflows/aur-publish.yml`](../.github/workflows/aur-publish.yml) can update the [AUR](https://aur.archlinux.org/packages/nosuckshell-bin) package `nosuckshell-bin` using [`aur/nosuckshell-bin/PKGBUILD`](../aur/nosuckshell-bin/PKGBUILD). It runs only on the upstream repository `d0dg3r/NoSuckShell` and requires the **`AUR_SSH_PRIVATE_KEY`** repository secret (SSH key with push access to the AUR). See [`aur/README.md`](../aur/README.md) for one-time setup.

## Creating a release

Create and push a tag:

```bash
# final release
git tag v0.2.0
git push origin v0.2.0

# prerelease
git tag v0.3.0-rc.1
git push origin v0.3.0-rc.1

# stable release (example: current product line)
git tag v0.2.1
git push origin v0.2.1
```

## Current release (0.3.x)

- **Latest stable:** `v0.3.6` — first store-ready cut of the `0.3.x` line (privacy + signing + CSP + CI gates). The `v0.3.6` tag was pushed but its macOS bundler step failed before the GitHub Release was created; users should install `v0.3.7-beta.1` until a re-cut stable is published. See [CHANGELOG.md](CHANGELOG.md) for `0.3.6`.
- **Current pre-release:** `v0.3.7-beta.1` — re-cut of the market-readiness pass with the macOS signing-env regression fixed; install from [GitHub Releases (pre-releases)](https://github.com/d0dg3r/NoSuckShell/releases?q=prerelease%3Atrue). See [CHANGELOG.md](CHANGELOG.md) for `0.3.7-beta.1`.
- **Earlier pre-release:** `v0.3.6-beta.1` — Linux terminal input latency fixes; archived on [GitHub Releases (pre-releases)](https://github.com/d0dg3r/NoSuckShell/releases?q=prerelease%3Atrue).

Before tagging, keep the same version string in:

- `apps/desktop/package.json`
- `apps/desktop/package-lock.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`

The release workflow still **overwrites** those files from the tag at build time; keeping them in sync avoids drift before the tag lands.

- **Working-tree drift:** if `package.json` is bumped ahead of `Cargo.toml` / `tauri.conf.json` (or the reverse), realign before you cut a release so local `tauri dev` and CI agree on the product version.

## Common pitfalls checklist

- Ensure workflow has `permissions: contents: write` (required for release upload).
- Ensure Linux runner installs Tauri system dependencies.
- Keep version source single: tag is the source of truth.
- Use tag-based trigger only (avoid releasing on every commit).
- Keep asset names/platform artifacts separated by matrix job.
- Keep workflow `concurrency` enabled to prevent duplicate runs for the same tag.

## Code signing and notarization

The release workflow has **plumbing** for both macOS notarization and Windows code signing. Both are **opt-in**: the workflow keeps producing usable binaries when the matching secrets are unset (the macOS step warns and exits 0; Tauri's build step skips signing automatically). Configure the secrets below for **official** binaries before public rollout.

### macOS (Developer ID + notarization)

Required GitHub repository secrets:

| Secret | Description |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` of the **Developer ID Application** certificate (full chain). |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12`. |
| `APPLE_SIGNING_IDENTITY` | Identity string Tauri passes to `codesign`, e.g. `Developer ID Application: NoSuckShell (TEAMID)`. |
| `APPLE_TEAM_ID` | Apple Developer team ID (e.g. `ABCDE12345`). |
| `APPLE_ID` + `APPLE_PASSWORD` | App-Store-Connect account email and **app-specific password** for `notarytool`. |
| *or* `APPLE_API_KEY` + `APPLE_API_KEY_PATH` + `APPLE_API_ISSUER` | App-Store-Connect API key alternative to ID/password. |

The `Import Apple signing certificate` step creates a temporary keychain on the macOS runner, imports the `.p12`, and unlocks it for `codesign`. The next `Build Tauri app bundles` step picks up `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` etc. so Tauri signs and notarizes automatically.

To export the certificate locally:

```bash
# After your Developer ID Application cert is in Keychain Access:
security export -k login.keychain -t identities -f pkcs12 -o cert.p12
base64 cert.p12 | pbcopy   # paste as the APPLE_CERTIFICATE secret
```

### Windows (Authenticode signing)

Required GitHub repository secrets:

| Secret | Description |
| --- | --- |
| `TAURI_WINDOWS_SIGN_COMMAND` | Full sign command Tauri runs over each binary, e.g. `signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /sha1 <thumbprint> %1` or an `AzureSignTool.exe` invocation. |

Tauri reads `TAURI_WINDOWS_SIGN_COMMAND` and runs it for each generated artifact. Modern recommendation is **Azure Trusted Signing** or a remote HSM-based signing service so no certificate material lives in the runner image. The certificate must chain to a Microsoft-trusted root and have an EKU compatible with code signing.

### Linux

AppImage generally works unsigned. Optional signature/provenance (e.g. `appimagetool --sign`, sigstore/cosign) can be added later in a hardened pipeline.

### Verifying a signed build

1. **macOS:** `spctl --assess --type execute --verbose=4 NoSuckShell.app` should report `accepted`.
2. **macOS notarization:** `xcrun stapler validate NoSuckShell.dmg` should succeed.
3. **Windows:** `Get-AuthenticodeSignature NoSuckShell.exe` (PowerShell) should show `Status: Valid`.

### AppImage and host shared libraries (`libpcre2` / `libgit2`)

Some rolling distros ship **`libgit2`** that expects a **version-tagged** **`libpcre2`** from the system. The AppImage bundles its own `libpcre2` under the mount (`/tmp/.mount_*/usr/lib/...`). If anything in your environment puts that mount on the **library search path** while a **host** binary loads **`/usr/lib/libgit2.so.*`**, the dynamic linker can mix **host `libgit2` + AppImage `libpcre2`**, which triggers warnings such as:

`no version information available (required by /usr/lib/libgit2.so.*)`

Typical triggers:

- **`LD_LIBRARY_PATH`** (or similar) still containing the AppImage mount in a shell where you run **git-aware** tools (for example **`eza` / `exa` / `lsd`** aliased as `ll`).
- Running those tools in the **same** environment while the AppImage payload is mounted.

Mitigations:

- Prefer the **native Arch package** (`.pkg.tar.zst` from CI) on Arch-based systems when you hit this; it avoids AppImage library injection.
- Use a **clean shell** without AppImage paths in `LD_LIBRARY_PATH` for unrelated CLI tools.
- Official **release** AppImages are **post-processed** in CI to **remove bundled `libpcre2-8`** so the loader can pick the **system** `libpcre2` that matches your distro’s `libgit2` (see `scripts/postprocess-linux-appimage-libs.sh`).

Recommended next step:

1. Add secrets for signing credentials.
2. Add conditional signing steps in `.github/workflows/release.yml`.
3. Verify signed artifacts on each platform before public rollout.
