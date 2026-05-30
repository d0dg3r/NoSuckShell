# AUR package (`nosuckshell-bin`)

The [AUR](https://wiki.archlinux.org/title/Arch_User_Repository) package **nosuckshell-bin** repackages the official **stable** `.deb` from [GitHub Releases](https://github.com/d0dg3r/NoSuckShell/releases). Pre-releases (for example `v0.3.6-beta.1`) are published separately on GitHub; install those from the pre-release assets, not from AUR, until a matching stable tag ships.

## Install (users)

```bash
yay -S nosuckshell-bin
```

(or any other AUR helper.)

## Maintainer: first-time AUR setup

1. Register on [aur.archlinux.org](https://aur.archlinux.org) and add an SSH public key to your account.
2. Create the package on the AUR (empty Git repo): submit [`nosuckshell-bin/PKGBUILD`](nosuckshell-bin/PKGBUILD) and `.SRCINFO` (`makepkg --printsrcinfo` from `nosuckshell-bin/`).
3. In the GitHub repository **Settings → Secrets and variables → Actions**, add **`AUR_SSH_PRIVATE_KEY`** with the private key that matches the public key from step 1 (deploy key with push access to `nosuckshell-bin` on the AUR).

After each **published** GitHub Release, the workflow [`.github/workflows/aur-publish.yml`](../.github/workflows/aur-publish.yml) updates the AUR package (version and checksum). The workflow runs only on the upstream repository `d0dg3r/NoSuckShell`.

## Local test

From `aur/nosuckshell-bin/`, set `pkgver` and a real `sha256sums` for the matching release `.deb` (or use `updpkgsums`), then:

```bash
makepkg -f
```

## Local build & install on this Arch machine

For development on Arch/CachyOS, [`scripts/build-local-arch.sh`](../scripts/build-local-arch.sh) builds the project with `tauri build --bundles deb` (no AppImage step), repacks the resulting `.deb` into a `.pkg.tar.zst` (same layout as `nosuckshell-bin`), and installs it via `sudo pacman -U`:

```bash
scripts/build-local-arch.sh                 # full build + install
NO_BUILD=1 scripts/build-local-arch.sh      # reuse existing .deb under target/ (or --skip-build)
NO_INSTALL=1 scripts/build-local-arch.sh    # only produce the .pkg.tar.zst (or --no-install)
scripts/build-local-arch.sh --install-z13  # also install the built .pkg on Z13_HOST (see script header)
```

Outputs land in `arch/build/` (gitignored). The generated package is named `nosuckshell-local`, defaults to **`pkgrel` 2** (same upstream `pkgver`, higher than typical `nosuckshell` / `nosuckshell-bin` `-1`), and declares `replaces`/`conflicts` so `pacman -U` can supersede an existing install. Override with `PKGREL=…` if needed. Requires `base-devel`, `dpkg`, `binutils` plus the runtime deps listed in [`nosuckshell-bin/PKGBUILD`](nosuckshell-bin/PKGBUILD).
