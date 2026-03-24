import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  closeSession,
  deleteHost,
  deleteLayoutProfile,
  exportBackup,
  importBackup,
  listLayoutProfiles,
  listViewProfiles,
  listHostMetadata,
  listHosts,
  saveHost,
  saveHostMetadata,
  saveLayoutProfile,
  saveViewProfile,
  deleteViewProfile,
  reorderViewProfiles,
  getSshConfigRaw,
  getSshDirInfo,
  saveSshConfigRaw,
  setSshDirOverride,
  sendInput,
  listStoreObjects,
  saveStoreObjects,
  createEncryptedKey,
  unlockKeyMaterial,
  deleteKeyById,
  exportResolvedOpensshConfigToPath,
  startLocalSession,
  startQuickSshSession,
  startSession,
  touchHostLastUsed,
  listPlugins,
  navigateInAppWebviewWindow,
  openExternalUrl,
  openVirtViewerFromSpicePayload,
  pluginInvoke,
} from "./tauri-api";
import { AddHostModal } from "./components/AddHostModal";
import { HostContextMenu } from "./components/HostContextMenu";
import { HostSidebar } from "./components/HostSidebar";
import { ProxmuxSidebarPanel } from "./components/ProxmuxSidebarPanel";
import { PaneContextMenu } from "./components/PaneContextMenu";
import { QuickConnectModal } from "./components/QuickConnectModal";
import { createSplitPaneRenderer } from "./components/SplitWorkspace";
import { useAppKeyboardShortcutEngine, type KeyboardShortcutEngineActions } from "./hooks/useAppKeyboardShortcutEngine";
import { useAppRefSync } from "./hooks/useAppRefSync";
import { listen } from "@tauri-apps/api/event";
import { useSessionOutputTrustListener } from "./hooks/useSessionOutputTrustListener";
import { useWorkspaceBootstrapFromStorage, useWorkspacePersistToStorage } from "./hooks/useWorkspaceLocalStorage";
import { TerminalWorkspaceDock } from "./components/TerminalWorkspaceDock";
import { TrustHostModal } from "./components/TrustHostModal";
import {
  AppSettingsPanel,
  type AppSettingsTab,
  type AutoArrangeMode,
  type ConnectionSubTab,
  type DensityProfile,
  type FileExportArchiveFormat,
  type FileExportDestMode,
  type FrameModePreset,
  type HelpAboutSubTab,
  type IdentityStoreSubTab,
  type IntegrationsSubTab,
  type InterfaceSubTab,
  type LayoutMode,
  type ListTonePreset,
  type QuickConnectMode,
  type SettingsOpenMode,
  type SplitRatioPreset,
  type TerminalFontPreset,
  type UiFontPreset,
  type WorkspaceSubTab,
} from "./components/AppSettingsPanel";

const LayoutCommandCenter = lazy(async () => {
  const m = await import("./components/LayoutCommandCenter");
  return { default: m.LayoutCommandCenter };
});

import { LAYOUT_PRESET_DEFINITIONS } from "./layoutPresets";
import { FILE_WORKSPACE_PLUGIN_ID, PROXMUX_PLUGIN_ID } from "./features/builtin-plugin-ids";
import { type ContextActionId, type PaneContextSessionKind } from "./features/context-actions";
import {
  FILE_DND_PAYLOAD_MIME,
  parseFileDragPayload,
  type FileDragPayload,
} from "./features/file-pane-dnd";
import { setFileTransferClipboardFromEvent } from "./features/file-transfer-clipboard";
import {
  buildQuickConnectUserCandidates,
  parseHostPortInput,
  parseQuickConnectCommandInput,
} from "./features/quick-connect";
import { shortenPathForPaneTitle } from "./features/terminal-osc7-path";
import {
  assignSessionToPane,
  clearPaneAtIndex,
  createPaneLayoutItem,
  createPaneLayoutsFromSlots,
  createInitialPaneState,
  ensurePaneIndex,
  MIN_PANE_HEIGHT,
  MIN_PANE_WIDTH,
  reconcilePaneLayouts,
  removeSessionFromSlots,
  resolveInputTargets,
  sanitizeBroadcastTargets,
} from "./features/split";
import { sortRowsByFavoriteThenAlias } from "./features/host-order";
import {
  createDefaultViewProfile,
  createEmptyViewFilterRule,
  evaluateGroup,
  type HostRowViewModel,
} from "./features/view-profile-filters";
import type {
  HostConfig,
  HostMetadata,
  HostMetadataStore,
  EntityStore,
  HostBinding,
  UserObject,
  GroupObject,
  TagObject,
  SshKeyObject,
  LayoutProfile,
  LayoutSplitTreeNode,
  PaneLayoutItem,
  QuickSshSessionRequest,
  RemoteSshSpec,
  StrictHostKeyPolicy,
  ViewFilterRule,
  ViewProfile,
  ViewSortField,
  SshDirInfo,
} from "./types";
import logoTextTransparent from "../../../img/logo_text_transparent.png";
import logoTransparent from "../../../img/logo_tranparent.png";
import {
  allowNativeBrowserContextMenu,
  createDefaultEntityStore,
  createDefaultHostBinding,
  createDefaultHostMetadata,
  createDefaultMetadataStore,
  emptyHost,
  normalizeEntityStore,
} from "./features/app-bootstrap";
import { normalizeHostIdentityWithBinding } from "./features/host-form-identity";
import { jumpHostCandidates, normalizeHostProxyJumpWithBinding, normalizeHostUserWithBinding } from "./features/host-form-store-links";
import { hostMetadataIsJumpHost, JUMP_HOST_METADATA_TAG, withJumpHostTagSync } from "./features/jump-host";
import {
  effectiveStrictHostKeyPolicy,
  metadataPatchForHostKeyPolicy,
} from "./features/host-metadata-policy";
import { createId } from "./features/app-id";
import { validateExternalHttpUrl } from "./features/external-http-url";
import { buildProxmoxConsoleUrl, isProxmoxConsoleDeepLinkUrl } from "./features/proxmox-console-urls";
import {
  computeProxmuxWarmupDelayMs,
  selectProxmuxWarmupClusterId,
  shouldRunProxmuxStartupWarmup,
} from "./features/proxmux-startup-warmup";
import { openProxmoxInAppWebviewWindow } from "./features/proxmox-webview-window";
import {
  AUTO_ARRANGE_MODE_STORAGE_KEY,
  DEFAULT_BACKUP_PATH,
  DEFAULT_VISUAL_STYLE,
  DENSITY_PROFILE_STORAGE_KEY,
  FILE_EXPORT_ARCHIVE_FORMAT_STORAGE_KEY,
  FILE_EXPORT_DEST_MODE_STORAGE_KEY,
  FILE_EXPORT_PATH_KEY_STORAGE_KEY,
  FILE_PANE_SHOW_FULL_PATH_IN_PANE_TITLE_KEY,
  DENSITY_TERMINAL_BASE_FONT,
  FRAME_MODE_PRESET_STORAGE_KEY,
  LAYOUT_MODE_STORAGE_KEY,
  LIST_TONE_PRESET_STORAGE_KEY,
  MOBILE_STACKED_MEDIA,
  PROXMUX_OPEN_WEB_CONSOLES_IN_PANE_KEY,
  QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY,
  QUICK_CONNECT_MODE_STORAGE_KEY,
  SETTINGS_OPEN_MODE_STORAGE_KEY,
  SIDEBAR_AUTO_HIDE_DELAY_MS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_PINNED_STORAGE_KEY,
  SIDEBAR_VIEW_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  SPLIT_RATIO_PRESET_STORAGE_KEY,
  SPLIT_RATIO_PRESET_VALUE,
  TERMINAL_FONT_FAMILY_BY_PRESET,
  TERMINAL_FONT_MAX,
  TERMINAL_FONT_MIN,
  TERMINAL_FONT_OFFSET_MAX,
  TERMINAL_FONT_OFFSET_MIN,
  TERMINAL_FONT_OFFSET_STORAGE_KEY,
  TERMINAL_FONT_PRESET_STORAGE_KEY,
  UI_DENSITY_OFFSET_STORAGE_KEY,
  UI_FONT_PRESET_STORAGE_KEY,
  clampSidebarWidth,
  parseFileExportArchiveFormat,
  parseFileExportDestMode,
  parseStoredAutoArrangeMode,
  readLayoutMode,
  readSplitRatioPreset,
} from "./features/app-preferences";
import { formatChordDisplay } from "./features/keyboard-shortcuts-display";
import { KEYBOARD_SHORTCUT_DEFINITIONS } from "./features/keyboard-shortcuts-registry";
import type { KeyboardShortcutCommandId, KeyChord, StoredShortcutMap } from "./features/keyboard-shortcuts-types";
import {
  KEYBOARD_SHORTCUTS_STORAGE_KEY,
  effectiveLeaderChord,
  mergeChordMap,
  parseStoredShortcutMap,
} from "./features/keyboard-shortcuts-storage";
import { resolveFileExportDestPath } from "./features/file-export-dest";
import {
  applyFilePaneSemanticNameColorVarsToDocument,
  readFilePaneSemanticNameColorsFromStorage,
  writeFilePaneSemanticNameColorsToStorage,
  type FilePaneSemanticNameColorsStored,
} from "./features/file-pane-semantic-name-colors-prefs";
import { DND_PAYLOAD_MIME, type DragPayload, type PaneDropZone, resolvePaneDropZoneFromOverlay } from "./features/pane-dnd";
import {
  type AutoArrangeActiveMode,
  type ContextMenuState,
  type HostStatusFilter,
  type QuickConnectDraft,
  type QuickConnectWizardStep,
  type SavedSshSessionTab,
  type SessionTab,
  type SidebarViewId,
  type SplitMode,
  type TrustPromptRequest,
  createQuickConnectDraft,
} from "./features/session-model";
import { sessionIsWebLike, sessionKindIsWebLike } from "./features/session-tab-helpers";
import {
  cloneSplitTree,
  collectPaneOrder,
  createEqualGridSplitTree,
  createLeafNode,
  createTreeFromPaneCount,
  isLayoutGridDimensionsValid,
  parseSplitTree,
  rebalanceSplitTree,
  removePaneFromTree,
  replacePaneInTree,
  serializeSplitTree,
  updateSplitRatioInTree,
  type SplitAxis,
  type SplitResizeState,
  type SplitTreeNode,
} from "./features/split-tree";
import {
  appendSessionToWorkspaceSnapshot,
  clonePaneLayouts,
  cloneWorkspaceSnapshot,
  compactSplitSlotsByPaneOrder,
  createEmptyWorkspaceSnapshot,
  DEFAULT_WORKSPACE_ID,
  findFirstFreePaneInOrder,
  type WorkspaceSnapshot,
} from "./features/workspace-snapshot";

function parseHostTagDraftToSortedTags(draft: string): string[] {
  return Array.from(
    new Set(
      draft
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function hostConfigsEqual(a: HostConfig, b: HostConfig): boolean {
  return (
    a.host === b.host &&
    a.hostName === b.hostName &&
    a.user === b.user &&
    a.port === b.port &&
    a.identityFile === b.identityFile &&
    a.proxyJump === b.proxyJump &&
    a.proxyCommand === b.proxyCommand
  );
}

function sidebarSavedHostBinding(
  menuAlias: string,
  hosts: HostConfig[],
  entityStore: EntityStore,
  metadataHosts: HostMetadataStore["hosts"],
): HostBinding {
  const existing = entityStore.hostBindings[menuAlias];
  if (existing) {
    return existing;
  }
  const host = hosts.find((h) => h.host === menuAlias);
  return {
    ...createDefaultHostBinding(),
    proxyJump: host?.proxyJump ?? "",
    legacyUser: host?.user ?? "",
    legacyTags: metadataHosts[menuAlias]?.tags ?? [],
    legacyIdentityFile: host?.identityFile ?? "",
    legacyProxyJump: host?.proxyJump ?? "",
    legacyProxyCommand: host?.proxyCommand ?? "",
  };
}

function sidebarBindingPickerDirty(a: HostBinding, b: HostBinding): boolean {
  return (
    a.userId !== b.userId ||
    a.legacyUser !== b.legacyUser ||
    a.proxyJump !== b.proxyJump ||
    a.legacyProxyJump !== b.legacyProxyJump ||
    a.legacyIdentityFile !== b.legacyIdentityFile ||
    JSON.stringify(a.keyRefs) !== JSON.stringify(b.keyRefs)
  );
}

function syncSidebarHostWithStore(
  host: HostConfig,
  draft: HostBinding,
  storeKeys: SshKeyObject[],
  storeUsers: UserObject[],
  allHosts: HostConfig[],
  metadataHosts: HostMetadataStore["hosts"],
): { host: HostConfig; binding: HostBinding } {
  let r = normalizeHostIdentityWithBinding(host, draft, storeKeys);
  r = normalizeHostUserWithBinding(r.host, r.binding, storeUsers);
  r = normalizeHostProxyJumpWithBinding(
    r.host,
    r.binding,
    jumpHostCandidates(allHosts, host.host, metadataHosts),
  );
  return r;
}

function isHostSettingsDirty(
  alias: string,
  hosts: HostConfig[],
  metadataHosts: HostMetadataStore["hosts"],
  draftHost: HostConfig,
  draftTagDraft: string,
  draftKeyPolicy: StrictHostKeyPolicy,
  entityStore: EntityStore,
  draftBinding: HostBinding,
): boolean {
  if (!alias.trim()) {
    return false;
  }
  const saved = hosts.find((h) => h.host === alias);
  if (!saved) {
    return false;
  }
  if (draftHost.host !== alias) {
    return true;
  }
  if (!hostConfigsEqual(draftHost, saved)) {
    return true;
  }
  const savedBinding = sidebarSavedHostBinding(alias, hosts, entityStore, metadataHosts);
  if (sidebarBindingPickerDirty(draftBinding, savedBinding)) {
    return true;
  }
  const savedTags = [...(metadataHosts[alias]?.tags ?? [])].sort((a, b) => a.localeCompare(b));
  const draftTags = parseHostTagDraftToSortedTags(draftTagDraft);
  if (savedTags.length !== draftTags.length) {
    return true;
  }
  if (savedTags.some((t, i) => t !== draftTags[i])) {
    return true;
  }
  const savedMeta = metadataHosts[alias] ?? createDefaultHostMetadata();
  return draftKeyPolicy !== effectiveStrictHostKeyPolicy(savedMeta);
}

export function App() {
  const [hosts, setHosts] = useState<HostConfig[]>([]);
  const [activeHost, setActiveHost] = useState<string>("");
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");
  const [metadataStore, setMetadataStore] = useState<HostMetadataStore>(() => createDefaultMetadataStore());
  const [entityStore, setEntityStore] = useState<EntityStore>(() => createDefaultEntityStore());
  const [storePassphrase, setStorePassphrase] = useState<string>("");
  const [storeUserDraft, setStoreUserDraft] = useState<string>("");
  const [storeGroupDraft, setStoreGroupDraft] = useState<string>("");
  const [storeTagDraft, setStoreTagDraft] = useState<string>("");
  const [storePathKeyNameDraft, setStorePathKeyNameDraft] = useState<string>("");
  const [storePathKeyPathDraft, setStorePathKeyPathDraft] = useState<string>("");
  const [storeEncryptedKeyNameDraft, setStoreEncryptedKeyNameDraft] = useState<string>("");
  const [storeEncryptedPrivateKeyDraft, setStoreEncryptedPrivateKeyDraft] = useState<string>("");
  const [storeEncryptedPublicKeyDraft, setStoreEncryptedPublicKeyDraft] = useState<string>("");
  const [error, setError] = useState<string>("");
  /** After opening Proxmox login in an external webview, user continues to the console URL here. */
  const [proxmoxWebLoginAssist, setProxmoxWebLoginAssist] = useState<{ label: string; consoleUrl: string } | null>(
    null,
  );
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState<boolean>(false);
  const [settingsOpenMode, setSettingsOpenMode] = useState<SettingsOpenMode>(() => {
    if (typeof window === "undefined") {
      return "modal";
    }
    const persisted = window.localStorage.getItem(SETTINGS_OPEN_MODE_STORAGE_KEY);
    return persisted === "docked" || persisted === "modal" ? persisted : "modal";
  });
  const [isSettingsDragging, setIsSettingsDragging] = useState<boolean>(false);
  const [settingsModalPosition, setSettingsModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeAppSettingsTab, setActiveAppSettingsTab] = useState<AppSettingsTab>("connection");
  const [connectionSubTab, setConnectionSubTab] = useState<ConnectionSubTab>("hosts");
  const [workspaceSubTab, setWorkspaceSubTab] = useState<WorkspaceSubTab>("views");
  const [integrationsSubTab, setIntegrationsSubTab] = useState<IntegrationsSubTab>("proxmux");
  const [interfaceSubTab, setInterfaceSubTab] = useState<InterfaceSubTab>("appearance");
  const [helpAboutSubTab, setHelpAboutSubTab] = useState<HelpAboutSubTab>("help");
  const [identityStoreSubTab, setIdentityStoreSubTab] = useState<IdentityStoreSubTab>("overview");
  const [keyboardShortcutChords, setKeyboardShortcutChords] = useState<Record<KeyboardShortcutCommandId, KeyChord>>(() =>
    mergeChordMap(parseStoredShortcutMap(window.localStorage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY))),
  );
  const [keyboardLeaderChord, setKeyboardLeaderChord] = useState<KeyChord>(() =>
    effectiveLeaderChord(parseStoredShortcutMap(window.localStorage.getItem(KEYBOARD_SHORTCUTS_STORAGE_KEY))),
  );
  const [sshConfigRaw, setSshConfigRaw] = useState<string>("");
  const [sshDirInfo, setSshDirInfo] = useState<SshDirInfo | null>(null);
  const [sshDirOverrideDraft, setSshDirOverrideDraft] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<HostStatusFilter>("all");
  const [recentOnly, setRecentOnly] = useState<boolean>(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");
  const [portFilter, setPortFilter] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [isQuickAddMenuOpen, setIsQuickAddMenuOpen] = useState<boolean>(false);
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState<boolean>(false);
  const [isQuickConnectModalOpen, setIsQuickConnectModalOpen] = useState<boolean>(false);
  const [pendingQuickConnectPaneIndex, setPendingQuickConnectPaneIndex] = useState<number | null>(null);
  const [newHostDraft, setNewHostDraft] = useState<HostConfig>(emptyHost());
  const [quickConnectDraft, setQuickConnectDraft] = useState<QuickConnectDraft>(() => createQuickConnectDraft());
  const [quickConnectCommandInput, setQuickConnectCommandInput] = useState<string>("");
  const [quickConnectWizardStep, setQuickConnectWizardStep] = useState<QuickConnectWizardStep>(1);
  const [addHostBindingDraft, setAddHostBindingDraft] = useState<HostBinding>(() => createDefaultHostBinding());
  const [backupExportPath, setBackupExportPath] = useState<string>(DEFAULT_BACKUP_PATH);
  const [backupImportPath, setBackupImportPath] = useState<string>(DEFAULT_BACKUP_PATH);
  const [backupExportPassword, setBackupExportPassword] = useState<string>("");
  const [backupImportPassword, setBackupImportPassword] = useState<string>("");
  const [backupMessage, setBackupMessage] = useState<string>("");
  const [trustPromptQueue, setTrustPromptQueue] = useState<TrustPromptRequest[]>([]);
  const [saveTrustHostAsDefault, setSaveTrustHostAsDefault] = useState<boolean>(true);
  const [splitSlots, setSplitSlots] = useState<Array<string | null>>(() => createInitialPaneState());
  /** Per SSH/local session: file browser vs terminal (keyed by session id so layout changes do not remap views). */
  const [sessionFileViews, setSessionFileViews] = useState<Record<string, "terminal" | "remote" | "local">>({});
  /** Gated by built-in plugin `dev.nosuckshell.plugin.file-workspace` (Settings → Plugins & license). */
  const [fileWorkspacePluginEnabled, setFileWorkspacePluginEnabled] = useState(true);
  const [proxmuxSidebarAvailable, setProxmuxSidebarAvailable] = useState(false);
  const [proxmuxResourceCount, setProxmuxResourceCount] = useState(0);
  const proxmuxWarmupTimerRef = useRef<number | null>(null);
  const proxmuxWarmupDoneRef = useRef(false);
  const [paneLayouts, setPaneLayouts] = useState<PaneLayoutItem[]>(() => createPaneLayoutsFromSlots(createInitialPaneState()));
  const [splitTree, setSplitTree] = useState<SplitTreeNode>(() => createLeafNode(0));
  const [activePaneIndex, setActivePaneIndex] = useState<number>(0);
  const [expandedPaneToolbarIndices, setExpandedPaneToolbarIndices] = useState<Set<number>>(new Set());
  const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState<boolean>(false);
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const [layoutProfiles, setLayoutProfiles] = useState<LayoutProfile[]>([]);
  const [viewProfiles, setViewProfiles] = useState<ViewProfile[]>([]);
  const [selectedSidebarViewId, setSelectedSidebarViewId] = useState<SidebarViewId>(() => {
    if (typeof window === "undefined") {
      return "builtin:all";
    }
    const persisted = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (
      persisted === "builtin:all" ||
      persisted === "builtin:favorites" ||
      persisted === "builtin:proxmux" ||
      persisted?.startsWith("custom:")
    ) {
      return persisted as SidebarViewId;
    }
    return "builtin:all";
  });
  const [selectedViewProfileIdInSettings, setSelectedViewProfileIdInSettings] = useState<string>("");
  const [viewDraft, setViewDraft] = useState<ViewProfile>(() => createDefaultViewProfile());
  const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState<string>("");
  const [pendingLayoutProfileDeleteId, setPendingLayoutProfileDeleteId] = useState<string>("");
  const [layoutProfileName, setLayoutProfileName] = useState<string>("");
  const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState<boolean>(false);
  const [isLayoutCommandCenterOpen, setIsLayoutCommandCenterOpen] = useState<boolean>(false);
  const [layoutTargetWorkspaceId, setLayoutTargetWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID);
  const [layoutSwitchToTargetAfterApply, setLayoutSwitchToTargetAfterApply] = useState<boolean>(false);
  const [layoutMirrorWorkspaceIdOnSave, setLayoutMirrorWorkspaceIdOnSave] = useState<string>("");
  const layoutCommandCenterWasOpenRef = useRef<boolean>(false);
  const [hostSettingsSelectedAlias, setHostSettingsSelectedAlias] = useState<string>("");
  const [hostSettingsDraftHost, setHostSettingsDraftHost] = useState<HostConfig>(() => emptyHost());
  const [hostSettingsDraftBinding, setHostSettingsDraftBinding] = useState<HostBinding>(() =>
    createDefaultHostBinding(),
  );
  const [hostSettingsTagDraft, setHostSettingsTagDraft] = useState<string>("");
  const [hostSettingsKeyPolicy, setHostSettingsKeyPolicy] = useState<StrictHostKeyPolicy>("ask");
  const [pendingRemoveHostsTab, setPendingRemoveHostsTab] = useState<boolean>(false);
  const removeHostsTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proxmuxStartupWarmupTimerRef = useRef<number | null>(null);
  const proxmuxStartupWarmupDoneRef = useRef<boolean>(false);
  const [draggingKind, setDraggingKind] = useState<DragPayload["type"] | null>(null);
  const [dragOverPaneIndex, setDragOverPaneIndex] = useState<number | null>(null);
  const [activeDropZonePaneIndex, setActiveDropZonePaneIndex] = useState<number | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<PaneDropZone | null>(null);
  const [splitResizeState, setSplitResizeState] = useState<SplitResizeState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    const persisted = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(persisted) ? clampSidebarWidth(persisted) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState<boolean>(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const persisted = window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY);
    return persisted !== "false";
  });
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);
  const [densityProfile, setDensityProfile] = useState<DensityProfile>(() => {
    if (typeof window === "undefined") {
      return "balanced";
    }
    const persisted = window.localStorage.getItem(DENSITY_PROFILE_STORAGE_KEY);
    return persisted === "aggressive" || persisted === "safe" || persisted === "balanced" ? persisted : "balanced";
  });
  const [uiDensityOffset, setUiDensityOffset] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }
    const persisted = Number(window.localStorage.getItem(UI_DENSITY_OFFSET_STORAGE_KEY));
    if (!Number.isFinite(persisted)) {
      return 0;
    }
    return Math.min(2, Math.max(-2, Math.round(persisted)));
  });
  const [listTonePreset, setListTonePreset] = useState<ListTonePreset>(() => {
    if (typeof window === "undefined") {
      return "subtle";
    }
    const persisted = window.localStorage.getItem(LIST_TONE_PRESET_STORAGE_KEY);
    return persisted === "strong" ? "strong" : "subtle";
  });
  const [frameModePreset, setFrameModePreset] = useState<FrameModePreset>(() => {
    if (typeof window === "undefined") {
      return "balanced";
    }
    const persisted = window.localStorage.getItem(FRAME_MODE_PRESET_STORAGE_KEY);
    return persisted === "cleaner" || persisted === "clearer" || persisted === "balanced" ? persisted : "balanced";
  });
  const [showFullPathInFilePaneTitle, setShowFullPathInFilePaneTitle] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(FILE_PANE_SHOW_FULL_PATH_IN_PANE_TITLE_KEY) === "true";
  });
  const [filePaneSemanticNameColors, setFilePaneSemanticNameColors] = useState<FilePaneSemanticNameColorsStored>(() =>
    readFilePaneSemanticNameColorsFromStorage(),
  );
  const [fileExportDestMode, setFileExportDestMode] = useState<FileExportDestMode>(() => {
    if (typeof window === "undefined") {
      return "fixed";
    }
    return parseFileExportDestMode(window.localStorage.getItem(FILE_EXPORT_DEST_MODE_STORAGE_KEY));
  });
  const [fileExportPathKey, setFileExportPathKey] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "Downloads";
    }
    return window.localStorage.getItem(FILE_EXPORT_PATH_KEY_STORAGE_KEY) ?? "Downloads";
  });
  const [fileExportArchiveFormat, setFileExportArchiveFormat] = useState<FileExportArchiveFormat>(() => {
    if (typeof window === "undefined") {
      return "tarGz";
    }
    return parseFileExportArchiveFormat(window.localStorage.getItem(FILE_EXPORT_ARCHIVE_FORMAT_STORAGE_KEY));
  });
  const [terminalFontOffset, setTerminalFontOffset] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }
    const persisted = Number(window.localStorage.getItem(TERMINAL_FONT_OFFSET_STORAGE_KEY));
    if (!Number.isFinite(persisted)) {
      return 0;
    }
    return Math.min(TERMINAL_FONT_OFFSET_MAX, Math.max(TERMINAL_FONT_OFFSET_MIN, Math.round(persisted)));
  });
  const [uiFontPreset, setUiFontPreset] = useState<UiFontPreset>(() => {
    if (typeof window === "undefined") {
      return "inter";
    }
    const persisted = window.localStorage.getItem(UI_FONT_PRESET_STORAGE_KEY);
    return persisted === "manrope" || persisted === "ibm-plex-sans" || persisted === "inter" ? persisted : "inter";
  });
  const [terminalFontPreset, setTerminalFontPreset] = useState<TerminalFontPreset>(() => {
    if (typeof window === "undefined") {
      return "jetbrains-mono";
    }
    const persisted = window.localStorage.getItem(TERMINAL_FONT_PRESET_STORAGE_KEY);
    return persisted === "ibm-plex-mono" || persisted === "source-code-pro" || persisted === "jetbrains-mono"
      ? persisted
      : "jetbrains-mono";
  });
  const [quickConnectMode, setQuickConnectMode] = useState<QuickConnectMode>(() => {
    if (typeof window === "undefined") {
      return "smart";
    }
    const persisted = window.localStorage.getItem(QUICK_CONNECT_MODE_STORAGE_KEY);
    return persisted === "wizard" || persisted === "command" || persisted === "smart" ? persisted : "smart";
  });
  const [quickConnectAutoTrust, setQuickConnectAutoTrust] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY) === "true";
  });
  const [splitRatioPreset, setSplitRatioPreset] = useState<SplitRatioPreset>(() => readSplitRatioPreset());
  const [autoArrangeMode, setAutoArrangeMode] = useState<AutoArrangeMode>(() => {
    if (typeof window === "undefined") {
      return "c";
    }
    const persisted = window.localStorage.getItem(AUTO_ARRANGE_MODE_STORAGE_KEY);
    return parseStoredAutoArrangeMode(persisted);
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => readLayoutMode());
  const [proxmuxOpenWebConsolesInPane, setProxmuxOpenWebConsolesInPane] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const raw = window.localStorage.getItem(PROXMUX_OPEN_WEB_CONSOLES_IN_PANE_KEY);
    return raw !== "false";
  });
  const [workspaceOrder, setWorkspaceOrder] = useState<string[]>([DEFAULT_WORKSPACE_ID]);
  const [workspaceSnapshots, setWorkspaceSnapshots] = useState<Record<string, WorkspaceSnapshot>>({
    [DEFAULT_WORKSPACE_ID]: createEmptyWorkspaceSnapshot(DEFAULT_WORKSPACE_ID, "Main"),
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID);
  const [viewportStacked, setViewportStacked] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_STACKED_MEDIA).matches,
  );
  const [mobileShellTab, setMobileShellTab] = useState<"hosts" | "terminal">("terminal");
  const [hoveredHostAlias, setHoveredHostAlias] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    paneIndex: null,
    splitMode: "duplicate",
  });
  const [hostContextMenu, setHostContextMenu] = useState<{
    x: number;
    y: number;
    host: HostConfig;
  } | null>(null);
  const sidebarDragStartXRef = useRef<number>(0);
  const sidebarDragStartWidthRef = useRef<number>(SIDEBAR_DEFAULT_WIDTH);
  const splitNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const paneScrollAnchorsRef = useRef<Record<number, HTMLElement | null>>({});
  const settingsModalRef = useRef<HTMLElement | null>(null);
  const settingsDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
  const skipMobilePagerScrollRef = useRef(false);
  const nextSplitIdRef = useRef<number>(1);
  const nextPaneIndexRef = useRef<number>(1);
  const splitResizeLatestRatioRef = useRef<number | null>(null);
  const splitResizeRafRef = useRef<number | null>(null);
  const missingDragPayloadLoggedRef = useRef<boolean>(false);
  const quickAddMenuRef = useRef<HTMLDivElement | null>(null);
  const removeConfirmResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAllConfirmResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideSidebarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProfileLoadSessionIdsRef = useRef<Set<string> | null>(null);
  const sessionsRef = useRef<SessionTab[]>([]);
  const metadataStoreRef = useRef<HostMetadataStore>(createDefaultMetadataStore());
  const quickConnectAutoTrustRef = useRef<boolean>(false);
  const orphanSeenSessionIdsRef = useRef<Set<string>>(new Set());
  const orphanClosingSessionIdsRef = useRef<Set<string>>(new Set());
  const lastInternalDragPayloadRef = useRef<DragPayload | null>(null);
  const localFilePanePathsRef = useRef<Record<number, string>>({});
  const filePaneTitlesRef = useRef<Record<number, { short: string; full: string }>>({});
  const [filePaneTitleEpoch, setFilePaneTitleEpoch] = useState(0);
  const sessionTerminalCwdRef = useRef<Record<string, string>>({});
  const [sessionTerminalCwdEpoch, setSessionTerminalCwdEpoch] = useState(0);
  const [proxmoxQemuVncReconnectNonces, setProxmoxQemuVncReconnectNonces] = useState<Record<number, number>>({});
  const [proxmoxLxcReconnectNonces, setProxmoxLxcReconnectNonces] = useState<Record<number, number>>({});
  const draggingSessionIdRef = useRef<string | null>(null);
  const suppressHostClickAliasRef = useRef<string | null>(null);
  const isApplyingWorkspaceSnapshotRef = useRef<boolean>(false);
  const isAutoArrangeApplyingRef = useRef<boolean>(false);
  const lastAutoArrangeBeforeFreeRef = useRef<AutoArrangeActiveMode>("c");
  const prevAppSettingsOpenRef = useRef(false);
  const [pendingCloseAllIntent, setPendingCloseAllIntent] = useState<"close" | "reset" | null>(null);
  const shouldSplitAsEmpty = (
    eventLike?:
      | {
          type?: string;
          key?: string;
          code?: string;
          altKey?: boolean;
          getModifierState?: (...args: any[]) => boolean;
        }
      | null,
  ): boolean => {
    if (!eventLike) {
      return false;
    }
    const modifierKey =
      eventLike.key === "Alt" ||
      eventLike.key === "AltGraph" ||
      eventLike.code === "AltLeft" ||
      eventLike.code === "AltRight";
    if (modifierKey && eventLike.type === "keydown") {
      return true;
    }
    if (modifierKey && eventLike.type === "keyup") {
      return false;
    }
    return Boolean(eventLike.altKey || eventLike.getModifierState?.("AltGraph"));
  };

  const canCreateHost = useMemo(
    () => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0,
    [newHostDraft],
  );
  const hostSettingsMetadataForSelected = useMemo(
    () => metadataStore.hosts[hostSettingsSelectedAlias] ?? createDefaultHostMetadata(),
    [metadataStore.hosts, hostSettingsSelectedAlias],
  );
  const isHostsTabDirty = useMemo(() => {
    if (!hostSettingsSelectedAlias.trim()) {
      return false;
    }
    return isHostSettingsDirty(
      hostSettingsSelectedAlias,
      hosts,
      metadataStore.hosts,
      hostSettingsDraftHost,
      hostSettingsTagDraft,
      hostSettingsKeyPolicy,
      entityStore,
      hostSettingsDraftBinding,
    );
  }, [
    hostSettingsSelectedAlias,
    hosts,
    metadataStore.hosts,
    hostSettingsDraftHost,
    hostSettingsTagDraft,
    hostSettingsKeyPolicy,
    entityStore,
    hostSettingsDraftBinding,
  ]);
  const hostSettingsTabSaveDisabled = useMemo(() => {
    return (
      hostSettingsDraftHost.host.trim().length === 0 ||
      hostSettingsDraftHost.hostName.trim().length === 0 ||
      !isHostsTabDirty
    );
  }, [hostSettingsDraftHost.host, hostSettingsDraftHost.hostName, isHostsTabDirty]);
  const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const sessionById = useMemo(() => {
    return new Map(sessions.map((session) => [session.id, session]));
  }, [sessions]);
  const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
  const visiblePaneSessionIds = useMemo(
    () => splitSlots.filter((slot): slot is string => Boolean(slot)),
    [splitSlots],
  );
  const broadcastEligibleVisiblePaneSessionIds = useMemo(() => {
    return visiblePaneSessionIds.filter((id) => {
      const s = sessionById.get(id);
      return Boolean(s && !sessionKindIsWebLike(s.kind));
    });
  }, [visiblePaneSessionIds, sessionById]);
  const activeTrustPrompt = useMemo(() => trustPromptQueue[0] ?? null, [trustPromptQueue]);
  const selectedLayoutProfile = useMemo(
    () => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null,
    [layoutProfiles, selectedLayoutProfileId],
  );
  const layoutCommandCenterPreviewTree = useMemo((): LayoutSplitTreeNode | null => {
    return selectedLayoutProfile?.splitTree ?? null;
  }, [selectedLayoutProfile]);
  const connectedHosts = useMemo(() => {
    return new Set(
      sessions
        .filter((session): session is SavedSshSessionTab => session.kind === "sshSaved")
        .map((session) => session.hostAlias),
    );
  }, [sessions]);
  const isSidebarOpen = isSidebarVisible;
  const terminalFontSize = useMemo(() => {
    const base = DENSITY_TERMINAL_BASE_FONT[densityProfile];
    const next = base + terminalFontOffset;
    return Math.min(TERMINAL_FONT_MAX, Math.max(TERMINAL_FONT_MIN, next));
  }, [densityProfile, terminalFontOffset]);
  const terminalFontFamily = useMemo(
    () => TERMINAL_FONT_FAMILY_BY_PRESET[terminalFontPreset],
    [terminalFontPreset],
  );
  const splitRatioDefaultValue = SPLIT_RATIO_PRESET_VALUE[splitRatioPreset];
  const workspaceTabs = useMemo(
    () =>
      workspaceOrder
        .map((workspaceId) => workspaceSnapshots[workspaceId])
        .filter((workspace): workspace is WorkspaceSnapshot => Boolean(workspace)),
    [workspaceOrder, workspaceSnapshots],
  );
  const layoutCommandWorkspaceOptions = useMemo(
    () => workspaceTabs.map((workspace) => ({ id: workspace.id, name: workspace.name })),
    [workspaceTabs],
  );
  const resolvedLayoutTargetWorkspaceId = useMemo(() => {
    if (workspaceTabs.some((workspace) => workspace.id === layoutTargetWorkspaceId)) {
      return layoutTargetWorkspaceId;
    }
    return activeWorkspaceId;
  }, [activeWorkspaceId, layoutTargetWorkspaceId, workspaceTabs]);
  useEffect(() => {
    if (isLayoutCommandCenterOpen && !layoutCommandCenterWasOpenRef.current) {
      setLayoutTargetWorkspaceId(activeWorkspaceId);
      setLayoutSwitchToTargetAfterApply(false);
      setLayoutMirrorWorkspaceIdOnSave("");
    }
    layoutCommandCenterWasOpenRef.current = isLayoutCommandCenterOpen;
  }, [isLayoutCommandCenterOpen, activeWorkspaceId]);

  const resetVisualStyle = useCallback(() => {
    const d = DEFAULT_VISUAL_STYLE;
    setDensityProfile(d.densityProfile);
    setUiDensityOffset(d.uiDensityOffset);
    setUiFontPreset(d.uiFontPreset);
    setTerminalFontPreset(d.terminalFontPreset);
    setTerminalFontOffset(d.terminalFontOffset);
    setListTonePreset(d.listTonePreset);
    setFrameModePreset(d.frameModePreset);
    setShowFullPathInFilePaneTitle(d.showFullPathInFilePaneTitle);
  }, []);

  const refreshLicensedPlugins = useCallback(async () => {
    try {
      const rows = await listPlugins();
      const fw = rows.find((r) => r.manifest.id === FILE_WORKSPACE_PLUGIN_ID);
      setFileWorkspacePluginEnabled(fw ? fw.enabled && fw.entitlementOk : true);
      const px = rows.find((r) => r.manifest.id === PROXMUX_PLUGIN_ID);
      setProxmuxSidebarAvailable(Boolean(px && px.enabled && px.entitlementOk));
    } catch {
      setFileWorkspacePluginEnabled(true);
      setProxmuxSidebarAvailable(false);
    }
  }, []);

  useEffect(() => {
    void refreshLicensedPlugins();
  }, [refreshLicensedPlugins]);

  useEffect(() => {
    if (prevAppSettingsOpenRef.current && !isAppSettingsOpen) {
      void refreshLicensedPlugins();
    }
    prevAppSettingsOpenRef.current = isAppSettingsOpen;
  }, [isAppSettingsOpen, refreshLicensedPlugins]);

  useEffect(() => {
    if (!proxmuxSidebarAvailable) {
      proxmuxWarmupDoneRef.current = false;
      if (proxmuxWarmupTimerRef.current != null) {
        window.clearTimeout(proxmuxWarmupTimerRef.current);
        proxmuxWarmupTimerRef.current = null;
      }
      return;
    }
    if (proxmuxWarmupDoneRef.current) {
      return;
    }
    proxmuxWarmupDoneRef.current = true;
    const delayMs = 1_000 + Math.round(Math.random() * 2_000);
    proxmuxWarmupTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const raw = (await pluginInvoke(PROXMUX_PLUGIN_ID, "listState", {})) as {
            activeClusterId?: string | null;
            clusters?: Array<{ id: string }>;
          };
          const clusters = Array.isArray(raw.clusters) ? raw.clusters : [];
          const selectedClusterId =
            (raw.activeClusterId && clusters.some((cluster) => cluster.id === raw.activeClusterId)
              ? raw.activeClusterId
              : null) ?? clusters[0]?.id ?? null;
          if (!selectedClusterId) {
            return;
          }
          await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchResources", { clusterId: selectedClusterId });
        } catch {
          // Warmup is best effort only; foreground fetch handles hard errors.
        }
      })();
    }, delayMs);
    return () => {
      if (proxmuxWarmupTimerRef.current != null) {
        window.clearTimeout(proxmuxWarmupTimerRef.current);
        proxmuxWarmupTimerRef.current = null;
      }
    };
  }, [proxmuxSidebarAvailable]);

  useEffect(() => {
    if (!proxmuxSidebarAvailable) {
      if (proxmuxStartupWarmupTimerRef.current != null) {
        window.clearTimeout(proxmuxStartupWarmupTimerRef.current);
        proxmuxStartupWarmupTimerRef.current = null;
      }
      proxmuxStartupWarmupDoneRef.current = false;
      return;
    }
    if (!shouldRunProxmuxStartupWarmup(proxmuxSidebarAvailable, proxmuxStartupWarmupDoneRef.current)) {
      return;
    }
    const delayMs = computeProxmuxWarmupDelayMs(Math.random());
    proxmuxStartupWarmupTimerRef.current = window.setTimeout(() => {
      proxmuxStartupWarmupTimerRef.current = null;
      void (async () => {
        try {
          const raw = (await pluginInvoke(PROXMUX_PLUGIN_ID, "listState", {})) as {
            activeClusterId?: string | null;
            clusters?: Array<{ id?: unknown }>;
          };
          const clusters = Array.isArray(raw.clusters)
            ? raw.clusters
                .map((entry) => ({ id: typeof entry?.id === "string" ? entry.id : "" }))
                .filter((entry) => entry.id.length > 0)
            : [];
          const clusterId = selectProxmuxWarmupClusterId(raw.activeClusterId ?? null, clusters);
          if (!clusterId) {
            return;
          }
          await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchResources", { clusterId });
        } catch {
          // Best-effort warmup only; the sidebar performs explicit loads.
        } finally {
          proxmuxStartupWarmupDoneRef.current = true;
        }
      })();
    }, delayMs);
    return () => {
      if (proxmuxStartupWarmupTimerRef.current != null) {
        window.clearTimeout(proxmuxStartupWarmupTimerRef.current);
        proxmuxStartupWarmupTimerRef.current = null;
      }
    };
  }, [proxmuxSidebarAvailable]);

  useEffect(() => {
    if (!fileWorkspacePluginEnabled) {
      setSessionFileViews({});
    }
  }, [fileWorkspacePluginEnabled]);

  const isStackedShell = layoutMode === "compact" || (layoutMode === "auto" && viewportStacked);

  const verticalStackScrollEnabled = useMemo(
    () =>
      Boolean(workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes) &&
      !(isStackedShell && mobileShellTab === "terminal"),
    [activeWorkspaceId, isStackedShell, mobileShellTab, workspaceSnapshots],
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const metadata of Object.values(metadataStore.hosts)) {
      for (const tag of metadata.tags) {
        if (tag.trim().length > 0) {
          tagSet.add(tag.trim());
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [metadataStore.hosts]);
  const hostRows = useMemo<HostRowViewModel[]>(() => {
    return hosts.map((host) => {
      const metadata = metadataStore.hosts[host.host] ?? createDefaultHostMetadata();
      return {
        host,
        metadata,
        connected: connectedHosts.has(host.host),
        displayUser: host.user.trim() || metadataStore.defaultUser.trim() || "n/a",
      };
    });
  }, [connectedHosts, hosts, metadataStore.defaultUser, metadataStore.hosts]);
  const sortedViewProfiles = useMemo(
    () => [...viewProfiles].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [viewProfiles],
  );
  const selectedCustomViewProfile = useMemo(() => {
    if (!selectedSidebarViewId.startsWith("custom:")) {
      return null;
    }
    const id = selectedSidebarViewId.slice("custom:".length);
    return sortedViewProfiles.find((profile) => profile.id === id) ?? null;
  }, [selectedSidebarViewId, sortedViewProfiles]);
  const filteredHostRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const numericPort = Number(portFilter);
    const hasPortFilter = portFilter.trim().length > 0 && Number.isFinite(numericPort);
    return hostRows
      .filter((row) => {
        if (selectedSidebarViewId === "builtin:favorites" && !row.metadata.favorite) {
          return false;
        }
        if (selectedCustomViewProfile && !evaluateGroup(row, selectedCustomViewProfile.filterGroup)) {
          return false;
        }
        if (normalizedSearch.length > 0) {
          const haystack = `${row.host.host} ${row.host.hostName} ${row.displayUser}`.toLowerCase();
          if (!haystack.includes(normalizedSearch)) {
            return false;
          }
        }
        if (statusFilter === "connected" && !row.connected) {
          return false;
        }
        if (statusFilter === "disconnected" && row.connected) {
          return false;
        }
        if (selectedTagFilter !== "all" && !row.metadata.tags.includes(selectedTagFilter)) {
          return false;
        }
        if (hasPortFilter && row.host.port !== numericPort) {
          return false;
        }
        if (recentOnly && !row.metadata.lastUsedAt) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (recentOnly) {
          return (b.metadata.lastUsedAt ?? 0) - (a.metadata.lastUsedAt ?? 0);
        }
        if (selectedCustomViewProfile?.sortRules.length) {
          for (const sortRule of selectedCustomViewProfile.sortRules) {
            const factor = sortRule.direction === "asc" ? 1 : -1;
            let cmp = 0;
            switch (sortRule.field as ViewSortField) {
              case "host":
                cmp = a.host.host.localeCompare(b.host.host);
                break;
              case "hostName":
                cmp = a.host.hostName.localeCompare(b.host.hostName);
                break;
              case "user":
                cmp = a.displayUser.localeCompare(b.displayUser);
                break;
              case "port":
                cmp = a.host.port - b.host.port;
                break;
              case "lastUsedAt":
                cmp = (a.metadata.lastUsedAt ?? 0) - (b.metadata.lastUsedAt ?? 0);
                break;
              case "status":
                cmp = (a.connected ? 1 : 0) - (b.connected ? 1 : 0);
                break;
              case "favorite":
                cmp = (a.metadata.favorite ? 1 : 0) - (b.metadata.favorite ? 1 : 0);
                break;
              default:
                cmp = 0;
            }
            if (cmp !== 0) {
              return cmp * factor;
            }
          }
        }
        return a.host.host.localeCompare(b.host.host);
      });
  }, [hostRows, portFilter, recentOnly, searchQuery, selectedCustomViewProfile, selectedSidebarViewId, selectedTagFilter, statusFilter]);
  const connectedHostRows = useMemo(
    () => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => row.connected)),
    [filteredHostRows],
  );
  const otherHostRows = useMemo(
    () => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => !row.connected)),
    [filteredHostRows],
  );
  const sidebarViews = useMemo(() => {
    const views: Array<{ id: SidebarViewId; label: string }> = [
      { id: "builtin:all", label: "All" },
      { id: "builtin:favorites", label: "Favorites" },
      ...sortedViewProfiles.map((profile) => ({
        id: `custom:${profile.id}` as SidebarViewId,
        label: profile.name,
      })),
    ];
    if (proxmuxSidebarAvailable) {
      views.push({ id: "builtin:proxmux", label: "PROXMUX" });
    }
    return views;
  }, [sortedViewProfiles, proxmuxSidebarAvailable]);
  const highlightedHostAlias = useMemo(() => {
    if (hoveredHostAlias) {
      return hoveredHostAlias;
    }
    const normalized = activeHost.trim();
    return normalized.length > 0 ? normalized : null;
  }, [activeHost, hoveredHostAlias]);
  const highlightedHostPaneIndices = useMemo(() => {
    if (!highlightedHostAlias) {
      return new Set<number>();
    }
    const highlightedSessions = new Set(
      sessions
        .filter((session): session is SavedSshSessionTab => session.kind === "sshSaved")
        .filter((session) => session.hostAlias === highlightedHostAlias)
        .map((session) => session.id),
    );
    const paneIndices = new Set<number>();
    splitSlots.forEach((slot, paneIndex) => {
      if (slot && highlightedSessions.has(slot)) {
        paneIndices.add(paneIndex);
      }
    });
    return paneIndices;
  }, [highlightedHostAlias, sessions, splitSlots]);
  const hasHighlightedHostTargets = highlightedHostAlias !== null && highlightedHostPaneIndices.size > 0;
  const resolveSessionTitle = useCallback(
    (session: SessionTab | null): string => {
      if (!session) {
        return "Drop it on me";
      }
      if (session.kind === "local") {
        return session.label;
      }
      if (sessionIsWebLike(session)) {
        return session.label;
      }
      if (session.kind === "sshQuick") {
        return session.label;
      }
      const paneHostConfig = hosts.find((host) => host.host === session.hostAlias) ?? null;
      const paneUser = paneHostConfig?.user.trim() || metadataStore.defaultUser.trim() || "n/a";
      const paneHostName = paneHostConfig?.hostName.trim() || session.hostAlias;
      return `${paneUser}@${paneHostName}`;
    },
    [hosts, metadataStore.defaultUser],
  );
  useAppRefSync({
    sessionsRef,
    sessions,
    metadataStoreRef,
    metadataStore,
    quickConnectAutoTrustRef,
    quickConnectAutoTrust,
  });
  useEffect(() => {
    if (!activeTrustPrompt) {
      return;
    }
    setSaveTrustHostAsDefault(true);
  }, [activeTrustPrompt?.sessionId]);
  const onFilePaneTitleChange = useCallback((paneIndex: number, payload: { short: string; full: string } | null) => {
    if (payload === null) {
      delete filePaneTitlesRef.current[paneIndex];
    } else {
      filePaneTitlesRef.current[paneIndex] = payload;
    }
    setFilePaneTitleEpoch((n) => n + 1);
  }, []);

  const handleSessionWorkingDirectoryChange = useCallback((sid: string, path: string) => {
    if (sessionTerminalCwdRef.current[sid] === path) {
      return;
    }
    sessionTerminalCwdRef.current[sid] = path;
    setSessionTerminalCwdEpoch((n) => n + 1);
  }, []);

  const resolvePaneLabel = useCallback(
    (paneIndex: number): { display: string; title: string } => {
      const paneSessionId = splitSlots[paneIndex] ?? null;
      if (!paneSessionId) {
        const t = "Drop it on me";
        return { display: t, title: t };
      }
      const fileView = fileWorkspacePluginEnabled ? (sessionFileViews[paneSessionId] ?? "terminal") : "terminal";
      if (fileView === "local" || fileView === "remote") {
        const payload = filePaneTitlesRef.current[paneIndex];
        if (payload) {
          return {
            display: showFullPathInFilePaneTitle ? payload.full : payload.short,
            title: payload.full,
          };
        }
      }
      const paneSession = sessionById.get(paneSessionId) ?? null;
      const identity = resolveSessionTitle(paneSession);
      const cwd = sessionTerminalCwdRef.current[paneSessionId];
      if (cwd) {
        const shortCwd = shortenPathForPaneTitle(cwd, 44);
        return {
          display: `${identity} · ${shortCwd}`,
          title: `${identity} — ${cwd}`,
        };
      }
      return { display: identity, title: identity };
    },
    [
      resolveSessionTitle,
      sessionById,
      splitSlots,
      sessionFileViews,
      showFullPathInFilePaneTitle,
      filePaneTitleEpoch,
      fileWorkspacePluginEnabled,
      sessionTerminalCwdEpoch,
    ],
  );
  const load = async () => {
    const [loadedHosts, loadedMetadata, loadedProfiles, loadedViewProfiles, loadedStore] = await Promise.all([
      listHosts(),
      listHostMetadata(),
      listLayoutProfiles(),
      listViewProfiles(),
      listStoreObjects().catch(() => createDefaultEntityStore()),
    ]);
    setHosts(loadedHosts);
    setMetadataStore(loadedMetadata);
    setLayoutProfiles(loadedProfiles);
    setViewProfiles(loadedViewProfiles);
    setEntityStore(normalizeEntityStore(loadedStore));
    setSelectedLayoutProfileId((prev) => {
      if (prev && loadedProfiles.some((profile) => profile.id === prev)) {
        return prev;
      }
      return loadedProfiles[0]?.id ?? "";
    });
    if (loadedHosts.length > 0) {
      setActiveHost(loadedHosts[0].host);
    }
    setSelectedViewProfileIdInSettings((prev) => {
      if (prev && loadedViewProfiles.some((profile) => profile.id === prev)) {
        return prev;
      }
      return loadedViewProfiles[0]?.id ?? "";
    });
  };

  const handleSaveSshConfig = useCallback(async () => {
    setError("");
    try {
      await saveSshConfigRaw(sshConfigRaw);
      await load();
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [sshConfigRaw]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!isAppSettingsOpen || activeAppSettingsTab !== "connection" || connectionSubTab !== "ssh") {
      return;
    }
    let cancelled = false;
    void Promise.all([getSshConfigRaw(), getSshDirInfo()])
      .then(([raw, info]) => {
        if (!cancelled) {
          setSshConfigRaw(raw);
          setSshDirInfo(info);
          setSshDirOverrideDraft(info.overridePath ?? "");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAppSettingsOpen, activeAppSettingsTab, connectionSubTab]);

  const handleApplySshDirOverride = useCallback(async () => {
    setError("");
    try {
      const t = sshDirOverrideDraft.trim();
      await setSshDirOverride(t === "" ? null : t);
      const info = await getSshDirInfo();
      setSshDirInfo(info);
      setSshDirOverrideDraft(info.overridePath ?? "");
      await load();
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [sshDirOverrideDraft]);

  const handleResetSshDirOverride = useCallback(async () => {
    setError("");
    try {
      await setSshDirOverride(null);
      const info = await getSshDirInfo();
      setSshDirInfo(info);
      setSshDirOverrideDraft("");
      await load();
    } catch (e: unknown) {
      setError(String(e));
    }
  }, []);
  useWorkspaceBootstrapFromStorage({
    isApplyingWorkspaceSnapshotRef,
    setWorkspaceOrder,
    setWorkspaceSnapshots,
    setActiveWorkspaceId,
    setSplitSlots,
    setPaneLayouts,
    setSplitTree,
    setActivePaneIndex,
    setActiveSession,
  });

  const storeUsers = useMemo<UserObject[]>(() => Object.values(entityStore.users), [entityStore.users]);
  const storeGroups = useMemo<GroupObject[]>(() => Object.values(entityStore.groups), [entityStore.groups]);
  const storeTags = useMemo<TagObject[]>(() => Object.values(entityStore.tags), [entityStore.tags]);
  const storeKeys = useMemo<SshKeyObject[]>(() => Object.values(entityStore.keys), [entityStore.keys]);
  const quickConnectUserOptions = useMemo<string[]>(
    () => buildQuickConnectUserCandidates(metadataStore.defaultUser, storeUsers.map((entry) => entry.username || entry.name)),
    [metadataStore.defaultUser, storeUsers],
  );
  const persistEntityStore = useCallback(async (next: EntityStore) => {
    setEntityStore(next);
    await saveStoreObjects(next);
  }, []);

  const addStoreUser = useCallback(async () => {
    const username = storeUserDraft.trim();
    if (!username) {
      return;
    }
    const now = Date.now();
    const id = `user-${createId()}`;
    const next: EntityStore = {
      ...entityStore,
      users: {
        ...entityStore.users,
        [id]: {
          id,
          name: username,
          username,
          hostName: "",
          proxyJump: "",
          keyRefs: [],
          tagIds: [],
          createdAt: now,
          updatedAt: now,
        },
      },
      updatedAt: now,
    };
    setStoreUserDraft("");
    await persistEntityStore(next);
  }, [entityStore, persistEntityStore, storeUserDraft]);

  const addStoreGroup = useCallback(async () => {
    const name = storeGroupDraft.trim();
    if (!name) {
      return;
    }
    const now = Date.now();
    const id = `group-${createId()}`;
    const next: EntityStore = {
      ...entityStore,
      groups: {
        ...entityStore.groups,
        [id]: { id, name, memberUserIds: [], tagIds: [], createdAt: now, updatedAt: now },
      },
      updatedAt: now,
    };
    setStoreGroupDraft("");
    await persistEntityStore(next);
  }, [entityStore, persistEntityStore, storeGroupDraft]);

  const addStoreTag = useCallback(async () => {
    const name = storeTagDraft.trim();
    if (!name) {
      return;
    }
    const now = Date.now();
    const id = `tag-${createId()}`;
    const next: EntityStore = {
      ...entityStore,
      tags: {
        ...entityStore.tags,
        [id]: { id, name, createdAt: now, updatedAt: now },
      },
      updatedAt: now,
    };
    setStoreTagDraft("");
    await persistEntityStore(next);
  }, [entityStore, persistEntityStore, storeTagDraft]);

  const importStoreUsersFromHosts = useCallback(async () => {
    const seen = new Set(
      storeUsers.map((u) => (u.username || u.name).trim().toLowerCase()).filter(Boolean),
    );
    let next: EntityStore = { ...entityStore, users: { ...entityStore.users } };
    const now = Date.now();
    let added = false;
    for (const h of hosts) {
      const u = h.user?.trim();
      if (!u) {
        continue;
      }
      const key = u.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const id = `user-${createId()}`;
      next.users[id] = {
        id,
        name: u,
        username: u,
        hostName: "",
        proxyJump: "",
        keyRefs: [],
        tagIds: [],
        createdAt: now,
        updatedAt: now,
      };
      added = true;
    }
    if (!added) {
      return;
    }
    next.updatedAt = now;
    await persistEntityStore(next);
  }, [entityStore, hosts, persistEntityStore, storeUsers]);

  const updateStoreUser = useCallback(
    async (
      userId: string,
      patch: Partial<Pick<UserObject, "name" | "username" | "hostName" | "proxyJump" | "keyRefs" | "tagIds">>,
    ) => {
      const cur = entityStore.users[userId];
      if (!cur) {
        return;
      }
      const now = Date.now();
      await persistEntityStore({
        ...entityStore,
        users: {
          ...entityStore.users,
          [userId]: { ...cur, ...patch, updatedAt: now },
        },
        updatedAt: now,
      });
    },
    [entityStore, persistEntityStore],
  );

  const deleteStoreUser = useCallback(
    async (userId: string) => {
      const nextUsers = { ...entityStore.users };
      delete nextUsers[userId];
      const nextGroups: EntityStore["groups"] = Object.fromEntries(
        Object.entries(entityStore.groups).map(([gid, g]) => [
          gid,
          { ...g, memberUserIds: g.memberUserIds.filter((id) => id !== userId), updatedAt: Date.now() },
        ]),
      );
      const nextBindings: EntityStore["hostBindings"] = Object.fromEntries(
        Object.entries(entityStore.hostBindings).map(([alias, b]) => [
          alias,
          b.userId === userId ? { ...b, userId: undefined } : b,
        ]),
      );
      await persistEntityStore({
        ...entityStore,
        users: nextUsers,
        groups: nextGroups,
        hostBindings: nextBindings,
        updatedAt: Date.now(),
      });
    },
    [entityStore, persistEntityStore],
  );

  const setStoreUserGroupMembership = useCallback(
    async (userId: string, groupIds: string[]) => {
      const now = Date.now();
      const want = new Set(groupIds);
      const nextGroups = { ...entityStore.groups };
      for (const [gid, g] of Object.entries(nextGroups)) {
        const has = g.memberUserIds.includes(userId);
        const should = want.has(gid);
        if (has === should) {
          continue;
        }
        nextGroups[gid] = {
          ...g,
          memberUserIds: should
            ? [...g.memberUserIds, userId]
            : g.memberUserIds.filter((id) => id !== userId),
          updatedAt: now,
        };
      }
      await persistEntityStore({ ...entityStore, groups: nextGroups, updatedAt: now });
    },
    [entityStore, persistEntityStore],
  );

  const updateStoreGroup = useCallback(
    async (groupId: string, patch: Partial<Pick<GroupObject, "name" | "memberUserIds" | "tagIds">>) => {
      const cur = entityStore.groups[groupId];
      if (!cur) {
        return;
      }
      const now = Date.now();
      await persistEntityStore({
        ...entityStore,
        groups: {
          ...entityStore.groups,
          [groupId]: { ...cur, ...patch, updatedAt: now },
        },
        updatedAt: now,
      });
    },
    [entityStore, persistEntityStore],
  );

  const deleteStoreGroup = useCallback(
    async (groupId: string) => {
      const nextGroups = { ...entityStore.groups };
      delete nextGroups[groupId];
      const nextBindings: EntityStore["hostBindings"] = Object.fromEntries(
        Object.entries(entityStore.hostBindings).map(([alias, b]) => [
          alias,
          { ...b, groupIds: b.groupIds.filter((id) => id !== groupId) },
        ]),
      );
      await persistEntityStore({
        ...entityStore,
        groups: nextGroups,
        hostBindings: nextBindings,
        updatedAt: Date.now(),
      });
    },
    [entityStore, persistEntityStore],
  );

  const updateStoreTag = useCallback(
    async (tagId: string, name: string) => {
      const cur = entityStore.tags[tagId];
      if (!cur) {
        return;
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      const now = Date.now();
      await persistEntityStore({
        ...entityStore,
        tags: {
          ...entityStore.tags,
          [tagId]: { ...cur, name: trimmed, updatedAt: now },
        },
        updatedAt: now,
      });
    },
    [entityStore, persistEntityStore],
  );

  const deleteStoreTag = useCallback(
    async (tagId: string) => {
      const nextTags = { ...entityStore.tags };
      delete nextTags[tagId];
      const nextBindings: EntityStore["hostBindings"] = Object.fromEntries(
        Object.entries(entityStore.hostBindings).map(([alias, b]) => [
          alias,
          { ...b, tagIds: b.tagIds.filter((id) => id !== tagId) },
        ]),
      );
      const nextUsers: EntityStore["users"] = Object.fromEntries(
        Object.entries(entityStore.users).map(([id, u]) => [
          id,
          { ...u, tagIds: u.tagIds.filter((tid) => tid !== tagId) },
        ]),
      );
      const nextGroups: EntityStore["groups"] = Object.fromEntries(
        Object.entries(entityStore.groups).map(([id, g]) => [
          id,
          { ...g, tagIds: g.tagIds.filter((tid) => tid !== tagId) },
        ]),
      );
      const nextKeys: EntityStore["keys"] = Object.fromEntries(
        Object.entries(entityStore.keys).map(([kid, k]) => [
          kid,
          { ...k, tagIds: k.tagIds.filter((tid) => tid !== tagId) },
        ]),
      );
      await persistEntityStore({
        ...entityStore,
        tags: nextTags,
        hostBindings: nextBindings,
        users: nextUsers,
        groups: nextGroups,
        keys: nextKeys,
        updatedAt: Date.now(),
      });
    },
    [entityStore, persistEntityStore],
  );

  const patchStoreKey = useCallback(
    async (keyId: string, patch: { tagIds: string[] }) => {
      const cur = entityStore.keys[keyId];
      if (!cur) {
        return;
      }
      const now = Date.now();
      const nextKey: SshKeyObject =
        cur.type === "path"
          ? { ...cur, tagIds: patch.tagIds, updatedAt: now }
          : { ...cur, tagIds: patch.tagIds, updatedAt: now };
      await persistEntityStore({
        ...entityStore,
        keys: { ...entityStore.keys, [keyId]: nextKey },
        updatedAt: now,
      });
    },
    [entityStore, persistEntityStore],
  );

  const reorderUserStoreKeys = useCallback(
    async (userId: string, index: number, direction: "up" | "down") => {
      const user = entityStore.users[userId];
      if (!user || user.keyRefs.length < 2) {
        return;
      }
      const j = direction === "up" ? index - 1 : index + 1;
      if (j < 0 || j >= user.keyRefs.length) {
        return;
      }
      const refs = [...user.keyRefs];
      [refs[index], refs[j]] = [refs[j], refs[index]];
      const keyRefs = refs.map((r, i) => ({ ...r, usage: i === 0 ? "primary" : "additional" }));
      await updateStoreUser(userId, { keyRefs });
    },
    [entityStore.users, updateStoreUser],
  );

  const addStorePathKey = useCallback(async () => {
    const name = storePathKeyNameDraft.trim();
    const identityFilePath = storePathKeyPathDraft.trim();
    if (!name || !identityFilePath) {
      return;
    }
    const now = Date.now();
    const id = `key-path-${createId()}`;
    const key: SshKeyObject = {
      type: "path",
      id,
      name,
      identityFilePath,
      tagIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const next: EntityStore = {
      ...entityStore,
      keys: { ...entityStore.keys, [id]: key },
      updatedAt: now,
    };
    setStorePathKeyNameDraft("");
    setStorePathKeyPathDraft("");
    await persistEntityStore(next);
  }, [entityStore, persistEntityStore, storePathKeyNameDraft, storePathKeyPathDraft]);

  const addStoreEncryptedKey = useCallback(async () => {
    const name = storeEncryptedKeyNameDraft.trim();
    const privateKeyPem = storeEncryptedPrivateKeyDraft.trim();
    if (!name || !privateKeyPem) {
      return;
    }
    setError("");
    try {
      const created = await createEncryptedKey(
        name,
        privateKeyPem,
        storeEncryptedPublicKeyDraft.trim(),
        storePassphrase.trim() || undefined,
      );
      const withTags = { ...created, tagIds: created.tagIds ?? [] } as SshKeyObject;
      const next: EntityStore = {
        ...entityStore,
        keys: {
          ...entityStore.keys,
          [created.id]: withTags,
        },
        updatedAt: Date.now(),
      };
      setStoreEncryptedKeyNameDraft("");
      setStoreEncryptedPrivateKeyDraft("");
      setStoreEncryptedPublicKeyDraft("");
      await persistEntityStore(next);
    } catch (error: unknown) {
      setError(String(error));
    }
  }, [
    entityStore,
    persistEntityStore,
    storeEncryptedKeyNameDraft,
    storeEncryptedPrivateKeyDraft,
    storeEncryptedPublicKeyDraft,
    storePassphrase,
  ]);

  const removeStoreKey = useCallback(
    async (keyId: string) => {
      await deleteKeyById(keyId);
      const nextKeys = { ...entityStore.keys };
      delete nextKeys[keyId];
      const nextBindings: EntityStore["hostBindings"] = Object.fromEntries(
        Object.entries(entityStore.hostBindings).map(([alias, binding]) => [
          alias,
          { ...binding, keyRefs: binding.keyRefs.filter((entry) => entry.keyId !== keyId) },
        ]),
      );
      const nextUsers: EntityStore["users"] = Object.fromEntries(
        Object.entries(entityStore.users).map(([id, user]) => [
          id,
          { ...user, keyRefs: user.keyRefs.filter((entry) => entry.keyId !== keyId) },
        ]),
      );
      await persistEntityStore({
        ...entityStore,
        keys: nextKeys,
        hostBindings: nextBindings,
        users: nextUsers,
        updatedAt: Date.now(),
      });
    },
    [entityStore, persistEntityStore],
  );

  const unlockStoreKey = useCallback(
    async (keyId: string) => {
      setError("");
      try {
        await unlockKeyMaterial(keyId, storePassphrase.trim() || undefined);
      } catch (error: unknown) {
        setError(String(error));
      }
    },
    [storePassphrase],
  );

  const clearPendingRemoveHostsTab = useCallback(() => {
    if (removeHostsTabTimerRef.current) {
      clearTimeout(removeHostsTabTimerRef.current);
      removeHostsTabTimerRef.current = null;
    }
    setPendingRemoveHostsTab(false);
  }, []);

  const loadHostIntoSettingsEditor = useCallback(
    (alias: string) => {
      const trimmed = alias.trim();
      const h = hosts.find((x) => x.host === trimmed);
      if (!h) {
        return;
      }
      const draft = sidebarSavedHostBinding(trimmed, hosts, entityStore, metadataStore.hosts);
      const synced = syncSidebarHostWithStore(h, draft, storeKeys, storeUsers, hosts, metadataStore.hosts);
      clearPendingRemoveHostsTab();
      setHostSettingsSelectedAlias(trimmed);
      setHostSettingsDraftHost(synced.host);
      setHostSettingsDraftBinding(synced.binding);
      setHostSettingsTagDraft((metadataStore.hosts[trimmed]?.tags ?? []).join(", "));
      setHostSettingsKeyPolicy(
        effectiveStrictHostKeyPolicy(metadataStore.hosts[trimmed] ?? createDefaultHostMetadata()),
      );
    },
    [hosts, entityStore, metadataStore.hosts, storeKeys, storeUsers, clearPendingRemoveHostsTab],
  );

  const onHostSettingsSelectAlias = useCallback(
    (alias: string) => {
      const trimmed = alias.trim();
      if (!trimmed || trimmed === hostSettingsSelectedAlias) {
        return;
      }
      loadHostIntoSettingsEditor(trimmed);
    },
    [hostSettingsSelectedAlias, loadHostIntoSettingsEditor],
  );

  const openHostSettingsForHost = useCallback(
    (alias: string) => {
      loadHostIntoSettingsEditor(alias);
      setActiveAppSettingsTab("connection");
      setConnectionSubTab("hosts");
      setIsAppSettingsOpen(true);
    },
    [loadHostIntoSettingsEditor],
  );

  useEffect(() => {
    if (activeAppSettingsTab !== "connection" || connectionSubTab !== "hosts") {
      return;
    }
    if (hosts.length === 0) {
      setHostSettingsSelectedAlias("");
      return;
    }
    const valid = Boolean(hostSettingsSelectedAlias && hosts.some((x) => x.host === hostSettingsSelectedAlias));
    if (!valid) {
      loadHostIntoSettingsEditor(hosts[0].host);
    }
  }, [activeAppSettingsTab, connectionSubTab, hosts, hostSettingsSelectedAlias, loadHostIntoSettingsEditor]);

  useEffect(() => {
    if (activeAppSettingsTab !== "connection" || connectionSubTab !== "hosts") {
      clearPendingRemoveHostsTab();
    }
  }, [activeAppSettingsTab, connectionSubTab, clearPendingRemoveHostsTab]);

  useSessionOutputTrustListener({
    sessionsRef,
    quickConnectAutoTrustRef,
    metadataStoreRef,
    setError,
    setTrustPromptQueue,
  });

  useEffect(() => {
    if (import.meta.env.VITE_E2E === "true") {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen<FileDragPayload>("nossuck-file-clipboard", (ev) => {
      setFileTransferClipboardFromEvent(ev.payload as FileDragPayload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* plain Vite preview without Tauri */
      });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_E2E === "true") {
      return;
    }
    type ProxmoxAssistAutoPayload = { webviewLabel: string; consoleUrl: string };
    let unlisten: (() => void) | undefined;
    void listen<ProxmoxAssistAutoPayload>("proxmox-web-assist-auto-console", (ev) => {
      const { webviewLabel } = ev.payload;
      setProxmoxWebLoginAssist((prev) => {
        if (prev?.label !== webviewLabel) {
          return prev;
        }
        return null;
      });
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* plain Vite preview without Tauri */
      });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const pendingProfileSessionIds = pendingProfileLoadSessionIdsRef.current;
    if (pendingProfileSessionIds && pendingProfileSessionIds.size > 0) {
      const hasAllPendingSessionIds = Array.from(pendingProfileSessionIds).every((id) => sessionIds.includes(id));
      if (!hasAllPendingSessionIds) {
        setBroadcastTargets((prev) => sanitizeBroadcastTargets(prev, sessionIds));
        setTrustPromptQueue((prev) => prev.filter((entry) => sessionIds.includes(entry.sessionId)));
        return;
      }
      pendingProfileLoadSessionIdsRef.current = null;
    }
    setSplitSlots((prev) => {
      const cleaned = prev.map((slot) => {
        if (!slot) {
          return null;
        }
        return sessionIds.includes(slot) ? slot : null;
      });
      return cleaned.length > 0 ? cleaned : [null];
    });
    setBroadcastTargets((prev) => sanitizeBroadcastTargets(prev, sessionIds));
    setTrustPromptQueue((prev) => prev.filter((entry) => sessionIds.includes(entry.sessionId)));
  }, [sessionIds]);

  useEffect(() => {
    setSessionFileViews((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [sid, view] of Object.entries(prev)) {
        if (view !== "remote") {
          continue;
        }
        const session = sessions.find((s) => s.id === sid);
        if (!session || session.kind !== "sshSaved") {
          continue;
        }
        if (!hosts.some((h) => h.host === session.hostAlias)) {
          delete next[sid];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hosts, sessions]);

  useEffect(() => {
    const assignedSessionIds = new Set<string>([
      ...Object.values(workspaceSnapshots).flatMap((workspace) => workspace.splitSlots),
      ...splitSlots,
    ].filter((slot): slot is string => Boolean(slot)));
    const orphanSessionIds = sessions
      .map((session) => session.id)
      .filter((sessionId) => !assignedSessionIds.has(sessionId));
    const orphanSet = new Set(orphanSessionIds);

    orphanSeenSessionIdsRef.current.forEach((sessionId) => {
      if (!orphanSet.has(sessionId)) {
        orphanSeenSessionIdsRef.current.delete(sessionId);
      }
    });

    orphanSessionIds.forEach((sessionId) => {
      if (orphanClosingSessionIdsRef.current.has(sessionId)) {
        return;
      }
      if (!orphanSeenSessionIdsRef.current.has(sessionId)) {
        orphanSeenSessionIdsRef.current.add(sessionId);
        return;
      }

      orphanClosingSessionIdsRef.current.add(sessionId);
      void closeSession(sessionId)
        .catch((error) => {
          setError(`Failed to close unassigned session: ${String(error)}`);
        })
        .finally(() => {
          setSessions((prev) => prev.filter((session) => session.id !== sessionId));
          setActiveSession((prev) => (prev === sessionId ? "" : prev));
          setSplitSlots((prev) => removeSessionFromSlots(prev, sessionId));
          setWorkspaceSnapshots((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([workspaceId, snapshot]) => [
                workspaceId,
                {
                  ...snapshot,
                  splitSlots: removeSessionFromSlots(snapshot.splitSlots, sessionId),
                  activeSessionId: snapshot.activeSessionId === sessionId ? "" : snapshot.activeSessionId,
                },
              ]),
            ),
          );
          setBroadcastTargets((prev) => {
            const nextSet = new Set(prev);
            nextSet.delete(sessionId);
            return nextSet;
          });
          setTrustPromptQueue((prev) => prev.filter((entry) => entry.sessionId !== sessionId));
          delete sessionTerminalCwdRef.current[sessionId];
          setSessionTerminalCwdEpoch((n) => n + 1);
          orphanSeenSessionIdsRef.current.delete(sessionId);
          orphanClosingSessionIdsRef.current.delete(sessionId);
        });
    });
  }, [sessions, splitSlots, workspaceSnapshots]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("nosuckshell:terminal-fit-request"));
    }, 80);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeSession, splitSlots, splitTree]);

  useEffect(() => {
    const maxPaneIndex = splitSlots.length - 1;
    if (nextPaneIndexRef.current <= maxPaneIndex) {
      nextPaneIndexRef.current = maxPaneIndex + 1;
    }
    setPaneLayouts((prev) => reconcilePaneLayouts(prev, splitSlots));
  }, [splitSlots]);

  useEffect(() => {
    setActivePaneIndex((prev) => {
      if (paneOrder.length === 0) {
        return 0;
      }
      if (paneOrder.includes(prev)) {
        return prev;
      }
      return paneOrder[0] ?? 0;
    });
  }, [paneOrder]);
  useEffect(() => {
    if (isApplyingWorkspaceSnapshotRef.current) {
      return;
    }
    setWorkspaceSnapshots((prev) => {
      const current = prev[activeWorkspaceId];
      if (!current) {
        return prev;
      }
      const sameSlots =
        current.splitSlots.length === splitSlots.length &&
        current.splitSlots.every((slot, index) => slot === splitSlots[index]);
      const sameLayouts =
        current.paneLayouts.length === paneLayouts.length &&
        current.paneLayouts.every(
          (entry, index) =>
            entry.id === paneLayouts[index]?.id &&
            entry.width === paneLayouts[index]?.width &&
            entry.height === paneLayouts[index]?.height,
        );
      const sameActive = current.activePaneIndex === activePaneIndex && current.activeSessionId === activeSession;
      const sameTree = JSON.stringify(current.splitTree) === JSON.stringify(splitTree);
      if (sameSlots && sameLayouts && sameActive && sameTree) {
        return prev;
      }
      return {
        ...prev,
        [activeWorkspaceId]: {
          ...current,
          splitSlots: [...splitSlots],
          paneLayouts: clonePaneLayouts(paneLayouts),
          splitTree: cloneSplitTree(splitTree),
          activePaneIndex,
          activeSessionId: activeSession,
        },
      };
    });
  }, [activePaneIndex, activeSession, activeWorkspaceId, paneLayouts, splitSlots, splitTree]);
  useEffect(() => {
    if (autoArrangeMode === "a" || autoArrangeMode === "b" || autoArrangeMode === "c") {
      lastAutoArrangeBeforeFreeRef.current = autoArrangeMode;
    }
  }, [autoArrangeMode]);

  useEffect(() => {
    if (autoArrangeMode === "off" || autoArrangeMode === "free") {
      return;
    }
    if (isAutoArrangeApplyingRef.current) {
      return;
    }
    const nextSplitTree = rebalanceSplitTree(splitTree);
    const nextSplitSlots = compactSplitSlotsByPaneOrder(splitSlots, paneOrder);
    const shouldRebalanceTree = autoArrangeMode === "b" || autoArrangeMode === "c";
    const shouldCompactSlots = autoArrangeMode === "a" || autoArrangeMode === "c";
    const splitTreeChanged = shouldRebalanceTree && nextSplitTree !== splitTree;
    const splitSlotsChanged = shouldCompactSlots && nextSplitSlots !== splitSlots;
    if (!splitTreeChanged && !splitSlotsChanged) {
      return;
    }
    isAutoArrangeApplyingRef.current = true;
    if (splitTreeChanged) {
      setSplitTree(nextSplitTree);
    }
    if (splitSlotsChanged) {
      setSplitSlots(nextSplitSlots);
    }
    queueMicrotask(() => {
      isAutoArrangeApplyingRef.current = false;
    });
  }, [autoArrangeMode, paneOrder, splitSlots, splitTree]);

  useEffect(() => {
    if (!contextMenu.visible && !hostContextMenu) {
      return;
    }
    const hide = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      setHostContextMenu(null);
    };
    window.addEventListener("click", hide);
    return () => {
      window.removeEventListener("click", hide);
    };
  }, [contextMenu.visible, hostContextMenu]);

  useEffect(() => {
    const paneMenuOpen = contextMenu.visible && contextMenu.paneIndex !== null;
    if (!paneMenuOpen && !hostContextMenu) {
      return;
    }
    const blockNativeMenuOutsideOverlay = (e: Event) => {
      const ev = e as MouseEvent;
      const t = ev.target;
      if (!(t instanceof Element)) {
        return;
      }
      if (t.closest(".context-menu")) {
        return;
      }
      ev.preventDefault();
    };
    document.addEventListener("contextmenu", blockNativeMenuOutsideOverlay, true);
    return () => document.removeEventListener("contextmenu", blockNativeMenuOutsideOverlay, true);
  }, [contextMenu.visible, contextMenu.paneIndex, hostContextMenu]);

  useEffect(() => {
    if (!contextMenu.visible) {
      return;
    }
    const syncSplitModeFromModifier = (event: KeyboardEvent) => {
      setContextMenu((prev) => {
        if (!prev.visible) {
          return prev;
        }
        const nextMode: SplitMode = shouldSplitAsEmpty(event) ? "empty" : "duplicate";
        if (prev.splitMode === nextMode) {
          return prev;
        }
        return { ...prev, splitMode: nextMode };
      });
    };
    window.addEventListener("keydown", syncSplitModeFromModifier);
    window.addEventListener("keyup", syncSplitModeFromModifier);
    return () => {
      window.removeEventListener("keydown", syncSplitModeFromModifier);
      window.removeEventListener("keyup", syncSplitModeFromModifier);
    };
  }, [contextMenu.visible]);

  useEffect(() => {
    setPendingLayoutProfileDeleteId((prev) => (prev === selectedLayoutProfileId ? prev : ""));
  }, [selectedLayoutProfileId]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, String(isSidebarPinned));
    if (isSidebarPinned) {
      setIsSidebarVisible(true);
    }
  }, [isSidebarPinned]);
  useEffect(() => {
    window.localStorage.setItem(DENSITY_PROFILE_STORAGE_KEY, densityProfile);
  }, [densityProfile]);
  useEffect(() => {
    window.localStorage.setItem(UI_DENSITY_OFFSET_STORAGE_KEY, String(uiDensityOffset));
  }, [uiDensityOffset]);
  useEffect(() => {
    window.localStorage.setItem(LIST_TONE_PRESET_STORAGE_KEY, listTonePreset);
  }, [listTonePreset]);
  useEffect(() => {
    window.localStorage.setItem(FRAME_MODE_PRESET_STORAGE_KEY, frameModePreset);
  }, [frameModePreset]);
  useEffect(() => {
    window.localStorage.setItem(FILE_PANE_SHOW_FULL_PATH_IN_PANE_TITLE_KEY, String(showFullPathInFilePaneTitle));
  }, [showFullPathInFilePaneTitle]);
  useEffect(() => {
    writeFilePaneSemanticNameColorsToStorage(filePaneSemanticNameColors);
  }, [filePaneSemanticNameColors]);
  useEffect(() => {
    applyFilePaneSemanticNameColorVarsToDocument(filePaneSemanticNameColors.colors);
  }, [filePaneSemanticNameColors.colors]);
  useEffect(() => {
    window.localStorage.setItem(FILE_EXPORT_DEST_MODE_STORAGE_KEY, fileExportDestMode);
  }, [fileExportDestMode]);
  useEffect(() => {
    window.localStorage.setItem(FILE_EXPORT_PATH_KEY_STORAGE_KEY, fileExportPathKey);
  }, [fileExportPathKey]);
  useEffect(() => {
    window.localStorage.setItem(FILE_EXPORT_ARCHIVE_FORMAT_STORAGE_KEY, fileExportArchiveFormat);
  }, [fileExportArchiveFormat]);
  useEffect(() => {
    window.localStorage.setItem(TERMINAL_FONT_OFFSET_STORAGE_KEY, String(terminalFontOffset));
  }, [terminalFontOffset]);
  useEffect(() => {
    window.localStorage.setItem(UI_FONT_PRESET_STORAGE_KEY, uiFontPreset);
  }, [uiFontPreset]);
  useEffect(() => {
    window.localStorage.setItem(TERMINAL_FONT_PRESET_STORAGE_KEY, terminalFontPreset);
  }, [terminalFontPreset]);
  useEffect(() => {
    window.localStorage.setItem(QUICK_CONNECT_MODE_STORAGE_KEY, quickConnectMode);
  }, [quickConnectMode]);
  useEffect(() => {
    window.localStorage.setItem(QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY, String(quickConnectAutoTrust));
  }, [quickConnectAutoTrust]);
  useEffect(() => {
    window.localStorage.setItem(SPLIT_RATIO_PRESET_STORAGE_KEY, splitRatioPreset);
  }, [splitRatioPreset]);
  useEffect(() => {
    window.localStorage.setItem(AUTO_ARRANGE_MODE_STORAGE_KEY, autoArrangeMode);
  }, [autoArrangeMode]);
  useEffect(() => {
    window.localStorage.setItem(SETTINGS_OPEN_MODE_STORAGE_KEY, settingsOpenMode);
  }, [settingsOpenMode]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, selectedSidebarViewId);
  }, [selectedSidebarViewId]);
  useEffect(() => {
    window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode);
  }, [layoutMode]);
  useEffect(() => {
    window.localStorage.setItem(PROXMUX_OPEN_WEB_CONSOLES_IN_PANE_KEY, String(proxmuxOpenWebConsolesInPane));
  }, [proxmuxOpenWebConsolesInPane]);
  useWorkspacePersistToStorage(workspaceOrder, activeWorkspaceId, workspaceSnapshots);
  useEffect(() => {
    if (!isAppSettingsOpen || settingsOpenMode !== "modal" || settingsModalPosition) {
      return;
    }
    const modal = settingsModalRef.current;
    const width = modal?.offsetWidth ?? 860;
    const topMargin = 20;
    const x = Math.max(8, Math.round((window.innerWidth - width) / 2));
    const y = Math.max(topMargin, Math.round((window.innerHeight - Math.min(820, window.innerHeight - 40)) / 2));
    setSettingsModalPosition({ x, y });
  }, [isAppSettingsOpen, settingsModalPosition, settingsOpenMode]);
  useEffect(() => {
    if (!isSettingsDragging) {
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const dragOffset = settingsDragOffsetRef.current;
      const modal = settingsModalRef.current;
      if (!dragOffset || !modal) {
        return;
      }
      const modalWidth = modal.offsetWidth;
      const modalHeight = modal.offsetHeight;
      const nextX = Math.min(
        Math.max(8, event.clientX - dragOffset.x),
        Math.max(8, window.innerWidth - modalWidth - 8),
      );
      const nextY = Math.min(
        Math.max(8, event.clientY - dragOffset.y),
        Math.max(8, window.innerHeight - modalHeight - 8),
      );
      setSettingsModalPosition({ x: Math.round(nextX), y: Math.round(nextY) });
    };
    const onPointerUp = () => {
      setIsSettingsDragging(false);
      settingsDragOffsetRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isSettingsDragging]);
  useEffect(() => {
    if (isAppSettingsOpen) {
      return;
    }
    setIsSettingsDragging(false);
    settingsDragOffsetRef.current = null;
  }, [isAppSettingsOpen]);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_STACKED_MEDIA);
    const apply = () => {
      setViewportStacked(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
    };
  }, []);
  useEffect(() => {
    if (!isStackedShell || mobileShellTab !== "hosts") {
      return;
    }
    setIsSidebarVisible(true);
  }, [isStackedShell, mobileShellTab]);
  useEffect(() => {
    if (!selectedSidebarViewId.startsWith("custom:")) {
      return;
    }
    const id = selectedSidebarViewId.slice("custom:".length);
    if (!viewProfiles.some((profile) => profile.id === id)) {
      setSelectedSidebarViewId("builtin:all");
    }
  }, [selectedSidebarViewId, viewProfiles]);
  useEffect(() => {
    if (selectedSidebarViewId === "builtin:proxmux" && !proxmuxSidebarAvailable) {
      setSelectedSidebarViewId("builtin:all");
    }
  }, [selectedSidebarViewId, proxmuxSidebarAvailable]);
  useEffect(() => {
    if (selectedSidebarViewId === "builtin:proxmux") {
      setShowAdvancedFilters(false);
    }
  }, [selectedSidebarViewId]);
  useEffect(() => {
    if (!selectedViewProfileIdInSettings) {
      return;
    }
    const profile = viewProfiles.find((entry) => entry.id === selectedViewProfileIdInSettings);
    if (profile) {
      setViewDraft(profile);
    }
  }, [selectedViewProfileIdInSettings, viewProfiles]);

  useEffect(() => {
    if (!isSidebarResizing) {
      return;
    }

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const delta = event.clientX - sidebarDragStartXRef.current;
      setSidebarWidth(clampSidebarWidth(sidebarDragStartWidthRef.current + delta));
    };

    const onPointerUp = () => {
      setIsSidebarResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isSidebarResizing]);

  useEffect(() => {
    if (!splitResizeState) {
      return;
    }
    splitResizeLatestRatioRef.current = null;
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const container = splitNodeRefs.current[splitResizeState.splitId];
      if (!container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const nextRatio =
        splitResizeState.axis === "horizontal"
          ? (event.clientX - bounds.left) / bounds.width
          : (event.clientY - bounds.top) / bounds.height;
      splitResizeLatestRatioRef.current = nextRatio;
      if (splitResizeRafRef.current === null) {
        splitResizeRafRef.current = window.requestAnimationFrame(() => {
          splitResizeRafRef.current = null;
          const latestRatio = splitResizeLatestRatioRef.current;
          if (latestRatio === null) {
            return;
          }
          setSplitTree((prev) => updateSplitRatioInTree(prev, splitResizeState.splitId, latestRatio));
        });
      }
    };
    const onPointerUp = () => {
      if (splitResizeRafRef.current !== null) {
        window.cancelAnimationFrame(splitResizeRafRef.current);
        splitResizeRafRef.current = null;
      }
      setSplitResizeState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      if (splitResizeRafRef.current !== null) {
        window.cancelAnimationFrame(splitResizeRafRef.current);
        splitResizeRafRef.current = null;
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [splitResizeState]);

  useEffect(() => {
    if (!isQuickAddMenuOpen) {
      return;
    }
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (quickAddMenuRef.current && !quickAddMenuRef.current.contains(target)) {
        setIsQuickAddMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isQuickAddMenuOpen]);

  useEffect(() => {
    return () => {
      if (removeConfirmResetTimerRef.current) {
        clearTimeout(removeConfirmResetTimerRef.current);
      }
      if (closeAllConfirmResetTimerRef.current) {
        clearTimeout(closeAllConfirmResetTimerRef.current);
      }
      if (hideSidebarTimeoutRef.current) {
        clearTimeout(hideSidebarTimeoutRef.current);
      }
    };
  }, []);

  const clearSidebarHideTimeout = useCallback(() => {
    if (hideSidebarTimeoutRef.current) {
      clearTimeout(hideSidebarTimeoutRef.current);
      hideSidebarTimeoutRef.current = null;
    }
  }, []);


  const clearPendingCloseAllIntent = useCallback(() => {
    if (closeAllConfirmResetTimerRef.current) {
      clearTimeout(closeAllConfirmResetTimerRef.current);
      closeAllConfirmResetTimerRef.current = null;
    }
    setPendingCloseAllIntent(null);
  }, []);
  const armPendingCloseAllIntent = useCallback((intent: "close" | "reset") => {
    if (closeAllConfirmResetTimerRef.current) {
      clearTimeout(closeAllConfirmResetTimerRef.current);
    }
    setPendingCloseAllIntent(intent);
    closeAllConfirmResetTimerRef.current = setTimeout(() => {
      setPendingCloseAllIntent(null);
      closeAllConfirmResetTimerRef.current = null;
    }, 2600);
  }, []);

  const persistMetadataStore = async (next: HostMetadataStore) => {
    setMetadataStore(next);
    await saveHostMetadata(next);
  };

  const upsertHostMetadata = async (hostAlias: string, updater: (current: HostMetadata) => HostMetadata) => {
    const current = metadataStore.hosts[hostAlias] ?? createDefaultHostMetadata();
    const nextMetadata = updater(current);
    const nextStore: HostMetadataStore = {
      ...metadataStore,
      hosts: {
        ...metadataStore.hosts,
        [hostAlias]: nextMetadata,
      },
    };
    await persistMetadataStore(nextStore);
  };

  const applyDefaultUser = async (value: string) => {
    const nextStore: HostMetadataStore = {
      ...metadataStore,
      defaultUser: value.trim(),
    };
    await persistMetadataStore(nextStore);
  };

  const saveHostTagsAndKeyPolicy = async (
    hostAlias: string,
    tagsCommaSeparated: string,
    policy: StrictHostKeyPolicy,
  ) => {
    if (!hostAlias.trim()) {
      return;
    }
    const normalizedTags = Array.from(
      new Set(
        tagsCommaSeparated
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    const isJumpHost = normalizedTags.includes(JUMP_HOST_METADATA_TAG);
    await upsertHostMetadata(hostAlias, (current) => ({
      ...current,
      tags: normalizedTags,
      isJumpHost,
      ...metadataPatchForHostKeyPolicy(policy),
    }));
  };

  const toggleFavoriteForHost = async (hostAlias: string) => {
    try {
      await upsertHostMetadata(hostAlias, (current) => ({
        ...current,
        favorite: !current.favorite,
      }));
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleJumpHostForHost = async (hostAlias: string) => {
    try {
      let nextTags: string[] = [];
      await upsertHostMetadata(hostAlias, (current) => {
        const nextJump = !hostMetadataIsJumpHost(current);
        nextTags = withJumpHostTagSync(current.tags, nextJump);
        return {
          ...current,
          isJumpHost: nextJump,
          tags: nextTags,
        };
      });
      if (hostSettingsSelectedAlias === hostAlias) {
        setHostSettingsTagDraft(nextTags.join(", "));
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setRecentOnly(false);
    setSelectedTagFilter("all");
    setPortFilter("");
    setShowAdvancedFilters(false);
  };

  const closeAdvancedFilters = useCallback(() => {
    setShowAdvancedFilters(false);
  }, []);

  const selectViewProfileForSettings = (profileId: string) => {
    setSelectedViewProfileIdInSettings(profileId);
    const profile = viewProfiles.find((entry) => entry.id === profileId);
    if (profile) {
      setViewDraft(profile);
    }
  };

  const createViewRule = (): ViewFilterRule => createEmptyViewFilterRule();

  const createNewViewDraft = () => {
    setViewDraft(createDefaultViewProfile());
    setSelectedViewProfileIdInSettings("");
  };

  const saveCurrentViewDraft = async () => {
    const normalizedName = viewDraft.name.trim();
    if (!normalizedName) {
      setError("View name is required.");
      return;
    }
    const now = Date.now();
    const nextProfile: ViewProfile = {
      ...viewDraft,
      name: normalizedName,
      order:
        selectedViewProfileIdInSettings.length > 0
          ? viewDraft.order
          : viewProfiles.length,
      createdAt: viewDraft.createdAt || now,
      updatedAt: now,
    };
    try {
      await saveViewProfile(nextProfile);
      await load();
      setSelectedViewProfileIdInSettings(nextProfile.id);
      setViewDraft(nextProfile);
      setSelectedSidebarViewId(`custom:${nextProfile.id}`);
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteCurrentViewDraft = async () => {
    if (!selectedViewProfileIdInSettings) {
      return;
    }
    try {
      await deleteViewProfile(selectedViewProfileIdInSettings);
      await load();
      if (selectedSidebarViewId === `custom:${selectedViewProfileIdInSettings}`) {
        setSelectedSidebarViewId("builtin:all");
      }
      createNewViewDraft();
    } catch (e) {
      setError(String(e));
    }
  };

  const reorderView = async (direction: "up" | "down") => {
    if (!selectedViewProfileIdInSettings) {
      return;
    }
    const sorted = [...viewProfiles].sort((a, b) => a.order - b.order);
    const currentIndex = sorted.findIndex((entry) => entry.id === selectedViewProfileIdInSettings);
    if (currentIndex === -1) {
      return;
    }
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) {
      return;
    }
    const next = [...sorted];
    const [item] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, item);
    try {
      await reorderViewProfiles(next.map((entry) => entry.id));
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleExportBackup = async () => {
    setBackupMessage("");
    const path = backupExportPath.trim();
    const password = backupExportPassword;
    if (!path) {
      setBackupMessage("Export failed: Backup path is required.");
      return;
    }
    if (!password) {
      setBackupMessage("Export failed: Backup password is required.");
      return;
    }
    try {
      await exportBackup(path, password);
      setBackupMessage("Backup exported.");
    } catch (e) {
      setBackupMessage(`Export failed: ${String(e)}`);
    } finally {
      setBackupExportPassword("");
    }
  };

  const handleImportBackup = async () => {
    setBackupMessage("");
    const path = backupImportPath.trim();
    const password = backupImportPassword;
    if (!path) {
      setBackupMessage("Import failed: Backup path is required.");
      return;
    }
    if (!password) {
      setBackupMessage("Import failed: Backup password is required.");
      return;
    }
    try {
      await importBackup(path, password);
      await load();
      setBackupMessage("Backup imported.");
    } catch (e) {
      setBackupMessage(`Import failed: ${String(e)}`);
    } finally {
      setBackupImportPassword("");
    }
  };

  const handleExportResolvedOpensshConfig = useCallback(
    async (includeStrictHostKey: boolean) => {
      setError("");
      try {
        const picked = await saveDialog({
          title: "Export resolved SSH config",
          defaultPath: "nosuckshell-resolved.conf",
          filters: [{ name: "SSH config", extensions: ["conf", "config"] }],
        });
        if (picked === null || picked === undefined) {
          return;
        }
        const targetPath = Array.isArray(picked) ? picked[0] : picked;
        if (!targetPath) {
          return;
        }
        await exportResolvedOpensshConfigToPath(targetPath, includeStrictHostKey);
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const onDelete = async (hostAlias: string) => {
    const normalizedAlias = hostAlias.trim();
    if (!normalizedAlias) {
      return;
    }
    if (!hosts.some((item) => item.host === normalizedAlias)) {
      return;
    }

    setError("");
    try {
      await deleteHost(normalizedAlias);
      const nextHosts = { ...metadataStore.hosts };
      delete nextHosts[normalizedAlias];
      await persistMetadataStore({
        ...metadataStore,
        hosts: nextHosts,
      });
      if (activeHost === normalizedAlias) {
        setActiveHost("");
      }
      clearPendingRemoveHostsTab();
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const saveHostFromSettingsTab = useCallback(async () => {
    const alias = hostSettingsDraftHost.host.trim();
    if (!alias) {
      return;
    }
    setError("");
    try {
      const synced = syncSidebarHostWithStore(
        hostSettingsDraftHost,
        hostSettingsDraftBinding,
        storeKeys,
        storeUsers,
        hosts,
        metadataStore.hosts,
      );
      await saveHost(synced.host);
      await persistEntityStore({
        ...entityStore,
        hostBindings: { ...entityStore.hostBindings, [alias]: synced.binding },
        updatedAt: Date.now(),
      });
      await saveHostTagsAndKeyPolicy(alias, hostSettingsTagDraft, hostSettingsKeyPolicy);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }, [
    hostSettingsDraftHost,
    hostSettingsDraftBinding,
    storeKeys,
    storeUsers,
    hosts,
    metadataStore.hosts,
    entityStore,
    hostSettingsTagDraft,
    hostSettingsKeyPolicy,
    persistEntityStore,
  ]);

  const onRemoveHostSettingsTabIntent = useCallback(() => {
    const alias = hostSettingsSelectedAlias.trim();
    if (!alias || !hosts.some((h) => h.host === alias)) {
      return;
    }
    if (pendingRemoveHostsTab) {
      clearPendingRemoveHostsTab();
      void onDelete(alias);
      return;
    }
    setPendingRemoveHostsTab(true);
    if (removeHostsTabTimerRef.current) {
      clearTimeout(removeHostsTabTimerRef.current);
    }
    removeHostsTabTimerRef.current = setTimeout(() => {
      setPendingRemoveHostsTab(false);
      removeHostsTabTimerRef.current = null;
    }, 2200);
  }, [hostSettingsSelectedAlias, hosts, pendingRemoveHostsTab, clearPendingRemoveHostsTab, onDelete]);


  const openAddHostModal = () => {
    setNewHostDraft(emptyHost());
    setAddHostBindingDraft(createDefaultHostBinding());
    setIsQuickAddMenuOpen(false);
    setIsAddHostModalOpen(true);
  };

  const closeAddHostModal = () => {
    setIsAddHostModalOpen(false);
    setNewHostDraft(emptyHost());
    setAddHostBindingDraft(createDefaultHostBinding());
  };

  const openQuickConnectModal = (paneIndex: number | null = null) => {
    const defaultUser = metadataStore.defaultUser.trim();
    setQuickConnectDraft((prev) => ({
      ...createQuickConnectDraft(defaultUser),
      identityFile: prev.identityFile,
      proxyJump: prev.proxyJump,
      proxyCommand: prev.proxyCommand,
    }));
    setQuickConnectCommandInput(defaultUser ? `${defaultUser}@` : "");
    setQuickConnectWizardStep(1);
    setIsQuickAddMenuOpen(false);
    setPendingQuickConnectPaneIndex(paneIndex);
    setIsQuickConnectModalOpen(true);
  };

  const closeQuickConnectModal = () => {
    setIsQuickConnectModalOpen(false);
    setQuickConnectDraft(createQuickConnectDraft());
    setQuickConnectCommandInput("");
    setQuickConnectWizardStep(1);
    setPendingQuickConnectPaneIndex(null);
  };

  useEffect(() => {
    const payload: StoredShortcutMap = {
      version: 1,
      chords: keyboardShortcutChords,
      leaderChord: keyboardLeaderChord,
    };
    window.localStorage.setItem(KEYBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(payload));
  }, [keyboardShortcutChords, keyboardLeaderChord]);

  const handleSettingsHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isAppSettingsOpen || settingsOpenMode !== "modal") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) {
        return;
      }
      const modal = settingsModalRef.current;
      if (!modal) {
        return;
      }
      const modalRect = modal.getBoundingClientRect();
      settingsDragOffsetRef.current = {
        x: event.clientX - modalRect.left,
        y: event.clientY - modalRect.top,
      };
      setIsSettingsDragging(true);
    },
    [isAppSettingsOpen, settingsOpenMode],
  );

  const createHost = async () => {
    setError("");
    try {
      const synced = syncSidebarHostWithStore(
        newHostDraft,
        addHostBindingDraft,
        storeKeys,
        storeUsers,
        hosts,
        metadataStore.hosts,
      );
      const alias = synced.host.host.trim();
      await saveHost(synced.host);
      await persistEntityStore({
        ...entityStore,
        hostBindings: { ...entityStore.hostBindings, [alias]: synced.binding },
        updatedAt: Date.now(),
      });
      await load();
      closeAddHostModal();
    } catch (e) {
      setError(String(e));
    }
  };

  const connectToHost = async (host: HostConfig): Promise<string | null> => {
    if (!host.host.trim() || !host.hostName.trim()) {
      setError("Host alias and HostName are required.");
      return null;
    }
    setError("");

    try {
      const started = await startSession(host);
      setSessions((prev) => {
        return [...prev, { id: started.session_id, kind: "sshSaved", hostAlias: host.host }];
      });
      setActiveSession(started.session_id);
      setActiveHost(host.host);
      const lastUsedAt = Math.floor(Date.now() / 1000);
      setMetadataStore((prev) => ({
        ...prev,
        hosts: {
          ...prev.hosts,
          [host.host]: {
            ...(prev.hosts[host.host] ?? createDefaultHostMetadata()),
            lastUsedAt,
          },
        },
      }));
      void touchHostLastUsed(host.host).catch((touchError: unknown) => setError(String(touchError)));
      return started.session_id;
    } catch (e) {
      setError(String(e));
      return null;
    }
  };

  const placeSessionIntoNewOrFreePane = (sessionId: string, splitFromPaneIndex: number) => {
    const firstFreePaneIndex = findFirstFreePaneInOrder(paneOrder, splitSlots);
    const usedExistingEmptyPane = firstFreePaneIndex !== null;
    const autoSplitDirection: "right" | "bottom" =
      workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true ? "bottom" : "right";
    const targetPaneIndex = usedExistingEmptyPane
      ? firstFreePaneIndex
      : splitFocusedPane(autoSplitDirection, splitFromPaneIndex, "empty");
    setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, sessionId));
    setActivePaneIndex(targetPaneIndex);
    setActiveSession(sessionId);
  };

  const connectToHostInNewPane = async (host: HostConfig): Promise<void> => {
    const splitFromPaneIndex = activePaneIndex;
    const startedSessionId = await connectToHost(host);
    if (!startedSessionId) {
      return;
    }
    placeSessionIntoNewOrFreePane(startedSessionId, splitFromPaneIndex);
  };

  const handleProxmuxSshNode = useCallback(
    async (ctx: { clusterId: string; node: string }) => {
      const normalizedNode = ctx.node.trim();
      if (!normalizedNode) return;
      const match = hosts.find((h) => h.hostName.trim().toLowerCase() === normalizedNode.toLowerCase());
      const user = match?.user.trim() || metadataStore.defaultUser.trim() || "root";
      const slug = `${ctx.clusterId}-${normalizedNode}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
      const safeAlias = `proxmox-${slug}`.slice(0, 120) || "proxmox-node";
      const host: HostConfig =
        match ??
        ({
          host: safeAlias,
          hostName: normalizedNode,
          user,
          port: 22,
          identityFile: "",
          proxyJump: "",
          proxyCommand: "",
        } satisfies HostConfig);
      await connectToHostInNewPane(host);
    },
    [hosts, metadataStore.defaultUser, connectToHostInNewPane],
  );

  const handleProxmuxOpenExternalUrl = useCallback(
    async (url: string, label?: string, options?: { allowInsecureTls?: boolean }) => {
      setError("");
      const allowInsecureTls = options?.allowInsecureTls === true;
      if (proxmuxOpenWebConsolesInPane) {
        const err = validateExternalHttpUrl(url);
        if (err) {
          setError(err);
          return;
        }
        const trimmed = url.trim();
        const title = (label ?? "").trim() || "Proxmox console";
        if (isProxmoxConsoleDeepLinkUrl(trimmed)) {
          try {
            const result = await openProxmoxInAppWebviewWindow({
              title,
              consoleUrl: trimmed,
              allowInsecureTls,
            });
            if (result.loginFirst && !result.reused) {
              setProxmoxWebLoginAssist({ label: result.label, consoleUrl: trimmed });
            }
          } catch (e) {
            setError(String(e));
          }
          return;
        }
        const id = `web-${createId()}`;
        setSessions((prev) => [
          ...prev,
          { id, kind: "web", label: title, url: trimmed, ...(allowInsecureTls ? { allowInsecureTls: true } : {}) },
        ]);
        const autoSplitDirection: "right" | "bottom" =
          workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true ? "bottom" : "right";
        const firstFree = findFirstFreePaneInOrder(paneOrder, splitSlots);
        const targetPaneIndex =
          firstFree !== null ? firstFree : splitFocusedPane(autoSplitDirection, activePaneIndex, "empty");
        setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, id));
        setActivePaneIndex(targetPaneIndex);
        setActiveSession(id);
        return;
      }
      try {
        await openExternalUrl(url);
      } catch (e) {
        setError(String(e));
      }
    },
    [activePaneIndex, activeWorkspaceId, paneOrder, proxmuxOpenWebConsolesInPane, splitSlots, workspaceSnapshots],
  );

  const handleProxmoxContinueToConsole = useCallback(async () => {
    if (!proxmoxWebLoginAssist) return;
    setError("");
    try {
      await navigateInAppWebviewWindow(proxmoxWebLoginAssist.label, proxmoxWebLoginAssist.consoleUrl);
      setProxmoxWebLoginAssist(null);
    } catch (e) {
      setError(String(e));
    }
  }, [proxmoxWebLoginAssist]);

  const onWebPaneLoginFirstWebviewOpen = useCallback((payload: { label: string; consoleUrl: string }) => {
    setProxmoxWebLoginAssist(payload);
  }, []);

  const handleProxmuxSpice = useCallback(async (ctx: { clusterId: string; node: string; vmid: string }) => {
    setError("");
    try {
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchSpiceProxy", {
        clusterId: ctx.clusterId,
        node: ctx.node,
        guestType: "qemu",
        vmid: ctx.vmid,
      })) as { ok?: boolean; data?: Record<string, unknown> };
      if (!out?.ok || out.data == null || typeof out.data !== "object" || Array.isArray(out.data)) {
        setError("SPICE proxy response was invalid.");
        return;
      }
      await openVirtViewerFromSpicePayload(out.data as Record<string, unknown>);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const connectLocalShellInNewPane = async (splitFromPaneIndex: number): Promise<void> => {
    setError("");
    try {
      const started = await startLocalSession();
      setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
      placeSessionIntoNewOrFreePane(started.session_id, splitFromPaneIndex);
    } catch (e) {
      setError(String(e));
    }
  };

  const connectLocalShellInPane = async (paneIndex: number): Promise<void> => {
    setError("");
    try {
      const started = await startLocalSession();
      setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
      setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, started.session_id));
      setActivePaneIndex(paneIndex);
      setActiveSession(started.session_id);
    } catch (e) {
      setError(String(e));
    }
  };

  const applyQuickConnectUser = (user: string) => {
    setQuickConnectDraft((prev) => ({ ...prev, user }));
  };

  const shiftQuickConnectUserOption = (direction: 1 | -1) => {
    if (quickConnectUserOptions.length === 0) {
      return;
    }
    const currentUser = quickConnectDraft.user.trim();
    const currentIndex = quickConnectUserOptions.findIndex((entry) => entry === currentUser);
    const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextRaw = baseIndex + direction;
    const wrapped = (nextRaw + quickConnectUserOptions.length) % quickConnectUserOptions.length;
    const user = quickConnectUserOptions[wrapped] ?? "";
    if (!user) {
      return;
    }
    applyQuickConnectUser(user);
    if (quickConnectMode === "command") {
      setQuickConnectCommandInput((current) => {
        const trimmed = current.trim();
        const atIndex = trimmed.lastIndexOf("@");
        const hostPart = atIndex >= 0 ? trimmed.slice(atIndex + 1).trim() : trimmed;
        return hostPart ? `${user}@${hostPart}` : `${user}@`;
      });
    }
  };

  const buildQuickSshRequestFromDraft = (): QuickSshSessionRequest | null => {
    const defaultUser = metadataStore.defaultUser.trim();
    let normalizedDraft: QuickConnectDraft = {
      ...quickConnectDraft,
      user: quickConnectDraft.user.trim() || defaultUser,
      hostName: quickConnectDraft.hostName.trim(),
      identityFile: quickConnectDraft.identityFile.trim(),
      proxyJump: quickConnectDraft.proxyJump.trim(),
      proxyCommand: quickConnectDraft.proxyCommand.trim(),
    };
    let parsedPort: number | undefined;
    if (quickConnectMode === "command") {
      const parsed = parseQuickConnectCommandInput(quickConnectCommandInput);
      if (parsed.error) {
        setError(parsed.error);
        return null;
      }
      const nextHostName = parsed.hostName.trim();
      if (!nextHostName) {
        setError("HostName is required for quick connect.");
        return null;
      }
      normalizedDraft = {
        ...normalizedDraft,
        hostName: nextHostName,
        user: parsed.user.trim() || normalizedDraft.user,
      };
      parsedPort = parsed.port;
    } else {
      const parsed = parseHostPortInput(normalizedDraft.hostName);
      if (parsed.error) {
        setError(parsed.error);
        return null;
      }
      if (!parsed.hostName.trim()) {
        setError("HostName is required for quick connect.");
        return null;
      }
      normalizedDraft = {
        ...normalizedDraft,
        hostName: parsed.hostName,
      };
      parsedPort = parsed.port;
    }
    setQuickConnectDraft(normalizedDraft);
    return {
      hostName: normalizedDraft.hostName,
      user: normalizedDraft.user,
      port: parsedPort,
      identityFile: normalizedDraft.identityFile,
      proxyJump: normalizedDraft.proxyJump,
      proxyCommand: normalizedDraft.proxyCommand,
      ...(quickConnectAutoTrust ? { strictHostKeyPolicy: "accept-new" as const } : {}),
    };
  };

  const proceedQuickConnectWizard = () => {
    if (quickConnectWizardStep === 1) {
      const parsed = parseHostPortInput(quickConnectDraft.hostName);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      if (!parsed.hostName.trim()) {
        setError("HostName is required for quick connect.");
        return;
      }
      setError("");
      setQuickConnectDraft((prev) => ({
        ...prev,
        hostName: parsed.hostName,
      }));
      setQuickConnectWizardStep(2);
      return;
    }
    void connectQuickSshInNewPane();
  };

  const handleQuickConnectUserInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      shiftQuickConnectUserOption(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      shiftQuickConnectUserOption(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (quickConnectMode === "wizard") {
        proceedQuickConnectWizard();
      } else {
        void connectQuickSshInNewPane();
      }
    }
  };

  const handleQuickConnectModalKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeQuickConnectModal();
    }
  };
  const handleQuickConnectCommandInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      shiftQuickConnectUserOption(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      shiftQuickConnectUserOption(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void connectQuickSshInNewPane();
    }
  };

  const connectQuickSshInNewPane = async (): Promise<void> => {
    setError("");
    const splitFromPaneIndex = activePaneIndex;
    const request = buildQuickSshRequestFromDraft();
    if (!request) {
      return;
    }
    try {
      const started = await startQuickSshSession(request);
      const quickLabel = request.user ? `${request.user}@${request.hostName}` : request.hostName;
      setSessions((prev) => [
        ...prev,
        { id: started.session_id, kind: "sshQuick", label: `Quick: ${quickLabel}`, request },
      ]);
      const requestedPaneIndex = pendingQuickConnectPaneIndex;
      const canAttachToRequestedPane =
        typeof requestedPaneIndex === "number" &&
        requestedPaneIndex >= 0 &&
        paneOrder.includes(requestedPaneIndex);
      if (canAttachToRequestedPane) {
        setSplitSlots((prev) => assignSessionToPane(prev, requestedPaneIndex, started.session_id));
        setActivePaneIndex(requestedPaneIndex);
        setActiveSession(started.session_id);
      } else {
        placeSessionIntoNewOrFreePane(started.session_id, splitFromPaneIndex);
      }
      closeQuickConnectModal();
    } catch (e) {
      setError(String(e));
    }
  };

  const ensureSessionForHost = async (hostAlias: string): Promise<string | null> => {
    const host = hosts.find((entry) => entry.host === hostAlias);
    if (!host) {
      setError(`Host '${hostAlias}' not found.`);
      return null;
    }
    return connectToHost(host);
  };
  const spawnSessionFromHostAlias = async (hostAlias: string): Promise<string | null> => {
    const host = hosts.find((entry) => entry.host === hostAlias);
    if (!host) {
      setError(`Host '${hostAlias}' not found.`);
      return null;
    }
    return connectToHost(host);
  };

  const spawnSessionFromExistingSession = async (sourceSession: SessionTab): Promise<string | null> => {
    if (sourceSession.kind === "sshSaved") {
      return spawnSessionFromHostAlias(sourceSession.hostAlias);
    }
    if (sourceSession.kind === "web") {
      const err = validateExternalHttpUrl(sourceSession.url);
      if (err) {
        setError(err);
        return null;
      }
      const id = `web-${createId()}`;
      setSessions((prev) => [
        ...prev,
        {
          id,
          kind: "web",
          label: sourceSession.label,
          url: sourceSession.url.trim(),
          ...(sourceSession.allowInsecureTls ? { allowInsecureTls: true } : {}),
        },
      ]);
      return id;
    }
    if (sourceSession.kind === "proxmoxQemuVnc" || sourceSession.kind === "proxmoxLxcTerm") {
      const id = sourceSession.kind === "proxmoxQemuVnc" ? `pxvnc-${createId()}` : `pxlxc-${createId()}`;
      if (sourceSession.kind === "proxmoxQemuVnc") {
        setSessions((prev) => [
          ...prev,
          {
            id,
            kind: "proxmoxQemuVnc",
            label: sourceSession.label,
            clusterId: sourceSession.clusterId,
            node: sourceSession.node,
            vmid: sourceSession.vmid,
            proxmoxBaseUrl: sourceSession.proxmoxBaseUrl,
            ...(sourceSession.allowInsecureTls ? { allowInsecureTls: true } : {}),
            ...(sourceSession.tlsTrustedCertPem ? { tlsTrustedCertPem: sourceSession.tlsTrustedCertPem } : {}),
          },
        ]);
      } else {
        setSessions((prev) => [
          ...prev,
          {
            id,
            kind: "proxmoxLxcTerm",
            label: sourceSession.label,
            clusterId: sourceSession.clusterId,
            node: sourceSession.node,
            vmid: sourceSession.vmid,
            proxmoxBaseUrl: sourceSession.proxmoxBaseUrl,
            ...(sourceSession.allowInsecureTls ? { allowInsecureTls: true } : {}),
            ...(sourceSession.tlsTrustedCertPem ? { tlsTrustedCertPem: sourceSession.tlsTrustedCertPem } : {}),
          },
        ]);
      }
      return id;
    }
    if (sourceSession.kind === "local") {
      try {
        const started = await startLocalSession();
        setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: sourceSession.label }]);
        return started.session_id;
      } catch (error) {
        setError(String(error));
        return null;
      }
    }
    try {
      const started = await startQuickSshSession(sourceSession.request);
      setSessions((prev) => [...prev, { ...sourceSession, id: started.session_id }]);
      return started.session_id;
    } catch (error) {
      setError(String(error));
      return null;
    }
  };

  const setDragPayload = (event: ReactDragEvent, payload: DragPayload) => {
    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = payload.type === "session" ? "copyMove" : "copy";
    event.dataTransfer.setData(DND_PAYLOAD_MIME, serialized);
    event.dataTransfer.setData("text/plain", serialized);
    lastInternalDragPayloadRef.current = payload;
  };

  const parseDragPayload = (event: ReactDragEvent): DragPayload | null => {
    const customPayload = event.dataTransfer.getData(DND_PAYLOAD_MIME);
    const plainPayload = event.dataTransfer.getData("text/plain");
    const encoded = customPayload || plainPayload;
    if (!encoded) {
      return lastInternalDragPayloadRef.current;
    }
    try {
      const parsedObj = JSON.parse(encoded) as Record<string, unknown>;
      if (parsedObj.kind === "local" || parsedObj.kind === "remote") {
        return null;
      }
      const parsed = parsedObj as Partial<DragPayload>;
      const result =
        parsed.type === "session" && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0
          ? ({ type: "session", sessionId: parsed.sessionId } as DragPayload)
          : parsed.type === "machine" && typeof parsed.hostAlias === "string" && parsed.hostAlias.length > 0
            ? ({ type: "machine", hostAlias: parsed.hostAlias } as DragPayload)
            : null;
      return result ?? lastInternalDragPayloadRef.current;
    } catch {
      return lastInternalDragPayloadRef.current;
    }
  };

  const resolvePaneDropZone = (
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, "left" | "top" | "width" | "height"> | null,
  ): PaneDropZone => {
    if (!bounds) {
      return "center";
    }
    return resolvePaneDropZoneFromOverlay(clientX, clientY, bounds);
  };

  const handlePaneDrop = async (event: ReactDragEvent<HTMLDivElement>, paneIndex: number) => {
    event.preventDefault();
    setDragOverPaneIndex(null);
    setActiveDropZonePaneIndex(null);
    setActiveDropZone(null);
    const dropClientX = event.clientX;
    const dropClientY = event.clientY;
    const rawBounds = event.currentTarget?.getBoundingClientRect() ?? null;
    const dropBounds = rawBounds
      ? {
          left: rawBounds.left,
          top: rawBounds.top,
          width: rawBounds.width,
          height: rawBounds.height,
        }
      : null;
    const fileRaw = event.dataTransfer.getData(FILE_DND_PAYLOAD_MIME);
    const filePlain = parseFileDragPayload(event.dataTransfer.getData("text/plain") || "");
    if ((fileRaw && parseFileDragPayload(fileRaw)) || filePlain) {
      lastInternalDragPayloadRef.current = null;
      return;
    }
    const payload = parseDragPayload(event);
    if (!payload) {
      lastInternalDragPayloadRef.current = null;
      return;
    }
    const sourcePaneIndex =
      payload.type === "session" ? splitSlots.findIndex((slot) => slot === payload.sessionId) : -1;
    const isSamePane = payload.type === "session" && sourcePaneIndex >= 0 && sourcePaneIndex === paneIndex;
    const resolvedDropZone = resolvePaneDropZone(dropClientX, dropClientY, dropBounds);
    if (isSamePane && resolvedDropZone === "center") {
      return;
    }
    const assignSessionToZone = (sessionId: string, zone: PaneDropZone, moveExistingSession = false) => {
      const targetPane =
        zone === "center" ? paneIndex : splitFocusedPane(zone, paneIndex, "empty");
      setActivePaneIndex(targetPane);
      setActiveSession(sessionId);
      setSplitSlots((prev) => {
        const base = moveExistingSession ? removeSessionFromSlots(prev, sessionId) : prev;
        return assignSessionToPane(base, targetPane, sessionId);
      });
    };
    const placeSessionOnPane = (sessionId: string) => {
      assignSessionToZone(sessionId, resolvedDropZone, false);
    };
    if (payload.type === "session") {
      if (isSamePane) {
        const sourceSession = sessions.find((session) => session.id === payload.sessionId) ?? null;
        if (!sourceSession) return;
        const spawnedSessionId = await spawnSessionFromExistingSession(sourceSession);
        if (!spawnedSessionId) return;
        placeSessionOnPane(spawnedSessionId);
        return;
      }
      if (sourcePaneIndex >= 0 && sourcePaneIndex !== paneIndex) {
        if (resolvedDropZone === "center") {
          const targetSessionId = splitSlots[paneIndex] ?? null;
          setActivePaneIndex(paneIndex);
          setActiveSession(payload.sessionId);
          setSplitSlots((prev) => {
            const cleared = removeSessionFromSlots(prev, payload.sessionId);
            const next = assignSessionToPane(cleared, paneIndex, payload.sessionId);
            return targetSessionId
              ? assignSessionToPane(next, sourcePaneIndex, targetSessionId)
              : next;
          });
          if (!targetSessionId && paneOrder.length > 1) {
            setSplitTree((prev) => {
              const next = removePaneFromTree(prev, sourcePaneIndex);
              if (!next) return prev;
              const maxPaneIndex = Math.max(...collectPaneOrder(next));
              if (nextPaneIndexRef.current <= maxPaneIndex) {
                nextPaneIndexRef.current = maxPaneIndex + 1;
              }
              return next;
            });
            setSplitSlots((prev) => clearPaneAtIndex(prev, sourcePaneIndex));
          }
          return;
        }
        const targetPane = splitFocusedPane(resolvedDropZone, paneIndex, "empty");
        setActivePaneIndex(targetPane);
        setActiveSession(payload.sessionId);
        setSplitSlots((prev) => {
          const cleared = removeSessionFromSlots(prev, payload.sessionId);
          return assignSessionToPane(cleared, targetPane, payload.sessionId);
        });
        if (paneOrder.length > 1) {
          setSplitTree((prev) => {
            const next = removePaneFromTree(prev, sourcePaneIndex);
            if (!next) return prev;
            const maxPaneIndex = Math.max(...collectPaneOrder(next));
            if (nextPaneIndexRef.current <= maxPaneIndex) {
              nextPaneIndexRef.current = maxPaneIndex + 1;
            }
            return next;
          });
          setSplitSlots((prev) => clearPaneAtIndex(prev, sourcePaneIndex));
        }
        return;
      }
      const sourceSession = sessions.find((session) => session.id === payload.sessionId) ?? null;
      if (!sourceSession) return;
      placeSessionOnPane(payload.sessionId);
      return;
    }
    if (payload.type === "machine") {
      const hostConfig = hosts.find((h) => h.host === payload.hostAlias) ?? null;
      if (!hostConfig) {
        setError(`Host '${payload.hostAlias}' not found.`);
        lastInternalDragPayloadRef.current = null;
        return;
      }
      const targetPaneEmpty = (splitSlots[paneIndex] ?? null) === null;
      const machineDropZone = targetPaneEmpty ? ("center" as const) : resolvedDropZone;
      if (machineDropZone === "center") {
        const oldSessionId = splitSlots[paneIndex] ?? null;
        const existingSession =
          sessions.find((session) => session.kind === "sshSaved" && session.hostAlias === payload.hostAlias) ?? null;
        if (existingSession) {
          setSplitSlots((prev) =>
            assignSessionToPane(removeSessionFromSlots(prev, existingSession.id), paneIndex, existingSession.id),
          );
          setActivePaneIndex(paneIndex);
          setActiveSession(existingSession.id);
          if (oldSessionId && oldSessionId !== existingSession.id) {
            await closeSessionById(oldSessionId);
          }
          lastInternalDragPayloadRef.current = null;
          return;
        }
        const newSessionId = await connectToHost(hostConfig);
        if (!newSessionId) {
          lastInternalDragPayloadRef.current = null;
          return;
        }
        setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, newSessionId));
        setActivePaneIndex(paneIndex);
        setActiveSession(newSessionId);
        if (oldSessionId && oldSessionId !== newSessionId) {
          await closeSessionById(oldSessionId);
        }
        lastInternalDragPayloadRef.current = null;
        return;
      }
      const existingHostSession =
        sessions.find((session) => session.kind === "sshSaved" && session.hostAlias === payload.hostAlias) ?? null;
      if (existingHostSession) {
        placeSessionOnPane(existingHostSession.id);
        lastInternalDragPayloadRef.current = null;
        return;
      }
      const sessionId = await ensureSessionForHost(payload.hostAlias);
      if (sessionId) {
        placeSessionOnPane(sessionId);
      }
    }
    lastInternalDragPayloadRef.current = null;
  };

  const resolveDropEffect = (event: ReactDragEvent): DataTransfer["dropEffect"] => {
    if (event.dataTransfer.types.includes(FILE_DND_PAYLOAD_MIME)) {
      return "copy";
    }
    const payload = parseDragPayload(event);
    if (!payload) {
      if (!missingDragPayloadLoggedRef.current && draggingKind !== null) {
        missingDragPayloadLoggedRef.current = true;
      }
      if (draggingKind === "session") {
        return "move";
      }
      if (draggingKind === "machine") {
        return "copy";
      }
      return "none";
    }
    missingDragPayloadLoggedRef.current = false;
    if (payload.type === "session") {
      return "move";
    }
    return "copy";
  };

  const toggleBroadcastTarget = (sessionId: string) => {
    if (!isBroadcastModeEnabled) {
      return;
    }
    setBroadcastTargets((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };
  const requestTerminalFocus = useCallback((sessionId: string) => {
    window.dispatchEvent(new CustomEvent("nosuckshell:terminal-focus-request", { detail: { sessionId } }));
  }, []);

  const registerPaneScrollAnchor = useCallback((paneIndex: number, element: HTMLElement | null) => {
    if (element) {
      paneScrollAnchorsRef.current[paneIndex] = element;
    } else {
      delete paneScrollAnchorsRef.current[paneIndex];
    }
  }, []);

  const handleMobilePagerScroll = useCallback(() => {
    if (skipMobilePagerScrollRef.current) {
      return;
    }
    const el = mobilePagerRef.current;
    if (!el || !isStackedShell || mobileShellTab !== "terminal") {
      return;
    }
    const w = el.clientWidth;
    if (w < 8) {
      return;
    }
    const idx = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(paneOrder.length - 1, idx));
    const pi = paneOrder[clamped];
    if (pi === undefined || pi === activePaneIndex) {
      return;
    }
    setActivePaneIndex(pi);
    const sid = splitSlots[pi];
    if (sid) {
      requestTerminalFocus(sid);
    }
  }, [activePaneIndex, isStackedShell, mobileShellTab, paneOrder, splitSlots, requestTerminalFocus]);

  const nudgeMobilePager = useCallback((delta: number) => {
    const el = mobilePagerRef.current;
    if (!el) {
      return;
    }
    el.scrollBy({ left: delta * el.clientWidth, behavior: "smooth" });
  }, []);

  const onQuickNavPane = useCallback(
    (paneIndex: number) => {
      if (paneIndex === activePaneIndex) {
        queueMicrotask(() => {
          paneScrollAnchorsRef.current[paneIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }
      setActivePaneIndex(paneIndex);
      const sid = splitSlots[paneIndex];
      if (sid) {
        setActiveSession(sid);
        requestTerminalFocus(sid);
      }
    },
    [activePaneIndex, requestTerminalFocus, splitSlots],
  );

  useEffect(() => {
    if (!verticalStackScrollEnabled) {
      return;
    }
    queueMicrotask(() => {
      paneScrollAnchorsRef.current[activePaneIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [activePaneIndex, verticalStackScrollEnabled]);

  useLayoutEffect(() => {
    if (!isStackedShell || mobileShellTab !== "terminal") {
      return;
    }
    const el = mobilePagerRef.current;
    if (!el) {
      return;
    }
    const idx = paneOrder.indexOf(activePaneIndex);
    if (idx < 0) {
      return;
    }
    const w = el.clientWidth;
    if (w < 8) {
      return;
    }
    const target = idx * w;
    if (Math.abs(el.scrollLeft - target) < 3) {
      return;
    }
    skipMobilePagerScrollRef.current = true;
    el.scrollTo({ left: target, behavior: "auto" });
    requestAnimationFrame(() => {
      skipMobilePagerScrollRef.current = false;
    });
  }, [activePaneIndex, isStackedShell, mobileShellTab, paneOrder]);

  const closeSessionById = async (sessionId: string) => {
    const tab = sessions.find((s) => s.id === sessionId);
    if (!tab || !sessionKindIsWebLike(tab.kind)) {
      await closeSession(sessionId);
    }
    setSessionFileViews((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    setActiveSession((prev) => (prev === sessionId ? "" : prev));
    setSplitSlots((prev) => removeSessionFromSlots(prev, sessionId));
    setWorkspaceSnapshots((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([workspaceId, snapshot]) => [
          workspaceId,
          {
            ...snapshot,
            splitSlots: removeSessionFromSlots(snapshot.splitSlots, sessionId),
            activeSessionId: snapshot.activeSessionId === sessionId ? "" : snapshot.activeSessionId,
          },
        ]),
      ),
    );
    setBroadcastTargets((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(sessionId);
      return nextSet;
    });
    setTrustPromptQueue((prev) => prev.filter((entry) => entry.sessionId !== sessionId));
    delete sessionTerminalCwdRef.current[sessionId];
    setSessionTerminalCwdEpoch((n) => n + 1);
  };
  const closeSessionInPane = async (paneIndex: number) => {
    const paneSessionId = splitSlots[paneIndex] ?? null;
    if (!paneSessionId) {
      setSplitSlots((prev) => clearPaneAtIndex(prev, paneIndex));
      return;
    }
    await closeSessionById(paneSessionId);
  };
  const closeAllSessions = async (withLayoutReset: boolean) => {
    if (sessionIds.length === 0) {
      if (withLayoutReset) {
        resetPaneLayout();
      }
      return;
    }
    const results = await Promise.allSettled(
      sessionIds.map((sessionId) => {
        const tab = sessions.find((s) => s.id === sessionId);
        if (tab && sessionKindIsWebLike(tab.kind)) {
          return Promise.resolve();
        }
        return closeSession(sessionId);
      }),
    );
    const failedCount = results.filter((result) => result.status === "rejected").length;
    setSessions([]);
    setActiveSession("");
    setSplitSlots((prev) => prev.map(() => null));
    setWorkspaceSnapshots((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([workspaceId, snapshot]) => [
          workspaceId,
          {
            ...snapshot,
            splitSlots: snapshot.splitSlots.map(() => null),
            activeSessionId: "",
          },
        ]),
      ),
    );
    setBroadcastTargets(new Set());
    setTrustPromptQueue([]);
    setSessionFileViews({});
    sessionTerminalCwdRef.current = {};
    setSessionTerminalCwdEpoch((n) => n + 1);
    if (withLayoutReset) {
      resetPaneLayout();
    }
    if (failedCount > 0) {
      setError(`Failed to close ${failedCount} session(s).`);
    }
  };
  const handleCloseAllIntent = async (withLayoutReset: boolean) => {
    const intent: "close" | "reset" = withLayoutReset ? "reset" : "close";
    if (pendingCloseAllIntent !== intent) {
      armPendingCloseAllIntent(intent);
      return;
    }
    clearPendingCloseAllIntent();
    await closeAllSessions(withLayoutReset);
  };
  const dismissTrustPrompt = (sessionId: string) => {
    setTrustPromptQueue((prev) => prev.filter((entry) => entry.sessionId !== sessionId));
  };
  const acceptTrustPrompt = async () => {
    if (!activeTrustPrompt) {
      return;
    }
    try {
      const promptSession = sessionsRef.current.find((session) => session.id === activeTrustPrompt.sessionId) ?? null;
      if (saveTrustHostAsDefault && promptSession?.kind === "sshSaved") {
        await upsertHostMetadata(promptSession.hostAlias, (current) => ({
          ...current,
          ...metadataPatchForHostKeyPolicy("accept-new"),
        }));
      }
      await sendInput(activeTrustPrompt.sessionId, "yes\n");
      dismissTrustPrompt(activeTrustPrompt.sessionId);
    } catch (e) {
      setError(String(e));
    }
  };
  const handleTrustPromptKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!activeTrustPrompt) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismissTrustPrompt(activeTrustPrompt.sessionId);
      return;
    }
    if (event.key !== "Enter" && event.key !== "NumpadEnter") {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) {
      return;
    }
    event.preventDefault();
    void acceptTrustPrompt();
  };
  const closePaneAndSession = async (paneIndex: number) => {
    if (paneOrder.length <= 1 || !paneOrder.includes(paneIndex)) {
      return;
    }
    const paneSessionId = splitSlots[paneIndex] ?? null;
    if (paneSessionId) {
      await closeSessionById(paneSessionId);
    }
    setSplitTree((prev) => {
      const next = removePaneFromTree(prev, paneIndex);
      if (!next) {
        return prev;
      }
      const maxPaneIndex = Math.max(...collectPaneOrder(next));
      if (nextPaneIndexRef.current <= maxPaneIndex) {
        nextPaneIndexRef.current = maxPaneIndex + 1;
      }
      return next;
    });
    setSplitSlots((prev) => clearPaneAtIndex(prev, paneIndex));
  };
  const resetPaneLayout = () => {
    setSessionFileViews({});
    const resetSlots: Array<string | null> = [null];
    setSplitSlots(resetSlots);
    setPaneLayouts(createPaneLayoutsFromSlots(resetSlots));
    setSplitTree(createLeafNode(0));
    setActivePaneIndex(0);
    nextPaneIndexRef.current = 1;
    nextSplitIdRef.current = 1;
  };

  const togglePaneTarget = (paneIndex: number) => {
    const sessionId = splitSlots[paneIndex] ?? null;
    if (!sessionId) {
      return;
    }
    const tab = sessions.find((s) => s.id === sessionId);
    if (tab && sessionKindIsWebLike(tab.kind)) {
      return;
    }
    toggleBroadcastTarget(sessionId);
  };

  const broadcastToVisiblePanes = () => {
    if (!isBroadcastModeEnabled) {
      return;
    }
    const eligible = broadcastEligibleVisiblePaneSessionIds;
    if (eligible.length === 0) {
      return;
    }
    setBroadcastTargets((prev) => {
      const next = new Set(prev);
      const allVisibleAlreadyTargeted = eligible.every((sessionId) => next.has(sessionId));
      if (allVisibleAlreadyTargeted) {
        eligible.forEach((sessionId) => next.delete(sessionId));
      } else {
        eligible.forEach((sessionId) => next.add(sessionId));
      }
      return next;
    });
  };

  const setBroadcastMode = (enabled: boolean) => {
    setIsBroadcastModeEnabled(enabled);
    if (!enabled) {
      setBroadcastTargets(new Set());
    }
  };
  const applyWorkspaceSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    isApplyingWorkspaceSnapshotRef.current = true;
    setSessionFileViews({});
    setSplitSlots([...snapshot.splitSlots]);
    setPaneLayouts(clonePaneLayouts(snapshot.paneLayouts));
    setSplitTree(cloneSplitTree(snapshot.splitTree));
    setActivePaneIndex(snapshot.activePaneIndex);
    setActiveSession(snapshot.activeSessionId);
    queueMicrotask(() => {
      isApplyingWorkspaceSnapshotRef.current = false;
    });
  }, []);
  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === activeWorkspaceId) {
        return;
      }
      const currentSnapshot: WorkspaceSnapshot = {
        id: activeWorkspaceId,
        name: workspaceSnapshots[activeWorkspaceId]?.name ?? activeWorkspaceId,
        preferVerticalNewPanes: workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true,
        splitSlots: [...splitSlots],
        paneLayouts: clonePaneLayouts(paneLayouts),
        splitTree: cloneSplitTree(splitTree),
        activePaneIndex,
        activeSessionId: activeSession,
      };
      const nextSnapshot = workspaceSnapshots[workspaceId];
      if (!nextSnapshot) {
        return;
      }
      setWorkspaceSnapshots((prev) => ({
        ...prev,
        [activeWorkspaceId]: currentSnapshot,
      }));
      setActiveWorkspaceId(workspaceId);
      applyWorkspaceSnapshot(nextSnapshot);
    },
    [activePaneIndex, activeSession, activeWorkspaceId, applyWorkspaceSnapshot, paneLayouts, splitSlots, splitTree, workspaceSnapshots],
  );
  const createWorkspace = useCallback(() => {
    const workspaceId = `workspace-${createId()}`;
    const workspaceName = `Workspace ${workspaceOrder.length + 1}`;
    const nextSnapshot = createEmptyWorkspaceSnapshot(workspaceId, workspaceName);
    setWorkspaceSnapshots((prev) => ({
      ...prev,
      [workspaceId]: nextSnapshot,
      [activeWorkspaceId]: {
        ...(prev[activeWorkspaceId] ?? createEmptyWorkspaceSnapshot(activeWorkspaceId, "Main")),
        splitSlots: [...splitSlots],
        paneLayouts: clonePaneLayouts(paneLayouts),
        splitTree: cloneSplitTree(splitTree),
        activePaneIndex,
        activeSessionId: activeSession,
      },
    }));
    setWorkspaceOrder((prev) => [...prev, workspaceId]);
    setActiveWorkspaceId(workspaceId);
    applyWorkspaceSnapshot(nextSnapshot);
  }, [activePaneIndex, activeSession, activeWorkspaceId, applyWorkspaceSnapshot, paneLayouts, splitSlots, splitTree, workspaceOrder.length]);
  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceOrder.length <= 1) {
        setError("At least one workspace must remain.");
        return;
      }
      if (!workspaceSnapshots[workspaceId]) {
        return;
      }
      const nextOrder = workspaceOrder.filter((entry) => entry !== workspaceId);
      const fallbackWorkspaceId = nextOrder[0] ?? DEFAULT_WORKSPACE_ID;
      const nextActiveWorkspaceId = workspaceId === activeWorkspaceId ? fallbackWorkspaceId : activeWorkspaceId;
      setWorkspaceOrder(nextOrder);
      setWorkspaceSnapshots((prev) => {
        const next = { ...prev };
        delete next[workspaceId];
        return next;
      });
      if (nextActiveWorkspaceId !== activeWorkspaceId) {
        const nextSnapshot = workspaceSnapshots[nextActiveWorkspaceId];
        if (nextSnapshot) {
          setActiveWorkspaceId(nextActiveWorkspaceId);
          applyWorkspaceSnapshot(nextSnapshot);
        }
      }
    },
    [activeWorkspaceId, applyWorkspaceSnapshot, workspaceOrder, workspaceSnapshots],
  );
  const renameWorkspace = useCallback((workspaceId: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) {
      return;
    }
    setWorkspaceSnapshots((prev) => {
      const snapshot = prev[workspaceId];
      if (!snapshot || snapshot.name === trimmed) {
        return prev;
      }
      return {
        ...prev,
        [workspaceId]: {
          ...snapshot,
          name: trimmed,
        },
      };
    });
  }, []);
  const setWorkspaceVerticalStacking = useCallback((workspaceId: string, enabled: boolean) => {
    setWorkspaceSnapshots((prev) => {
      const snapshot = prev[workspaceId];
      if (!snapshot || snapshot.preferVerticalNewPanes === enabled) {
        return prev;
      }
      return {
        ...prev,
        [workspaceId]: {
          ...snapshot,
          preferVerticalNewPanes: enabled,
        },
      };
    });
  }, []);

  const applyRuntimeSplitTreeToWorkspace = useCallback(
    (workspaceId: string, tree: SplitTreeNode) => {
      const nextTree = cloneSplitTree(tree);
      const nextPaneOrder = collectPaneOrder(nextTree);
      const maxPaneIndex = Math.max(0, ...nextPaneOrder);
      const newSlots = Array.from({ length: maxPaneIndex + 1 }, () => null as string | null);
      const nextLayouts = createPaneLayoutsFromSlots(newSlots);

      if (workspaceId === activeWorkspaceId) {
        setSplitTree(nextTree);
        setSplitSlots(newSlots);
        setPaneLayouts(nextLayouts);
        setActivePaneIndex(nextPaneOrder[0] ?? 0);
        setActiveSession("");
        nextPaneIndexRef.current = maxPaneIndex + 1;
        nextSplitIdRef.current = Math.max(1, nextPaneOrder.length);
        return;
      }

      setWorkspaceSnapshots((prev) => {
        const snap = prev[workspaceId];
        if (!snap) {
          return prev;
        }
        return {
          ...prev,
          [workspaceId]: {
            ...snap,
            splitTree: nextTree,
            splitSlots: newSlots,
            paneLayouts: nextLayouts,
            activePaneIndex: nextPaneOrder[0] ?? 0,
            activeSessionId: "",
          },
        };
      });
    },
    [activeWorkspaceId],
  );

  const handleApplyLayoutPresetFromCommandCenter = useCallback(
    (serialized: LayoutSplitTreeNode) => {
      const parsed = parseSplitTree(serialized);
      if (!parsed) {
        return;
      }
      const targetWorkspaceId = workspaceTabs.some((workspace) => workspace.id === layoutTargetWorkspaceId)
        ? layoutTargetWorkspaceId
        : activeWorkspaceId;
      applyRuntimeSplitTreeToWorkspace(targetWorkspaceId, parsed);
      if (layoutSwitchToTargetAfterApply && targetWorkspaceId !== activeWorkspaceId) {
        switchWorkspace(targetWorkspaceId);
      }
      setIsLayoutCommandCenterOpen(false);
    },
    [
      activeWorkspaceId,
      applyRuntimeSplitTreeToWorkspace,
      layoutSwitchToTargetAfterApply,
      layoutTargetWorkspaceId,
      switchWorkspace,
      workspaceTabs,
    ],
  );

  const handleApplyCustomGridFromCommandCenter = useCallback(
    (rows: number, cols: number) => {
      if (!isLayoutGridDimensionsValid(rows, cols)) {
        return;
      }
      const tree = createEqualGridSplitTree(rows, cols);
      const targetWorkspaceId = workspaceTabs.some((workspace) => workspace.id === layoutTargetWorkspaceId)
        ? layoutTargetWorkspaceId
        : activeWorkspaceId;
      applyRuntimeSplitTreeToWorkspace(targetWorkspaceId, tree);
      if (layoutSwitchToTargetAfterApply && targetWorkspaceId !== activeWorkspaceId) {
        switchWorkspace(targetWorkspaceId);
      }
      setIsLayoutCommandCenterOpen(false);
    },
    [
      activeWorkspaceId,
      applyRuntimeSplitTreeToWorkspace,
      layoutSwitchToTargetAfterApply,
      layoutTargetWorkspaceId,
      switchWorkspace,
      workspaceTabs,
    ],
  );

  const sendSessionToWorkspace = useCallback(
    (sessionId: string, targetWorkspaceId: string) => {
      const sourcePaneIndex = splitSlots.findIndex((slot) => slot === sessionId);
      const canCloseSourcePane = sourcePaneIndex >= 0 && paneOrder.includes(sourcePaneIndex) && paneOrder.length > 1;
      if (!sessionId || !workspaceSnapshots[targetWorkspaceId]) {
        return;
      }
      if (targetWorkspaceId === activeWorkspaceId) {
        return;
      }
      const targetSnapshot = workspaceSnapshots[targetWorkspaceId];
      const targetPaneOrder = collectPaneOrder(targetSnapshot.splitTree);
      const firstFreePaneIndex = targetPaneOrder.find((paneIndex) => targetSnapshot.splitSlots[paneIndex] === null);
      const nextTargetPaneIndex =
        typeof firstFreePaneIndex === "number"
          ? firstFreePaneIndex
          : Math.max(-1, ...targetPaneOrder) + 1;
      const nextTargetSlots = assignSessionToPane(targetSnapshot.splitSlots, nextTargetPaneIndex, sessionId);
      const nextTargetPaneLayouts = clonePaneLayouts(targetSnapshot.paneLayouts);
      if (!nextTargetPaneLayouts[nextTargetPaneIndex]) {
        nextTargetPaneLayouts[nextTargetPaneIndex] = createPaneLayoutItem();
      }
      const nextTargetSplitTree: SplitTreeNode =
        typeof firstFreePaneIndex === "number"
          ? cloneSplitTree(targetSnapshot.splitTree)
          : {
              id: `split-workspace-${createId()}`,
              type: "split",
              axis: "vertical",
              ratio: splitRatioDefaultValue,
              first: cloneSplitTree(targetSnapshot.splitTree),
              second: createLeafNode(nextTargetPaneIndex),
            };
      const nextTargetSnapshot: WorkspaceSnapshot = {
        ...cloneWorkspaceSnapshot(targetSnapshot),
        splitSlots: nextTargetSlots,
        paneLayouts: nextTargetPaneLayouts,
        splitTree: nextTargetSplitTree,
        activePaneIndex: nextTargetPaneIndex,
        activeSessionId: sessionId,
      };
      setWorkspaceSnapshots((prev) => ({
        ...prev,
        [targetWorkspaceId]: nextTargetSnapshot,
      }));
      setSplitSlots((prev) => {
        const cleared = removeSessionFromSlots(prev, sessionId);
        return canCloseSourcePane ? clearPaneAtIndex(cleared, sourcePaneIndex) : cleared;
      });
      if (canCloseSourcePane) {
        setSplitTree((prev) => {
          const next = removePaneFromTree(prev, sourcePaneIndex);
          if (!next) {
            return prev;
          }
          const maxPaneIndex = Math.max(...collectPaneOrder(next));
          if (nextPaneIndexRef.current <= maxPaneIndex) {
            nextPaneIndexRef.current = maxPaneIndex + 1;
          }
          return next;
        });
      }
      setBroadcastTargets((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      if (activeSession === sessionId) {
        setActiveSession("");
      }
    },
    [activeSession, activeWorkspaceId, paneOrder, splitRatioDefaultValue, splitSlots, workspaceSnapshots],
  );

  const connectToHostInWorkspace = useCallback(
    async (host: HostConfig, targetWorkspaceId: string): Promise<void> => {
      const priorActiveSession = activeSession;
      const priorActivePaneIndex = activePaneIndex;
      const startedSessionId = await connectToHost(host);
      if (!startedSessionId) {
        return;
      }
      if (targetWorkspaceId === activeWorkspaceId) {
        placeSessionIntoNewOrFreePane(startedSessionId, priorActivePaneIndex);
        return;
      }
      const targetSnapshot = workspaceSnapshots[targetWorkspaceId];
      if (!targetSnapshot) {
        return;
      }
      const nextTargetSnapshot = appendSessionToWorkspaceSnapshot(
        targetSnapshot,
        startedSessionId,
        splitRatioDefaultValue,
      );
      const persistedCurrentSnapshot: WorkspaceSnapshot = {
        id: activeWorkspaceId,
        name: workspaceSnapshots[activeWorkspaceId]?.name ?? activeWorkspaceId,
        preferVerticalNewPanes: workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true,
        splitSlots: [...splitSlots],
        paneLayouts: clonePaneLayouts(paneLayouts),
        splitTree: cloneSplitTree(splitTree),
        activePaneIndex: priorActivePaneIndex,
        activeSessionId: priorActiveSession,
      };
      setWorkspaceSnapshots((prev) => ({
        ...prev,
        [activeWorkspaceId]: persistedCurrentSnapshot,
        [targetWorkspaceId]: nextTargetSnapshot,
      }));
      setActiveWorkspaceId(targetWorkspaceId);
      applyWorkspaceSnapshot(nextTargetSnapshot);
    },
    [
      activePaneIndex,
      activeSession,
      activeWorkspaceId,
      applyWorkspaceSnapshot,
      paneLayouts,
      splitRatioDefaultValue,
      splitSlots,
      splitTree,
      workspaceSnapshots,
    ],
  );

  const handleContextAction = async (
    actionId: ContextActionId,
    paneIndex: number,
    options?: {
      preferredSplitMode?: SplitMode;
      eventLike?: {
        type?: string;
        key?: string;
        code?: string;
        altKey?: boolean;
        getModifierState?: (...args: any[]) => boolean;
      } | null;
    },
  ) => {
    setActivePaneIndex(paneIndex);
    const preferredSplitMode = options?.preferredSplitMode ?? "duplicate";
    const splitMode: SplitMode = shouldSplitAsEmpty(options?.eventLike) ? "empty" : preferredSplitMode;
    switch (actionId) {
      case "pane.newLocal":
        await connectLocalShellInNewPane(paneIndex);
        break;
      case "pane.quickConnect":
        openQuickConnectModal(paneIndex);
        break;
      case "pane.toggleRemoteFiles": {
        if (!fileWorkspacePluginEnabled) {
          setActiveAppSettingsTab("integrations");
          setIntegrationsSubTab("plugins");
          setIsAppSettingsOpen(true);
          break;
        }
        const sid = splitSlots[paneIndex] ?? null;
        if (!sid) {
          break;
        }
        const session = sessions.find((s) => s.id === sid);
        if (!session || (session.kind !== "sshSaved" && session.kind !== "sshQuick")) {
          break;
        }
        setSessionFileViews((prev) => {
          const cur = prev[sid] ?? "terminal";
          if (cur === "remote") {
            const next = { ...prev };
            delete next[sid];
            return next;
          }
          if (session.kind === "sshSaved") {
            const hostEntry = hosts.find((h) => h.host === session.hostAlias);
            if (!hostEntry) {
              queueMicrotask(() => setError(`Host '${session.hostAlias}' not found.`));
              return prev;
            }
          }
          return { ...prev, [sid]: "remote" };
        });
        break;
      }
      case "pane.toggleLocalFiles": {
        if (!fileWorkspacePluginEnabled) {
          setActiveAppSettingsTab("integrations");
          setIntegrationsSubTab("plugins");
          setIsAppSettingsOpen(true);
          break;
        }
        const sidLocal = splitSlots[paneIndex] ?? null;
        if (!sidLocal) {
          break;
        }
        const sessionLocal = sessions.find((s) => s.id === sidLocal);
        if (!sessionLocal || sessionLocal.kind !== "local") {
          break;
        }
        setSessionFileViews((prev) => {
          const cur = prev[sidLocal] ?? "terminal";
          if (cur === "local") {
            const next = { ...prev };
            delete next[sidLocal];
            return next;
          }
          return { ...prev, [sidLocal]: "local" };
        });
        break;
      }
      case "pane.clear":
        await closeSessionInPane(paneIndex);
        break;
      case "pane.close":
        await closePaneAndSession(paneIndex);
        break;
      case "layout.split.left":
        splitFocusedPane("left", paneIndex, splitMode);
        break;
      case "layout.split.right":
        splitFocusedPane("right", paneIndex, splitMode);
        break;
      case "layout.split.top":
        splitFocusedPane("top", paneIndex, splitMode);
        break;
      case "layout.split.bottom":
        splitFocusedPane("bottom", paneIndex, splitMode);
        break;
      case "broadcast.clearTargets":
        setBroadcastTargets(new Set());
        break;
      case "broadcast.mode.enable":
        setBroadcastMode(true);
        break;
      case "broadcast.mode.disable":
        setBroadcastMode(false);
        break;
      case "broadcast.selectAllVisible":
        broadcastToVisiblePanes();
        break;
      case "broadcast.togglePaneTarget":
        togglePaneTarget(paneIndex);
        break;
      case "layout.freeMove.enable":
        setAutoArrangeMode("free");
        break;
      case "layout.freeMove.disable":
        setAutoArrangeMode(lastAutoArrangeBeforeFreeRef.current);
        break;
      case "app.openSettings":
        setIsAppSettingsOpen(true);
        break;
      default:
        break;
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleTerminalInput = useCallback(
    (originSessionId: string, data: string) => {
      const origin = sessionById.get(originSessionId);
      if (origin && sessionKindIsWebLike(origin.kind)) {
        return;
      }
      const terminalSessionIds = sessionIds.filter((id) => {
        const t = sessionById.get(id);
        return t && !sessionKindIsWebLike(t.kind);
      });
      const targets = isBroadcastModeEnabled
        ? resolveInputTargets(originSessionId, broadcastTargets, terminalSessionIds)
        : [originSessionId];
      for (const target of targets) {
        const t = sessionById.get(target);
        if (t && sessionKindIsWebLike(t.kind)) {
          continue;
        }
        void sendInput(target, data);
      }
    },
    [broadcastTargets, isBroadcastModeEnabled, sessionById, sessionIds],
  );

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSidebarOpen) {
      return;
    }
    event.preventDefault();
    sidebarDragStartXRef.current = event.clientX;
    sidebarDragStartWidthRef.current = sidebarWidth;
    setIsSidebarResizing(true);
  };
  const toggleSidebarPinned = () => {
    clearSidebarHideTimeout();
    setIsSidebarPinned((prev) => !prev);
  };
  const revealSidebar = () => {
    clearSidebarHideTimeout();
    setIsSidebarVisible(true);
  };
  const toggleHostSidebar = () => {
    clearSidebarHideTimeout();
    setIsSidebarVisible((prev) => !prev);
  };
  const maybeHideSidebar = () => {
    if (isSidebarPinned || isSidebarResizing) {
      clearSidebarHideTimeout();
      return;
    }
    clearSidebarHideTimeout();
    hideSidebarTimeoutRef.current = setTimeout(() => {
      setIsSidebarVisible(false);
      hideSidebarTimeoutRef.current = null;
    }, SIDEBAR_AUTO_HIDE_DELAY_MS);
  };

  const focusNextPaneFromShortcut = useCallback(() => {
    if (paneOrder.length === 0) {
      return;
    }
    const idx = paneOrder.indexOf(activePaneIndex);
    const base = idx >= 0 ? idx : 0;
    const next = paneOrder[(base + 1) % paneOrder.length];
    setActivePaneIndex(next);
    const sid = splitSlots[next];
    if (sid) {
      requestTerminalFocus(sid);
    }
  }, [paneOrder, activePaneIndex, splitSlots, requestTerminalFocus]);

  const focusPreviousPaneFromShortcut = useCallback(() => {
    if (paneOrder.length === 0) {
      return;
    }
    const idx = paneOrder.indexOf(activePaneIndex);
    const base = idx >= 0 ? idx : 0;
    const prev = paneOrder[(base - 1 + paneOrder.length) % paneOrder.length];
    setActivePaneIndex(prev);
    const sid = splitSlots[prev];
    if (sid) {
      requestTerminalFocus(sid);
    }
  }, [paneOrder, activePaneIndex, splitSlots, requestTerminalFocus]);

  const shortcutSnapshotRef = useRef({ overlayOpen: false });
  const keyboardShortcutSuspendEscapeRef = useRef(false);
  const shortcutActionsRef = useRef<KeyboardShortcutEngineActions>({
    openSettings: () => {},
    toggleSidebar: () => {},
    openQuickConnect: () => {},
    openLayoutCommandCenter: () => {},
    focusNextPane: () => {},
    focusPreviousPane: () => {},
    dismissPrimaryOverlay: () => {},
    openSettingsKeyboardTab: () => {},
  });

  shortcutSnapshotRef.current = {
    overlayOpen:
      Boolean(hostContextMenu) ||
      contextMenu.visible ||
      Boolean(activeTrustPrompt) ||
      isQuickConnectModalOpen ||
      isAddHostModalOpen ||
      isLayoutCommandCenterOpen ||
      isAppSettingsOpen,
  };

  shortcutActionsRef.current = {
    openSettings: () => setIsAppSettingsOpen(true),
    toggleSidebar: () => toggleHostSidebar(),
    openQuickConnect: () => openQuickConnectModal(null),
    openLayoutCommandCenter: () => setIsLayoutCommandCenterOpen(true),
    focusNextPane: () => focusNextPaneFromShortcut(),
    focusPreviousPane: () => focusPreviousPaneFromShortcut(),
    dismissPrimaryOverlay: () => {
      if (hostContextMenu) {
        setHostContextMenu(null);
        return;
      }
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        return;
      }
      if (activeTrustPrompt) {
        dismissTrustPrompt(activeTrustPrompt.sessionId);
        return;
      }
      if (isQuickConnectModalOpen) {
        closeQuickConnectModal();
        return;
      }
      if (isAddHostModalOpen) {
        closeAddHostModal();
        return;
      }
      if (isLayoutCommandCenterOpen) {
        setIsLayoutCommandCenterOpen(false);
        return;
      }
      if (isAppSettingsOpen) {
        setIsAppSettingsOpen(false);
      }
    },
    openSettingsKeyboardTab: () => {
      setIsAppSettingsOpen(true);
      setActiveAppSettingsTab("interface");
      setInterfaceSubTab("keyboard");
    },
  };

  useAppKeyboardShortcutEngine(
    keyboardShortcutChords,
    keyboardLeaderChord,
    () => shortcutSnapshotRef.current,
    shortcutActionsRef,
    keyboardShortcutSuspendEscapeRef,
  );

  const resolveHelpShortcutLabel = useCallback(
    (action: string) => {
      const def = KEYBOARD_SHORTCUT_DEFINITIONS.find((d) => d.helpAction === action);
      if (!def) {
        return undefined;
      }
      return formatChordDisplay(keyboardShortcutChords[def.id]);
    },
    [keyboardShortcutChords],
  );

  const shortcutCheatsheetLines = useMemo(() => {
    const leaderLine = { label: "Leader key (then follow-up key)", keys: formatChordDisplay(keyboardLeaderChord) };
    const rest = KEYBOARD_SHORTCUT_DEFINITIONS.map((d) => ({
      label: d.label,
      keys: formatChordDisplay(keyboardShortcutChords[d.id]),
    }));
    return [leaderLine, ...rest];
  }, [keyboardShortcutChords, keyboardLeaderChord]);

  const splitFocusedPane = (
    direction: "left" | "right" | "top" | "bottom",
    paneIndex = activePaneIndex,
    splitMode: SplitMode = "duplicate",
  ) => {
    const targetPane = paneOrder.includes(paneIndex) ? paneIndex : (paneOrder[0] ?? 0);
    let sourceSessionId = splitSlots[targetPane] ?? null;
    if (splitMode === "duplicate" && !sourceSessionId) {
      const fallbackSessionId =
        splitSlots[activePaneIndex] ??
        paneOrder.map((pi) => splitSlots[pi]).find((sid): sid is string => Boolean(sid)) ??
        splitSlots.find((sid): sid is string => Boolean(sid)) ??
        sessions[0]?.id ??
        null;
      sourceSessionId = fallbackSessionId;
    }
    const newPaneIndex = nextPaneIndexRef.current;
    nextPaneIndexRef.current += 1;
    const splitId = `split-${nextSplitIdRef.current}`;
    nextSplitIdRef.current += 1;
    const optimisticDuplicateSessionId =
      splitMode === "duplicate" && sourceSessionId ? sourceSessionId : null;
    setSplitSlots((prev) => {
      const next = ensurePaneIndex(prev, newPaneIndex);
      if (optimisticDuplicateSessionId != null) {
        next[newPaneIndex] = optimisticDuplicateSessionId;
      } else if (next[newPaneIndex] === undefined) {
        next[newPaneIndex] = null;
      }
      return next;
    });
    setPaneLayouts((prev) => {
      const next = [...prev];
      if (!next[newPaneIndex]) {
        next[newPaneIndex] = createPaneLayoutItem();
      }
      return next;
    });
    setSplitTree((prev) =>
      replacePaneInTree(prev, targetPane, (leaf) => {
        const insertedLeaf = createLeafNode(newPaneIndex);
        let splitNode;
        if (direction === "left") {
          splitNode = {
            id: splitId,
            type: "split",
            axis: "horizontal",
            ratio: splitRatioDefaultValue,
            first: insertedLeaf,
            second: leaf,
          };
        } else if (direction === "right") {
          splitNode = {
            id: splitId,
            type: "split",
            axis: "horizontal",
            ratio: splitRatioDefaultValue,
            first: leaf,
            second: insertedLeaf,
          };
        } else if (direction === "top") {
          splitNode = {
            id: splitId,
            type: "split",
            axis: "vertical",
            ratio: splitRatioDefaultValue,
            first: insertedLeaf,
            second: leaf,
          };
        } else {
          splitNode = {
            id: splitId,
            type: "split",
            axis: "vertical",
            ratio: splitRatioDefaultValue,
            first: leaf,
            second: insertedLeaf,
          };
        }
        return splitNode as SplitTreeNode;
      }),
    );
    setActivePaneIndex(newPaneIndex);
    if (splitMode === "duplicate" && sourceSessionId) {
      const sourceSession = sessions.find((session) => session.id === sourceSessionId) ?? null;
      if (!sourceSession) {
        setSplitSlots((prev) => clearPaneAtIndex(prev, newPaneIndex));
      } else {
        void spawnSessionFromExistingSession(sourceSession).then((spawnedSessionId) => {
          if (!spawnedSessionId) {
            setSplitSlots((prev) => clearPaneAtIndex(prev, newPaneIndex));
            return;
          }
          setSplitSlots((prev) => assignSessionToPane(prev, newPaneIndex, spawnedSessionId));
          setActiveSession(spawnedSessionId);
        });
      }
    }
    return newPaneIndex;
  };

  const handleProxmoxQemuVncInPane = useCallback(
    (ctx: {
      clusterId: string;
      node: string;
      vmid: string;
      label: string;
      allowInsecureTls: boolean;
      proxmoxBaseUrl: string;
      tlsTrustedCertPem?: string;
    }) => {
      setError("");
      const base = ctx.proxmoxBaseUrl.trim();
      if (!base) {
        setError("Proxmox base URL is missing for this cluster.");
        return;
      }
      const id = `pxvnc-${createId()}`;
      setSessions((prev) => [
        ...prev,
        {
          id,
          kind: "proxmoxQemuVnc" as const,
          label: ctx.label.trim() || `noVNC ${ctx.vmid}`,
          clusterId: ctx.clusterId,
          node: ctx.node,
          vmid: ctx.vmid,
          proxmoxBaseUrl: base,
          ...(ctx.allowInsecureTls ? { allowInsecureTls: true as const } : {}),
          ...(ctx.tlsTrustedCertPem?.trim() ? { tlsTrustedCertPem: ctx.tlsTrustedCertPem.trim() } : {}),
        },
      ]);
      const autoSplitDirection: "right" | "bottom" =
        workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true ? "bottom" : "right";
      const firstFree = findFirstFreePaneInOrder(paneOrder, splitSlots);
      const targetPaneIndex =
        firstFree !== null ? firstFree : splitFocusedPane(autoSplitDirection, activePaneIndex, "empty");
      setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, id));
      setActivePaneIndex(targetPaneIndex);
      setActiveSession(id);
    },
    [activePaneIndex, activeWorkspaceId, paneOrder, splitFocusedPane, splitSlots, workspaceSnapshots],
  );

  const handleProxmoxLxcConsoleInPane = useCallback(
    (ctx: {
      clusterId: string;
      node: string;
      vmid: string;
      label: string;
      allowInsecureTls: boolean;
      proxmoxBaseUrl: string;
      tlsTrustedCertPem?: string;
    }) => {
      setError("");
      const base = ctx.proxmoxBaseUrl.trim();
      if (!base) {
        setError("Proxmox base URL is missing for this cluster.");
        return;
      }
      const id = `pxlxc-${createId()}`;
      setSessions((prev) => [
        ...prev,
        {
          id,
          kind: "proxmoxLxcTerm" as const,
          label: ctx.label.trim() || `LXC ${ctx.vmid}`,
          clusterId: ctx.clusterId,
          node: ctx.node,
          vmid: ctx.vmid,
          proxmoxBaseUrl: base,
          ...(ctx.allowInsecureTls ? { allowInsecureTls: true as const } : {}),
          ...(ctx.tlsTrustedCertPem?.trim() ? { tlsTrustedCertPem: ctx.tlsTrustedCertPem.trim() } : {}),
        },
      ]);
      const autoSplitDirection: "right" | "bottom" =
        workspaceSnapshots[activeWorkspaceId]?.preferVerticalNewPanes === true ? "bottom" : "right";
      const firstFree = findFirstFreePaneInOrder(paneOrder, splitSlots);
      const targetPaneIndex =
        firstFree !== null ? firstFree : splitFocusedPane(autoSplitDirection, activePaneIndex, "empty");
      setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, id));
      setActivePaneIndex(targetPaneIndex);
      setActiveSession(id);
    },
    [activePaneIndex, activeWorkspaceId, paneOrder, splitFocusedPane, splitSlots, workspaceSnapshots],
  );

  const startSplitResize = (splitId: string, axis: SplitAxis) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSplitResizeState({ splitId, axis });
  };

  const refreshLayoutProfiles = async () => {
    const next = await listLayoutProfiles();
    setLayoutProfiles(next);
    return next;
  };

  const saveCurrentLayoutProfile = async () => {
    const structureSnapshot = cloneSplitTree(splitTree);
    const mirrorWorkspaceId = layoutMirrorWorkspaceIdOnSave;
    const mirrorFromWorkspaceId = activeWorkspaceId;
    const trimmedName = layoutProfileName.trim();
    const fallbackName = selectedLayoutProfile?.name ?? `Layout ${new Date().toLocaleString()}`;
    const name = trimmedName.length > 0 ? trimmedName : fallbackName;
    const now = Math.floor(Date.now() / 1000);
    const profileId =
      selectedLayoutProfile?.id ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `layout-${Date.now()}`);

    const profile: LayoutProfile = {
      id: profileId,
      name,
      withHosts: saveLayoutWithHosts,
      panes: paneOrder.map((paneIndex) => {
        const pane = paneLayouts[paneIndex] ?? createPaneLayoutItem();
        const sessionId = splitSlots[paneIndex] ?? null;
        const paneSession = sessionId ? sessionById.get(sessionId) ?? null : null;
        if (!saveLayoutWithHosts || !paneSession) {
          return {
            width: pane.width,
            height: pane.height,
            hostAlias: null,
          };
        }
        if (paneSession.kind === "sshSaved") {
          return {
            width: pane.width,
            height: pane.height,
            hostAlias: paneSession.hostAlias,
            sessionKind: "sshSaved" as const,
          };
        }
        if (paneSession.kind === "local") {
          return {
            width: pane.width,
            height: pane.height,
            hostAlias: null,
            sessionKind: "local" as const,
          };
        }
        if (sessionKindIsWebLike(paneSession.kind)) {
          return {
            width: pane.width,
            height: pane.height,
            hostAlias: null,
          };
        }
        if (paneSession.kind === "sshQuick") {
          return {
            width: pane.width,
            height: pane.height,
            hostAlias: null,
            sessionKind: "sshQuick" as const,
            quickSsh: { ...paneSession.request },
          };
        }
        return {
          width: pane.width,
          height: pane.height,
          hostAlias: null,
        };
      }),
      splitTree: serializeSplitTree(splitTree),
      createdAt: selectedLayoutProfile?.createdAt ?? now,
      updatedAt: now,
    };

    await saveLayoutProfile(profile);
    const next = await refreshLayoutProfiles();
    setSelectedLayoutProfileId(profile.id);
    setLayoutProfileName(profile.name);
    if (!next.some((entry) => entry.id === profile.id)) {
      setSelectedLayoutProfileId(next[0]?.id ?? "");
    }
    if (
      mirrorWorkspaceId &&
      mirrorWorkspaceId !== mirrorFromWorkspaceId &&
      workspaceSnapshots[mirrorWorkspaceId]
    ) {
      applyRuntimeSplitTreeToWorkspace(mirrorWorkspaceId, structureSnapshot);
    }
  };

  const loadSelectedLayoutProfile = async () => {
    if (!selectedLayoutProfile) {
      return;
    }
    const parsedTree = parseSplitTree(selectedLayoutProfile.splitTree);
    const profilePaneOrder = parsedTree ? collectPaneOrder(parsedTree) : selectedLayoutProfile.panes.map((_, index) => index);
    const mappedSlots: Array<string | null> = [];
    const mappedLayouts: PaneLayoutItem[] = [];
    const consumedSessionIds = new Set<string>();
    for (let index = 0; index < selectedLayoutProfile.panes.length; index += 1) {
      const pane = selectedLayoutProfile.panes[index];
      const paneIndex = profilePaneOrder[index] ?? index;
      let sessionId: string | null = null;
      if (selectedLayoutProfile.withHosts) {
        const restoreKind =
          pane.sessionKind ?? (pane.hostAlias ? ("sshSaved" as const) : null);
        if (restoreKind === "sshSaved" && pane.hostAlias) {
          const existingSession = sessions.find(
            (session) =>
              session.kind === "sshSaved" &&
              session.hostAlias === pane.hostAlias &&
              !consumedSessionIds.has(session.id),
          );
          if (existingSession) {
            sessionId = existingSession.id;
          } else if (hosts.some((host) => host.host === pane.hostAlias)) {
            const hostConfig = hosts.find((host) => host.host === pane.hostAlias) ?? null;
            if (hostConfig) {
              sessionId = await connectToHost(hostConfig);
            }
          }
        } else if (restoreKind === "local") {
          try {
            const started = await startLocalSession();
            setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
            sessionId = started.session_id;
          } catch (e) {
            setError(String(e));
            sessionId = null;
          }
        } else if (restoreKind === "sshQuick" && pane.quickSsh && pane.quickSsh.hostName.trim().length > 0) {
          try {
            const req = pane.quickSsh;
            const started = await startQuickSshSession(req);
            const quickLabel = req.user ? `${req.user}@${req.hostName}` : req.hostName;
            setSessions((prev) => [
              ...prev,
              {
                id: started.session_id,
                kind: "sshQuick",
                label: `Quick: ${quickLabel}`,
                request: { ...req },
              },
            ]);
            sessionId = started.session_id;
          } catch (e) {
            setError(String(e));
            sessionId = null;
          }
        }
        if (sessionId) {
          consumedSessionIds.add(sessionId);
        }
      }
      mappedSlots[paneIndex] = sessionId;
      mappedLayouts[paneIndex] = {
        id: createPaneLayoutItem().id,
        width: Math.max(MIN_PANE_WIDTH, pane.width),
        height: Math.max(MIN_PANE_HEIGHT, pane.height),
      };
    }
    const fallbackTree = createTreeFromPaneCount(Math.max(1, selectedLayoutProfile.panes.length));
    const nextTree = parsedTree ?? fallbackTree;
    const nextPaneOrder = collectPaneOrder(nextTree);
    const maxPaneIndex = Math.max(0, ...nextPaneOrder);
    const normalizedSlots = Array.from({ length: maxPaneIndex + 1 }, (_, paneIndex) => mappedSlots[paneIndex] ?? null);
    const normalizedLayouts = Array.from(
      { length: maxPaneIndex + 1 },
      (_, paneIndex) => mappedLayouts[paneIndex] ?? createPaneLayoutItem(),
    );
    pendingProfileLoadSessionIdsRef.current = new Set(normalizedSlots.filter((slot): slot is string => Boolean(slot)));
    setSplitTree(nextTree);
    setSplitSlots(normalizedSlots);
    setPaneLayouts(normalizedLayouts);
    setActivePaneIndex(nextPaneOrder[0] ?? 0);
    nextPaneIndexRef.current = maxPaneIndex + 1;
    nextSplitIdRef.current = Math.max(1, nextPaneOrder.length);
  };

  const deleteSelectedLayoutProfile = async () => {
    if (!selectedLayoutProfileId) {
      return;
    }
    await deleteLayoutProfile(selectedLayoutProfileId);
    const next = await refreshLayoutProfiles();
    setSelectedLayoutProfileId(next[0]?.id ?? "");
    setPendingLayoutProfileDeleteId("");
  };
  const handleDeleteSelectedLayoutProfileIntent = async () => {
    if (!selectedLayoutProfileId) {
      return;
    }
    if (pendingLayoutProfileDeleteId !== selectedLayoutProfileId) {
      setPendingLayoutProfileDeleteId(selectedLayoutProfileId);
      return;
    }
    await deleteSelectedLayoutProfile();
  };

  const paneFileViewForPane = useCallback(
    (paneIndex: number) => {
      if (!fileWorkspacePluginEnabled) {
        return "terminal";
      }
      const sid = splitSlots[paneIndex] ?? null;
      if (!sid) {
        return "terminal";
      }
      return sessionFileViews[sid] ?? "terminal";
    },
    [fileWorkspacePluginEnabled, splitSlots, sessionFileViews],
  );

  const paneContextSessionKindForPane = useCallback(
    (paneIndex: number): PaneContextSessionKind => {
      const sid = splitSlots[paneIndex] ?? null;
      if (!sid) {
        return "empty";
      }
      const session = sessions.find((s) => s.id === sid);
      if (!session) {
        return "empty";
      }
      if (sessionKindIsWebLike(session.kind)) {
        return "web";
      }
      return session.kind === "local" ? "local" : "ssh";
    },
    [splitSlots, sessions],
  );

  const remoteSshSpecForPane = useCallback(
    (paneIndex: number): RemoteSshSpec | null => {
      const sid = splitSlots[paneIndex] ?? null;
      if (!sid) {
        return null;
      }
      const session = sessions.find((s) => s.id === sid);
      if (!session || session.kind === "local" || sessionKindIsWebLike(session.kind)) {
        return null;
      }
      if (session.kind === "sshSaved") {
        const hostEntry = hosts.find((h) => h.host === session.hostAlias);
        if (!hostEntry) {
          return null;
        }
        return { kind: "saved", host: hostEntry };
      }
      if (session.kind === "sshQuick") {
        return { kind: "quick", request: session.request };
      }
      return null;
    },
    [splitSlots, sessions, hosts],
  );

  const onLocalFilePanePathChange = useCallback((paneIndex: number, pathKey: string) => {
    localFilePanePathsRef.current[paneIndex] = pathKey;
  }, []);

  const webPanePayloadForPane = useCallback(
    (paneIndex: number): { url: string; title: string; allowInsecureTls?: boolean } | null => {
      const sid = splitSlots[paneIndex] ?? null;
      if (!sid) {
        return null;
      }
      const session = sessions.find((s) => s.id === sid);
      if (!session || session.kind !== "web") {
        return null;
      }
      return {
        url: session.url,
        title: session.label,
        ...(session.allowInsecureTls ? { allowInsecureTls: true } : {}),
      };
    },
    [splitSlots, sessions],
  );

  const proxmoxNativeConsoleForPane = useCallback(
    (paneIndex: number) => {
      const sid = splitSlots[paneIndex] ?? null;
      if (!sid) {
        return null;
      }
      const session = sessions.find((s) => s.id === sid);
      if (!session) {
        return null;
      }
      if (session.kind === "proxmoxQemuVnc") {
        return {
          kind: "qemu-vnc" as const,
          clusterId: session.clusterId,
          node: session.node,
          vmid: session.vmid,
          paneTitle: session.label,
          proxmoxBaseUrl: session.proxmoxBaseUrl,
          ...(session.allowInsecureTls ? { allowInsecureTls: true as const } : {}),
          ...(session.tlsTrustedCertPem ? { tlsTrustedCertPem: session.tlsTrustedCertPem } : {}),
        };
      }
      if (session.kind === "proxmoxLxcTerm") {
        return {
          kind: "lxc-term" as const,
          clusterId: session.clusterId,
          node: session.node,
          vmid: session.vmid,
          paneTitle: session.label,
          proxmoxBaseUrl: session.proxmoxBaseUrl,
          ...(session.allowInsecureTls ? { allowInsecureTls: true as const } : {}),
          ...(session.tlsTrustedCertPem ? { tlsTrustedCertPem: session.tlsTrustedCertPem } : {}),
        };
      }
      return null;
    },
    [splitSlots, sessions],
  );

  const proxmoxQemuVncForPane = useCallback(
    (paneIndex: number) => {
      const px = proxmoxNativeConsoleForPane(paneIndex);
      return px?.kind === "qemu-vnc" ? px : null;
    },
    [proxmoxNativeConsoleForPane],
  );

  const proxmoxQemuVncReconnectNonceForPane = useCallback(
    (paneIndex: number): number => proxmoxQemuVncReconnectNonces[paneIndex] ?? 0,
    [proxmoxQemuVncReconnectNonces],
  );

  const requestProxmoxQemuVncReconnect = useCallback((paneIndex: number) => {
    setProxmoxQemuVncReconnectNonces((prev) => ({
      ...prev,
      [paneIndex]: (prev[paneIndex] ?? 0) + 1,
    }));
  }, []);

  const openProxmoxQemuVncInAppWindow = useCallback(
    (paneIndex: number) => {
      const px = proxmoxQemuVncForPane(paneIndex);
      if (!px) {
        return;
      }
      setError("");
      const consoleUrl = buildProxmoxConsoleUrl(px.proxmoxBaseUrl, {
        kind: "qemu",
        node: px.node,
        vmid: px.vmid,
      });
      void openProxmoxInAppWebviewWindow({
        title: px.paneTitle,
        consoleUrl,
        allowInsecureTls: px.allowInsecureTls === true,
      })
        .then((result) => {
          if (result.loginFirst && !result.reused) {
            setProxmoxWebLoginAssist({ label: result.label, consoleUrl });
          }
        })
        .catch((e) => {
          setError(String(e));
        });
    },
    [proxmoxQemuVncForPane],
  );

  const openProxmoxQemuVncInBrowser = useCallback(
    (paneIndex: number) => {
      const px = proxmoxQemuVncForPane(paneIndex);
      if (!px) {
        return;
      }
      setError("");
      const consoleUrl = buildProxmoxConsoleUrl(px.proxmoxBaseUrl, {
        kind: "qemu",
        node: px.node,
        vmid: px.vmid,
      });
      void openExternalUrl(consoleUrl).catch((e) => {
        setError(String(e));
      });
    },
    [proxmoxQemuVncForPane],
  );

  const proxmoxLxcForPane = useCallback(
    (paneIndex: number) => {
      const px = proxmoxNativeConsoleForPane(paneIndex);
      return px?.kind === "lxc-term" ? px : null;
    },
    [proxmoxNativeConsoleForPane],
  );

  const proxmoxLxcReconnectNonceForPane = useCallback(
    (paneIndex: number): number => proxmoxLxcReconnectNonces[paneIndex] ?? 0,
    [proxmoxLxcReconnectNonces],
  );

  const requestProxmoxLxcReconnect = useCallback((paneIndex: number) => {
    setProxmoxLxcReconnectNonces((prev) => ({
      ...prev,
      [paneIndex]: (prev[paneIndex] ?? 0) + 1,
    }));
  }, []);

  const openProxmoxLxcInAppWindow = useCallback(
    (paneIndex: number) => {
      const px = proxmoxLxcForPane(paneIndex);
      if (!px) {
        return;
      }
      setError("");
      const consoleUrl = buildProxmoxConsoleUrl(px.proxmoxBaseUrl, {
        kind: "lxc",
        node: px.node,
        vmid: px.vmid,
      });
      void openProxmoxInAppWebviewWindow({
        title: px.paneTitle,
        consoleUrl,
        allowInsecureTls: px.allowInsecureTls === true,
      })
        .then((result) => {
          if (result.loginFirst && !result.reused) {
            setProxmoxWebLoginAssist({ label: result.label, consoleUrl });
          }
        })
        .catch((e) => {
          setError(String(e));
        });
    },
    [proxmoxLxcForPane],
  );

  const openProxmoxLxcInBrowser = useCallback(
    (paneIndex: number) => {
      const px = proxmoxLxcForPane(paneIndex);
      if (!px) {
        return;
      }
      setError("");
      const consoleUrl = buildProxmoxConsoleUrl(px.proxmoxBaseUrl, {
        kind: "lxc",
        node: px.node,
        vmid: px.vmid,
      });
      void openExternalUrl(consoleUrl).catch((e) => {
        setError(String(e));
      });
    },
    [proxmoxLxcForPane],
  );

  const getFileExportDestPath = useCallback(async () => {
    return resolveFileExportDestPath(fileExportDestMode, fileExportPathKey);
  }, [fileExportDestMode, fileExportPathKey]);

  const renderSplitNode = createSplitPaneRenderer({
    splitSlots,
    activePaneIndex,
    paneOrder,
    resolvePaneLabel,
    showFullPathInFilePaneTitle,
    highlightedHostPaneIndices,
    hasHighlightedHostTargets,
    highlightedHostAlias,
    draggingKind,
    dragOverPaneIndex,
    activeDropZonePaneIndex,
    activeDropZone,
    draggingSessionIdRef,
    setActivePaneIndex,
    setActiveSession,
    requestTerminalFocus,
    setDragOverPaneIndex,
    setActiveDropZonePaneIndex,
    setActiveDropZone,
    resolveDropEffect,
    resolvePaneDropZone,
    handlePaneDrop,
    setHostContextMenu,
    setContextMenu,
    shouldSplitAsEmpty,
    expandedPaneToolbarIndices,
    setExpandedPaneToolbarIndices,
    handleContextAction,
    isBroadcastModeEnabled,
    setBroadcastMode,
    visiblePaneSessionIds,
    broadcastEligibleVisiblePaneSessionIds,
    broadcastTargets,
    terminalFontSize,
    terminalFontFamily,
    handleTerminalInput,
    connectLocalShellInPane,
    logoTransparentSrc: logoTransparent,
    splitNodeRefs,
    startSplitResize,
    setDragPayload,
    setDraggingKind,
    missingDragPayloadLoggedRef,
    paneFileViewForPane,
    paneContextSessionKindForPane,
    remoteSshSpecForPane,
    onLocalFilePanePathChange,
    getFileExportDestPath,
    fileExportArchiveFormat,
    onFilePaneTitleChange,
    semanticFileNameColors: filePaneSemanticNameColors.enabled,
    fileWorkspacePluginEnabled,
    webPanePayloadForPane,
    proxmoxNativeConsoleForPane,
    proxmoxQemuVncReconnectNonceForPane,
    requestProxmoxQemuVncReconnect,
    openProxmoxQemuVncInAppWindow,
    openProxmoxQemuVncInBrowser,
    proxmoxLxcReconnectNonceForPane,
    requestProxmoxLxcReconnect,
    openProxmoxLxcInAppWindow,
    openProxmoxLxcInBrowser,
    onWebPaneOpenInAppWindowError: setError,
    onWebPaneLoginFirstWebviewOpen,
    onSessionWorkingDirectoryChange: handleSessionWorkingDirectoryChange,
    verticalStackScrollEnabled,
    registerPaneScrollAnchor,
  });

  const appShellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--sidebar-layout-width": isSidebarOpen ? `${sidebarWidth}px` : "18px",
    "--shell-grid-gap": isSidebarOpen ? "var(--space-2)" : "var(--space-1)",
    "--sidebar-resize-track-width": isSidebarOpen ? "12px" : "0px",
  } as CSSProperties;
  const contextMenuPaneSessionId =
    contextMenu.paneIndex !== null && contextMenu.paneIndex >= 0 ? (splitSlots[contextMenu.paneIndex] ?? null) : null;
  const contextPaneSessionKindForMenu: PaneContextSessionKind = (() => {
    if (!contextMenuPaneSessionId) {
      return "empty";
    }
    const session = sessions.find((s) => s.id === contextMenuPaneSessionId);
    if (!session) {
      return "empty";
    }
    if (sessionKindIsWebLike(session.kind)) {
      return "web";
    }
    return session.kind === "local" ? "local" : "ssh";
  })();
  const contextPaneFileViewForMenu =
    !fileWorkspacePluginEnabled || !contextMenuPaneSessionId
      ? "terminal"
      : (sessionFileViews[contextMenuPaneSessionId] ?? "terminal");
  const workspaceSendTargets =
    contextMenuPaneSessionId && workspaceTabs.length > 1
      ? workspaceTabs.filter((workspace) => workspace.id !== activeWorkspaceId)
      : [];
  const workspaceSendPlaceholder =
    Boolean(contextMenuPaneSessionId) && workspaceTabs.length === 1;

  return (
    <main
      className={`app-shell ${isSidebarResizing ? "is-resizing" : ""} ${
        isSidebarOpen ? "is-sidebar-open" : "is-sidebar-hidden"
      } ${isSidebarPinned ? "is-sidebar-pinned" : "is-sidebar-unpinned"}${
        layoutMode === "wide" ? " app-shell--layout-wide" : ""
      }${layoutMode === "compact" ? " app-shell--layout-compact" : ""}${
        isStackedShell ? " app-shell--stacked-mobile" : ""
      }${isStackedShell && mobileShellTab === "hosts" ? " app-shell--mobile-panel-hosts" : ""}${
        isStackedShell && mobileShellTab === "terminal" ? " app-shell--mobile-panel-terminal" : ""
      }`}
      data-density={densityProfile}
      data-density-offset={uiDensityOffset}
      data-list-tone={listTonePreset}
      data-frame-mode={frameModePreset}
      data-ui-font={uiFontPreset}
      style={appShellStyle}
      onContextMenuCapture={(event) => {
        if (allowNativeBrowserContextMenu(event.target)) {
          return;
        }
        event.preventDefault();
      }}
    >
      {proxmoxWebLoginAssist ? (
        <div className="proxmox-login-assist-banner" role="status">
          <span className="proxmox-login-assist-banner-text">
            Log in to Proxmox in the window that opened. The console opens automatically once the UI loads after
            login, or use Continue below if it does not.
          </span>
          <div className="proxmox-login-assist-banner-actions">
            <button type="button" className="btn btn-primary" onClick={() => void handleProxmoxContinueToConsole()}>
              Continue to console
            </button>
            <button type="button" className="btn btn-settings-tool" onClick={() => setProxmoxWebLoginAssist(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={`left-rail-edge-strip${isSidebarOpen ? "" : " left-rail-edge-strip--collapsed"}`}
        onMouseEnter={() => {
          if (!isSidebarPinned && !isSidebarOpen) {
            revealSidebar();
          }
        }}
      >
        {!isSidebarOpen && (
          <button
            type="button"
            className="btn sidebar-rail-toggle-btn"
            aria-label="Expand host sidebar"
            title="Expand host sidebar"
            onClick={() => {
              clearSidebarHideTimeout();
              setIsSidebarVisible(true);
            }}
          >
            <svg className="sidebar-rail-toggle-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 7.5l5.25 4.5L9 16.5" />
                <path d="M14.25 7.5l5.25 4.5-5.25 4.5" />
              </g>
            </svg>
          </button>
        )}
      </div>
      {!isStackedShell && !isSidebarPinned && !isSidebarOpen ? (
        <div
          className="left-rail-hover-reveal-zone"
          aria-hidden
          onMouseEnter={revealSidebar}
        />
      ) : null}
      <HostSidebar
        isSidebarOpen={isSidebarOpen}
        isSidebarPinned={isSidebarPinned}
        onToggleSidebarPinned={toggleSidebarPinned}
        onMouseEnter={revealSidebar}
        onMouseLeave={maybeHideSidebar}
        logoSrc={logoTextTransparent}
        isQuickAddMenuOpen={isQuickAddMenuOpen}
        quickAddMenuRef={quickAddMenuRef}
        onOpenSettings={() => setIsAppSettingsOpen(true)}
        onToggleQuickAddMenu={() => setIsQuickAddMenuOpen((prev) => !prev)}
        onConnectLocalInActivePane={() => void connectLocalShellInNewPane(activePaneIndex)}
        onOpenQuickConnect={() => openQuickConnectModal()}
        onOpenAddHost={openAddHostModal}
        sidebarViews={sidebarViews}
        selectedSidebarViewId={selectedSidebarViewId}
        onSelectSidebarView={setSelectedSidebarViewId}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        showAdvancedFilters={showAdvancedFilters}
        onToggleAdvancedFilters={() => setShowAdvancedFilters((prev) => !prev)}
        onCloseAdvancedFilters={closeAdvancedFilters}
        listFilterCount={selectedSidebarViewId === "builtin:proxmux" ? proxmuxResourceCount : filteredHostRows.length}
        showHostAdvancedFilters={selectedSidebarViewId !== "builtin:proxmux"}
        searchInputPlaceholder={
          selectedSidebarViewId === "builtin:proxmux"
            ? "Filter name, node, VMID, status, IPv4, IPv6…"
            : undefined
        }
        proxmuxPanel={
          proxmuxSidebarAvailable ? (
            <ProxmuxSidebarPanel
              searchQuery={searchQuery}
              onResourceCountChange={setProxmuxResourceCount}
              onSshToProxmoxNode={handleProxmuxSshNode}
              onOpenProxmoxExternalUrl={handleProxmuxOpenExternalUrl}
              onOpenProxmoxSpice={handleProxmuxSpice}
              usePaneNativeProxmoxConsoles={proxmuxOpenWebConsolesInPane}
              onOpenProxmoxQemuVncInPane={handleProxmoxQemuVncInPane}
              onOpenProxmoxLxcConsoleInPane={handleProxmoxLxcConsoleInPane}
            />
          ) : null
        }
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        portFilter={portFilter}
        onPortFilterChange={setPortFilter}
        availableTags={availableTags}
        selectedTagFilter={selectedTagFilter}
        onSelectedTagFilterChange={setSelectedTagFilter}
        recentOnly={recentOnly}
        onToggleRecent={() => setRecentOnly((prev) => !prev)}
        onClearFilters={clearFilters}
        connectedHostRows={connectedHostRows}
        otherHostRows={otherHostRows}
        hostListRowBridge={{
          activeHost,
          suppressHostClickAliasRef,
          setContextMenu,
          setHostContextMenu,
          setHoveredHostAlias,
          setActiveHost,
          setDragOverPaneIndex,
          toggleFavoriteForHost,
          connectToHostInNewPane,
          setDragPayload,
          setDraggingKind,
          missingDragPayloadLoggedRef,
          onEditHost: (host: HostConfig) => openHostSettingsForHost(host.host),
        }}
      />
      <div className={`sidebar-resize-handle ${isSidebarOpen ? "" : "is-hidden"}`}>
        <div
          className="sidebar-resize-track"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize host sidebar"
          onPointerDown={startSidebarResize}
        />
        <button
          type="button"
          className="btn sidebar-rail-toggle-btn sidebar-rail-toggle-btn--on-separator"
          aria-expanded={isSidebarOpen}
          aria-label="Collapse host sidebar"
          title="Collapse host sidebar"
          onClick={(event) => {
            event.stopPropagation();
            toggleHostSidebar();
          }}
        >
          <svg className="sidebar-rail-toggle-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.75 7.5L9.5 12l5.25 4.5" />
              <path d="M19.5 7.5l-5.25 4.5 5.25 4.5" />
            </g>
          </svg>
        </button>
      </div>

      <TerminalWorkspaceDock
        workspaceTabs={workspaceTabs}
        activeWorkspaceId={activeWorkspaceId}
        switchWorkspace={switchWorkspace}
        parseDragPayload={parseDragPayload}
        sendSessionToWorkspace={sendSessionToWorkspace}
        createWorkspace={createWorkspace}
        removeWorkspace={removeWorkspace}
        renameWorkspace={renameWorkspace}
        setWorkspaceVerticalStacking={setWorkspaceVerticalStacking}
        splitResizeState={splitResizeState}
        verticalStackScrollEnabled={verticalStackScrollEnabled}
        resolvePaneQuickNavLabel={resolvePaneLabel}
        onQuickNavPane={onQuickNavPane}
        isStackedShell={isStackedShell}
        mobileShellTab={mobileShellTab}
        paneOrder={paneOrder}
        activePaneIndex={activePaneIndex}
        nudgeMobilePager={nudgeMobilePager}
        mobilePagerRef={mobilePagerRef}
        handleMobilePagerScroll={handleMobilePagerScroll}
        splitTree={splitTree}
        renderSplitNode={renderSplitNode}
        onOpenLayoutCommandCenter={() => setIsLayoutCommandCenterOpen(true)}
        isBroadcastModeEnabled={isBroadcastModeEnabled}
        broadcastTargetCount={broadcastTargets.size}
      />
      {isAppSettingsOpen && (
        <AppSettingsPanel
          keyboardShortcutChords={keyboardShortcutChords}
          setKeyboardShortcutChords={setKeyboardShortcutChords}
          keyboardLeaderChord={keyboardLeaderChord}
          setKeyboardLeaderChord={setKeyboardLeaderChord}
          resolveHelpShortcutLabel={resolveHelpShortcutLabel}
          shortcutCheatsheetLines={shortcutCheatsheetLines}
          keyboardShortcutSuspendEscapeRef={keyboardShortcutSuspendEscapeRef}
          settingsOpenMode={settingsOpenMode}
          setSettingsOpenMode={setSettingsOpenMode}
          onCloseSettings={() => setIsAppSettingsOpen(false)}
          settingsSectionRef={settingsModalRef}
          onSettingsHeaderPointerDown={handleSettingsHeaderPointerDown}
          isSettingsDragging={isSettingsDragging}
          settingsModalPosition={settingsModalPosition}
          activeAppSettingsTab={activeAppSettingsTab}
          setActiveAppSettingsTab={setActiveAppSettingsTab}
          connectionSubTab={connectionSubTab}
          setConnectionSubTab={setConnectionSubTab}
          workspaceSubTab={workspaceSubTab}
          setWorkspaceSubTab={setWorkspaceSubTab}
          integrationsSubTab={integrationsSubTab}
          setIntegrationsSubTab={setIntegrationsSubTab}
          interfaceSubTab={interfaceSubTab}
          setInterfaceSubTab={setInterfaceSubTab}
          helpAboutSubTab={helpAboutSubTab}
          setHelpAboutSubTab={setHelpAboutSubTab}
          identityStoreSubTab={identityStoreSubTab}
          setIdentityStoreSubTab={setIdentityStoreSubTab}
          densityProfile={densityProfile}
          setDensityProfile={setDensityProfile}
          uiDensityOffset={uiDensityOffset}
          setUiDensityOffset={setUiDensityOffset}
          uiFontPreset={uiFontPreset}
          setUiFontPreset={setUiFontPreset}
          terminalFontPreset={terminalFontPreset}
          setTerminalFontPreset={setTerminalFontPreset}
          terminalFontOffset={terminalFontOffset}
          setTerminalFontOffset={setTerminalFontOffset}
          terminalFontSize={terminalFontSize}
          listTonePreset={listTonePreset}
          setListTonePreset={setListTonePreset}
          frameModePreset={frameModePreset}
          setFrameModePreset={setFrameModePreset}
          showFullPathInFilePaneTitle={showFullPathInFilePaneTitle}
          setShowFullPathInFilePaneTitle={setShowFullPathInFilePaneTitle}
          onResetVisualStyle={resetVisualStyle}
          fileExportDestMode={fileExportDestMode}
          setFileExportDestMode={setFileExportDestMode}
          fileExportPathKey={fileExportPathKey}
          setFileExportPathKey={setFileExportPathKey}
          fileExportArchiveFormat={fileExportArchiveFormat}
          setFileExportArchiveFormat={setFileExportArchiveFormat}
          filePaneSemanticNameColors={filePaneSemanticNameColors}
          setFilePaneSemanticNameColors={setFilePaneSemanticNameColors}
          layoutMode={layoutMode}
          setLayoutMode={setLayoutMode}
          splitRatioPreset={splitRatioPreset}
          setSplitRatioPreset={setSplitRatioPreset}
          autoArrangeMode={autoArrangeMode}
          setAutoArrangeMode={setAutoArrangeMode}
          isBroadcastModeEnabled={isBroadcastModeEnabled}
          setBroadcastMode={setBroadcastMode}
          isSidebarPinned={isSidebarPinned}
          setSidebarPinned={setIsSidebarPinned}
          metadataStore={metadataStore}
          setMetadataStore={setMetadataStore}
          applyDefaultUser={applyDefaultUser}
          setError={setError}
          error={error}
          quickConnectMode={quickConnectMode}
          setQuickConnectMode={setQuickConnectMode}
          quickConnectAutoTrust={quickConnectAutoTrust}
          setQuickConnectAutoTrust={setQuickConnectAutoTrust}
          sortedViewProfiles={sortedViewProfiles}
          selectedViewProfileIdInSettings={selectedViewProfileIdInSettings}
          selectViewProfileForSettings={selectViewProfileForSettings}
          createNewViewDraft={createNewViewDraft}
          reorderView={reorderView}
          deleteCurrentViewDraft={deleteCurrentViewDraft}
          viewDraft={viewDraft}
          setViewDraft={setViewDraft}
          createViewRule={createViewRule}
          saveCurrentViewDraft={saveCurrentViewDraft}
          defaultBackupPath={DEFAULT_BACKUP_PATH}
          backupExportPath={backupExportPath}
          setBackupExportPath={setBackupExportPath}
          backupExportPassword={backupExportPassword}
          setBackupExportPassword={setBackupExportPassword}
          handleExportBackup={handleExportBackup}
          backupImportPath={backupImportPath}
          setBackupImportPath={setBackupImportPath}
          backupImportPassword={backupImportPassword}
          setBackupImportPassword={setBackupImportPassword}
          handleImportBackup={handleImportBackup}
          backupMessage={backupMessage}
          storePassphrase={storePassphrase}
          setStorePassphrase={setStorePassphrase}
          storeUsers={storeUsers}
          storeGroups={storeGroups}
          storeTags={storeTags}
          storeKeys={storeKeys}
          hosts={hosts}
          storeUserDraft={storeUserDraft}
          setStoreUserDraft={setStoreUserDraft}
          addStoreUser={addStoreUser}
          storeGroupDraft={storeGroupDraft}
          setStoreGroupDraft={setStoreGroupDraft}
          addStoreGroup={addStoreGroup}
          storeTagDraft={storeTagDraft}
          setStoreTagDraft={setStoreTagDraft}
          addStoreTag={addStoreTag}
          importStoreUsersFromHosts={importStoreUsersFromHosts}
          updateStoreUser={updateStoreUser}
          deleteStoreUser={deleteStoreUser}
          setStoreUserGroupMembership={setStoreUserGroupMembership}
          updateStoreGroup={updateStoreGroup}
          deleteStoreGroup={deleteStoreGroup}
          updateStoreTag={updateStoreTag}
          deleteStoreTag={deleteStoreTag}
          patchStoreKey={patchStoreKey}
          reorderUserStoreKeys={reorderUserStoreKeys}
          storePathKeyNameDraft={storePathKeyNameDraft}
          setStorePathKeyNameDraft={setStorePathKeyNameDraft}
          storePathKeyPathDraft={storePathKeyPathDraft}
          setStorePathKeyPathDraft={setStorePathKeyPathDraft}
          addStorePathKey={addStorePathKey}
          storeEncryptedKeyNameDraft={storeEncryptedKeyNameDraft}
          setStoreEncryptedKeyNameDraft={setStoreEncryptedKeyNameDraft}
          storeEncryptedPublicKeyDraft={storeEncryptedPublicKeyDraft}
          setStoreEncryptedPublicKeyDraft={setStoreEncryptedPublicKeyDraft}
          storeEncryptedPrivateKeyDraft={storeEncryptedPrivateKeyDraft}
          setStoreEncryptedPrivateKeyDraft={setStoreEncryptedPrivateKeyDraft}
          addStoreEncryptedKey={addStoreEncryptedKey}
          unlockStoreKey={unlockStoreKey}
          removeStoreKey={removeStoreKey}
          sshConfigRaw={sshConfigRaw}
          setSshConfigRaw={setSshConfigRaw}
          onSaveSshConfig={handleSaveSshConfig}
          onExportResolvedOpensshConfig={handleExportResolvedOpensshConfig}
          sshDirInfo={sshDirInfo}
          sshDirOverrideDraft={sshDirOverrideDraft}
          setSshDirOverrideDraft={setSshDirOverrideDraft}
          onApplySshDirOverride={handleApplySshDirOverride}
          onResetSshDirOverride={handleResetSshDirOverride}
          hostSettingsSelectedAlias={hostSettingsSelectedAlias}
          onHostSettingsSelectAlias={onHostSettingsSelectAlias}
          hostSettingsDraftHost={hostSettingsDraftHost}
          setHostSettingsDraftHost={setHostSettingsDraftHost}
          hostSettingsDraftBinding={hostSettingsDraftBinding}
          setHostSettingsDraftBinding={setHostSettingsDraftBinding}
          hostSettingsTagDraft={hostSettingsTagDraft}
          setHostSettingsTagDraft={setHostSettingsTagDraft}
          hostSettingsKeyPolicy={hostSettingsKeyPolicy}
          setHostSettingsKeyPolicy={setHostSettingsKeyPolicy}
          hostSettingsMetadataForSelected={hostSettingsMetadataForSelected}
          onSaveHostSettingsTab={saveHostFromSettingsTab}
          hostSettingsTabSaveDisabled={hostSettingsTabSaveDisabled}
          onRemoveHostSettingsTabIntent={onRemoveHostSettingsTabIntent}
          hostSettingsTabRemoveConfirmActive={pendingRemoveHostsTab}
          toggleFavoriteForHost={toggleFavoriteForHost}
          toggleJumpHostForHost={toggleJumpHostForHost}
          proxmuxOpenWebConsolesInPane={proxmuxOpenWebConsolesInPane}
          setProxmuxOpenWebConsolesInPane={setProxmuxOpenWebConsolesInPane}
        />
      )}
      {isLayoutCommandCenterOpen && (
        <Suspense fallback={null}>
          <LayoutCommandCenter
            open={isLayoutCommandCenterOpen}
            onClose={() => setIsLayoutCommandCenterOpen(false)}
            layoutPresets={LAYOUT_PRESET_DEFINITIONS}
            profiles={layoutProfiles}
            selectedProfileId={selectedLayoutProfileId}
            onSelectProfileId={(id) => {
              setSelectedLayoutProfileId(id);
              setPendingLayoutProfileDeleteId("");
              const nextProfile = layoutProfiles.find((profile) => profile.id === id) ?? null;
              if (nextProfile) {
                setLayoutProfileName(nextProfile.name);
              }
            }}
            profileName={layoutProfileName}
            onProfileNameChange={setLayoutProfileName}
            restoreSessions={saveLayoutWithHosts}
            onRestoreSessionsChange={setSaveLayoutWithHosts}
            onApplyProfile={() => {
              void loadSelectedLayoutProfile().then(() => setIsLayoutCommandCenterOpen(false));
            }}
            onSaveProfile={() => void saveCurrentLayoutProfile()}
            pendingDeleteProfileId={pendingLayoutProfileDeleteId}
            onDeleteProfileIntent={() => void handleDeleteSelectedLayoutProfileIntent()}
            onApplyPreset={handleApplyLayoutPresetFromCommandCenter}
            onApplyCustomGrid={handleApplyCustomGridFromCommandCenter}
            onCloseAllIntent={(withLayoutReset) => void handleCloseAllIntent(withLayoutReset)}
            pendingCloseAllIntent={pendingCloseAllIntent}
            previewTree={layoutCommandCenterPreviewTree}
            applyProfileDisabled={!selectedLayoutProfileId}
            saveDisabled={false}
            closeActionsDisabled={sessions.length === 0}
            workspaceOptions={layoutCommandWorkspaceOptions}
            activeWorkspaceId={activeWorkspaceId}
            layoutTargetWorkspaceId={resolvedLayoutTargetWorkspaceId}
            onLayoutTargetWorkspaceChange={setLayoutTargetWorkspaceId}
            layoutSwitchToTargetAfterApply={layoutSwitchToTargetAfterApply}
            onLayoutSwitchToTargetAfterApplyChange={setLayoutSwitchToTargetAfterApply}
            layoutMirrorWorkspaceIdOnSave={layoutMirrorWorkspaceIdOnSave}
            onLayoutMirrorWorkspaceIdOnSaveChange={setLayoutMirrorWorkspaceIdOnSave}
          />
        </Suspense>
      )}
      {isAddHostModalOpen && (
        <AddHostModal
          newHostDraft={newHostDraft}
          onChangeNewHost={setNewHostDraft}
          storeKeys={storeKeys}
          storeUsers={storeUsers}
          sshHosts={hosts}
          hostMetadataByHost={metadataStore.hosts}
          hostBindingDraft={addHostBindingDraft}
          onHostBindingDraftChange={setAddHostBindingDraft}
          onClose={closeAddHostModal}
          onCreateHost={createHost}
          canCreateHost={canCreateHost}
          error={error}
        />
      )}
      {isQuickConnectModalOpen && (
        <QuickConnectModal
          quickConnectMode={quickConnectMode}
          quickConnectWizardStep={quickConnectWizardStep}
          onWizardStepChange={setQuickConnectWizardStep}
          quickConnectDraft={quickConnectDraft}
          onQuickConnectDraftChange={setQuickConnectDraft}
          quickConnectCommandInput={quickConnectCommandInput}
          onQuickConnectCommandInputChange={setQuickConnectCommandInput}
          quickConnectUserOptions={quickConnectUserOptions}
          onClose={closeQuickConnectModal}
          onModalKeyDown={handleQuickConnectModalKeyDown}
          onProceedWizard={proceedQuickConnectWizard}
          onUserInputKeyDown={handleQuickConnectUserInputKeyDown}
          onCommandInputKeyDown={handleQuickConnectCommandInputKeyDown}
          onApplyUser={applyQuickConnectUser}
          onConnect={() => void connectQuickSshInNewPane()}
          error={error}
        />
      )}
      {activeTrustPrompt && (
        <TrustHostModal
          prompt={activeTrustPrompt}
          saveTrustHostAsDefault={saveTrustHostAsDefault}
          onSaveTrustDefaultChange={setSaveTrustHostAsDefault}
          onClose={dismissTrustPrompt}
          onAccept={acceptTrustPrompt}
          onKeyDown={handleTrustPromptKeyDown}
        />
      )}
      {contextMenu.visible && contextMenu.paneIndex !== null && (
        <PaneContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paneIndex={contextMenu.paneIndex}
          splitMode={contextMenu.splitMode}
          paneSessionId={splitSlots[contextMenu.paneIndex] ?? null}
          paneSessionKind={contextPaneSessionKindForMenu}
          paneFileView={contextPaneFileViewForMenu}
          fileWorkspaceEnabled={fileWorkspacePluginEnabled}
          canClosePane={paneOrder.length > 1}
          broadcastModeEnabled={isBroadcastModeEnabled}
          broadcastCount={broadcastTargets.size}
          freeMoveEnabled={autoArrangeMode === "free"}
          workspaceSendTargets={workspaceSendTargets}
          workspaceSendPlaceholder={workspaceSendPlaceholder}
          onSendToWorkspace={sendSessionToWorkspace}
          onDismiss={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
          onPaneAction={handleContextAction}
        />
      )}
      {hostContextMenu && (
        <HostContextMenu
          x={hostContextMenu.x}
          y={hostContextMenu.y}
          host={hostContextMenu.host}
          workspaces={workspaceTabs}
          onConnectInWorkspace={connectToHostInWorkspace}
          onEditHost={(host: HostConfig) => openHostSettingsForHost(host.host)}
          onClose={() => setHostContextMenu(null)}
        />
      )}
      {isStackedShell && (
        <nav className="mobile-shell-tabbar" aria-label="Mobile workspace">
          <button
            type="button"
            className={`mobile-shell-tabbar-btn ${mobileShellTab === "hosts" ? "is-active" : ""}`}
            aria-current={mobileShellTab === "hosts" ? "page" : undefined}
            onClick={() => setMobileShellTab("hosts")}
          >
            Hosts
          </button>
          <button
            type="button"
            className={`mobile-shell-tabbar-btn ${mobileShellTab === "terminal" ? "is-active" : ""}`}
            aria-current={mobileShellTab === "terminal" ? "page" : undefined}
            onClick={() => setMobileShellTab("terminal")}
          >
            Terminal
          </button>
        </nav>
      )}
    </main>
  );
}
