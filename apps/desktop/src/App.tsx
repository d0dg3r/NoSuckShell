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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
  startLocalSession,
  startQuickSshSession,
  startSession,
  touchHostLastUsed,
} from "./tauri-api";
import { HostForm } from "./components/HostForm";
import {
  AppSettingsPanel,
  type AppSettingsTab,
  type AutoArrangeMode,
  type DensityProfile,
  type FrameModePreset,
  type LayoutMode,
  type ListTonePreset,
  type QuickConnectMode,
  type SettingsOpenMode,
  type SplitRatioPreset,
  type TerminalFontPreset,
  type UiFontPreset,
} from "./components/AppSettingsPanel";

const LayoutCommandCenter = lazy(async () => {
  const m = await import("./components/LayoutCommandCenter");
  return { default: m.LayoutCommandCenter };
});

const TerminalPane = lazy(async () => {
  const m = await import("./components/TerminalPane");
  return { default: m.TerminalPane };
});
import { LAYOUT_PRESET_DEFINITIONS } from "./layoutPresets";
import { buildPaneContextActions, type ContextActionId } from "./features/context-actions";
import {
  buildQuickConnectUserCandidates,
  parseHostPortInput,
  parseQuickConnectCommandInput,
} from "./features/quick-connect";
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
  SessionOutputEvent,
  ViewFilterRule,
  ViewProfile,
  ViewSortField,
  SshDirInfo,
} from "./types";
import logoTextTransparent from "../../../img/logo_text_transparent.png";
import logoTransparent from "../../../img/logo_tranparent.png";

const emptyHost = (): HostConfig => ({
  host: "",
  hostName: "",
  user: "",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

const createQuickConnectDraft = (defaultUser = ""): QuickConnectDraft => ({
  hostName: "",
  user: defaultUser.trim(),
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

type SavedSshSessionTab = {
  id: string;
  kind: "sshSaved";
  hostAlias: string;
};
type QuickSshSessionTab = {
  id: string;
  kind: "sshQuick";
  label: string;
  request: QuickSshSessionRequest;
};
type LocalSessionTab = {
  id: string;
  kind: "local";
  label: string;
};
type SessionTab = SavedSshSessionTab | QuickSshSessionTab | LocalSessionTab;
type QuickConnectDraft = {
  hostName: string;
  user: string;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
};

type HostStatusFilter = "all" | "connected" | "disconnected";

type QuickConnectWizardStep = 1 | 2;
type AutoArrangeActiveMode = "a" | "b" | "c";
type SidebarViewId = "builtin:all" | "builtin:favorites" | `custom:${string}`;
type SplitMode = "duplicate" | "empty";
type WorkspaceSnapshot = {
  id: string;
  name: string;
  splitSlots: Array<string | null>;
  paneLayouts: PaneLayoutItem[];
  splitTree: SplitTreeNode;
  activePaneIndex: number;
  activeSessionId: string;
};
type DragPayload =
  | { type: "session"; sessionId: string }
  | { type: "machine"; hostAlias: string };
type PaneDropZone = "left" | "right" | "top" | "bottom" | "center";
type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  paneIndex: number | null;
  splitMode: SplitMode;
};
type SplitAxis = "horizontal" | "vertical";
type SplitLeafNode = { id: string; type: "leaf"; paneIndex: number };
type SplitContainerNode = {
  id: string;
  type: "split";
  axis: SplitAxis;
  ratio: number;
  first: SplitTreeNode;
  second: SplitTreeNode;
};
type SplitTreeNode = SplitLeafNode | SplitContainerNode;
type SplitResizeState = { splitId: string; axis: SplitAxis };
type TrustPromptRequest = { sessionId: string; hostAlias: string };
const DND_PAYLOAD_MIME = "application/x-nosuckshell-dnd";
const DEFAULT_SPLIT_RATIO = 0.6;
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_AUTO_HIDE_DELAY_MS = 300;
const SIDEBAR_WIDTH_STORAGE_KEY = "nosuckshell.sidebar.width";
const SIDEBAR_PINNED_STORAGE_KEY = "nosuckshell.sidebar.pinned";
const DENSITY_PROFILE_STORAGE_KEY = "nosuckshell.ui.densityProfile";
const LIST_TONE_PRESET_STORAGE_KEY = "nosuckshell.ui.listTonePreset";
const FRAME_MODE_PRESET_STORAGE_KEY = "nosuckshell.ui.frameModePreset";
const TERMINAL_FONT_OFFSET_STORAGE_KEY = "nosuckshell.terminal.fontOffset";
const UI_FONT_PRESET_STORAGE_KEY = "nosuckshell.ui.fontPreset";
const TERMINAL_FONT_PRESET_STORAGE_KEY = "nosuckshell.terminal.fontPreset";
const QUICK_CONNECT_MODE_STORAGE_KEY = "nosuckshell.quickConnect.mode";
const QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY = "nosuckshell.quickConnect.autoTrust";
const SPLIT_RATIO_PRESET_STORAGE_KEY = "nosuckshell.layout.splitRatioPreset";
const AUTO_ARRANGE_MODE_STORAGE_KEY = "nosuckshell.layout.autoArrangeMode";

const parseStoredAutoArrangeMode = (raw: string | null): AutoArrangeMode => {
  if (raw === "off" || raw === "a" || raw === "b" || raw === "c" || raw === "free") {
    return raw;
  }
  return "c";
};
const WORKSPACES_STORAGE_KEY = "nosuckshell.layout.workspaces.v1";
const SETTINGS_OPEN_MODE_STORAGE_KEY = "nosuckshell.settings.openMode";
const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";
const DEFAULT_WORKSPACE_ID = "workspace-main";
const SPLIT_RATIO_PRESET_VALUE: Record<SplitRatioPreset, number> = {
  "50-50": 0.5,
  "60-40": 0.6,
  "70-30": 0.7,
};
const TERMINAL_FONT_FAMILY_BY_PRESET: Record<TerminalFontPreset, string> = {
  "jetbrains-mono":
    '"JetBrains Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
  "ibm-plex-mono":
    '"IBM Plex Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
  "source-code-pro":
    '"Source Code Pro", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
};
const DENSITY_TERMINAL_BASE_FONT: Record<DensityProfile, number> = {
  aggressive: 12,
  balanced: 13,
  safe: 14,
};
const TERMINAL_FONT_OFFSET_MIN = -3;
const TERMINAL_FONT_OFFSET_MAX = 6;
const TERMINAL_FONT_MIN = 9;
const TERMINAL_FONT_MAX = 22;
const SIDEBAR_VIEW_STORAGE_KEY = "nosuckshell.sidebar.selectedView";
const LAYOUT_MODE_STORAGE_KEY = "nosuckshell.layout.mode";
/** Must match CSS breakpoint for stacked-mobile shell */
const MOBILE_STACKED_MEDIA = "(max-width: 900px)";

const createId = (): string => {
  let suffix: string;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    suffix = arr[0].toString(36).padStart(8, "0").slice(0, 8);
  } else {
    suffix = Math.random().toString(36).slice(2, 10);
  }
  return `${Date.now()}-${suffix}`;
};
const hasTauriTransformCallback = (): boolean => {
  if (import.meta.env.VITE_E2E === "true") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: { transformCallback?: unknown } })
    .__TAURI_INTERNALS__;
  return typeof tauriInternals?.transformCallback === "function";
};

/** Block WebKit/Electron default context menu app-wide except in real text fields. */
const allowNativeBrowserContextMenu = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest("textarea, select, [contenteditable='true'], [contenteditable='']")) {
    return true;
  }
  const input = target.closest("input");
  if (!input) {
    return false;
  }
  const type = (input as HTMLInputElement).type;
  return (
    type === "text" ||
    type === "search" ||
    type === "password" ||
    type === "email" ||
    type === "url" ||
    type === "tel" ||
    type === "number" ||
    type === "date" ||
    type === "time" ||
    type === "datetime-local" ||
    type === ""
  );
};

const clampSidebarWidth = (value: number): number => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const readLayoutMode = (): LayoutMode => {
  if (typeof window === "undefined") {
    return "auto";
  }
  const persisted = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
  return persisted === "wide" || persisted === "compact" ? persisted : "auto";
};
const readSplitRatioPreset = (): SplitRatioPreset => {
  if (typeof window === "undefined") {
    return "60-40";
  }
  const persisted = window.localStorage.getItem(SPLIT_RATIO_PRESET_STORAGE_KEY);
  return persisted === "50-50" || persisted === "60-40" || persisted === "70-30" ? persisted : "60-40";
};
const createDefaultMetadataStore = (): HostMetadataStore => ({ defaultUser: "", hosts: {} });
const createDefaultEntityStore = (): EntityStore => ({
  schemaVersion: 3,
  updatedAt: 0,
  users: {},
  groups: {},
  keys: {},
  tags: {},
  hostBindings: {},
});
const createDefaultHostMetadata = (): HostMetadata => ({ favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false });
const createLeafNode = (paneIndex: number): SplitLeafNode => ({ id: `leaf-${paneIndex}`, type: "leaf", paneIndex });
const cloneSplitTree = (node: SplitTreeNode): SplitTreeNode =>
  node.type === "leaf"
    ? { ...node }
    : {
        ...node,
        first: cloneSplitTree(node.first),
        second: cloneSplitTree(node.second),
      };
const clonePaneLayouts = (layouts: PaneLayoutItem[]): PaneLayoutItem[] => layouts.map((entry) => ({ ...entry }));
const cloneWorkspaceSnapshot = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot => ({
  ...snapshot,
  splitSlots: [...snapshot.splitSlots],
  paneLayouts: clonePaneLayouts(snapshot.paneLayouts),
  splitTree: cloneSplitTree(snapshot.splitTree),
});
const rebalanceSplitTree = (node: SplitTreeNode): SplitTreeNode => {
  if (node.type === "leaf") {
    return node;
  }
  const nextFirst = rebalanceSplitTree(node.first);
  const nextSecond = rebalanceSplitTree(node.second);
  const nextRatio = 0.5;
  if (nextFirst === node.first && nextSecond === node.second && node.ratio === nextRatio) {
    return node;
  }
  return {
    ...node,
    ratio: nextRatio,
    first: nextFirst,
    second: nextSecond,
  };
};
const compactSplitSlotsByPaneOrder = (slots: Array<string | null>, paneOrder: number[]): Array<string | null> => {
  if (paneOrder.length === 0) {
    return slots;
  }
  const maxPaneIndex = Math.max(0, ...paneOrder);
  const next = Array.from({ length: maxPaneIndex + 1 }, () => null as string | null);
  paneOrder.forEach((paneIndex) => {
    next[paneIndex] = slots[paneIndex] ?? null;
  });
  if (next.length !== slots.length) {
    return next;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== slots[index]) {
      return next;
    }
  }
  return slots;
};

/** Must match `.pane-drop-zones` in styles.css (size + grid fr ratios). */
const PANE_DROP_OVERLAY = {
  widthPx: 190,
  widthMaxPct: 0.88,
  widthCap: 220,
  heightPx: 160,
  heightMaxPct: 0.78,
  heightCap: 190,
  gapPx: 5,
  /** 1fr + 1.2fr + 1fr */
  frSum: 3.2,
} as const;

const getPaneDropOverlaySize = (paneWidth: number, paneHeight: number): { w: number; h: number } => {
  const w = Math.min(
    PANE_DROP_OVERLAY.widthCap,
    Math.min(PANE_DROP_OVERLAY.widthPx, paneWidth * PANE_DROP_OVERLAY.widthMaxPct),
  );
  const h = Math.min(
    PANE_DROP_OVERLAY.heightCap,
    Math.min(PANE_DROP_OVERLAY.heightPx, paneHeight * PANE_DROP_OVERLAY.heightMaxPct),
  );
  return { w, h };
};

const resolvePaneDropZoneFromOverlay = (
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): PaneDropZone => {
  const { w, h } = getPaneDropOverlaySize(bounds.width, bounds.height);
  const left = bounds.left + (bounds.width - w) / 2;
  const top = bounds.top + (bounds.height - h) / 2;
  const lx = Math.max(0, Math.min(w, clientX - left));
  const ly = Math.max(0, Math.min(h, clientY - top));

  const { frSum, gapPx } = PANE_DROP_OVERLAY;
  const trackW = w - 2 * gapPx;
  const trackH = h - 2 * gapPx;
  const col0w = (trackW * 1) / frSum;
  const col1w = (trackW * 1.2) / frSum;
  const row0h = (trackH * 1) / frSum;
  const row1h = (trackH * 1.2) / frSum;
  const x1 = col0w;
  const x2 = col0w + gapPx + col1w;
  const y1 = row0h;
  const y2 = row0h + gapPx + row1h;

  const col = lx < x1 ? 0 : lx < x2 ? 1 : 2;
  const row = ly < y1 ? 0 : ly < y2 ? 1 : 2;

  if (row === 1 && col === 1) return "center";
  if (row === 0 && col === 1) return "top";
  if (row === 2 && col === 1) return "bottom";
  if (row === 1 && col === 0) return "left";
  if (row === 1 && col === 2) return "right";

  const midTop = { x: w / 2, y: 0 };
  const midBottom = { x: w / 2, y: h };
  const midLeft = { x: 0, y: h / 2 };
  const midRight = { x: w, y: h / 2 };
  const dist = (ax: number, ay: number) => Math.hypot(lx - ax, ly - ay);

  if (row === 0 && col === 0) {
    return dist(midTop.x, midTop.y) < dist(midLeft.x, midLeft.y) ? "top" : "left";
  }
  if (row === 0 && col === 2) {
    return dist(midTop.x, midTop.y) < dist(midRight.x, midRight.y) ? "top" : "right";
  }
  if (row === 2 && col === 0) {
    return dist(midBottom.x, midBottom.y) < dist(midLeft.x, midLeft.y) ? "bottom" : "left";
  }
  return dist(midBottom.x, midBottom.y) < dist(midRight.x, midRight.y) ? "bottom" : "right";
};

const createEmptyWorkspaceSnapshot = (id: string, name: string): WorkspaceSnapshot => {
  const splitSlots = createInitialPaneState();
  return {
    id,
    name,
    splitSlots,
    paneLayouts: createPaneLayoutsFromSlots(splitSlots),
    splitTree: createLeafNode(0),
    activePaneIndex: 0,
    activeSessionId: "",
  };
};
const collectPaneOrder = (node: SplitTreeNode): number[] =>
  node.type === "leaf" ? [node.paneIndex] : [...collectPaneOrder(node.first), ...collectPaneOrder(node.second)];

/** Places a new session into a workspace snapshot (free pane or new split). Used for host connect → chosen workspace. */
const appendSessionToWorkspaceSnapshot = (
  targetSnapshot: WorkspaceSnapshot,
  sessionId: string,
  splitRatioDefaultValue: number,
): WorkspaceSnapshot => {
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
  return {
    ...cloneWorkspaceSnapshot(targetSnapshot),
    splitSlots: nextTargetSlots,
    paneLayouts: nextTargetPaneLayouts,
    splitTree: nextTargetSplitTree,
    activePaneIndex: nextTargetPaneIndex,
    activeSessionId: sessionId,
  };
};

const replacePaneInTree = (
  node: SplitTreeNode,
  targetPaneIndex: number,
  createReplacement: (leaf: SplitLeafNode) => SplitTreeNode,
): SplitTreeNode => {
  if (node.type === "leaf") {
    return node.paneIndex === targetPaneIndex ? createReplacement(node) : node;
  }
  return {
    ...node,
    first: replacePaneInTree(node.first, targetPaneIndex, createReplacement),
    second: replacePaneInTree(node.second, targetPaneIndex, createReplacement),
  };
};
const updateSplitRatioInTree = (node: SplitTreeNode, splitId: string, ratio: number): SplitTreeNode => {
  if (node.type === "leaf") {
    return node;
  }
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio)) };
  }
  return {
    ...node,
    first: updateSplitRatioInTree(node.first, splitId, ratio),
    second: updateSplitRatioInTree(node.second, splitId, ratio),
  };
};
const removePaneFromTree = (node: SplitTreeNode, targetPane: number): SplitTreeNode | null => {
  if (node.type === "leaf") {
    return node.paneIndex === targetPane ? null : node;
  }
  const nextFirst = removePaneFromTree(node.first, targetPane);
  const nextSecond = removePaneFromTree(node.second, targetPane);
  if (!nextFirst && !nextSecond) {
    return null;
  }
  if (!nextFirst) {
    return nextSecond;
  }
  if (!nextSecond) {
    return nextFirst;
  }
  return {
    ...node,
    first: nextFirst,
    second: nextSecond,
  };
};
const createTreeFromPaneCount = (paneCount: number): SplitTreeNode => {
  const count = Math.max(1, paneCount);
  let tree: SplitTreeNode = createLeafNode(0);
  for (let paneIndex = 1; paneIndex < count; paneIndex += 1) {
    tree = {
      id: `split-${paneIndex}`,
      type: "split",
      axis: "vertical",
      ratio: DEFAULT_SPLIT_RATIO,
      first: tree,
      second: createLeafNode(paneIndex),
    };
  }
  return tree;
};
const serializeSplitTree = (node: SplitTreeNode): LayoutSplitTreeNode => {
  if (node.type === "leaf") {
    return {
      id: node.id,
      type: "leaf",
      paneIndex: node.paneIndex,
    };
  }
  return {
    id: node.id,
    type: "split",
    axis: node.axis,
    ratio: node.ratio,
    first: serializeSplitTree(node.first),
    second: serializeSplitTree(node.second),
  };
};
const parseSplitTree = (raw: LayoutSplitTreeNode | null | undefined): SplitTreeNode | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (raw.type === "leaf") {
    if (typeof raw.paneIndex !== "number" || !Number.isInteger(raw.paneIndex) || raw.paneIndex < 0) {
      return null;
    }
    return createLeafNode(raw.paneIndex);
  }
  if (raw.type === "split") {
    const first = parseSplitTree(raw.first);
    const second = parseSplitTree(raw.second);
    if (!first || !second) {
      return null;
    }
    return {
      id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `split-fallback`,
      type: "split",
      axis: raw.axis === "horizontal" ? "horizontal" : "vertical",
      ratio:
        typeof raw.ratio === "number" && Number.isFinite(raw.ratio)
          ? Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, raw.ratio))
          : DEFAULT_SPLIT_RATIO,
      first,
      second,
    };
  }
  return null;
};

export function App() {
  const [hosts, setHosts] = useState<HostConfig[]>([]);
  const [currentHost, setCurrentHost] = useState<HostConfig>(emptyHost());
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
  const [storeSelectedHostForBinding, setStoreSelectedHostForBinding] = useState<string>("");
  const [storeBindingDraft, setStoreBindingDraft] = useState<HostBinding>({
    userId: undefined,
    groupIds: [],
    tagIds: [],
    keyRefs: [],
    proxyJump: "",
    legacyUser: "",
    legacyTags: [],
    legacyIdentityFile: "",
    legacyProxyJump: "",
    legacyProxyCommand: "",
  });
  const [error, setError] = useState<string>("");
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
  const [activeAppSettingsTab, setActiveAppSettingsTab] = useState<AppSettingsTab>("appearance");
  const [sshConfigRaw, setSshConfigRaw] = useState<string>("");
  const [sshDirInfo, setSshDirInfo] = useState<SshDirInfo | null>(null);
  const [sshDirOverrideDraft, setSshDirOverrideDraft] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<HostStatusFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
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
  const [tagDraft, setTagDraft] = useState<string>("");
  const [backupExportPath, setBackupExportPath] = useState<string>(DEFAULT_BACKUP_PATH);
  const [backupImportPath, setBackupImportPath] = useState<string>(DEFAULT_BACKUP_PATH);
  const [backupExportPassword, setBackupExportPassword] = useState<string>("");
  const [backupImportPassword, setBackupImportPassword] = useState<string>("");
  const [backupMessage, setBackupMessage] = useState<string>("");
  const [trustPromptQueue, setTrustPromptQueue] = useState<TrustPromptRequest[]>([]);
  const [saveTrustHostAsDefault, setSaveTrustHostAsDefault] = useState<boolean>(true);
  const [splitSlots, setSplitSlots] = useState<Array<string | null>>(() => createInitialPaneState());
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
    if (persisted === "builtin:all" || persisted === "builtin:favorites" || persisted?.startsWith("custom:")) {
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
  const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState<string>("");
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
  const draggingSessionIdRef = useRef<string | null>(null);
  const suppressHostClickAliasRef = useRef<string | null>(null);
  const isApplyingWorkspaceSnapshotRef = useRef<boolean>(false);
  const isAutoArrangeApplyingRef = useRef<boolean>(false);
  const lastAutoArrangeBeforeFreeRef = useRef<AutoArrangeActiveMode>("c");
  const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState<{ hostAlias: string; scope: "settings" } | null>(null);
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

  const canSave = useMemo(
    () => currentHost.host.trim().length > 0 && currentHost.hostName.trim().length > 0,
    [currentHost],
  );
  const canCreateHost = useMemo(
    () => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0,
    [newHostDraft],
  );
  const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const sessionById = useMemo(() => {
    return new Map(sessions.map((session) => [session.id, session]));
  }, [sessions]);
  const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
  const visiblePaneSessionIds = useMemo(
    () => splitSlots.filter((slot): slot is string => Boolean(slot)),
    [splitSlots],
  );
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
  const isStackedShell = layoutMode === "compact" || (layoutMode === "auto" && viewportStacked);

  const activeHostMetadata = useMemo(() => {
    if (!activeHost) {
      return createDefaultHostMetadata();
    }
    return metadataStore.hosts[activeHost] ?? createDefaultHostMetadata();
  }, [activeHost, metadataStore.hosts]);
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
        if (favoritesOnly && !row.metadata.favorite) {
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
  }, [favoritesOnly, hostRows, portFilter, recentOnly, searchQuery, selectedCustomViewProfile, selectedSidebarViewId, selectedTagFilter, statusFilter]);
  const connectedHostRows = useMemo(
    () => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => row.connected)),
    [filteredHostRows],
  );
  const otherHostRows = useMemo(
    () => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => !row.connected)),
    [filteredHostRows],
  );
  const sidebarViews = useMemo(
    () => [
      { id: "builtin:all" as SidebarViewId, label: "All" },
      { id: "builtin:favorites" as SidebarViewId, label: "Favorites" },
      ...sortedViewProfiles.map((profile) => ({
        id: `custom:${profile.id}` as SidebarViewId,
        label: profile.name,
      })),
    ],
    [sortedViewProfiles],
  );
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
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    metadataStoreRef.current = metadataStore;
  }, [metadataStore]);
  useEffect(() => {
    quickConnectAutoTrustRef.current = quickConnectAutoTrust;
  }, [quickConnectAutoTrust]);
  useEffect(() => {
    if (!activeTrustPrompt) {
      return;
    }
    setSaveTrustHostAsDefault(true);
  }, [activeTrustPrompt?.sessionId]);
  const resolvePaneIdentity = useCallback(
    (paneIndex: number): string => {
      const paneSessionId = splitSlots[paneIndex] ?? null;
      if (!paneSessionId) {
        return "Drop it on me";
      }
      const paneSession = sessionById.get(paneSessionId) ?? null;
      return resolveSessionTitle(paneSession);
    },
    [resolveSessionTitle, sessionById, splitSlots],
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
    setEntityStore(loadedStore);
    setSelectedLayoutProfileId((prev) => {
      if (prev && loadedProfiles.some((profile) => profile.id === prev)) {
        return prev;
      }
      return loadedProfiles[0]?.id ?? "";
    });
    if (loadedHosts.length > 0) {
      setActiveHost(loadedHosts[0].host);
      setCurrentHost(loadedHosts[0]);
      setTagDraft((loadedMetadata.hosts[loadedHosts[0].host]?.tags ?? []).join(", "));
      setStoreSelectedHostForBinding((prev) => prev || loadedHosts[0].host);
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
    if (!isAppSettingsOpen || activeAppSettingsTab !== "ssh") {
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
  }, [isAppSettingsOpen, activeAppSettingsTab]);

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
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        order?: string[];
        activeWorkspaceId?: string;
        snapshots?: Record<string, WorkspaceSnapshot>;
      };
      const order = Array.isArray(parsed.order) ? parsed.order.filter((entry): entry is string => typeof entry === "string") : [];
      const snapshots = parsed.snapshots ?? {};
      if (order.length === 0) {
        return;
      }
      const normalizedOrder = order.filter((workspaceId) => {
        const snapshot = snapshots[workspaceId];
        return Boolean(snapshot && Array.isArray(snapshot.splitSlots) && snapshot.splitTree);
      });
      if (normalizedOrder.length === 0) {
        return;
      }
      const normalizedSnapshots = normalizedOrder.reduce<Record<string, WorkspaceSnapshot>>((acc, workspaceId) => {
        const snapshot = snapshots[workspaceId];
        if (!snapshot) {
          return acc;
        }
        acc[workspaceId] = {
          ...snapshot,
          id: snapshot.id || workspaceId,
          name: snapshot.name || workspaceId,
          splitSlots: Array.isArray(snapshot.splitSlots) ? [...snapshot.splitSlots] : createInitialPaneState(),
          paneLayouts: Array.isArray(snapshot.paneLayouts)
            ? snapshot.paneLayouts.map((entry) => ({ ...entry }))
            : createPaneLayoutsFromSlots(createInitialPaneState()),
          splitTree: snapshot.splitTree ? cloneSplitTree(snapshot.splitTree) : createLeafNode(0),
          activePaneIndex: Number.isInteger(snapshot.activePaneIndex) ? snapshot.activePaneIndex : 0,
          activeSessionId: typeof snapshot.activeSessionId === "string" ? snapshot.activeSessionId : "",
        };
        return acc;
      }, {});
      const fallbackWorkspaceId = normalizedOrder[0] ?? DEFAULT_WORKSPACE_ID;
      const nextActiveWorkspaceId =
        typeof parsed.activeWorkspaceId === "string" && normalizedSnapshots[parsed.activeWorkspaceId]
          ? parsed.activeWorkspaceId
          : fallbackWorkspaceId;
      const nextActiveSnapshot = normalizedSnapshots[nextActiveWorkspaceId];
      if (!nextActiveSnapshot) {
        return;
      }
      isApplyingWorkspaceSnapshotRef.current = true;
      setWorkspaceOrder(normalizedOrder);
      setWorkspaceSnapshots(normalizedSnapshots);
      setActiveWorkspaceId(nextActiveWorkspaceId);
      setSplitSlots([...nextActiveSnapshot.splitSlots]);
      setPaneLayouts(clonePaneLayouts(nextActiveSnapshot.paneLayouts));
      setSplitTree(cloneSplitTree(nextActiveSnapshot.splitTree));
      setActivePaneIndex(nextActiveSnapshot.activePaneIndex);
      setActiveSession(nextActiveSnapshot.activeSessionId);
      queueMicrotask(() => {
        isApplyingWorkspaceSnapshotRef.current = false;
      });
    } catch {
      // ignore broken persisted workspace data
    }
  }, []);

  const storeUsers = useMemo<UserObject[]>(() => Object.values(entityStore.users), [entityStore.users]);
  const storeGroups = useMemo<GroupObject[]>(() => Object.values(entityStore.groups), [entityStore.groups]);
  const storeTags = useMemo<TagObject[]>(() => Object.values(entityStore.tags), [entityStore.tags]);
  const storeKeys = useMemo<SshKeyObject[]>(() => Object.values(entityStore.keys), [entityStore.keys]);
  const quickConnectUserOptions = useMemo<string[]>(
    () => buildQuickConnectUserCandidates(metadataStore.defaultUser, storeUsers.map((entry) => entry.username || entry.name)),
    [metadataStore.defaultUser, storeUsers],
  );
  useEffect(() => {
    if (!storeSelectedHostForBinding) {
      return;
    }
    const existing = entityStore.hostBindings[storeSelectedHostForBinding];
    if (existing) {
      setStoreBindingDraft(existing);
      return;
    }
    const host = hosts.find((entry) => entry.host === storeSelectedHostForBinding);
    setStoreBindingDraft({
      userId: undefined,
      groupIds: [],
      tagIds: [],
      keyRefs: [],
      proxyJump: host?.proxyJump ?? "",
      legacyUser: host?.user ?? "",
      legacyTags: metadataStore.hosts[storeSelectedHostForBinding]?.tags ?? [],
      legacyIdentityFile: host?.identityFile ?? "",
      legacyProxyJump: host?.proxyJump ?? "",
      legacyProxyCommand: host?.proxyCommand ?? "",
    });
  }, [entityStore.hostBindings, hosts, metadataStore.hosts, storeSelectedHostForBinding]);

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
        [id]: { id, name: username, username, keyRefs: [], tagIds: [], createdAt: now, updatedAt: now },
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
    async (userId: string, patch: Partial<Pick<UserObject, "name" | "username" | "keyRefs" | "tagIds">>) => {
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

  const saveHostBindingDraft = useCallback(async () => {
    const hostAlias = storeSelectedHostForBinding.trim();
    if (!hostAlias) {
      return;
    }
    const nextBindings = {
      ...entityStore.hostBindings,
      [hostAlias]: storeBindingDraft,
    };
    const next: EntityStore = {
      ...entityStore,
      hostBindings: nextBindings,
      updatedAt: Date.now(),
    };
    await persistEntityStore(next);
  }, [entityStore, persistEntityStore, storeBindingDraft, storeSelectedHostForBinding]);


  useEffect(() => {
    if (!hasTauriTransformCallback()) {
      return;
    }
    let unlisten: UnlistenFn | null = null;
    void listen<SessionOutputEvent>("session-output", (event) => {
      if (!event.payload.host_key_prompt) {
        return;
      }
      const sessionId = event.payload.session_id;
      const session = sessionsRef.current.find((entry) => entry.id === sessionId) ?? null;
      if (session?.kind === "sshQuick" && quickConnectAutoTrustRef.current) {
        void sendInput(sessionId, "yes\n").catch((sendError: unknown) => setError(String(sendError)));
        return;
      }
      const trustHostAlias = session?.kind === "sshSaved" ? session.hostAlias : "";
      if (trustHostAlias) {
        const metadata = metadataStoreRef.current.hosts[trustHostAlias] ?? null;
        if (metadata?.trustHostDefault) {
          void sendInput(sessionId, "yes\n").catch((sendError: unknown) => setError(String(sendError)));
          return;
        }
      }
      const promptHostLabel =
        session?.kind === "sshSaved"
          ? session.hostAlias
          : session?.kind === "sshQuick"
            ? session.label
            : session?.kind === "local"
              ? "local-shell"
              : "unknown";
      setTrustPromptQueue((prev) => {
        if (prev.some((entry) => entry.sessionId === sessionId)) {
          return prev;
        }
        return [...prev, { sessionId, hostAlias: promptHostLabel }];
      });
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      // Tauri event bridge can be temporarily unavailable during dev reload.
    });

    return () => {
      if (unlisten) {
        void unlisten();
      }
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
    window.localStorage.setItem(LIST_TONE_PRESET_STORAGE_KEY, listTonePreset);
  }, [listTonePreset]);
  useEffect(() => {
    window.localStorage.setItem(FRAME_MODE_PRESET_STORAGE_KEY, frameModePreset);
  }, [frameModePreset]);
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
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      WORKSPACES_STORAGE_KEY,
      JSON.stringify({
        order: workspaceOrder,
        activeWorkspaceId,
        snapshots: workspaceSnapshots,
      }),
    );
  }, [activeWorkspaceId, workspaceOrder, workspaceSnapshots]);
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

  const toggleHostMenu = (host: HostConfig) => {
    setOpenHostMenuHostAlias((prev) => {
      if (prev === host.host) {
        return "";
      }
      setActiveHost(host.host);
      setCurrentHost(host);
      setTagDraft((metadataStore.hosts[host.host]?.tags ?? []).join(", "));
      return host.host;
    });
  };

  const openHostMenuForHost = (host: HostConfig) => {
    setActiveHost(host.host);
    setCurrentHost(host);
    setTagDraft((metadataStore.hosts[host.host]?.tags ?? []).join(", "));
    setOpenHostMenuHostAlias(host.host);
  };

  const toggleHostSelection = (host: HostConfig) => {
    setActiveHost((prev) => {
      if (prev === host.host) {
        return "";
      }
      setCurrentHost(host);
      setTagDraft((metadataStore.hosts[host.host]?.tags ?? []).join(", "));
      return host.host;
    });
  };

  const clearPendingRemoveConfirm = useCallback(() => {
    if (removeConfirmResetTimerRef.current) {
      clearTimeout(removeConfirmResetTimerRef.current);
      removeConfirmResetTimerRef.current = null;
    }
    setPendingRemoveConfirm(null);
  }, []);

  const armPendingRemoveConfirm = useCallback((hostAlias: string, scope: "settings") => {
    if (removeConfirmResetTimerRef.current) {
      clearTimeout(removeConfirmResetTimerRef.current);
    }
    setPendingRemoveConfirm({ hostAlias, scope });
    removeConfirmResetTimerRef.current = setTimeout(() => {
      setPendingRemoveConfirm(null);
      removeConfirmResetTimerRef.current = null;
    }, 2200);
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

  const saveTagsForHost = async (hostAlias: string) => {
    if (!hostAlias.trim()) {
      return;
    }
    const normalizedTags = Array.from(
      new Set(
        tagDraft
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
    await upsertHostMetadata(hostAlias, (current) => ({
      ...current,
      tags: normalizedTags,
    }));
  };

  const saveTagsForActiveHost = async () => {
    if (!activeHost.trim()) {
      return;
    }
    await saveTagsForHost(activeHost);
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

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setFavoritesOnly(false);
    setRecentOnly(false);
    setSelectedTagFilter("all");
    setPortFilter("");
  };

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

  const onSave = async () => {
    setError("");
    try {
      const normalizedAlias = currentHost.host.trim();
      await Promise.all([saveHost(currentHost), saveTagsForHost(normalizedAlias)]);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

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
      setOpenHostMenuHostAlias((prev) => (prev === normalizedAlias ? "" : prev));
      if (currentHost.host === normalizedAlias) {
        const cleared = emptyHost();
        setCurrentHost(cleared);
        setTagDraft("");
      }
      if (activeHost === normalizedAlias) {
        setActiveHost("");
      }
      clearPendingRemoveConfirm();
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveHostIntent = (hostAlias: string, scope: "settings") => {
    const normalizedAlias = hostAlias.trim();
    if (!normalizedAlias || !hosts.some((host) => host.host === normalizedAlias)) {
      setError("Select an existing host before removing.");
      return;
    }
    if (pendingRemoveConfirm?.hostAlias === normalizedAlias && pendingRemoveConfirm.scope === scope) {
      clearPendingRemoveConfirm();
      void onDelete(normalizedAlias);
      return;
    }
    armPendingRemoveConfirm(normalizedAlias, scope);
  };

  const openAddHostModal = () => {
    setNewHostDraft(emptyHost());
    setIsQuickAddMenuOpen(false);
    setOpenHostMenuHostAlias("");
    setIsAddHostModalOpen(true);
  };

  const closeAddHostModal = () => {
    setIsAddHostModalOpen(false);
    setNewHostDraft(emptyHost());
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
    setOpenHostMenuHostAlias("");
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
      await saveHost(newHostDraft);
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
      setCurrentHost(host);
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
    const firstFreePaneIndex = paneOrder.find((paneIndex) => splitSlots[paneIndex] === null);
    const usedExistingEmptyPane = typeof firstFreePaneIndex === "number" && firstFreePaneIndex >= 0;
    const targetPaneIndex = usedExistingEmptyPane ? firstFreePaneIndex : splitFocusedPane("right", splitFromPaneIndex, "empty");
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
      const parsed = JSON.parse(encoded) as Partial<DragPayload>;
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
    await closeSession(sessionId);
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
    const results = await Promise.allSettled(sessionIds.map((sessionId) => closeSession(sessionId)));
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
          trustHostDefault: true,
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
    toggleBroadcastTarget(sessionId);
  };

  const broadcastToVisiblePanes = () => {
    if (!isBroadcastModeEnabled) {
      return;
    }
    if (visiblePaneSessionIds.length === 0) {
      return;
    }
    setBroadcastTargets((prev) => {
      const next = new Set(prev);
      const allVisibleAlreadyTargeted = visiblePaneSessionIds.every((sessionId) => next.has(sessionId));
      if (allVisibleAlreadyTargeted) {
        visiblePaneSessionIds.forEach((sessionId) => next.delete(sessionId));
      } else {
        visiblePaneSessionIds.forEach((sessionId) => next.add(sessionId));
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
      const targets = isBroadcastModeEnabled
        ? resolveInputTargets(originSessionId, broadcastTargets, sessionIds)
        : [originSessionId];
      for (const target of targets) {
        void sendInput(target, data);
      }
    },
    [broadcastTargets, isBroadcastModeEnabled, sessionIds],
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
    if (!isSidebarPinned) {
      setIsSidebarVisible(true);
    }
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
        return {
          width: pane.width,
          height: pane.height,
          hostAlias: null,
          sessionKind: "sshQuick" as const,
          quickSsh: { ...paneSession.request },
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

  const applyLayoutPresetTree = (serialized: LayoutSplitTreeNode) => {
    const parsed = parseSplitTree(serialized);
    if (!parsed) {
      return;
    }
    const nextPaneOrder = collectPaneOrder(parsed);
    const maxPaneIndex = Math.max(0, ...nextPaneOrder);
    const newSlots = Array.from({ length: maxPaneIndex + 1 }, () => null as string | null);
    setSplitTree(parsed);
    setSplitSlots(newSlots);
    setPaneLayouts(createPaneLayoutsFromSlots(newSlots));
    setActivePaneIndex(nextPaneOrder[0] ?? 0);
    setActiveSession("");
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

  const renderSplitNode = (node: SplitTreeNode) => {
    if (node.type === "leaf") {
      const paneIndex = node.paneIndex;
      const paneSessionId = splitSlots[paneIndex] ?? null;
      const paneIdentity = resolvePaneIdentity(paneIndex);
      const isHoverTarget = highlightedHostPaneIndices.has(paneIndex);
      const isHoverDimmed = hasHighlightedHostTargets && !isHoverTarget;
      const isDropOverlayVisible =
        (draggingKind === "machine" || draggingKind === "session") &&
        dragOverPaneIndex === paneIndex &&
        activeDropZonePaneIndex === paneIndex;
      const isSelfPaneDrop =
        draggingKind === "session" &&
        draggingSessionIdRef.current != null &&
        splitSlots.findIndex((s) => s === draggingSessionIdRef.current) === paneIndex;
      const hasPaneSession = Boolean(paneSessionId);
      const canClosePane = paneOrder.length > 1;
      const isPaneBroadcastTarget = paneSessionId ? broadcastTargets.has(paneSessionId) : false;
      const isToolbarExpanded = expandedPaneToolbarIndices.has(paneIndex);
      const allVisibleAlreadyTargeted =
        isBroadcastModeEnabled &&
        visiblePaneSessionIds.length > 0 &&
        visiblePaneSessionIds.every((sessionId) => broadcastTargets.has(sessionId));
      return (
        <div
          key={`pane-${paneIndex}`}
          data-pane-index={paneIndex}
          className={`split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${
            dragOverPaneIndex === paneIndex ? "is-drag-over" : ""
          } ${paneSessionId ? "is-connected" : "is-empty"} ${isHoverTarget ? "is-host-hover-target" : ""} ${
            isHoverDimmed ? "is-host-hover-dimmed" : ""
          } ${highlightedHostAlias ? "is-host-hovering" : ""}`}
          draggable={false}
          onClick={() => {
            setActivePaneIndex(paneIndex);
            if (paneSessionId) {
              setActiveSession(paneSessionId);
              requestTerminalFocus(paneSessionId);
            }
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = resolveDropEffect(event);
            const bounds = event.currentTarget.getBoundingClientRect();
            setDragOverPaneIndex(paneIndex);
            setActiveDropZonePaneIndex(paneIndex);
            const emptyForHostOverlay = draggingKind === "machine" && !paneSessionId;
            setActiveDropZone(
              emptyForHostOverlay ? "center" : resolvePaneDropZone(event.clientX, event.clientY, bounds),
            );
          }}
          onDragEnterCapture={(event) => {
            event.preventDefault();
            setDragOverPaneIndex(paneIndex);
            const bounds = event.currentTarget.getBoundingClientRect();
            setActiveDropZonePaneIndex(paneIndex);
            const emptyForHostOverlay = draggingKind === "machine" && !paneSessionId;
            setActiveDropZone(
              emptyForHostOverlay ? "center" : resolvePaneDropZone(event.clientX, event.clientY, bounds),
            );
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
            setActiveDropZonePaneIndex((prev) => (prev === paneIndex ? null : prev));
            setActiveDropZone(null);
          }}
          onDropCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handlePaneDrop(event, paneIndex);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setHostContextMenu(null);
            const initialSplitMode: SplitMode = shouldSplitAsEmpty(event) ? "empty" : "duplicate";
            setContextMenu({
              visible: true,
              x: event.clientX,
              y: event.clientY,
              paneIndex,
              splitMode: initialSplitMode,
            });
          }}
        >
          {isDropOverlayVisible && draggingKind === "machine" && !hasPaneSession && (
            <div className="pane-drop-zones pane-drop-zones-host-empty" aria-hidden="true">
              <span className="pane-drop-host-empty-label">Drop to open here</span>
            </div>
          )}
          {isDropOverlayVisible && !(draggingKind === "machine" && !hasPaneSession) && (
            <div className="pane-drop-zones" aria-hidden="true">
              <div className={`pane-drop-zone pane-drop-zone-top ${activeDropZone === "top" ? "is-active" : ""}`}>Top</div>
              <div className={`pane-drop-zone pane-drop-zone-left ${activeDropZone === "left" ? "is-active" : ""}`}>Left</div>
              <div
                className={`pane-drop-zone pane-drop-zone-center ${activeDropZone === "center" ? "is-active" : ""}`}
              >
                {draggingKind === "machine"
                  ? "Replace"
                  : isSelfPaneDrop
                    ? "–"
                    : "Swap"}
              </div>
              <div className={`pane-drop-zone pane-drop-zone-right ${activeDropZone === "right" ? "is-active" : ""}`}>
                Right
              </div>
              <div
                className={`pane-drop-zone pane-drop-zone-bottom ${activeDropZone === "bottom" ? "is-active" : ""}`}
              >
                Bottom
              </div>
            </div>
          )}
          <div
            className={`split-pane-label ${activePaneIndex === paneIndex ? "is-active" : ""} ${
              isToolbarExpanded ? "is-toolbar-expanded" : ""
            }`}
            draggable={Boolean(paneSessionId)}
            onDragStart={(event) => {
              if (!paneSessionId) {
                return;
              }
              draggingSessionIdRef.current = paneSessionId;
              setDragPayload(event, { type: "session", sessionId: paneSessionId });
              setDraggingKind("session");
              missingDragPayloadLoggedRef.current = false;
            }}
            onDragEnd={() => {
              draggingSessionIdRef.current = null;
              setDraggingKind(null);
              setDragOverPaneIndex(null);
              setActiveDropZonePaneIndex(null);
              setActiveDropZone(null);
              missingDragPayloadLoggedRef.current = false;
            }}
          >
            <div className="split-pane-toolbar-group split-pane-toolbar-group-nav">
              <span className="split-pane-label-title" title={paneIdentity}>
                {paneIdentity}
              </span>
              <button
                className={`btn action-icon-btn pane-toolbar-btn pane-toolbar-expand-toggle ${
                  isToolbarExpanded ? "is-expanded" : ""
                }`}
                title={isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions"}
                aria-label={isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions"}
                aria-pressed={isToolbarExpanded}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedPaneToolbarIndices((prev) => {
                    const next = new Set(prev);
                    if (next.has(paneIndex)) {
                      next.delete(paneIndex);
                    } else {
                      next.add(paneIndex);
                    }
                    return next;
                  });
                }}
              >
                <span aria-hidden="true">{isToolbarExpanded ? "▾" : "▸"}</span>
              </button>
            </div>
            <div className="split-pane-toolbar-group split-pane-toolbar-group-layout">
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane left"
                aria-label={`Split pane ${paneIndex + 1} left`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.left", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-vertical split-icon-vertical-normal" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane right"
                aria-label={`Split pane ${paneIndex + 1} right`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.right", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-vertical split-icon-vertical-inverse" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane top"
                aria-label={`Split pane ${paneIndex + 1} top`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.top", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-horizontal split-icon-horizontal-normal" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane bottom"
                aria-label={`Split pane ${paneIndex + 1} bottom`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.bottom", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-horizontal split-icon-horizontal-inverse" aria-hidden="true" />
              </button>
            </div>
            <span className="pane-toolbar-separator" aria-hidden="true" />
            <div className="split-pane-toolbar-group split-pane-toolbar-group-broadcast">
              <button
                className={`btn action-icon-btn pane-toolbar-btn ${isBroadcastModeEnabled ? "is-broadcast-active" : ""}`}
                title={
                  isBroadcastModeEnabled
                    ? "Broadcast enabled — click to turn off"
                    : "Broadcast disabled — click to send keyboard to multiple panes"
                }
                aria-label={
                  isBroadcastModeEnabled ? "Turn off broadcast to multiple panes" : "Turn on broadcast to multiple panes"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setBroadcastMode(!isBroadcastModeEnabled);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-broadcast" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="2.2" />
                  <path d="M8.6 8.8a4.8 4.8 0 0 0 0 6.4" />
                  <path d="M15.4 8.8a4.8 4.8 0 0 1 0 6.4" />
                  <path d="M6.2 6.3a8.3 8.3 0 0 0 0 11.4" />
                  <path d="M17.8 6.3a8.3 8.3 0 0 1 0 11.4" />
                </svg>
              </button>
              <button
                className={`btn action-icon-btn pane-toolbar-btn ${
                  isBroadcastModeEnabled && isPaneBroadcastTarget ? "is-broadcast-active" : ""
                }`}
                title="Toggle pane target"
                aria-label={`Toggle pane ${paneIndex + 1} broadcast target`}
                disabled={!isBroadcastModeEnabled || !hasPaneSession}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("broadcast.togglePaneTarget", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-target" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="6.4" />
                  <circle cx="12" cy="12" r="2.3" />
                </svg>
              </button>
              <button
                className={`btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-broadcast-all ${
                  allVisibleAlreadyTargeted ? "is-broadcast-active" : ""
                }`}
                title="Target all visible panes"
                aria-label="Target all visible panes"
                disabled={!isBroadcastModeEnabled}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("broadcast.selectAllVisible", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-all" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="6.2" cy="12.4" r="2.1" />
                  <circle cx="12" cy="7.1" r="2.1" />
                  <circle cx="17.8" cy="12.4" r="2.1" />
                  <path d="M8 11.1l2.3-2.2M13.7 8.9l2.3 2.2M8.3 13.6h7.4" />
                </svg>
              </button>
            </div>
            <span className="pane-toolbar-separator" aria-hidden="true" />
            <div className="split-pane-toolbar-group split-pane-toolbar-group-close">
              <button
                className="btn action-icon-btn pane-toolbar-btn"
                title="Close session in pane"
                aria-label={`Close session in pane ${paneIndex + 1}`}
                disabled={!hasPaneSession}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("pane.clear", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-close-session" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" />
                  <path d="M9.5 10l5 5M14.5 10l-5 5" />
                </svg>
              </button>
              <button
                className="btn action-icon-btn action-icon-btn-danger pane-toolbar-btn"
                title="Close pane and session"
                aria-label={`Close pane ${paneIndex + 1} and its session`}
                disabled={!canClosePane}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("pane.close", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-close-pane" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.6 7.6l8.8 8.8M16.4 7.6l-8.8 8.8" />
                </svg>
              </button>
            </div>
          </div>
          {paneSessionId ? (
            <Suspense
              fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading terminal" />}
            >
              <TerminalPane
                sessionId={paneSessionId}
                onUserInput={handleTerminalInput}
                fontSize={terminalFontSize}
                fontFamily={terminalFontFamily}
              />
            </Suspense>
          ) : (
            <div className="empty-pane split-empty-pane">
              <p className="split-empty-pane-copy">One click and we both get what we want</p>
              <button
                type="button"
                className="split-empty-pane-logo-btn"
                title="Open local terminal in this pane"
                onClick={(event) => {
                  event.stopPropagation();
                  void connectLocalShellInPane(paneIndex);
                }}
              >
                <img src={logoTransparent} alt="Open local terminal in this pane" className="split-empty-pane-image" />
              </button>
              <p className="split-empty-pane-copy split-empty-pane-copy-secondary">
                Or drop that host right here - I&apos;m waiting
              </p>
            </div>
          )}
        </div>
      );
    }

    const firstRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, node.ratio));
    const secondRatio = 1 - firstRatio;
    const dividerClass = node.axis === "horizontal" ? "split-node-divider vertical" : "split-node-divider horizontal";

    return (
      <div
        key={node.id}
        className={`split-node split-node-${node.axis}`}
        ref={(element) => {
          splitNodeRefs.current[node.id] = element;
        }}
      >
        <div className="split-node-child" style={{ flexBasis: `${firstRatio * 100}%` }}>
          {renderSplitNode(node.first)}
        </div>
        <div
          className={dividerClass}
          role="separator"
          aria-orientation={node.axis === "horizontal" ? "vertical" : "horizontal"}
          onPointerDown={startSplitResize(node.id, node.axis)}
        />
        <div className="split-node-child" style={{ flexBasis: `${secondRatio * 100}%` }}>
          {renderSplitNode(node.second)}
        </div>
      </div>
    );
  };

  const renderHostRow = (row: HostRowViewModel, key: string) => (
    <div
      key={key}
      className="host-row"
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setHostContextMenu({
          x: event.clientX,
          y: event.clientY,
          host: row.host,
        });
      }}
    >
      <div
        className={`host-item-shell ${row.connected ? "is-connected" : "is-disconnected"} ${
          activeHost === row.host.host ? "is-active" : ""
        } ${openHostMenuHostAlias === row.host.host ? "is-menu-open" : ""}`}
      >
        <button
          className={`host-favorite-btn host-favorite-btn-inline host-favorite-in-shell ${
            row.metadata.favorite ? "is-active" : ""
          }`}
          aria-label={`Toggle favorite for ${row.host.host}`}
          onClick={(event) => {
            event.stopPropagation();
            void toggleFavoriteForHost(row.host.host);
          }}
        >
          ★
        </button>
        <div
          role="button"
          tabIndex={0}
          aria-label={`SSH host ${row.host.host}`}
          className="host-item"
          onClick={() => {
            if (suppressHostClickAliasRef.current) {
              const suppressedAlias = suppressHostClickAliasRef.current;
              suppressHostClickAliasRef.current = null;
              if (suppressedAlias === row.host.host) {
                return;
              }
            }
            toggleHostSelection(row.host);
          }}
          onMouseEnter={() => {
            // Only enable hover affordances for connected hosts to avoid flicker on disconnected rows
            if (row.connected) {
              setHoveredHostAlias(row.host.host);
            }
          }}
          onMouseLeave={() => {
            if (row.connected) {
              setHoveredHostAlias((prev) => (prev === row.host.host ? null : prev));
            }
          }}
          onDoubleClick={() => {
            void connectToHostInNewPane(row.host);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (activeHost !== row.host.host) {
                setActiveHost(row.host.host);
              }
              void connectToHostInNewPane(row.host);
            }
          }}
          draggable
          onDragStart={(event) => {
            suppressHostClickAliasRef.current = row.host.host;
            setDragPayload(event, { type: "machine", hostAlias: row.host.host });
            setDraggingKind("machine");
            missingDragPayloadLoggedRef.current = false;
          }}
          onDragEnd={() => {
            setDraggingKind(null);
            setDragOverPaneIndex(null);
            missingDragPayloadLoggedRef.current = false;
          }}
        >
          <span className="host-item-main">{row.host.host}</span>
          <span className="host-user-badge">{row.displayUser}</span>
        </div>
        <div className="host-row-actions">
          <button
            className={`host-settings-inline-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`}
            aria-label={`Open host settings for ${row.host.host}`}
            title={`Open host settings for ${row.host.host}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleHostMenu(row.host);
            }}
          >
            ⋮
          </button>
        </div>
      </div>
      <div className={`host-slide-menu ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`}>
        {openHostMenuHostAlias === row.host.host && (
          <div className="host-slide-content">
            <HostForm host={currentHost} onChange={setCurrentHost} />
            <div className="host-meta-edit">
              <label className="field">
                <span className="field-label">Tags (comma separated)</span>
                <input
                  className="input"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  placeholder="prod, home, lab"
                />
              </label>
              <label className="field checkbox-field">
                <input
                  className="checkbox-input"
                  type="checkbox"
                  checked={activeHostMetadata.favorite}
                  onChange={() => void toggleFavoriteForHost(activeHost)}
                />
                <span className="field-label">Favorite</span>
              </label>
            </div>
            <div className="action-row host-slide-actions">
              <button
                className="btn icon-btn"
                aria-label="Save tags"
                title="Save tags"
                onClick={() => {
                  void saveTagsForActiveHost().catch((e: unknown) => setError(String(e)));
                }}
              >
                #
              </button>
              <button
                className="btn btn-primary icon-btn"
                aria-label="Save settings"
                title="Save settings"
                onClick={onSave}
                disabled={!canSave}
              >
                ✓
              </button>
              <button
                className={`btn btn-danger icon-btn ${
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "btn-danger-confirm"
                    : ""
                }`}
                onClick={() => handleRemoveHostIntent(currentHost.host, "settings")}
                disabled={!currentHost.host || !hosts.some((host) => host.host === currentHost.host)}
                aria-label={
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "Confirm remove host"
                    : "Remove host"
                }
                title={
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "Confirm remove host"
                    : "Remove host"
                }
              >
                {pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings" ? "!" : "×"}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );

  const appShellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--sidebar-layout-width": isSidebarOpen ? `${sidebarWidth}px` : "18px",
    "--shell-grid-gap": isSidebarOpen ? "var(--space-2)" : "var(--space-1)",
    "--sidebar-resize-track-width": isSidebarOpen ? "8px" : "0px",
  } as CSSProperties;
  const contextMenuPaneSessionId =
    contextMenu.paneIndex !== null && contextMenu.paneIndex >= 0 ? (splitSlots[contextMenu.paneIndex] ?? null) : null;
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
      <button
        type="button"
        className={`left-rail-edge-handle ${isSidebarPinned ? "is-pinned" : "is-unpinned"}`}
        aria-label={isSidebarPinned ? "Unpin sidebar (auto-hide enabled)" : "Pin sidebar (always visible)"}
        title={isSidebarPinned ? "Pinned sidebar - click to enable auto-hide" : "Auto-hide sidebar - click to pin"}
        onMouseEnter={revealSidebar}
        onMouseLeave={maybeHideSidebar}
        onClick={toggleSidebarPinned}
      >
        {isSidebarPinned ? "◧" : "◨"}
      </button>
      <aside
        className={`left-rail panel ${isSidebarOpen ? "is-visible" : "is-hidden"} ${
          isSidebarPinned ? "is-pinned" : "is-unpinned"
        }`}
        onMouseEnter={revealSidebar}
        onMouseLeave={maybeHideSidebar}
      >
        <header className="brand">
          <div
            className={`brand-bar${isQuickAddMenuOpen ? " is-quick-add-open" : ""}`}
            ref={quickAddMenuRef}
          >
            <div className="brand-logo-area">
              <img src={logoTextTransparent} alt="NoSuckShell logo" className="brand-logo" />
            </div>
            <div className="brand-add-column">
              <div className="brand-primary-add-wrap brand-toolbar-cluster">
                <button
                  type="button"
                  className="btn brand-app-settings-btn"
                  aria-label="Open app settings"
                  title="App settings"
                  onClick={() => setIsAppSettingsOpen(true)}
                >
                  <svg className="settings-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.72-1.68-.97l-.38-2.65A.51.51 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.58-1.68.97l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.63c-.04.34-.07.67-.07.98s.03.66.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.68.97l.38 2.65c.03.24.24.43.5.43h4c.25 0 .46-.18.49-.42l.38-2.65c.62-.24 1.16-.57 1.68-.97l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.63z"
                    />
                  </svg>
                </button>
                <div className="quick-add-wrap brand-quick-add-wrap brand-primary-add-inner">
                  <button
                    className="btn host-plus-btn"
                    aria-label="Open add menu"
                    title="Add host"
                    onClick={() => setIsQuickAddMenuOpen((prev) => !prev)}
                  >
                    <svg className="add-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            {isQuickAddMenuOpen && (
              <div className="quick-add-menu" role="menu">
                <button className="quick-add-menu-item" onClick={() => void connectLocalShellInNewPane(activePaneIndex)}>
                  New local terminal
                </button>
                <button className="quick-add-menu-item" onClick={() => openQuickConnectModal()}>
                  Quick connect terminal
                </button>
                <button className="quick-add-menu-item" onClick={openAddHostModal}>
                  Add host
                </button>
                <button className="quick-add-menu-item" disabled>
                  Add group
                </button>
                <button className="quick-add-menu-item" disabled>
                  Add user
                </button>
                <button className="quick-add-menu-item" disabled>
                  Add key
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="host-filter-card">
          <div className="sidebar-view-tabs" role="tablist" aria-label="Sidebar views">
            {sidebarViews.map((view) => (
              <button
                key={view.id}
                className={`tab-pill sidebar-view-tab ${selectedSidebarViewId === view.id ? "is-active" : ""}`}
                role="tab"
                aria-selected={selectedSidebarViewId === view.id}
                onClick={() => setSelectedSidebarViewId(view.id)}
                title={view.label}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="filter-head-row">
            <input
              className="input host-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search alias, hostname, user"
            />
            <button
              className={`btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`}
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              aria-expanded={showAdvancedFilters}
              aria-controls="advanced-host-filters"
            >
              Filters {showAdvancedFilters ? "−" : "+"}
            </button>
            <span className="pill-muted">{filteredHostRows.length}</span>
          </div>
          <div id="advanced-host-filters" className={`advanced-filters ${showAdvancedFilters ? "is-open" : ""}`}>
            <div className="filter-row">
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as HostStatusFilter)}>
                <option value="all">All status</option>
                <option value="connected">Connected</option>
                <option value="disconnected">Disconnected</option>
              </select>
              <input
                className="input"
                type="number"
                value={portFilter}
                onChange={(event) => setPortFilter(event.target.value)}
                placeholder="Port"
              />
            </div>
            <div className="filter-row">
              <select className="input" value={selectedTagFilter} onChange={(event) => setSelectedTagFilter(event.target.value)}>
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <button className={`btn ${favoritesOnly ? "btn-primary" : ""}`} onClick={() => setFavoritesOnly((prev) => !prev)}>
                Favorites
              </button>
            </div>
            <div className="filter-row">
              <button className={`btn ${recentOnly ? "btn-primary" : ""}`} onClick={() => setRecentOnly((prev) => !prev)}>
                Recent
              </button>
              <button className="btn" onClick={clearFilters}>
                Reset filters
              </button>
            </div>
          </div>
        </section>

        <div className="host-list">
          {filteredHostRows.length === 0 ? (
            <div className="empty-pane">
              <p>No hosts match the active filters.</p>
              <span>Adjust or reset filters to show hosts.</span>
            </div>
          ) : (
            <>
              {connectedHostRows.length > 0 && (
                <div className="host-list-top">
                  <p className="host-list-section-title">Connected</p>
                  {connectedHostRows.map((row, index) =>
                    renderHostRow(row, `connected-${row.host.host}-${row.host.port}-${index}`),
                  )}
                </div>
              )}
              <div className="host-list-scroll">
                {otherHostRows.map((row, index) => renderHostRow(row, `other-${row.host.host}-${row.host.port}-${index}`))}
              </div>
            </>
          )}
        </div>
      </aside>
      <div
        className={`sidebar-resize-handle ${isSidebarOpen ? "" : "is-hidden"}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize host sidebar"
        onPointerDown={startSidebarResize}
      />

      <section className="right-dock panel">
        <div className="workspace-tabs" role="tablist" aria-label="Terminal workspaces">
          {workspaceTabs.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              role="tab"
              aria-selected={workspace.id === activeWorkspaceId}
              className={`btn workspace-tab ${workspace.id === activeWorkspaceId ? "is-active" : ""}`}
              onClick={() => switchWorkspace(workspace.id)}
              onDragOver={(event) => {
                const payload = parseDragPayload(event);
                const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
                if (shouldReject) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                const payload = parseDragPayload(event);
                const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
                if (shouldReject) {
                  return;
                }
                event.preventDefault();
                sendSessionToWorkspace(payload.sessionId, workspace.id);
              }}
            >
              {workspace.name}
            </button>
          ))}
          <button type="button" className="btn workspace-tab workspace-tab-add" onClick={createWorkspace}>
            + Workspace
          </button>
          {workspaceTabs.length > 1 && (
            <button type="button" className="btn workspace-tab workspace-tab-danger" onClick={() => removeWorkspace(activeWorkspaceId)}>
              Remove current
            </button>
          )}
        </div>
        <div className="sessions-workspace">
          <div className="sessions-zone">
            <div className="session-pane-canvas">
              <div
                className={`terminal-grid ${splitResizeState ? `is-pane-resizing is-pane-resizing-${splitResizeState.axis}` : ""}${
                  isStackedShell && mobileShellTab === "terminal" ? " is-mobile-terminal-pager" : ""
                }`}
              >
                {isStackedShell && mobileShellTab === "terminal" ? (
                  <div className="mobile-terminal-pager">
                    {paneOrder.length > 1 ? (
                      <div className="mobile-terminal-pager-controls" role="toolbar" aria-label="Terminal pager">
                        <button
                          type="button"
                          className="btn mobile-terminal-pager-nav"
                          onClick={() => nudgeMobilePager(-1)}
                          aria-label="Previous terminal"
                        >
                          ‹
                        </button>
                        <span className="mobile-terminal-pager-status" aria-live="polite">
                          {(() => {
                            const pos = paneOrder.indexOf(activePaneIndex);
                            return `${pos >= 0 ? pos + 1 : 1} / ${paneOrder.length}`;
                          })()}
                        </span>
                        <button
                          type="button"
                          className="btn mobile-terminal-pager-nav"
                          onClick={() => nudgeMobilePager(1)}
                          aria-label="Next terminal"
                        >
                          ›
                        </button>
                      </div>
                    ) : null}
                    <div
                      ref={mobilePagerRef}
                      className="mobile-terminal-pager-viewport"
                      onScroll={handleMobilePagerScroll}
                    >
                      {paneOrder.map((paneIndex) => (
                        <div key={paneIndex} className="mobile-terminal-slide">
                          {renderSplitNode(createLeafNode(paneIndex))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  renderSplitNode(splitTree)
                )}
              </div>
            </div>
            <div className="sessions-footer" role="status">
              <div className="sessions-footer-meta">
                <div className="footer-layout-controls">
                  <button
                    type="button"
                    className="btn btn-primary footer-layout-command-btn"
                    onClick={() => setIsLayoutCommandCenterOpen(true)}
                    aria-label="Open layout command center"
                    title="Layouts, templates, session cleanup"
                  >
                    Layouts
                  </button>
                  <div className="sessions-footer-status">
                    <span className={`context-pill footer-broadcast-pill ${isBroadcastModeEnabled ? "is-active" : ""}`}>
                      Broadcast: {isBroadcastModeEnabled ? "enabled" : "disabled"} ({broadcastTargets.size} targets)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {isAppSettingsOpen && (
        <AppSettingsPanel
          settingsOpenMode={settingsOpenMode}
          setSettingsOpenMode={setSettingsOpenMode}
          onCloseSettings={() => setIsAppSettingsOpen(false)}
          settingsSectionRef={settingsModalRef}
          onSettingsHeaderPointerDown={handleSettingsHeaderPointerDown}
          isSettingsDragging={isSettingsDragging}
          settingsModalPosition={settingsModalPosition}
          activeAppSettingsTab={activeAppSettingsTab}
          setActiveAppSettingsTab={setActiveAppSettingsTab}
          densityProfile={densityProfile}
          setDensityProfile={setDensityProfile}
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
          storeSelectedHostForBinding={storeSelectedHostForBinding}
          setStoreSelectedHostForBinding={setStoreSelectedHostForBinding}
          storeBindingDraft={storeBindingDraft}
          setStoreBindingDraft={setStoreBindingDraft}
          saveHostBindingDraft={saveHostBindingDraft}
          sshConfigRaw={sshConfigRaw}
          setSshConfigRaw={setSshConfigRaw}
          onSaveSshConfig={handleSaveSshConfig}
          sshDirInfo={sshDirInfo}
          sshDirOverrideDraft={sshDirOverrideDraft}
          setSshDirOverrideDraft={setSshDirOverrideDraft}
          onApplySshDirOverride={handleApplySshDirOverride}
          onResetSshDirOverride={handleResetSshDirOverride}
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
            onApplyPreset={(tree) => {
              applyLayoutPresetTree(tree);
              setIsLayoutCommandCenterOpen(false);
            }}
            onCloseAllIntent={(withLayoutReset) => void handleCloseAllIntent(withLayoutReset)}
            pendingCloseAllIntent={pendingCloseAllIntent}
            previewTree={layoutCommandCenterPreviewTree}
            applyProfileDisabled={!selectedLayoutProfileId}
            saveDisabled={false}
            closeActionsDisabled={sessions.length === 0}
          />
        </Suspense>
      )}
      {isAddHostModalOpen && (
        <div className="app-settings-overlay" onClick={closeAddHostModal}>
          <section className="app-settings-modal panel add-host-modal" onClick={(event) => event.stopPropagation()}>
            <header className="panel-header">
              <h2>Add host</h2>
              <button className="btn" onClick={closeAddHostModal}>
                Cancel
              </button>
            </header>
            <div className="app-settings-content">
              <HostForm host={newHostDraft} onChange={setNewHostDraft} />
              <div className="action-row">
                <button className="btn" onClick={closeAddHostModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={createHost} disabled={!canCreateHost}>
                  Add host
                </button>
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
          </section>
        </div>
      )}
      {isQuickConnectModalOpen && (
        <div className="app-settings-overlay" onClick={closeQuickConnectModal}>
          <section
            className="app-settings-modal panel add-host-modal"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleQuickConnectModalKeyDown}
          >
            <header className="panel-header">
              <h2>Quick connect</h2>
              <button className="btn" onClick={closeQuickConnectModal}>
                Cancel
              </button>
            </header>
            <div className="app-settings-content">
              <p className="muted-copy quick-connect-shortcuts">
                Enter connects, Esc closes, ArrowUp/ArrowDown cycles known users.
              </p>
              {quickConnectMode === "wizard" && (
                <div className="quick-connect-mode-wrap">
                  <p className="field-help">
                    Step {quickConnectWizardStep}/2 -{" "}
                    {quickConnectWizardStep === 1 ? "Provide host target" : "Choose or type user"}
                  </p>
                  {quickConnectWizardStep === 1 && (
                    <label className="field">
                      <span className="field-label">Host</span>
                      <input
                        className="input"
                        value={quickConnectDraft.hostName}
                        onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, hostName: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            proceedQuickConnectWizard();
                          }
                        }}
                        placeholder="server.local:2222 or [2001:db8::1]:2200"
                        autoFocus
                      />
                    </label>
                  )}
                  {quickConnectWizardStep === 2 && (
                    <>
                      <label className="field">
                        <span className="field-label">User</span>
                        <input
                          className="input"
                          value={quickConnectDraft.user}
                          onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, user: event.target.value }))}
                          onKeyDown={handleQuickConnectUserInputKeyDown}
                          placeholder="Default or custom user"
                          autoFocus
                        />
                      </label>
                      {quickConnectUserOptions.length > 0 && (
                        <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                          {quickConnectUserOptions.map((user) => (
                            <button
                              key={user}
                              type="button"
                              className={`btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`}
                              onClick={() => {
                                applyQuickConnectUser(user);
                              }}
                            >
                              {user}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {quickConnectMode === "smart" && (
                <div className="quick-connect-mode-wrap">
                  <label className="field">
                    <span className="field-label">Host</span>
                    <input
                      className="input"
                      value={quickConnectDraft.hostName}
                      onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, hostName: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void connectQuickSshInNewPane();
                        }
                      }}
                      placeholder="example.com or 10.0.0.8:2222"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">User</span>
                    <input
                      className="input"
                      value={quickConnectDraft.user}
                      onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, user: event.target.value }))}
                      onKeyDown={handleQuickConnectUserInputKeyDown}
                      placeholder="Default or custom user"
                    />
                  </label>
                  {quickConnectUserOptions.length > 0 && (
                    <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                      {quickConnectUserOptions.map((user) => (
                        <button
                          key={user}
                          type="button"
                          className={`btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`}
                          onClick={() => {
                            applyQuickConnectUser(user);
                          }}
                        >
                          {user}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {quickConnectMode === "command" && (
                <div className="quick-connect-mode-wrap">
                  <label className="field">
                    <span className="field-label">Target command</span>
                    <input
                      className="input"
                      value={quickConnectCommandInput}
                      onChange={(event) => setQuickConnectCommandInput(event.target.value)}
                      onKeyDown={handleQuickConnectCommandInputKeyDown}
                      placeholder="user@host:22"
                      autoFocus
                    />
                  </label>
                  {quickConnectUserOptions.length > 0 && (
                    <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                      {quickConnectUserOptions.map((user) => (
                        <button
                          key={user}
                          type="button"
                          className={`btn ${quickConnectCommandInput.trim().startsWith(`${user}@`) ? "btn-primary" : ""}`}
                          onClick={() => {
                            const targetPart = quickConnectCommandInput.includes("@")
                              ? quickConnectCommandInput.slice(quickConnectCommandInput.indexOf("@"))
                              : "@";
                            setQuickConnectCommandInput(`${user}${targetPart}`);
                          }}
                        >
                          {user}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="field-help">
                    Supports `user@host`, `user@host:port`, and `user@[2001:db8::1]:2200`.
                  </p>
                </div>
              )}
              {(quickConnectMode !== "wizard" || quickConnectWizardStep === 2) && (
                <>
                  <label className="field">
                    <span className="field-label">Identity file</span>
                    <input
                      className="input"
                      value={quickConnectDraft.identityFile}
                      onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, identityFile: event.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Proxy jump</span>
                    <input
                      className="input"
                      value={quickConnectDraft.proxyJump}
                      onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, proxyJump: event.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Proxy command</span>
                    <input
                      className="input"
                      value={quickConnectDraft.proxyCommand}
                      onChange={(event) => setQuickConnectDraft((prev) => ({ ...prev, proxyCommand: event.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                </>
              )}
              <div className="action-row">
                {quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (
                  <button className="btn" onClick={() => setQuickConnectWizardStep(1)}>
                    Back
                  </button>
                )}
                <button className="btn" onClick={closeQuickConnectModal}>
                  Cancel
                </button>
                {quickConnectMode === "wizard" && quickConnectWizardStep === 1 ? (
                  <button className="btn btn-primary" onClick={proceedQuickConnectWizard}>
                    Next
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => void connectQuickSshInNewPane()}>
                    Connect
                  </button>
                )}
                {quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (
                  <button className="btn" onClick={() => setQuickConnectWizardStep(1)}>
                    Back
                  </button>
                )}
              </div>
              {error && <p className="error-text">{error}</p>}
            </div>
          </section>
        </div>
      )}
      {activeTrustPrompt && (
        <div className="app-settings-overlay" onClick={() => dismissTrustPrompt(activeTrustPrompt.sessionId)}>
          <section
            className="app-settings-modal panel trust-host-modal"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleTrustPromptKeyDown}
          >
            <header className="panel-header">
              <h2>Trust host key</h2>
              <button className="btn" onClick={() => dismissTrustPrompt(activeTrustPrompt.sessionId)}>
                Close
              </button>
            </header>
            <div className="app-settings-content">
              <p className="muted-copy">
                Session <strong>{activeTrustPrompt.sessionId}</strong> requests trust confirmation for host{" "}
                <strong>{activeTrustPrompt.hostAlias}</strong>.
              </p>
              <label className="field checkbox-field trust-default-checkbox">
                <input
                  className="checkbox-input"
                  type="checkbox"
                  checked={saveTrustHostAsDefault}
                  onChange={(event) => setSaveTrustHostAsDefault(event.target.checked)}
                />
                <span className="field-label">Save as default for this host</span>
              </label>
              <div className="action-row">
                <button className="btn" onClick={() => dismissTrustPrompt(activeTrustPrompt.sessionId)}>
                  Dismiss
                </button>
                <button className="btn btn-primary" onClick={() => void acceptTrustPrompt()} autoFocus>
                  Trust host
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {contextMenu.visible && contextMenu.paneIndex !== null && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onContextMenuCapture={(event) => {
            event.preventDefault();
          }}
        >
          {buildPaneContextActions({
            paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
            canClosePane: paneOrder.length > 1,
            broadcastModeEnabled: isBroadcastModeEnabled,
            broadcastCount: broadcastTargets.size,
            splitMode: contextMenu.splitMode,
            freeMoveEnabled: autoArrangeMode === "free",
          }).map((action) => (
            <button
              key={action.id}
              className={`context-menu-item ${action.separatorAbove ? "separator-above" : ""}`}
              disabled={action.disabled}
              onClick={(event) =>
                void handleContextAction(action.id, contextMenu.paneIndex ?? 0, {
                  preferredSplitMode: contextMenu.splitMode,
                  eventLike: event,
                })
              }
            >
              {action.label}
            </button>
          ))}
          {workspaceSendTargets.map((workspace, index) => (
            <button
              key={`send-${workspace.id}`}
              className={`context-menu-item ${index === 0 ? "separator-above" : ""}`}
              onClick={() => {
                if (!contextMenuPaneSessionId) {
                  return;
                }
                sendSessionToWorkspace(contextMenuPaneSessionId, workspace.id);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              Send to {workspace.name}
            </button>
          ))}
          {workspaceSendPlaceholder && (
            <button type="button" className="context-menu-item separator-above" disabled>
              Send to other workspace (add another workspace tab)
            </button>
          )}
        </div>
      )}
      {hostContextMenu && (
        <div
          className="context-menu"
          style={{ left: hostContextMenu.x, top: hostContextMenu.y }}
          role="menu"
          onContextMenuCapture={(event) => {
            event.preventDefault();
          }}
        >
          {workspaceTabs.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className="context-menu-item"
              onClick={() => {
                void connectToHostInWorkspace(hostContextMenu.host, workspace.id);
                setHostContextMenu(null);
              }}
            >
              Connect in {workspace.name}
            </button>
          ))}
          <button
            type="button"
            className="context-menu-item separator-above"
            onClick={() => {
              openHostMenuForHost(hostContextMenu.host);
              setHostContextMenu(null);
            }}
          >
            Edit host
          </button>
        </div>
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
