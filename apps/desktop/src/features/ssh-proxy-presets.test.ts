import { describe, expect, it } from "vitest";
import {
  PROXY_COMMAND_PRESET_CUSTOM,
  PROXY_COMMAND_PRESETS,
  proxyCommandFromPresetSelect,
  proxyCommandPresetSelectValue,
} from "./ssh-proxy-presets";

describe("ssh-proxy-presets", () => {
  it("proxyCommandPresetSelectValue matches preset template", () => {
    const v = PROXY_COMMAND_PRESETS[0]!.value;
    expect(proxyCommandPresetSelectValue(v)).toBe(PROXY_COMMAND_PRESETS[0]!.id);
    expect(proxyCommandPresetSelectValue("custom thing")).toBe(PROXY_COMMAND_PRESET_CUSTOM);
  });

  it("proxyCommandFromPresetSelect fills from preset id", () => {
    const id = PROXY_COMMAND_PRESETS[0]!.id;
    expect(proxyCommandFromPresetSelect(id, "")).toBe(PROXY_COMMAND_PRESETS[0]!.value);
    expect(proxyCommandFromPresetSelect(PROXY_COMMAND_PRESET_CUSTOM, "keep")).toBe("keep");
  });
});
