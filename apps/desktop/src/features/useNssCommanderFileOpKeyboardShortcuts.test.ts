import { describe, expect, it } from "vitest";
import { nssCommanderKeyboardShortcutTargetBlocksShortcuts } from "./useNssCommanderFileOpKeyboardShortcuts";

describe("nssCommanderKeyboardShortcutTargetBlocksShortcuts", () => {
  it("blocks terminal host targets", () => {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-nosuckshell-terminal-host", "true");
    const inner = document.createElement("span");
    wrap.appendChild(inner);
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(inner)).toBe(true);
  });

  it("blocks form fields", () => {
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(document.createElement("input"))).toBe(true);
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(document.createElement("textarea"))).toBe(true);
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(document.createElement("select"))).toBe(true);
  });

  it("allows file-pane and plain div targets", () => {
    const pane = document.createElement("div");
    pane.className = "file-pane";
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(pane)).toBe(false);
    expect(nssCommanderKeyboardShortcutTargetBlocksShortcuts(document.createElement("div"))).toBe(false);
  });
});
