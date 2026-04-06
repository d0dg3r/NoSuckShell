import { describe, expect, it } from "vitest";
import { sanitizeTerminalPaste } from "./terminal-paste-sanitize";

describe("sanitizeTerminalPaste", () => {
  it("keeps newlines and tabs", () => {
    expect(sanitizeTerminalPaste("a\nb\tc")).toBe("a\nb\tc");
  });

  it("strips NUL and C0 controls", () => {
    expect(sanitizeTerminalPaste("a\u0000b\u0001c")).toBe("abc");
  });

  it("returns empty when replacement chars present", () => {
    expect(sanitizeTerminalPaste("a\uFFFDb")).toBe("");
  });
});
