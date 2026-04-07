# AUR package (`nosuckshell-bin`)

The [AUR](https://wiki.archlinux.org/title/Arch_User_Repository) package **nosuckshell-bin** repackages the official `.deb` from [GitHub Releases](https://github.com/d0dg3r/NoSuckShell/releases). The canonical `PKGBUILD` for that package lives in this directory.

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
