import type {
  HetznerVncSessionTab,
  ProxmoxLxcTermSessionTab,
  ProxmoxNodeTermSessionTab,
  ProxmoxQemuVncSessionTab,
  SessionTab,
  WebSessionTab,
} from "./session-model";

/** Sessions rendered as web/noVNC/LXC/node-shell overlays rather than PTY terminals (no SSH backend, no broadcast). */
export function sessionKindIsWebLike(kind: SessionTab["kind"]): boolean {
  return (
    kind === "web" ||
    kind === "proxmoxQemuVnc" ||
    kind === "proxmoxLxcTerm" ||
    kind === "proxmoxNodeTerm" ||
    kind === "hetznerVnc"
  );
}

export function sessionIsWebLike(
  session: SessionTab,
): session is WebSessionTab | ProxmoxQemuVncSessionTab | ProxmoxLxcTermSessionTab | ProxmoxNodeTermSessionTab | HetznerVncSessionTab {
  return sessionKindIsWebLike(session.kind);
}
