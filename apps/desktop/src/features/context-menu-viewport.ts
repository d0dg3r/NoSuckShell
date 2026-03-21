export const CONTEXT_MENU_VIEWPORT_MARGIN = 8;

export type ClampedContextMenuStyle = {
  left: number;
  top: number;
  maxHeight?: number;
  maxWidth?: number;
  overflowY?: "auto";
  overflowX?: "auto";
};

/**
 * Keeps a fixed-position context menu inside the viewport. Opens upward when there is not enough space below the anchor.
 */
export function clampContextMenuPosition(args: {
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}): ClampedContextMenuStyle {
  const margin = args.margin ?? CONTEXT_MENU_VIEWPORT_MARGIN;
  const { anchorX, anchorY, viewportWidth: vw, viewportHeight: vh } = args;
  let menuWidth = args.menuWidth;
  let menuHeight = args.menuHeight;

  const maxH = Math.max(0, vh - 2 * margin);
  const maxW = Math.max(0, vw - 2 * margin);

  const out: ClampedContextMenuStyle = { left: anchorX, top: anchorY };

  if (menuHeight > maxH) {
    out.maxHeight = maxH;
    out.overflowY = "auto";
    menuHeight = maxH;
  }
  if (menuWidth > maxW) {
    out.maxWidth = maxW;
    out.overflowX = "auto";
    menuWidth = maxW;
  }

  let top = anchorY;
  if (top + menuHeight > vh - margin) {
    top = anchorY - menuHeight;
  }
  top = Math.min(Math.max(top, margin), vh - menuHeight - margin);

  let left = anchorX;
  if (left + menuWidth > vw - margin) {
    left = vw - menuWidth - margin;
  }
  left = Math.min(Math.max(left, margin), vw - menuWidth - margin);

  out.left = left;
  out.top = top;
  return out;
}
