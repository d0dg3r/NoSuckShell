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
};
export type SessionTab = SavedSshSessionTab | QuickSshSessionTab | LocalSessionTab | WebSessionTab;

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
export type SidebarViewId = "builtin:all" | "builtin:favorites" | "builtin:proxmux" | `custom:${string}`;
export type SplitMode = "duplicate" | "empty";
export type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  paneIndex: number | null;
  splitMode: SplitMode;
};
export type TrustPromptRequest = { sessionId: string; hostLabel: string };
