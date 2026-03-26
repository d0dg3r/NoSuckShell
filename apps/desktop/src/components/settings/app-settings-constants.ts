import type {
  AppSettingsTab,
  HelpAboutSubTab,
  IdentityStoreSubTab,
  IntegrationsSubTab,
  InterfaceSubTab,
  WorkspaceSubTab,
} from "./app-settings-types";

/** Order: work-first (SSH, identity store, workspace, plugins) → interface → data → meta. */
export const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "ssh", label: "SSH" },
  { id: "store", label: "Identity Store" },
  { id: "workspace", label: "Workspace" },
  { id: "integrations", label: "Plugins" },
  { id: "interface", label: "Interface" },
  { id: "data", label: "Data & Backup" },
  { id: "help", label: "Help & info" },
];

export const WORKSPACE_SUBTABS: Array<{ id: WorkspaceSubTab; label: string }> = [
  { id: "views", label: "Views" },
  { id: "layout", label: "Layout & navigation" },
  { id: "files", label: "Files & export" },
];

export const INTERFACE_SUBTABS: Array<{ id: InterfaceSubTab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "keyboard", label: "Keyboard" },
];

export const HELP_ABOUT_SUBTABS: Array<{ id: HelpAboutSubTab; label: string }> = [
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
];

/** Overview first; then hosts → people → credentials → taxonomy. */
export const IDENTITY_STORE_SUBTABS: Array<{ id: IdentityStoreSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "hosts", label: "Hosts" },
  { id: "users", label: "Users" },
  { id: "keys", label: "SSH keys" },
  { id: "groups", label: "Groups" },
  { id: "tags", label: "Tags" },
];

export const INTEGRATIONS_SUBTABS: Array<{ id: IntegrationsSubTab; label: string }> = [
  { id: "plugins", label: "Plugins" },
  { id: "nss-commander", label: "NSS-Commander" },
  { id: "proxmux", label: "PROXMUX" },
  { id: "hetzner", label: "HETZNER" },
];

export const TERMINAL_FONT_OFFSET_MIN = -3;
export const TERMINAL_FONT_OFFSET_MAX = 6;
