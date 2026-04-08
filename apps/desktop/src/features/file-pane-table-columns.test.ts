import { describe, expect, it } from "vitest";
import {
  FILE_PANE_DEFAULT_VISIBILITY,
  filePaneNextSortState,
  filePaneSortRows,
  filePaneVisibleDataColumns,
  filePaneVisibleResizableKeysFromDisplayOrder,
  normalizeFilePaneColumnOrder,
  type FilePaneDirRow,
  type FilePaneSortState,
} from "./file-pane-table-columns";

function row(partial: Partial<FilePaneDirRow> & Pick<FilePaneDirRow, "name" | "isDir">): FilePaneDirRow {
  return {
    size: 0,
    mtime: null,
    modeDisplay: "",
    modeOctal: "",
    userDisplay: "",
    groupDisplay: "",
    ...partial,
    sortWithDirectories: partial.sortWithDirectories ?? partial.isDir,
  };
}

describe("filePaneSortRows", () => {
  it("lists directories before files regardless of sort column", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "a.txt", isDir: false, size: 1 }),
      row({ name: "z_dir", isDir: true }),
    ];
    const sort: FilePaneSortState = { column: "name", direction: "asc" };
    const out = filePaneSortRows(rows, sort);
    expect(out.map((r) => r.name)).toEqual(["z_dir", "a.txt"]);
  });

  it("sorts by name ascending among same kind", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "b", isDir: false }),
      row({ name: "a", isDir: false }),
    ];
    const out = filePaneSortRows(rows, { column: "name", direction: "asc" });
    expect(out.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("sorts by size descending with stable name tie-break", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "small", isDir: false, size: 10 }),
      row({ name: "big", isDir: false, size: 100 }),
      row({ name: "mid", isDir: false, size: 50 }),
    ];
    const out = filePaneSortRows(rows, { column: "size", direction: "desc" });
    expect(out.map((r) => r.name)).toEqual(["big", "mid", "small"]);
  });

  it("treats directory size as zero for size sort", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "huge", isDir: false, size: 999 }),
      row({ name: "dir", isDir: true, size: 1 }),
    ];
    const out = filePaneSortRows(rows, { column: "size", direction: "asc" });
    expect(out[0]!.isDir).toBe(true);
    expect(out[1]!.name).toBe("huge");
  });

  it("sorts by kind label among files", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "lnk", isDir: false, modeDisplay: "lrwxrwxrwx" }),
      row({ name: "txt", isDir: false, modeDisplay: "-rw-r--r--" }),
    ];
    const out = filePaneSortRows(rows, { column: "kind", direction: "asc" });
    expect(out.map((r) => r.name)).toEqual(["txt", "lnk"]);
  });

  it("groups symlink-to-directory with directories when sortWithDirectories is true", () => {
    const rows: FilePaneDirRow[] = [
      row({ name: "a.txt", isDir: false, sortWithDirectories: false }),
      row({ name: "zebra_link", isDir: false, sortWithDirectories: true, modeDisplay: "lrwxrwxrwx" }),
      row({ name: "realdir", isDir: true, sortWithDirectories: true }),
    ];
    const out = filePaneSortRows(rows, { column: "name", direction: "asc" });
    expect(out.map((r) => r.name)).toEqual(["realdir", "zebra_link", "a.txt"]);
  });
});

describe("filePaneNextSortState", () => {
  it("starts ascending when switching columns", () => {
    const next = filePaneNextSortState({ column: "name", direction: "desc" }, "size");
    expect(next).toEqual({ column: "size", direction: "asc" });
  });

  it("toggles direction when clicking the same column", () => {
    const next = filePaneNextSortState({ column: "name", direction: "asc" }, "name");
    expect(next).toEqual({ column: "name", direction: "desc" });
  });
});

describe("normalizeFilePaneColumnOrder", () => {
  it("dedupes and appends missing columns", () => {
    const out = normalizeFilePaneColumnOrder(["name", "size", "name", "group"]);
    expect(out).toContain("name");
    expect(out).toContain("size");
    expect(out.indexOf("name")).toBeLessThan(out.indexOf("size"));
    expect(out.length).toBe(8);
  });
});

describe("filePaneVisibleDataColumns with column order", () => {
  it("follows custom order and visibility", () => {
    const vis = { ...FILE_PANE_DEFAULT_VISIBILITY, permissions: true };
    const order = normalizeFilePaneColumnOrder(["modified", "name", "size", "permissions"]);
    const cols = filePaneVisibleDataColumns(vis, order);
    expect(cols[0]).toBe("modified");
    expect(cols[1]).toBe("name");
  });
});

describe("filePaneVisibleResizableKeysFromDisplayOrder", () => {
  it("matches left-to-right visible resizable columns", () => {
    const keys = filePaneVisibleResizableKeysFromDisplayOrder(["name", "octal", "size", "modified"]);
    expect(keys).toEqual(["name", "size"]);
  });
});
