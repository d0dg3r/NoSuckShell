import { describe, expect, it } from "vitest";
import { getPaneDropOverlaySize, resolvePaneDropZoneFromOverlay } from "./pane-dnd";

describe("pane-dnd", () => {
  it("getPaneDropOverlaySize caps by pane and constants", () => {
    const small = getPaneDropOverlaySize(100, 80);
    expect(small.w).toBeGreaterThan(0);
    expect(small.h).toBeGreaterThan(0);
    const large = getPaneDropOverlaySize(4000, 3000);
    expect(large.w).toBeLessThanOrEqual(220);
    expect(large.h).toBeLessThanOrEqual(190);
  });

  it("resolvePaneDropZoneFromOverlay center", () => {
    const bounds = { left: 0, top: 0, width: 800, height: 600 };
    const { w, h } = getPaneDropOverlaySize(bounds.width, bounds.height);
    const left = bounds.left + (bounds.width - w) / 2;
    const top = bounds.top + (bounds.height - h) / 2;
    const cx = left + w / 2;
    const cy = top + h / 2;
    expect(resolvePaneDropZoneFromOverlay(cx, cy, bounds)).toBe("center");
  });
});
