import { describe, expect, it } from "vitest";
import { TerminalScrollbackBuffer, MAX_TERMINAL_SCROLLBACK_CHARS } from "./terminal-scrollback-buffer";

describe("TerminalScrollbackBuffer", () => {
  it("appends and joins chunks", () => {
    const buffer = new TerminalScrollbackBuffer();
    buffer.append("hello");
    buffer.append(" world");
    expect(buffer.toString()).toBe("hello world");
  });

  it("trims oldest content when exceeding max chars", () => {
    const buffer = new TerminalScrollbackBuffer();
    const chunk = "a".repeat(100);
    const repeats = Math.ceil(MAX_TERMINAL_SCROLLBACK_CHARS / 100) + 2;
    for (let i = 0; i < repeats; i += 1) {
      buffer.append(chunk);
    }
    expect(buffer.toString().length).toBeLessThanOrEqual(MAX_TERMINAL_SCROLLBACK_CHARS);
  });
});
