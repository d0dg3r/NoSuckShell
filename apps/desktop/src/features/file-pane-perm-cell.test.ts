import { describe, expect, it } from "vitest";
import { FILE_PANE_PERM_OCTAL_BELOW_PX, filePanePermCell } from "./file-pane-perm-cell";

describe("filePanePermCell", () => {
  const row = { modeDisplay: "drwxr-xr-x", modeOctal: "755" };

  it("uses rwx when column is wide enough", () => {
    const w = FILE_PANE_PERM_OCTAL_BELOW_PX + 20;
    expect(filePanePermCell(w, row)).toEqual({ text: "drwxr-xr-x", title: "drwxr-xr-x" });
  });

  it("uses octal when column is narrow", () => {
    const w = FILE_PANE_PERM_OCTAL_BELOW_PX - 1;
    expect(filePanePermCell(w, row)).toEqual({ text: "755", title: "drwxr-xr-x" });
  });
});
