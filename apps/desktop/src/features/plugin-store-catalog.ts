import { NSS_COMMANDER_PLUGIN_ID, PROXMUX_PLUGIN_ID } from "./builtin-plugin-ids";

/** Replace with your Ko-fi shop, membership, or donation page URL. */
export const PLUGIN_STORE_DEFAULT_KOFI_URL = "https://ko-fi.com/";

export type PluginStoreCatalogItem = {
  id: string;
  title: string;
  description: string;
  /** Public URL path (Vite `public/`), e.g. `/plugin-store/bitwarden.svg`. */
  logoSrc?: string;
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
    id: "file-workspace-addon",
    title: "NSS-Commander",
    logoSrc: "/plugin-store/nss-commander.svg",
    description:
      "NSS-Commander: remote and local SFTP-style file panes in the split workspace. In official builds, unlock with a signed token (small add-on purchase) that includes the entitlement below; source remains MIT. After purchase, paste the license token under License in this tab.",
    requiredEntitlements: ["dev.nosuckshell.addon.file-workspace"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
    relatedPluginId: NSS_COMMANDER_PLUGIN_ID,
    trialHint:
      "Trials use a time-limited token: the license server can set `exp` (Unix seconds). When it expires, the app rejects the license until you activate a new token.",
  },
  {
    id: "bitwarden-integration",
    title: "Bitwarden",
    logoSrc: "/plugin-store/bitwarden.svg",
    description:
      "Planned secret backend: fetch SSH keys, API tokens, or other credentials from Bitwarden (CLI/API) into the shell workflow without duplicating vaults in plain files.",
    requiredEntitlements: ["dev.nosuckshell.addon.bitwarden"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "github-sync",
    title: "GitHub sync",
    logoSrc: "/plugin-store/github.svg",
    description:
      "Planned sync of SSH config fragments, known_hosts, or workspace snippets from a GitHub repository so multiple machines stay aligned.",
    requiredEntitlements: ["dev.nosuckshell.addon.github-sync"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "gitlab-sync",
    title: "GitLab sync",
    logoSrc: "/plugin-store/gitlab.svg",
    description:
      "Planned sync from GitLab projects or snippets — version-controlled shell/SSH assets pulled into the app.",
    requiredEntitlements: ["dev.nosuckshell.addon.gitlab-sync"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "gitea-sync",
    title: "Gitea sync",
    logoSrc: "/plugin-store/gitea.svg",
    description:
      "Planned sync for self-hosted Gitea: SSH-related config and assets from your instance.",
    requiredEntitlements: ["dev.nosuckshell.addon.gitea-sync"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "hashicorp-vault-integration",
    title: "HashiCorp Vault",
    logoSrc: "/plugin-store/vault.svg",
    description:
      "Planned integration to read secrets from Vault (e.g. KV) with token/AppRole-style auth for sessions and automation.",
    requiredEntitlements: ["dev.nosuckshell.addon.hashicorp-vault"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "proxmox-integration",
    title: "Proxmox",
    logoSrc: "/plugin-store/proxmox.svg",
    description:
      "PROXMUX: Proxmox VE API inventory (nodes, VMs, LXCs) in Settings. SSH shortcuts may follow in a later release.",
    requiredEntitlements: ["dev.nosuckshell.addon.proxmox"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
    relatedPluginId: PROXMUX_PLUGIN_ID,
  },
  {
    id: "aws-integration",
    title: "Amazon Web Services (AWS)",
    logoSrc: "/plugin-store/aws.svg",
    description:
      "Planned Proxmux-style discovery for AWS: list EC2 (and related resources where useful), power or lifecycle actions where the API allows, and connect via SSH or provider flows (for example SSM Session Manager). Not shipped yet.",
    requiredEntitlements: ["dev.nosuckshell.addon.aws"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "azure-integration",
    title: "Microsoft Azure",
    logoSrc: "/plugin-store/azure.svg",
    description:
      "Planned Proxmux-style discovery for Azure: list VMs and related resources, actions where the API allows, and connect via SSH or Azure-specific consoles. Not shipped yet.",
    requiredEntitlements: ["dev.nosuckshell.addon.azure"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "hetzner-integration",
    title: "Hetzner Cloud",
    logoSrc: "/plugin-store/hetzner.svg",
    description:
      "Planned Proxmux-style discovery for Hetzner Cloud: list servers, power actions where the API allows, and connect via SSH. Not shipped yet.",
    requiredEntitlements: ["dev.nosuckshell.addon.hetzner"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "gcp-integration",
    title: "Google Cloud Platform (GCP)",
    logoSrc: "/plugin-store/gcp.svg",
    description:
      "Planned Proxmux-style discovery for GCP: list Compute Engine VMs (and related resources where useful), actions where the API allows, and connect via SSH or IAP-style flows where applicable. Not shipped yet.",
    requiredEntitlements: ["dev.nosuckshell.addon.gcp"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
  },
  {
    id: "digitalocean-integration",
    title: "DigitalOcean",
    logoSrc: "/plugin-store/digitalocean.svg",
    description:
      "Planned Proxmux-style discovery for DigitalOcean Droplets and related resources: list instances, power actions where the API allows, and connect via SSH. Not shipped yet.",
    requiredEntitlements: ["dev.nosuckshell.addon.digitalocean"],
    purchaseUrl: PLUGIN_STORE_DEFAULT_KOFI_URL,
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
