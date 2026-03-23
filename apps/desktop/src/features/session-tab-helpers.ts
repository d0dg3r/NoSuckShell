import type {
  ProxmoxLxcTermSessionTab,
  ProxmoxQemuVncSessionTab,
  SessionTab,
  WebSessionTab,
} from "./session-model";

/** Sessions rendered as web/noVNC/LXC overlays rather than PTY terminals (no SSH backend, no broadcast). */
export function sessionKindIsWebLike(kind: SessionTab["kind"]): boolean {
  return kind === "web" || kind === "proxmoxQemuVnc" || kind === "proxmoxLxcTerm";
}

export function sessionIsWebLike(
  session: SessionTab,
): session is WebSessionTab | ProxmoxQemuVncSessionTab | ProxmoxLxcTermSessionTab {
  return sessionKindIsWebLike(session.kind);
}
