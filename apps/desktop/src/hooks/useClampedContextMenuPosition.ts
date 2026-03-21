import { useLayoutEffect, useRef, useState, type CSSProperties, type DependencyList, type RefObject } from "react";
import { flushSync } from "react-dom";
import { clampContextMenuPosition } from "../features/context-menu-viewport";

/**
 * After layout, measures the menu node and adjusts `left`/`top` (and optional `maxHeight` / `maxWidth`) so the menu stays in the viewport.
 */
export function useClampedContextMenuPosition(
  active: boolean,
  anchorX: number,
  anchorY: number,
  contentDeps: DependencyList,
): { menuRef: RefObject<HTMLDivElement | null>; style: CSSProperties } {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(() => ({ left: anchorX, top: anchorY }));

  useLayoutEffect(
    () => {
      if (!active) {
        return;
      }
      const el = menuRef.current;
      if (!el) {
        return;
      }
      flushSync(() => {
        setStyle({ left: anchorX, top: anchorY });
      });
      const rect = el.getBoundingClientRect();
      const clamped = clampContextMenuPosition({
        anchorX,
        anchorY,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setStyle({
        left: clamped.left,
        top: clamped.top,
        ...(clamped.maxHeight != null ? { maxHeight: clamped.maxHeight } : {}),
        ...(clamped.maxWidth != null ? { maxWidth: clamped.maxWidth } : {}),
        ...(clamped.overflowY != null ? { overflowY: clamped.overflowY } : {}),
        ...(clamped.overflowX != null ? { overflowX: clamped.overflowX } : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentDeps is the caller-supplied tail of this dependency list
    [active, anchorX, anchorY, ...contentDeps],
  );

  return { menuRef, style };
}
