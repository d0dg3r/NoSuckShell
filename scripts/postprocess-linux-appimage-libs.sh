#!/usr/bin/env bash
# Strip libraries from Tauri-generated AppImages that commonly conflict with host
# binaries (e.g. git-aware `ls` replacements linking system libgit2 + system libpcre2).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BUNDLE_DIRS=()
for CAND in \
  "${ROOT}/target/release/bundle" \
  "${ROOT}/apps/desktop/src-tauri/target/release/bundle"; do
  if [[ -d "${CAND}" ]]; then
    BUNDLE_DIRS+=("${CAND}")
  fi
done

if [[ "${#BUNDLE_DIRS[@]}" -eq 0 ]]; then
  echo "postprocess-linux-appimage-libs: no bundle directory found; skipping."
  exit 0
fi

APPIMAGES=()
for DIR in "${BUNDLE_DIRS[@]}"; do
  while IFS= read -r -d '' F; do
    APPIMAGES+=("${F}")
  done < <(find "${DIR}" -type f \( -name '*.AppImage' -o -name '*.appimage' \) -print0 2>/dev/null || true)
done

if [[ "${#APPIMAGES[@]}" -eq 0 ]]; then
  echo "postprocess-linux-appimage-libs: no AppImage under bundle dirs; skipping."
  exit 0
fi

APPIMAGETOOL_BIN="${APPIMAGETOOL:-}"
if [[ -z "${APPIMAGETOOL_BIN}" ]]; then
  if command -v appimagetool >/dev/null 2>&1; then
    APPIMAGETOOL_BIN="$(command -v appimagetool)"
  fi
fi

if [[ -z "${APPIMAGETOOL_BIN}" ]]; then
  CACHED="${ROOT}/.cache/appimagetool/appimagetool-x86_64.AppImage"
  APPIMAGETOOL_URL="https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  mkdir -p "$(dirname "${CACHED}")"
  if [[ ! -x "${CACHED}" ]]; then
    echo "postprocess-linux-appimage-libs: downloading appimagetool to ${CACHED}"
    curl -fsSL -o "${CACHED}" "${APPIMAGETOOL_URL}"
    chmod +x "${CACHED}"
  fi
  APPIMAGETOOL_BIN="${CACHED}"
fi

export APPIMAGE_EXTRACT_AND_RUN=1

for IMG in "${APPIMAGES[@]}"; do
  echo "postprocess-linux-appimage-libs: patching ${IMG}"
  WORK="$(mktemp -d)"
  cleanup() {
    rm -rf "${WORK}"
  }
  trap cleanup EXIT

  chmod +x "${IMG}"
  cp -a "${IMG}" "${WORK}/input.AppImage"
  chmod +x "${WORK}/input.AppImage"

  (
    cd "${WORK}"
    ./input.AppImage --appimage-extract >/dev/null
  )

  LIBDIR="${WORK}/squashfs-root/usr/lib"
  if [[ -d "${LIBDIR}" ]]; then
    # Host libgit2 on many distros expects the distro libpcre2 symbol versions.
    find "${LIBDIR}" -maxdepth 1 -name 'libpcre2-8.so.0*' -print -delete
  fi

  OUT="${WORK}/patched.AppImage"
  ARCH="$(uname -m)"
  export ARCH
  # -n: do not embed update information (matches typical CI unsigned builds).
  "${APPIMAGETOOL_BIN}" -n "${WORK}/squashfs-root" "${OUT}"

  mv -f "${OUT}" "${IMG}"
  chmod +x "${IMG}"
  trap - EXIT
  cleanup
  echo "postprocess-linux-appimage-libs: done ${IMG}"
done
