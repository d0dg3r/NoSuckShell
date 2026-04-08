import { describe, expect, it } from "vitest";
import { formatFilePaneModifiedTime } from "./file-pane-modified-time";

describe("formatFilePaneModifiedTime", () => {
  it("returns em dash for missing time", () => {
    expect(formatFilePaneModifiedTime(null)).toBe("—");
    expect(formatFilePaneModifiedTime(undefined)).toBe("—");
    expect(formatFilePaneModifiedTime(0)).toBe("—");
  });

  it("formats as en-US short date and 12-hour clock without seconds", () => {
    const s = formatFilePaneModifiedTime(1_717_234_320);
    expect(s).not.toContain("—");
    expect(s).toMatch(/\d{1,2}\/\d{1,2}\/\d{2} \d{1,2}:\d{2} (AM|PM)/);
    expect(s).not.toMatch(/:\d{2}:\d{2}/);
  });
});
