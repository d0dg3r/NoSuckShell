import { DEMO_PLUGIN_ID, FILE_WORKSPACE_PLUGIN_ID } from "./builtin-plugin-ids";

/** Replace with your Ko-fi shop, membership, or donation page URL. */
export const PLUGIN_STORE_DEFAULT_KOFI_URL = "https://ko-fi.com/";

export type PluginStoreCatalogItem = {
  id: string;
  title: string;
  description: string;
  /** Buyer’s license must include every listed entitlement for this add-on to unlock. */
  requiredEntitlements: readonly string[];
  /** Opens in the system browser. Omit for free-only items with no outbound link. */
  purchaseUrl?: string;
  /** No license entitlements required; shown as “Free” in the store. */
  isFree?: boolean;
  /** Built-in plugin id for cross-reference in “Installed plugins”. */
  relatedPluginId?: string;
  /** Shown under the description (e.g. how trials work). */
  trialHint?: string;
};

/**
 * Static catalog (phase 1). Entitlement strings must match what the license server puts in `LicensePayload.entitlements`
 * and what Rust `required_entitlement()` returns for gated plugins.
 */
export const PLUGIN_STORE_CATALOG: readonly PluginStoreCatalogItem[] = [
  {
    id: "demo-plugin",
    title: "Demo plugin",
    description:
      "Sample plugin for testing the pipeline (ping, host-config enrich hook). No license required — enable it under Installed plugins and use Ping demo plugin.",
    requiredEntitlements: [],
    isFree: true,
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
    relatedPluginId: DEMO_PLUGIN_ID,
  },
  {
    id: "file-workspace-addon",
    title: "File workspace (premium)",
    description:
      "Remote and local SFTP-style file panes in the split workspace. Requires a license that includes the entitlement below. After purchase, paste the license token under License in this tab.",
    requiredEntitlements: ["dev.nosuckshell.addon.file-workspace"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
    relatedPluginId: FILE_WORKSPACE_PLUGIN_ID,
    trialHint:
      "Trials use a time-limited token: the license server can set `exp` (Unix seconds). When it expires, the app rejects the license until you activate a new token.",
  },
];

export function catalogItemUnlocked(entitlements: readonly string[], item: PluginStoreCatalogItem): boolean {
  return item.requiredEntitlements.every((e) => entitlements.includes(e));
}

/** User has access: free items always; paid items need every required entitlement present on the license. */
export function storeItemAccessGranted(entitlements: readonly string[], item: PluginStoreCatalogItem): boolean {
  if (item.isFree === true || item.requiredEntitlements.length === 0) {
    return true;
  }
  return catalogItemUnlocked(entitlements, item);
}

export function formatLicenseExpSummary(expSeconds: number | null | undefined): string | null {
  if (expSeconds == null) {
    return null;
  }
  const ms = expSeconds * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
