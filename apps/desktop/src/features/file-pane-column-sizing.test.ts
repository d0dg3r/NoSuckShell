import { describe, expect, it } from "vitest";
import { FILE_PANE_RESIZABLE_HEADERS, resolveOptimalResizableWidths } from "./file-pane-column-sizing";

describe("file-pane-column-sizing", () => {
  it("uses English headers for the resizable file browser columns", () => {
    expect(FILE_PANE_RESIZABLE_HEADERS).toEqual(["Name", "Permissions", "User", "Group", "Size"]);
  });

  it("restores content-based optimal widths when the pane grows again", () => {
    const result = resolveOptimalResizableWidths({
      tableWidth: 1455,
      fixedExtra: 0,
      minTailRestPx: 140,
      measured: { name: 590, perm: 112, user: 88, group: 88, size: 97 },
      headerMins: { name: 60, perm: 100, user: 56, group: 64, size: 56 },
    });
    expect(result.name).toBeGreaterThanOrEqual(590);
    expect(result.perm).toBeGreaterThanOrEqual(100);
    expect(result.user).toBeGreaterThanOrEqual(56);
    expect(result.group).toBeGreaterThanOrEqual(64);
    expect(result.size).toBeGreaterThanOrEqual(56);
  });

  it("every column is at least as wide as its header even when space is tight", () => {
    const headerMins = { name: 60, perm: 100, user: 56, group: 64, size: 56 };
    const result = resolveOptimalResizableWidths({
      tableWidth: 600,
      fixedExtra: 0,
      minTailRestPx: 140,
      measured: { name: 300, perm: 112, user: 70, group: 70, size: 80 },
      headerMins,
    });
    expect(result.name).toBeGreaterThanOrEqual(headerMins.name);
    expect(result.perm).toBeGreaterThanOrEqual(headerMins.perm);
    expect(result.user).toBeGreaterThanOrEqual(headerMins.user);
    expect(result.group).toBeGreaterThanOrEqual(headerMins.group);
    expect(result.size).toBeGreaterThanOrEqual(headerMins.size);
  });

  it("is deterministic: same inputs produce same outputs", () => {
    const args = {
      tableWidth: 900,
      fixedExtra: 0,
      minTailRestPx: 140,
      measured: { name: 200, perm: 100, user: 60, group: 60, size: 80 },
      headerMins: { name: 60, perm: 100, user: 56, group: 64, size: 56 },
    } as const;
    const a = resolveOptimalResizableWidths(args);
    const b = resolveOptimalResizableWidths(args);
    expect(a).toEqual(b);
  });
});
