import { describe, expect, it } from "vitest";
import { filePaneEntryKindLabel } from "./file-pane-entry-kind";

describe("filePaneEntryKindLabel", () => {
  it("maps Unix mode prefix to kind", () => {
    expect(filePaneEntryKindLabel({ isDir: true, modeDisplay: "drwxr-xr-x" })).toBe("Folder");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "-rw-r--r--" })).toBe("File");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "lrwxrwxrwx" })).toBe("Symlink");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "brw-rw----" })).toBe("Block device");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "crw-rw-rw-" })).toBe("Character device");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "prw-r--r--" })).toBe("Pipe");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "srw-rw-rw-" })).toBe("Socket");
  });

  it("falls back when mode string is missing", () => {
    expect(filePaneEntryKindLabel({ isDir: true, modeDisplay: "" })).toBe("Folder");
    expect(filePaneEntryKindLabel({ isDir: false, modeDisplay: "" })).toBe("File");
  });
});
