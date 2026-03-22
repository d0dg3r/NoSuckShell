import { describe, expect, it } from "vitest";
import {
  PLUGIN_STORE_CATALOG,
  catalogItemUnlocked,
  formatLicenseExpSummary,
  storeItemAccessGranted,
} from "./plugin-store-catalog";

describe("plugin-store-catalog", () => {
  it("catalogItemUnlocked requires all entitlements", () => {
    const item = PLUGIN_STORE_CATALOG.find((i) => i.id === "file-workspace-addon")!;
    expect(catalogItemUnlocked([], item)).toBe(false);
    expect(catalogItemUnlocked(["dev.nosuckshell.addon.file-workspace"], item)).toBe(true);
    expect(catalogItemUnlocked(["other"], item)).toBe(false);
  });

  it("storeItemAccessGranted treats free catalog items as always granted", () => {
    const demo = PLUGIN_STORE_CATALOG.find((i) => i.id === "demo-plugin")!;
    expect(storeItemAccessGranted([], demo)).toBe(true);
  });

  it("formatLicenseExpSummary", () => {
    expect(formatLicenseExpSummary(null)).toBeNull();
    const s = formatLicenseExpSummary(1_700_000_000);
    expect(s).toBeTruthy();
    expect(s!.length).toBeGreaterThan(6);
  });
});
