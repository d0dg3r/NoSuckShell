import { describe, expect, it } from "vitest";
import {
  filePaneNameKind,
  filePaneNameKindClassName,
  filePaneRowHasUnixExecutableBit,
  filePaneRowHasUnixExecutableInDisplay,
} from "./file-pane-name-kind";

function row(p: Partial<{ name: string; isDir: boolean; modeOctal: string; modeDisplay: string }>) {
  return {
    name: "x",
    isDir: false,
    modeOctal: "644",
    modeDisplay: "-rw-r--r--",
    ...p,
  };
}

describe("filePaneRowHasUnixExecutableBit", () => {
  it("detects 755", () => {
    expect(filePaneRowHasUnixExecutableBit("755")).toBe(true);
  });

  it("detects 644 as non-executable", () => {
    expect(filePaneRowHasUnixExecutableBit("644")).toBe(false);
  });

  it("uses low 9 bits for longer modes", () => {
    expect(filePaneRowHasUnixExecutableBit("100755")).toBe(true);
    expect(filePaneRowHasUnixExecutableBit("100644")).toBe(false);
  });

  it("rejects invalid octal", () => {
    expect(filePaneRowHasUnixExecutableBit("")).toBe(false);
    expect(filePaneRowHasUnixExecutableBit("98a")).toBe(false);
  });
});

describe("filePaneRowHasUnixExecutableInDisplay", () => {
  it("reads x in user/group/other slots", () => {
    expect(filePaneRowHasUnixExecutableInDisplay("-rwxr-xr-x")).toBe(true);
    expect(filePaneRowHasUnixExecutableInDisplay("-rw-r--r--")).toBe(false);
    expect(filePaneRowHasUnixExecutableInDisplay("-rwSr--r--")).toBe(false);
  });
});

describe("filePaneNameKind", () => {
  it("folders win before extension", () => {
    expect(filePaneNameKind(row({ name: "archive.zip", isDir: true, modeOctal: "755" }))).toBe("folder");
  });

  it("archive by extension", () => {
    expect(filePaneNameKind(row({ name: "backup.tar.gz", modeOctal: "644" }))).toBe("archive");
    expect(filePaneNameKind(row({ name: "X.ZIP", modeOctal: "644" }))).toBe("archive");
  });

  it("script before executable", () => {
    expect(filePaneNameKind(row({ name: "run.sh", modeOctal: "755" }))).toBe("script");
  });

  it("executable by mode", () => {
    expect(filePaneNameKind(row({ name: "myapp", modeOctal: "755", modeDisplay: "-rwxr-xr-x" }))).toBe("executable");
    expect(filePaneNameKind(row({ name: "myapp", modeOctal: "644" }))).toBe("default");
  });

  it("executable by extension", () => {
    expect(filePaneNameKind(row({ name: "setup.exe", modeOctal: "644" }))).toBe("executable");
  });

  it("classifies media, code, document, data", () => {
    expect(filePaneNameKind(row({ name: "a.png", modeOctal: "644" }))).toBe("media");
    expect(filePaneNameKind(row({ name: "b.ts", modeOctal: "644" }))).toBe("code");
    expect(filePaneNameKind(row({ name: "c.txt", modeOctal: "644" }))).toBe("document");
    expect(filePaneNameKind(row({ name: "d.json", modeOctal: "644" }))).toBe("data");
  });

  it("no extension uses default unless executable", () => {
    expect(filePaneNameKind(row({ name: "Makefile", modeOctal: "644" }))).toBe("default");
  });

  it("falls back to modeDisplay when modeOctal empty", () => {
    expect(
      filePaneNameKind(row({ name: "binary", modeOctal: "", modeDisplay: "-rwxr-xr-x" })),
    ).toBe("executable");
  });
});

describe("filePaneNameKindClassName", () => {
  it("maps kinds to CSS classes", () => {
    expect(filePaneNameKindClassName("folder")).toBe("file-pane-name--folder");
    expect(filePaneNameKindClassName("default")).toBe("file-pane-name--default");
  });
});
