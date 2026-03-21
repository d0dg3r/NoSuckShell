#!/usr/bin/env bash
# Capture the focused or titled NoSuckShell window to Flathub / store PNG paths.
# Prerequisites: NoSuckShell running, xdotool, gnome-screenshot (or adjust below).
# Usage:
#   ./scripts/capture-store-screenshots.sh flathub 01-main
#   ./scripts/capture-store-screenshots.sh store-ms-snap 02-split
# Interactive mode (prompts between shots):
#   ./scripts/capture-store-screenshots.sh interactive flathub

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHOTS="$ROOT/docs/media/screenshots"

usage() {
  echo "Usage: $0 <flathub|store-ms-snap> <basename>" >&2
  echo "       $0 interactive <flathub|store-ms-snap>" >&2
  echo "Example: $0 flathub 01-main" >&2
  exit 1
}

find_window() {
  xdotool search --name "NoSuckShell" 2>/dev/null | head -1 || true
}

grab_window() {
  local dest="$1"
  local wid
  wid="$(find_window)"
  if [[ -z "${wid}" ]]; then
    echo "error: no window with title matching 'NoSuckShell' (xdotool). Start the app." >&2
    exit 1
  fi
  xdotool windowactivate --sync "${wid}"
  sleep 0.4
  gnome-screenshot -w -f "${dest}"
  echo "wrote ${dest}"
}

if [[ $# -lt 1 ]]; then
  usage
fi

if [[ "$1" == "interactive" ]]; then
  [[ $# -ge 2 ]] || usage
  target="$2"
  [[ "$target" == "flathub" || "$target" == "store-ms-snap" ]] || usage
  outdir="${SHOTS}/${target}"
  mkdir -p "${outdir}"
  names=(01-main 02-split 03-layout-profiles 04-quick-connect 05-backup 06-organization 07-broadcast)
  for n in "${names[@]}"; do
    read -r -p "Prepare UI for ${n}, then press Enter to capture…"
    grab_window "${outdir}/${n}.png"
  done
  exit 0
fi

[[ $# -eq 2 ]] || usage
target="$1"
base="$2"
[[ "$target" == "flathub" || "$target" == "store-ms-snap" ]] || usage

outdir="${SHOTS}/${target}"
mkdir -p "${outdir}"
grab_window "${outdir}/${base}.png"
