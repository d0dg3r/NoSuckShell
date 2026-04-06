# Local Flatpak (developer)

This folder holds a **Flatpak manifest** that repackages the **Tauri `.deb`** from a normal `npm run tauri:build`. It is intended for **local installs** (for example `flatpak --user install --bundle …`) and is **not** the same pipeline as a future [Flathub](https://flathub.org/) submission.

## Prerequisites

- `flatpak` and `flatpak-builder`
- `org.gnome.Platform` and `org.gnome.Sdk` matching `runtime-version` in `dev.nosuckshell.desktop.yml` (currently **47**)

Example (Flathub remote):

```bash
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install -y flathub org.gnome.Platform//47 org.gnome.Sdk//47
```

On Arch-based systems you may need `pacman -S flatpak flatpak-builder dpkg` (`dpkg-deb` unpacks the `.deb` into a staging tree).

## Build and install

From the **repository root**:

```bash
bash scripts/build-local-flatpak.sh
```

Options:

- `NO_BUILD=1` — skip `npm run tauri:build` if a `.deb` already exists under `target/release/bundle/deb/`.
- `COPY_TO="$HOME/Applications"` — copy the generated `.flatpak` bundle to that directory after `build-bundle` (directory is created if missing). Same for `~/applications` if you prefer a lowercase folder.

Install the bundle for your user:

```bash
flatpak --user install -y --bundle flatpak/NoSuckShell-local.flatpak
```

Flatpak registers the app under your **user** installation (`~/.local/share/flatpak`). Copying the `.flatpak` file to `~/Applications` is optional (handy as a download folder); install it with the command above.

## Sandboxing note

`finish-args` grant broad access (including `home` and `~/.ssh`) so SSH and file workflows match typical desktop use. Tightening permissions is possible but may break features until paths are tested.
