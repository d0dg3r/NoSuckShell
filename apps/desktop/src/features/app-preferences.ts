import type { AutoArrangeMode, DensityProfile, LayoutMode, SplitRatioPreset, TerminalFontPreset } from "../components/AppSettingsPanel";
import type { FileExportArchiveFormat, FileExportDestMode } from "../components/settings/app-settings-types";

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_AUTO_HIDE_DELAY_MS = 300;
export const SIDEBAR_WIDTH_STORAGE_KEY = "nosuckshell.sidebar.width";
export const SIDEBAR_PINNED_STORAGE_KEY = "nosuckshell.sidebar.pinned";
export const DENSITY_PROFILE_STORAGE_KEY = "nosuckshell.ui.densityProfile";
export const LIST_TONE_PRESET_STORAGE_KEY = "nosuckshell.ui.listTonePreset";
export const FRAME_MODE_PRESET_STORAGE_KEY = "nosuckshell.ui.frameModePreset";
export const TERMINAL_FONT_OFFSET_STORAGE_KEY = "nosuckshell.terminal.fontOffset";
export const UI_FONT_PRESET_STORAGE_KEY = "nosuckshell.ui.fontPreset";
export const TERMINAL_FONT_PRESET_STORAGE_KEY = "nosuckshell.terminal.fontPreset";
export const QUICK_CONNECT_MODE_STORAGE_KEY = "nosuckshell.quickConnect.mode";
export const QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY = "nosuckshell.quickConnect.autoTrust";
export const SPLIT_RATIO_PRESET_STORAGE_KEY = "nosuckshell.layout.splitRatioPreset";
export const AUTO_ARRANGE_MODE_STORAGE_KEY = "nosuckshell.layout.autoArrangeMode";
export const WORKSPACES_STORAGE_KEY = "nosuckshell.layout.workspaces.v1";
export const SETTINGS_OPEN_MODE_STORAGE_KEY = "nosuckshell.settings.openMode";
export const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";
export const SIDEBAR_VIEW_STORAGE_KEY = "nosuckshell.sidebar.selectedView";
/** When true, PROXMUX VNC / web consoles open in a split pane (iframe); when false, system browser. */
export const PROXMUX_OPEN_WEB_CONSOLES_IN_PANE_KEY = "nosuckshell.proxmux.openWebConsolesInAppPane";
export const LAYOUT_MODE_STORAGE_KEY = "nosuckshell.layout.mode";
/** When true, split-pane label shows full file path (ellipsis); otherwise folder basename only. Tooltip always shows full path in file view. */
export const FILE_PANE_SHOW_FULL_PATH_IN_PANE_TITLE_KEY = "nosuckshell.ui.filePaneShowFullPathInPaneTitle";

/** JSON `{ enabled, colors }` for semantic file-name tints in the file browser. */
export const FILE_PANE_SEMANTIC_NAME_COLORS_STORAGE_KEY = "nosuckshell.ui.filePaneSemanticNameColors";

export const FILE_EXPORT_DEST_MODE_STORAGE_KEY = "nosuckshell.fileExport.destMode";
export const FILE_EXPORT_PATH_KEY_STORAGE_KEY = "nosuckshell.fileExport.pathKey";
export const FILE_EXPORT_ARCHIVE_FORMAT_STORAGE_KEY = "nosuckshell.fileExport.archiveFormat";
/** Must match CSS breakpoint for stacked-mobile shell */
export const MOBILE_STACKED_MEDIA = "(max-width: 900px)";

export const SPLIT_RATIO_PRESET_VALUE: Record<SplitRatioPreset, number> = {
  "50-50": 0.5,
  "60-40": 0.6,
  "70-30": 0.7,
};

export const TERMINAL_FONT_FAMILY_BY_PRESET: Record<TerminalFontPreset, string> = {
  "jetbrains-mono":
    '"JetBrains Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
  "ibm-plex-mono":
    '"IBM Plex Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
  "source-code-pro":
    '"Source Code Pro", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
};

export const DENSITY_TERMINAL_BASE_FONT: Record<DensityProfile, number> = {
  aggressive: 12,
  balanced: 13,
  safe: 14,
};

export const TERMINAL_FONT_OFFSET_MIN = -3;
export const TERMINAL_FONT_OFFSET_MAX = 6;
export const TERMINAL_FONT_MIN = 9;
export const TERMINAL_FONT_MAX = 22;

export const parseStoredAutoArrangeMode = (raw: string | null): AutoArrangeMode => {
  if (raw === "off" || raw === "a" || raw === "b" || raw === "c" || raw === "free") {
    return raw;
  }
  return "c";
};

export const clampSidebarWidth = (value: number): number =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));

export const parseFileExportDestMode = (raw: string | null): FileExportDestMode =>
  raw === "ask" ? "ask" : "fixed";

export const parseFileExportArchiveFormat = (raw: string | null): FileExportArchiveFormat =>
  raw === "zip" ? "zip" : "tarGz";

export const fileExportArchiveFormatToApi = (fmt: FileExportArchiveFormat): "tar.gz" | "zip" =>
  fmt === "zip" ? "zip" : "tar.gz";

export const readLayoutMode = (): LayoutMode => {
  if (typeof window === "undefined") {
    return "auto";
  }
  const persisted = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
  return persisted === "wide" || persisted === "compact" ? persisted : "auto";
};

export const readSplitRatioPreset = (): SplitRatioPreset => {
  if (typeof window === "undefined") {
    return "60-40";
  }
  const persisted = window.localStorage.getItem(SPLIT_RATIO_PRESET_STORAGE_KEY);
  return persisted === "50-50" || persisted === "60-40" || persisted === "70-30" ? persisted : "60-40";
};
