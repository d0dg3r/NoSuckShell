#!/usr/bin/env bash
# Build NoSuckShell as an Arch Linux package (.pkg.tar.zst) on this machine and
# install it via pacman -U. The package is produced by repacking the official
# Tauri-generated .deb (mirrors the AUR `nosuckshell-bin` layout exactly), so
# what gets installed locally matches what AUR users would receive. The
# tauri:build step passes --bundles deb only (no AppImage) so the build does not
# depend on linuxdeploy, which often fails on rolling distros.
#
# Usage:
#   scripts/build-local-arch.sh                 # full build + local install
#   NO_BUILD=1 scripts/build-local-arch.sh      # reuse existing .deb (same as --skip-build)
#   NO_INSTALL=1 scripts/build-local-arch.sh  # only build the .pkg.tar.zst (same as --no-install)
#   scripts/build-local-arch.sh --skip-build --no-install
#   scripts/build-local-arch.sh --install-z13  # also install the built package on a remote host
#   PKGNAME=nosuckshell-local scripts/build-local-arch.sh
#   PKGREL — Arch pkgrel (default: 2; above typical nosuckshell/nosuckshell-bin pkgrel 1 for same pkgver)
#
# Optional remote install (same idea as NoSuckTV’s build_install_linux_arch_pkg.sh):
#   Z13_HOST — SSH host (default: z13)
#   Z13_USER — SSH user (default: $USER)
#   Z13_DIR  — remote temp path (default: /tmp)
#
# Output:
#   arch/build/<pkgname>-<ver>-<rel>-x86_64.pkg.tar.zst (gitignored)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH_DIR="${ROOT}/arch"
BUILD_DIR="${ARCH_DIR}/build"

PKGNAME="${PKGNAME:-nosuckshell-local}"
# Default 2 so e.g. 0.3.5-2 sorts above repo/AUR 0.3.5-1 and replaces it without same-rel confusion.
PKGREL="${PKGREL:-2}"
INSTALL_Z13=0

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --skip-build|--no-build) NO_BUILD=1 ;;
    --no-install|--package-only) NO_INSTALL=1 ;;
    --install-z13|--z13) INSTALL_Z13=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Allowed: --skip-build, --no-install, --install-z13, --help" >&2
      exit 1
      ;;
  esac
done

Z13_HOST="${Z13_HOST:-z13}"
Z13_USER="${Z13_USER:-${USER:-}}"
Z13_DIR="${Z13_DIR:-/tmp}"

require_cmd() {
  local cmd=$1
  local hint=${2:-}
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    if [[ -n "${hint}" ]]; then
      echo "${cmd} not found. ${hint}" >&2
    else
      echo "${cmd} not found in PATH." >&2
    fi
    exit 1
  fi
}

require_cmd makepkg "On Arch/CachyOS: sudo pacman -S --needed base-devel"
require_cmd dpkg-deb "On Arch/CachyOS: sudo pacman -S --needed dpkg"
require_cmd ar "On Arch/CachyOS: sudo pacman -S --needed binutils"
require_cmd sha256sum "On Arch/CachyOS: sudo pacman -S --needed coreutils"
if [[ "${NO_INSTALL:-}" != "1" ]]; then
  require_cmd pacman "This script targets Arch-based systems."
  require_cmd sudo "Install the package locally with sudo pacman -U <pkg>, or use --no-install."
fi
if [[ "${INSTALL_Z13}" -eq 1 ]]; then
  require_cmd scp
  require_cmd ssh
fi

read_version() {
  # tauri.conf.json carries the canonical version (kept in sync with package.json
  # and Cargo.toml by the release checklist in .agents/skills/nosuckshell_ops).
  local conf="${ROOT}/apps/desktop/src-tauri/tauri.conf.json"
  if [[ ! -f "${conf}" ]]; then
    echo "tauri.conf.json not found at ${conf}" >&2
    return 1
  fi
  # Tolerant grep: matches "version": "x.y.z" with arbitrary whitespace.
  local ver
  ver="$(grep -E '"version"[[:space:]]*:' "${conf}" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  if [[ -z "${ver}" ]]; then
    echo "Could not read version from ${conf}" >&2
    return 1
  fi
  printf '%s' "${ver}"
}

# makepkg forbids hyphens in pkgver; map SemVer pre-release (e.g. 0.3.6-beta.1) to Arch form.
arch_pkgver_from_app_version() {
  printf '%s' "$1" | tr '-' '.'
}

find_deb() {
  local d f
  for d in \
    "${ROOT}/target/release/bundle/deb" \
    "${ROOT}/apps/desktop/src-tauri/target/release/bundle/deb"; do
    if [[ -d "${d}" ]]; then
      f="$(ls -1t "${d}"/*.deb 2>/dev/null | head -1 || true)"
      if [[ -n "${f}" ]]; then
        printf '%s' "${f}"
        return 0
      fi
    fi
  done
  return 1
}

if [[ "${NO_BUILD:-}" == "1" ]]; then
  DEB="$(find_deb || true)"
  if [[ -z "${DEB}" ]]; then
    echo "NO_BUILD=1 but no .deb found under target/release/bundle/deb or apps/desktop/src-tauri/target/release/bundle/deb." >&2
    exit 1
  fi
  echo "Using existing deb (NO_BUILD=1): ${DEB}"
else
  echo "Running npm run tauri:build -- --bundles deb (only the .deb is needed; skips AppImage)…"
  echo "Set NO_BUILD=1 to reuse an existing .deb"
  (cd "${ROOT}/apps/desktop" && npm run tauri:build -- --bundles deb)
  DEB="$(find_deb || true)"
  if [[ -z "${DEB}" ]]; then
    echo "No .deb found after build. Expected under target/release/bundle/deb (workspace) or apps/desktop/src-tauri/target/release/bundle/deb." >&2
    exit 1
  fi
  echo "Using freshly built deb: ${DEB}"
fi

APP_VERSION="$(read_version)"
PKGVER="$(arch_pkgver_from_app_version "${APP_VERSION}")"
echo "App version: ${APP_VERSION} (Arch pkgver ${PKGVER}-${PKGREL})"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Pull the .deb into the build dir under the exact filename the PKGBUILD references,
# so makepkg's source/integrity checks operate on the local file (no download).
DEB_BASENAME="${PKGNAME}-${APP_VERSION}.deb"
cp -f "${DEB}" "${BUILD_DIR}/${DEB_BASENAME}"

DEB_SHA="$(sha256sum "${BUILD_DIR}/${DEB_BASENAME}" | awk '{print $1}')"

cat >"${BUILD_DIR}/PKGBUILD" <<PKGBUILD
# Auto-generated by scripts/build-local-arch.sh — do not edit by hand.
# Repacks the locally built Tauri .deb into an Arch package (mirrors aur/nosuckshell-bin).
pkgname=${PKGNAME}
pkgver=${PKGVER}
pkgrel=${PKGREL}
pkgdesc="Cross-platform SSH manager desktop app (locally built from this repo)"
arch=('x86_64')
url="https://github.com/d0dg3r/NoSuckShell"
license=('MIT')
depends=('gtk3' 'webkit2gtk-4.1' 'libayatana-appindicator' 'librsvg' 'libsoup3' 'openssl')
provides=('nosuckshell')
conflicts=('nosuckshell' 'nosuckshell-bin')
replaces=('nosuckshell' 'nosuckshell-bin')
options=('!strip')
source=("${DEB_BASENAME}")
sha256sums=('${DEB_SHA}')

package() {
  cd "\${srcdir}"
  ar x "${DEB_BASENAME}"
  tar xf data.tar.* -C "\${pkgdir}"

  # Match CI / Arch: final name on PATH is nosuckshell. Upstream .deb can ship
  # NoSuckShell (older) or the Cargo name src-tauri (current Tauri default).
  if [[ -f "\${pkgdir}/usr/bin/NoSuckShell" && ! -f "\${pkgdir}/usr/bin/nosuckshell" ]]; then
    mv "\${pkgdir}/usr/bin/NoSuckShell" "\${pkgdir}/usr/bin/nosuckshell"
  elif [[ -f "\${pkgdir}/usr/bin/src-tauri" && ! -f "\${pkgdir}/usr/bin/nosuckshell" ]]; then
    mv "\${pkgdir}/usr/bin/src-tauri" "\${pkgdir}/usr/bin/nosuckshell"
  fi

  # Align .desktop launchers with /usr/bin/nosuckshell.
  shopt -s nullglob
  for f in "\${pkgdir}/usr/share/applications/"*.desktop; do
    sed -i 's/^Exec=.*/Exec=nosuckshell/' "\$f"
  done
}
PKGBUILD

echo "Generated PKGBUILD at ${BUILD_DIR}/PKGBUILD"

# Run makepkg in the build dir. --force overwrites previous artifacts;
# --cleanbuild starts from a clean srcdir. Integrity checks stay on (sha256
# was just computed). Dependency syncing is intentionally NOT requested
# (no -s) — the user already has webkit2gtk/etc. installed (otherwise the
# preceding `npm run tauri:build` would have failed).
(
  cd "${BUILD_DIR}"
  makepkg --force --cleanbuild
)

PKG_FILE="$(ls -1t "${BUILD_DIR}"/${PKGNAME}-${PKGVER}-${PKGREL}-*.pkg.tar.zst 2>/dev/null | head -1 || true)"
if [[ -z "${PKG_FILE}" ]]; then
  echo "makepkg finished but no ${PKGNAME}-*-${PKGVER}-*-*.pkg.tar.zst was produced under ${BUILD_DIR}." >&2
  exit 1
fi
echo "Built: ${PKG_FILE}"

if [[ "${NO_INSTALL:-}" != "1" ]]; then
  echo "Installing via sudo pacman -U (local)…"
  sudo pacman -U --noconfirm "${PKG_FILE}"
else
  echo "Local install skipped (--no-install, NO_INSTALL=1, or --package-only). Install with:"
  echo "  sudo pacman -U \"${PKG_FILE}\""
fi

if [[ "${INSTALL_Z13}" -eq 1 ]]; then
  if [[ -z "${Z13_USER}" ]]; then
    echo "Z13_USER is empty (could not read USER)." >&2
    exit 1
  fi
  echo ""
  echo "Installing on ${Z13_USER}@${Z13_HOST}…"
  remote_pkg="${Z13_DIR%/}/$(basename "${PKG_FILE}")"
  scp "${PKG_FILE}" "${Z13_USER}@${Z13_HOST}:${remote_pkg}"
  ssh "${Z13_USER}@${Z13_HOST}" "sudo pacman -U --noconfirm \"${remote_pkg}\" && rm -f \"${remote_pkg}\""
fi

echo "Done."
if [[ "${NO_INSTALL:-}" != "1" ]]; then
  echo "Launch with: nosuckshell"
fi
if [[ "${INSTALL_Z13}" -eq 1 ]]; then
  echo "Remote: ${Z13_HOST} — installed $(basename "${PKG_FILE}")."
fi
