import { describe, expect, it } from "vitest";
import { PROXMUX_PLUGIN_ID } from "./builtin-plugin-ids";
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

  it("storeItemAccessGranted treats manually defined free items as always granted", () => {
    expect(
      storeItemAccessGranted([], {
        id: "free-item",
        title: "Free item",
        description: "free",
        requiredEntitlements: [],
        isFree: true,
      }),
    ).toBe(true);
  });

  it("formatLicenseExpSummary", () => {
    expect(formatLicenseExpSummary(null)).toBeNull();
    const s = formatLicenseExpSummary(1_700_000_000);
    expect(s).toBeTruthy();
    expect(s!.length).toBeGreaterThan(6);
  });

  it("proxmox store item references built-in PROXMUX plugin id", () => {
    const item = PLUGIN_STORE_CATALOG.find((i) => i.id === "proxmox-integration")!;
    expect(item.relatedPluginId).toBe(PROXMUX_PLUGIN_ID);
  });

  it("planned paid integrations require entitlements and are not free", () => {
    const ids = [
      "bitwarden-integration",
      "github-sync",
      "gitlab-sync",
      "gitea-sync",
      "hashicorp-vault-integration",
      "proxmox-integration",
      "aws-integration",
      "azure-integration",
      "hetzner-integration",
      "gcp-integration",
      "digitalocean-integration",
    ];
    for (const id of ids) {
      const item = PLUGIN_STORE_CATALOG.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      expect(item!.requiredEntitlements.length).toBeGreaterThan(0);
      expect(item!.isFree).not.toBe(true);
      expect(item!.logoSrc).toMatch(/^\/plugin-store\/.+\.svg$/);
      expect(catalogItemUnlocked([], item!)).toBe(false);
    }
  });
});
