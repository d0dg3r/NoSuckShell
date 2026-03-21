#!/usr/bin/env python3
"""Resize/crop repo logos to NSIS/WiX BMP dimensions (RGB, no alpha)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
IMG = ROOT / "img"
OUT = ROOT / "apps" / "desktop" / "src-tauri" / "windows"
BG = (11, 15, 20)  # #0b0f14


def cover_rgb(src: Path, w: int, h: int) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    nw, nh = max(1, int(sw * scale + 0.5)), max(1, int(sh * scale + 0.5))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    im = im.crop((left, top, left + w, top + h))
    base = Image.new("RGB", (w, h), BG)
    base.paste(im, (0, 0), im.getchannel("A"))
    return base


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    terminal = IMG / "logo_terminal.png"
    transparent = IMG / "logo_tranparent.png"
    if not terminal.is_file() or not transparent.is_file():
        print("Missing logo PNGs under img/", file=sys.stderr)
        sys.exit(1)

    jobs = [
        (terminal, OUT / "nsis-header.bmp", 150, 57),
        (transparent, OUT / "nsis-sidebar.bmp", 164, 314),
        (terminal, OUT / "wix-banner.bmp", 493, 58),
        (terminal, OUT / "wix-dialog.bmp", 493, 312),
    ]
    for src, dest, w, h in jobs:
        cover_rgb(src, w, h).save(dest, format="BMP")
        print(f"Wrote {dest.relative_to(ROOT)} ({w}x{h})")


if __name__ == "__main__":
    main()
