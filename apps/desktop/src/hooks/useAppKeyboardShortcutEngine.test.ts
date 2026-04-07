import { describe, expect, it } from "vitest";
import { keyboardEngineShouldConsumeResolvedCommand } from "./useAppKeyboardShortcutEngine";

describe("keyboardEngineShouldConsumeResolvedCommand", () => {
  it("defers nssCommanderCopy when NSS-Commander shortcuts own the chord", () => {
    expect(
      keyboardEngineShouldConsumeResolvedCommand("nssCommanderCopy", { nssCommanderDeferChordShortcuts: true }),
    ).toBe(false);
    expect(
      keyboardEngineShouldConsumeResolvedCommand("nssCommanderCopy", { nssCommanderDeferChordShortcuts: false }),
    ).toBe(true);
  });

  it("never consumes nssCommanderSwitchPane in the global engine (NSS or default Tab)", () => {
    expect(
      keyboardEngineShouldConsumeResolvedCommand("nssCommanderSwitchPane", { nssCommanderDeferChordShortcuts: true }),
    ).toBe(false);
    expect(
      keyboardEngineShouldConsumeResolvedCommand("nssCommanderSwitchPane", { nssCommanderDeferChordShortcuts: false }),
    ).toBe(false);
  });

  it("consumes other commands regardless of NSS defer flag", () => {
    expect(
      keyboardEngineShouldConsumeResolvedCommand("openQuickConnect", { nssCommanderDeferChordShortcuts: true }),
    ).toBe(true);
  });
});
