#!/usr/bin/env python3
"""Build 1024² app-icon source: trim alpha, scale to fit whole artwork (no crop)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "img" / "logo_tranparent.png"
OUT = ROOT / "apps" / "desktop" / "src-tauri" / "app-icon-square.png"
SIZE = 1024
BG = (11, 15, 20)  # #0b0f14 — match shell chrome


def main() -> None:
    if not SRC.is_file():
        print(f"Missing {SRC}", file=sys.stderr)
        sys.exit(1)
    im = Image.open(SRC).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    sw, sh = im.size
    # Largest uniform scale that still fits in SIZE×SIZE (nothing clipped).
    scale = min(SIZE / sw, SIZE / sh)
    nw = max(1, int(sw * scale + 0.5))
    nh = max(1, int(sh * scale + 0.5))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    base = Image.new("RGB", (SIZE, SIZE), BG)
    ox = (SIZE - nw) // 2
    oy = (SIZE - nh) // 2
    base.paste(im, (ox, oy), im.getchannel("A"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    base.save(OUT, format="PNG")
    print(f"Wrote {OUT.relative_to(ROOT)} (contain {nw}×{nh} in {SIZE}²)")


if __name__ == "__main__":
    main()
