import type { AppSettingsTab, IdentityStoreSubTab } from "./app-settings-types";

/** Order: work-first (hosts, identity, integrations) → data safety → layout/input → look & feel → meta. */
export const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "hosts", label: "Hosts" },
  { id: "store", label: "Identity Store" },
  { id: "views", label: "Views" },
  { id: "ssh", label: "SSH" },
  { id: "proxmux", label: "PROXMUX" },
  { id: "plugins", label: "Plugins & license" },
  { id: "data", label: "Data & Backup" },
  { id: "layout", label: "Layout & Navigation" },
  { id: "keyboard", label: "Keyboard" },
  { id: "files", label: "Files & export" },
  { id: "appearance", label: "Appearance" },
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
