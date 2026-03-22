export const DND_PAYLOAD_MIME = "application/x-nosuckshell-dnd";

export type DragPayload =
  | { type: "session"; sessionId: string }
  | { type: "machine"; hostAlias: string };

export type PaneDropZone = "left" | "right" | "top" | "bottom" | "center";

/** Must match `.pane-drop-zones` in styles.css (size + grid fr ratios). */
export const PANE_DROP_OVERLAY = {
  widthPx: 190,
  widthMaxPct: 0.88,
  widthCap: 220,
  heightPx: 160,
  heightMaxPct: 0.78,
  heightCap: 190,
  gapPx: 5,
  /** 1fr + 1.2fr + 1fr */
  frSum: 3.2,
} as const;

export const getPaneDropOverlaySize = (paneWidth: number, paneHeight: number): { w: number; h: number } => {
  const w = Math.min(
    PANE_DROP_OVERLAY.widthCap,
    Math.min(PANE_DROP_OVERLAY.widthPx, paneWidth * PANE_DROP_OVERLAY.widthMaxPct),
  );
  const h = Math.min(
    PANE_DROP_OVERLAY.heightCap,
    Math.min(PANE_DROP_OVERLAY.heightPx, paneHeight * PANE_DROP_OVERLAY.heightMaxPct),
  );
  return { w, h };
};

export const resolvePaneDropZoneFromOverlay = (
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): PaneDropZone => {
  const { w, h } = getPaneDropOverlaySize(bounds.width, bounds.height);
  const left = bounds.left + (bounds.width - w) / 2;
  const top = bounds.top + (bounds.height - h) / 2;
  const lx = Math.max(0, Math.min(w, clientX - left));
  const ly = Math.max(0, Math.min(h, clientY - top));

  const { frSum, gapPx } = PANE_DROP_OVERLAY;
  const trackW = w - 2 * gapPx;
  const trackH = h - 2 * gapPx;
  const col0w = (trackW * 1) / frSum;
  const col1w = (trackW * 1.2) / frSum;
  const row0h = (trackH * 1) / frSum;
  const row1h = (trackH * 1.2) / frSum;
  const x1 = col0w;
  const x2 = col0w + gapPx + col1w;
  const y1 = row0h;
  const y2 = row0h + gapPx + row1h;

  const col = lx < x1 ? 0 : lx < x2 ? 1 : 2;
  const row = ly < y1 ? 0 : ly < y2 ? 1 : 2;

  if (row === 1 && col === 1) return "center";
  if (row === 0 && col === 1) return "top";
  if (row === 2 && col === 1) return "bottom";
  if (row === 1 && col === 0) return "left";
  if (row === 1 && col === 2) return "right";

  const midTop = { x: w / 2, y: 0 };
  const midBottom = { x: w / 2, y: h };
  const midLeft = { x: 0, y: h / 2 };
  const midRight = { x: w, y: h / 2 };
  const dist = (ax: number, ay: number) => Math.hypot(lx - ax, ly - ay);

  if (row === 0 && col === 0) {
    return dist(midTop.x, midTop.y) < dist(midLeft.x, midLeft.y) ? "top" : "left";
  }
  if (row === 0 && col === 2) {
    return dist(midTop.x, midTop.y) < dist(midRight.x, midRight.y) ? "top" : "right";
  }
  if (row === 2 && col === 0) {
    return dist(midBottom.x, midBottom.y) < dist(midLeft.x, midLeft.y) ? "bottom" : "left";
  }
  return dist(midBottom.x, midBottom.y) < dist(midRight.x, midRight.y) ? "bottom" : "right";
};
