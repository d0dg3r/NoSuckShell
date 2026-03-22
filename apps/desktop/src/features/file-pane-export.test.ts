import { describe, expect, it } from "vitest";
import { exportNeedsArchive } from "./file-pane-export";

describe("exportNeedsArchive", () => {
  it("returns false for a single file", () => {
    expect(exportNeedsArchive(["a"], [{ name: "a", isDir: false }])).toBe(false);
  });

  it("returns true for a single directory", () => {
    expect(exportNeedsArchive(["d"], [{ name: "d", isDir: true }])).toBe(true);
  });

  it("returns true for multiple names", () => {
    expect(
      exportNeedsArchive(
        ["a", "b"],
        [
          { name: "a", isDir: false },
          { name: "b", isDir: false },
        ],
      ),
    ).toBe(true);
  });
});
