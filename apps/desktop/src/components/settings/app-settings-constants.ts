import type { AppSettingsTab, IdentityStoreSubTab } from "./app-settings-types";

/** Order: look & workspace & quick connect → views → identities → advanced SSH → data safety → meta. */
export const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout & Navigation" },
  { id: "keyboard", label: "Keyboard" },
  { id: "files", label: "Files & export" },
  { id: "views", label: "Views" },
  { id: "hosts", label: "Hosts" },
  { id: "store", label: "Identity Store" },
  { id: "ssh", label: "SSH" },
  { id: "data", label: "Data & Backup" },
  { id: "plugins", label: "Plugins & license" },
  { id: "proxmux", label: "PROXMUX" },
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
];

/** Overview first; then people → credentials → taxonomy → host bindings. */
export const IDENTITY_STORE_SUBTABS: Array<{ id: IdentityStoreSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "keys", label: "SSH keys" },
  { id: "groups", label: "Groups" },
  { id: "tags", label: "Tags" },
  { id: "hosts", label: "Hosts" },
];

export const TERMINAL_FONT_OFFSET_MIN = -3;
export const TERMINAL_FONT_OFFSET_MAX = 6;
