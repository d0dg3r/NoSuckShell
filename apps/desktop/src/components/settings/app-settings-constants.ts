import type {
  AppSettingsTab,
  ConnectionSubTab,
  HelpAboutSubTab,
  IdentityStoreSubTab,
  InterfaceSubTab,
  WorkspaceSubTab,
} from "./app-settings-types";

/** Order: work-first (connection, identity, workspace, plugins) → interface → data → meta. */
export const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "connection", label: "Connection" },
  { id: "store", label: "Identity Store" },
  { id: "workspace", label: "Workspace" },
  { id: "integrations", label: "Plugins" },
  { id: "interface", label: "Interface" },
  { id: "data", label: "Data & Backup" },
  { id: "help", label: "Help & info" },
];

export const CONNECTION_SUBTABS: Array<{ id: ConnectionSubTab; label: string }> = [
  { id: "hosts", label: "Hosts" },
  { id: "ssh", label: "SSH" },
  { id: "proxmux", label: "PROXMUX" },
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

/** Overview first; then people → credentials → taxonomy. */
export const IDENTITY_STORE_SUBTABS: Array<{ id: IdentityStoreSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "keys", label: "SSH keys" },
  { id: "groups", label: "Groups" },
  { id: "tags", label: "Tags" },
];

export const TERMINAL_FONT_OFFSET_MIN = -3;
export const TERMINAL_FONT_OFFSET_MAX = 6;
