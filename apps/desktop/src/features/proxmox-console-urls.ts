/** Normalize Proxmox UI base URL (matches Rust `normalize_base_url`). */
export function normalizeProxmoxBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export type ProxmoxConsoleTarget =
  | { kind: "node"; node: string }
  | { kind: "qemu"; node: string; vmid: string }
  | { kind: "lxc"; node: string; vmid: string };

/**
 * Build a Proxmox web UI console URL (same query shapes as PROXMUX-Manager `getConsoleUrl`).
 */
export function buildProxmoxConsoleUrl(baseUrl: string, target: ProxmoxConsoleTarget): string {
  const base = normalizeProxmoxBaseUrl(baseUrl);
  if (!base) {
    throw new Error("Proxmox base URL is empty.");
  }
  const node = encodeURIComponent(target.node);
  if (target.kind === "node") {
    return `${base}/?console=shell&xtermjs=1&node=${node}`;
  }
  const vmid = encodeURIComponent(target.vmid);
  if (target.kind === "qemu") {
    return `${base}/?console=kvm&novnc=1&vmid=${vmid}&node=${node}`;
  }
  return `${base}/?console=lxc&xtermjs=1&vmid=${vmid}&node=${node}`;
}

/** Proxmox GUI deep links include `console=`; they require a web UI session (login) first. */
export function isProxmoxConsoleDeepLinkUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.searchParams.has("console");
  } catch {
    return false;
  }
}

/**
 * Root web UI URL for the same origin as a console or base URL (shows the login / dashboard).
 * Use before navigating to `buildProxmoxConsoleUrl` targets to avoid 401 "No ticket".
 */
export function proxmoxWebUiEntryUrlFromConsoleOrBaseUrl(url: string): string {
  const u = new URL(url.trim());
  return `${u.origin}/`;
}
