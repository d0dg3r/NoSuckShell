import { describe, expect, it } from "vitest";
import {
  parseFilePaneSemanticNameColors,
  resolveFilePaneSemanticNameColorHex,
} from "./file-pane-semantic-name-colors-prefs";

describe("parseFilePaneSemanticNameColors", () => {
  it("defaults when empty", () => {
    expect(parseFilePaneSemanticNameColors(null)).toEqual({ enabled: true, colors: {} });
  });

  it("parses enabled false", () => {
    expect(parseFilePaneSemanticNameColors(JSON.stringify({ enabled: false, colors: {} }))).toEqual({
      enabled: false,
      colors: {},
    });
  });

  it("accepts valid hex overrides only", () => {
    const r = parseFilePaneSemanticNameColors(
      JSON.stringify({
        enabled: true,
        colors: { folder: "#aabbcc", archive: "not-hex", script: "#GGGGGG" },
      }),
    );
    expect(r.colors).toEqual({ folder: "#aabbcc" });
  });
});

describe("resolveFilePaneSemanticNameColorHex", () => {
  it("falls back to defaults", () => {
    expect(resolveFilePaneSemanticNameColorHex("folder", {})).toMatch(/^#/);
  });
});
