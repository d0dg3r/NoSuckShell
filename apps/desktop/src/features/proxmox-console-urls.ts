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
