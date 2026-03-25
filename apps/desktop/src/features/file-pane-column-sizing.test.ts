import { describe, expect, it } from "vitest";
import { FILE_PANE_RESIZABLE_HEADERS, resolveOptimalResizableWidths } from "./file-pane-column-sizing";

describe("file-pane-column-sizing", () => {
  it("uses English headers for the resizable file browser columns", () => {
    expect(FILE_PANE_RESIZABLE_HEADERS).toEqual(["Name", "Permissions", "Size"]);
  });

  it("restores content-based optimal widths when the pane grows again", () => {
    expect(
      resolveOptimalResizableWidths({
        tableWidth: 1455,
        fixedExtra: 141,
        minTailRestPx: 300,
        measured: { name: 590, perm: 112, size: 97 },
      }),
    ).toEqual({ name: 590, perm: 112, size: 97 });
  });
});
