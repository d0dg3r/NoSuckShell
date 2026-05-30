#!/usr/bin/env bash
# Build a single-file Flatpak bundle from the Tauri Linux .deb (local / developer use).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLATPAK_DIR="${ROOT}/flatpak"
STAGE="${FLATPAK_DIR}/stage"
MANIFEST="${FLATPAK_DIR}/dev.nosuckshell.desktop.yml"
BUILD_DIR="${FLATPAK_DIR}/build-dir"
REPO="${FLATPAK_DIR}/repo-local"
BUNDLE_OUT="${FLATPAK_DIR}/NoSuckShell-local.flatpak"

if ! command -v flatpak-builder >/dev/null 2>&1; then
  echo "flatpak-builder not found. On Arch/CachyOS: sudo pacman -S flatpak flatpak-builder" >&2
  exit 1
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb not found (needed to unpack the .deb). On Arch/CachyOS: sudo pacman -S dpkg" >&2
  exit 1
fi

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
    echo "NO_BUILD=1 but no .deb found under target/release/bundle/deb or apps/desktop/src-tauri/target/release/bundle/deb" >&2
    exit 1
  fi
  echo "Using existing deb (NO_BUILD=1): ${DEB}"
else
  echo "Running npm run tauri:build -- --bundles deb (only the .deb is needed; skips AppImage)…"
  (cd "${ROOT}/apps/desktop" && npm run tauri:build -- --bundles deb)
  DEB="$(find_deb || true)"
  if [[ -z "${DEB}" ]]; then
    echo "No .deb found after build. Expected under target/release/bundle/deb (workspace) or apps/desktop/src-tauri/target/release/bundle/deb." >&2
    exit 1
  fi
  echo "Using deb: ${DEB}"
fi

rm -rf "${STAGE}" "${BUILD_DIR}" "${REPO}"
mkdir -p "${STAGE}"

dpkg-deb -x "${DEB}" "${STAGE}"

if [[ ! -d "${STAGE}/usr/bin" ]]; then
  echo "Stage missing usr/bin after dpkg-deb -x" >&2
  exit 1
fi

rm -f "${BUNDLE_OUT}"

flatpak-builder \
  --force-clean \
  --repo="${REPO}" \
  "${BUILD_DIR}" \
  "${MANIFEST}"

flatpak build-bundle "${REPO}" "${BUNDLE_OUT}" dev.nosuckshell.desktop

echo "Built: ${BUNDLE_OUT}"
echo "Install: flatpak --user install -y --bundle ${BUNDLE_OUT}"

if [[ -n "${COPY_TO:-}" ]]; then
  mkdir -p "${COPY_TO}"
  cp -f "${BUNDLE_OUT}" "${COPY_TO}/"
  echo "Copied bundle to ${COPY_TO}/$(basename "${BUNDLE_OUT}")"
fi
