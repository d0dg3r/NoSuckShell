import { normalizeProxmoxBaseUrl } from "./proxmox-console-urls";

export type ProxmoxConsoleTicketFields = {
  port: number | string;
  ticket: string;
};

function pickPortAndTicket(data: Record<string, unknown>): ProxmoxConsoleTicketFields | null {
  const portRaw = data.port;
  const ticketRaw = data.ticket;
  const port =
    typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "string" && portRaw.trim().length > 0
        ? portRaw.trim()
        : null;
  const ticket = typeof ticketRaw === "string" ? ticketRaw : null;
  if (port == null || ticket == null) {
    return null;
  }
  return { port, ticket };
}

/** Parse PROXMUX `fetchQemuVncProxy` / `fetchLxcTermProxy` `data` object. */
export function parseProxmoxConsoleProxyData(data: unknown): ProxmoxConsoleTicketFields | null {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return pickPortAndTicket(data as Record<string, unknown>);
}

export type ProxmoxConsoleWsGuest = "qemu" | "lxc";

/**
 * Build the Proxmox API WebSocket URL for noVNC (QEMU) or LXC terminal, using a ticket from vncproxy/termproxy.
 */
export function buildProxmoxConsoleWebSocketUrl(
  apiOrigin: string,
  node: string,
  vmid: string,
  guest: ProxmoxConsoleWsGuest,
  ticketFields: ProxmoxConsoleTicketFields,
): string {
  const base = normalizeProxmoxBaseUrl(apiOrigin);
  if (!base) {
    throw new Error("apiOrigin is empty.");
  }
  const u = new URL(`${base}/`);
  const wssScheme = u.protocol === "https:" ? "wss:" : "ws:";
  const segment = guest === "qemu" ? "qemu" : "lxc";
  const path = `/api2/json/nodes/${encodeURIComponent(node)}/${segment}/${encodeURIComponent(vmid)}/vncwebsocket`;
  const q = new URLSearchParams();
  q.set("port", String(ticketFields.port));
  q.set("vncticket", ticketFields.ticket);
  return `${wssScheme}//${u.host}${path}?${q.toString()}`;
}
