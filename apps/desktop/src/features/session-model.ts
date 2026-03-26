import type { QuickSshSessionRequest } from "../types";

export type SavedSshSessionTab = {
  id: string;
  kind: "sshSaved";
  hostAlias: string;
};
export type QuickSshSessionTab = {
  id: string;
  kind: "sshQuick";
  label: string;
  request: QuickSshSessionRequest;
};
export type LocalSessionTab = {
  id: string;
  kind: "local";
  label: string;
};
/** In-app iframe pane for HTTPS URLs (e.g. Proxmox noVNC / web shell). No backend PTY session. */
export type WebSessionTab = {
  id: string;
  kind: "web";
  label: string;
  url: string;
  /** Mirrors PROXMUX cluster "Allow insecure TLS" for in-app webview window (Linux/BSD WebKit). */
  allowInsecureTls?: boolean;
  /** PEM trusted for TLS (PROXMUX cluster). */
  tlsTrustedCertPem?: string | null;
};
/** Pane-native QEMU noVNC using PROXMUX vncproxy ticket + API WebSocket (or local WS proxy if TLS is insecure). */
export type ProxmoxQemuVncSessionTab = {
  id: string;
  kind: "proxmoxQemuVnc";
  label: string;
  clusterId: string;
  node: string;
  vmid: string;
  /** Cluster GUI base URL for "Open in app window" fallback (deep link). */
  proxmoxBaseUrl: string;
  allowInsecureTls?: boolean;
  /** PEM trusted for TLS (PROXMUX cluster); used with the local WebSocket bridge. */
  tlsTrustedCertPem?: string;
};
/** Pane-native LXC console using PROXMUX termproxy ticket + API WebSocket. */
export type ProxmoxLxcTermSessionTab = {
  id: string;
  kind: "proxmoxLxcTerm";
  label: string;
  clusterId: string;
  node: string;
  vmid: string;
  proxmoxBaseUrl: string;
  allowInsecureTls?: boolean;
  tlsTrustedCertPem?: string;
};
/** Pane-native Proxmox node host shell (nodes/{node}/termproxy + vncwebsocket). */
export type ProxmoxNodeTermSessionTab = {
  id: string;
  kind: "proxmoxNodeTerm";
  label: string;
  clusterId: string;
  node: string;
  proxmoxBaseUrl: string;
  allowInsecureTls?: boolean;
  tlsTrustedCertPem?: string;
};
export type SessionTab =
  | SavedSshSessionTab
  | QuickSshSessionTab
  | LocalSessionTab
  | WebSessionTab
  | ProxmoxQemuVncSessionTab
  | ProxmoxLxcTermSessionTab
  | ProxmoxNodeTermSessionTab;

export type QuickConnectDraft = {
  hostName: string;
  user: string;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
};

export const createQuickConnectDraft = (defaultUser = ""): QuickConnectDraft => ({
  hostName: "",
  user: defaultUser.trim(),
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

export type HostStatusFilter = "all" | "connected" | "disconnected";
export type QuickConnectWizardStep = 1 | 2;
export type AutoArrangeActiveMode = "a" | "b" | "c";
export type SidebarViewId = "builtin:all" | "builtin:favorites" | "builtin:proxmux" | "builtin:hetzner" | `custom:${string}`;
export type SplitMode = "duplicate" | "empty";
export type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  paneIndex: number | null;
  splitMode: SplitMode;
};
export type TrustPromptRequest = { sessionId: string; hostLabel: string };
