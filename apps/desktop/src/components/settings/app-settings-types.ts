export type AppSettingsTab =
  | "appearance"
  | "layout"
  | "data"
  | "ssh"
  | "views"
  | "store"
  | "help"
  | "about";

export type IdentityStoreSubTab = "overview" | "users" | "groups" | "tags" | "keys" | "hosts";

export type DensityProfile = "aggressive" | "balanced" | "safe";
export type ListTonePreset = "subtle" | "strong";
export type FrameModePreset = "cleaner" | "balanced" | "clearer";
export type UiFontPreset = "inter" | "manrope" | "ibm-plex-sans";
export type TerminalFontPreset = "jetbrains-mono" | "ibm-plex-mono" | "source-code-pro";
export type QuickConnectMode = "wizard" | "smart" | "command";
export type SettingsOpenMode = "modal" | "docked";
export type LayoutMode = "auto" | "wide" | "compact";
export type SplitRatioPreset = "50-50" | "60-40" | "70-30";
export type AutoArrangeMode = "off" | "a" | "b" | "c" | "free";
