import { describe, expect, it } from "vitest";
import { clampContextMenuPosition, CONTEXT_MENU_VIEWPORT_MARGIN } from "./context-menu-viewport";

describe("clampContextMenuPosition", () => {
  const m = CONTEXT_MENU_VIEWPORT_MARGIN;

  it("keeps default position when menu fits below anchor", () => {
    const r = clampContextMenuPosition({
      anchorX: 10,
      anchorY: 10,
      menuWidth: 200,
      menuHeight: 100,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(r.left).toBe(10);
    expect(r.top).toBe(10);
    expect(r.maxHeight).toBeUndefined();
  });

  it("flips upward when bottom would overflow", () => {
    const r = clampContextMenuPosition({
      anchorX: 10,
      anchorY: 580,
      menuWidth: 200,
      menuHeight: 100,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(r.top).toBe(580 - 100);
    expect(r.left).toBe(10);
  });

  it("shifts left when right edge would overflow", () => {
    const r = clampContextMenuPosition({
      anchorX: 780,
      anchorY: 10,
      menuWidth: 200,
      menuHeight: 80,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(r.left).toBe(800 - m - 200);
  });

  it("applies maxHeight when menu is taller than viewport margin box", () => {
    const r = clampContextMenuPosition({
      anchorX: m,
      anchorY: m,
      menuWidth: 100,
      menuHeight: 900,
      viewportWidth: 400,
      viewportHeight: 500,
    });
    expect(r.maxHeight).toBe(500 - 2 * m);
    expect(r.overflowY).toBe("auto");
    expect(r.top).toBeGreaterThanOrEqual(m);
    expect(r.top + (r.maxHeight ?? 0)).toBeLessThanOrEqual(500 - m);
  });
});
