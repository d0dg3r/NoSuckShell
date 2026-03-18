import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
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
  listHostMetadata,
  listHosts,
  saveHost,
  saveHostMetadata,
  saveLayoutProfile,
  sendInput,
  startSession,
  touchHostLastUsed,
} from "./tauri-api";
import { HostForm } from "./components/HostForm";
import { TerminalPane } from "./components/TerminalPane";
import { buildPaneContextActions, type ContextActionId } from "./features/context-actions";
import {
  assignSessionToPane,
  clearPaneAtIndex,
  createPaneLayoutItem,
  createPaneLayoutsFromSlots,
  createInitialPaneState,
  MIN_PANE_HEIGHT,
  MIN_PANE_WIDTH,
  reconcilePaneLayouts,
  removeSessionFromSlots,
  resolveInputTargets,
  sanitizeBroadcastTargets,
} from "./features/split";
import type {
  HostConfig,
  HostMetadata,
  HostMetadataStore,
  LayoutProfile,
  LayoutSplitTreeNode,
  PaneLayoutItem,
  SessionOutputEvent,
} from "./types";
import logoTextTransparent from "../../../img/logo_text_transparent.png";
import logoTerminal from "../../../img/logo_terminal.png";

const emptyHost = (): HostConfig => ({
  host: "",
  hostName: "",
  user: "",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

type SessionTab = {
  id: string;
  host: string;
};

type HostStatusFilter = "all" | "connected" | "disconnected";
type HostRowViewModel = {
  host: HostConfig;
  metadata: HostMetadata;
  connected: boolean;
  displayUser: string;
};

type AppSettingsTab = "general" | "backup" | "extras" | "help" | "about";
type SessionDropPolicy = "spawn_new_from_host" | "move_existing";
type DragPayload =
  | { type: "session"; sessionId: string }
  | { type: "machine"; hostAlias: string }
  | { type: "pane"; paneIndex: number };
type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  paneIndex: number | null;
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

const appSettingsTabs: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "backup", label: "Backup & Restore" },
  { id: "extras", label: "Extras" },
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
];
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_AUTO_HIDE_DELAY_MS = 300;
const SIDEBAR_WIDTH_STORAGE_KEY = "nosuckshell.sidebar.width";
const SIDEBAR_PINNED_STORAGE_KEY = "nosuckshell.sidebar.pinned";
const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";
const SESSION_DROP_POLICY: SessionDropPolicy = "spawn_new_from_host";
const hasTauriTransformCallback = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: { transformCallback?: unknown } })
    .__TAURI_INTERNALS__;
  return typeof tauriInternals?.transformCallback === "function";
};

const clampSidebarWidth = (value: number): number => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const createDefaultMetadataStore = (): HostMetadataStore => ({ defaultUser: "", hosts: {} });
const createDefaultHostMetadata = (): HostMetadata => ({ favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false });
const createLeafNode = (paneIndex: number): SplitLeafNode => ({ id: `leaf-${paneIndex}`, type: "leaf", paneIndex });
const collectPaneOrder = (node: SplitTreeNode): number[] =>
  node.type === "leaf" ? [node.paneIndex] : [...collectPaneOrder(node.first), ...collectPaneOrder(node.second)];
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
const swapPaneIndicesInTree = (node: SplitTreeNode, firstPane: number, secondPane: number): SplitTreeNode => {
  if (node.type === "leaf") {
    if (node.paneIndex === firstPane) {
      return { ...node, paneIndex: secondPane };
    }
    if (node.paneIndex === secondPane) {
      return { ...node, paneIndex: firstPane };
    }
    return node;
  }
  return {
    ...node,
    first: swapPaneIndicesInTree(node.first, firstPane, secondPane),
    second: swapPaneIndicesInTree(node.second, firstPane, secondPane),
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
  const [error, setError] = useState<string>("");
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState<boolean>(false);
  const [activeAppSettingsTab, setActiveAppSettingsTab] = useState<AppSettingsTab>("general");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<HostStatusFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [recentOnly, setRecentOnly] = useState<boolean>(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");
  const [portFilter, setPortFilter] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [isQuickAddMenuOpen, setIsQuickAddMenuOpen] = useState<boolean>(false);
  const [isAddHostModalOpen, setIsAddHostModalOpen] = useState<boolean>(false);
  const [newHostDraft, setNewHostDraft] = useState<HostConfig>(emptyHost());
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
  const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState<boolean>(false);
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const [layoutProfiles, setLayoutProfiles] = useState<LayoutProfile[]>([]);
  const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState<string>("");
  const [pendingLayoutProfileDeleteId, setPendingLayoutProfileDeleteId] = useState<string>("");
  const [layoutProfileName, setLayoutProfileName] = useState<string>("");
  const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState<boolean>(false);
  const [isFooterLayoutPanelOpen, setIsFooterLayoutPanelOpen] = useState<boolean>(false);
  const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState<string>("");
  const [draggingKind, setDraggingKind] = useState<DragPayload["type"] | null>(null);
  const [sessionDropMode, setSessionDropMode] = useState<"spawn" | "move">("spawn");
  const [dragOverPaneIndex, setDragOverPaneIndex] = useState<number | null>(null);
  const [panePointerDragSource, setPanePointerDragSource] = useState<number | null>(null);
  const [paneDragPointer, setPaneDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [swapPulsePaneIndices, setSwapPulsePaneIndices] = useState<number[]>([]);
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
  const [hoveredHostAlias, setHoveredHostAlias] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    paneIndex: null,
  });
  const sidebarDragStartXRef = useRef<number>(0);
  const sidebarDragStartWidthRef = useRef<number>(SIDEBAR_DEFAULT_WIDTH);
  const splitNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState<{ hostAlias: string; scope: "settings" } | null>(null);
  const [pendingCloseAllIntent, setPendingCloseAllIntent] = useState<"close" | "reset" | null>(null);

  const canSave = useMemo(
    () => currentHost.host.trim().length > 0 && currentHost.hostName.trim().length > 0,
    [currentHost],
  );
  const canCreateHost = useMemo(
    () => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0,
    [newHostDraft],
  );
  const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
  const hasAssignedPaneSessions = useMemo(() => splitSlots.some((slot) => Boolean(slot)), [splitSlots]);
  const activeTrustPrompt = useMemo(() => trustPromptQueue[0] ?? null, [trustPromptQueue]);
  const selectedLayoutProfile = useMemo(
    () => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null,
    [layoutProfiles, selectedLayoutProfileId],
  );
  const connectedHosts = useMemo(() => new Set(sessions.map((session) => session.host)), [sessions]);
  const isSidebarOpen = isSidebarPinned || isSidebarVisible;


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
  const filteredHostRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const numericPort = Number(portFilter);
    const hasPortFilter = portFilter.trim().length > 0 && Number.isFinite(numericPort);
    return hostRows
      .filter((row) => {
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
        return a.host.host.localeCompare(b.host.host);
      });
  }, [favoritesOnly, hostRows, portFilter, recentOnly, searchQuery, selectedTagFilter, statusFilter]);
  const connectedHostRows = useMemo(
    () => filteredHostRows.filter((row) => row.connected).sort((a, b) => a.host.host.localeCompare(b.host.host)),
    [filteredHostRows],
  );
  const otherHostRows = useMemo(() => filteredHostRows.filter((row) => !row.connected), [filteredHostRows]);
  const hoveredHostPaneIndices = useMemo(() => {
    if (!hoveredHostAlias) {
      return new Set<number>();
    }
    const hoveredSessions = new Set(
      sessions.filter((session) => session.host === hoveredHostAlias).map((session) => session.id),
    );
    const paneIndices = new Set<number>();
    splitSlots.forEach((slot, paneIndex) => {
      if (slot && hoveredSessions.has(slot)) {
        paneIndices.add(paneIndex);
      }
    });
    return paneIndices;
  }, [hoveredHostAlias, sessions, splitSlots]);
  const hasHoveredHostTargets = hoveredHostAlias !== null && hoveredHostPaneIndices.size > 0;
  const swapPulsePaneSet = useMemo(() => new Set(swapPulsePaneIndices), [swapPulsePaneIndices]);
  const dragGhostLabel = useMemo(() => {
    if (panePointerDragSource === null) {
      return "";
    }
    const sourceSessionId = splitSlots[panePointerDragSource] ?? null;
    if (!sourceSessionId) {
      return "empty";
    }
    const sourceHost = sessions.find((session) => session.id === sourceSessionId)?.host ?? null;
    if (!sourceHost) {
      return "empty";
    }
    const sourceHostConfig = hosts.find((host) => host.host === sourceHost) ?? null;
    const sourceUser = sourceHostConfig?.user.trim() || metadataStore.defaultUser.trim();
    return sourceUser ? `${sourceUser}@${sourceHost}` : sourceHost;
  }, [hosts, metadataStore.defaultUser, panePointerDragSource, sessions, splitSlots]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    metadataStoreRef.current = metadataStore;
  }, [metadataStore]);
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
        return "empty";
      }
      const paneSessionHost = sessions.find((session) => session.id === paneSessionId)?.host ?? null;
      if (!paneSessionHost) {
        return "empty";
      }
      const paneHostConfig = hosts.find((host) => host.host === paneSessionHost) ?? null;
      const paneUser = paneHostConfig?.user.trim() || metadataStore.defaultUser.trim();
      return paneUser ? `${paneUser}@${paneSessionHost}` : paneSessionHost;
    },
    [hosts, metadataStore.defaultUser, sessions, splitSlots],
  );
  const toggleFooterLayoutPanel = useCallback(() => {
    setIsFooterLayoutPanelOpen((prev) => !prev);
  }, []);

  const load = async () => {
    const [loadedHosts, loadedMetadata, loadedProfiles] = await Promise.all([
      listHosts(),
      listHostMetadata(),
      listLayoutProfiles(),
    ]);
    setHosts(loadedHosts);
    setMetadataStore(loadedMetadata);
    setLayoutProfiles(loadedProfiles);
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
    }
  };

  useEffect(() => {
    void load().catch((e: unknown) => setError(String(e)));
  }, []);


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
      const hostAlias = sessionsRef.current.find((session) => session.id === sessionId)?.host ?? "";
      if (hostAlias) {
        const metadata = metadataStoreRef.current.hosts[hostAlias] ?? null;
        if (metadata?.trustHostDefault) {
          void sendInput(sessionId, "yes\n").catch((sendError: unknown) => setError(String(sendError)));
          return;
        }
      }
      setTrustPromptQueue((prev) => {
        if (prev.some((entry) => entry.sessionId === sessionId)) {
          return prev;
        }
        return [...prev, { sessionId, hostAlias: hostAlias || "unknown" }];
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
    if (!contextMenu.visible) {
      return;
    }
    const hide = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", hide);
    return () => {
      window.removeEventListener("click", hide);
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
    const clearPointerDragSource = (event: PointerEvent) => {
      if (panePointerDragSource === null) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const dropPaneElement = target?.closest("[data-pane-index]") as HTMLElement | null;
      const dropPaneIndexRaw = dropPaneElement?.dataset?.paneIndex;
      const dropPaneIndex =
        typeof dropPaneIndexRaw === "string" && dropPaneIndexRaw.length > 0 ? Number(dropPaneIndexRaw) : null;
      if (
        dropPaneIndex !== null &&
        Number.isInteger(dropPaneIndex) &&
        dropPaneIndex >= 0 &&
        dropPaneIndex !== panePointerDragSource
      ) {
        swapPaneIndices(panePointerDragSource, dropPaneIndex, "pointer-fallback");
      }
      setPanePointerDragSource(null);
      setPaneDragPointer(null);
      setDragOverPaneIndex(null);
    };
    const updatePointerDragPosition = (event: PointerEvent) => {
      if (panePointerDragSource === null) {
        return;
      }
      setPaneDragPointer({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", updatePointerDragPosition);
    window.addEventListener("pointerup", clearPointerDragSource);
    return () => {
      window.removeEventListener("pointermove", updatePointerDragPosition);
      window.removeEventListener("pointerup", clearPointerDragSource);
    };
  }, [panePointerDragSource]);

  useEffect(() => {
    if (swapPulsePaneIndices.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSwapPulsePaneIndices([]);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [swapPulsePaneIndices]);

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

  const selectHost = (hostAlias: string) => {
    const found = hosts.find((item) => item.host === hostAlias);
    if (!found) {
      return;
    }
    setActiveHost(found.host);
    setCurrentHost(found);
    setOpenHostMenuHostAlias("");
    setTagDraft((metadataStore.hosts[found.host]?.tags ?? []).join(", "));
  };

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
        return [...prev, { id: started.session_id, host: host.host }];
      });
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
        body: JSON.stringify({
          sessionId: "be74dc",
          runId: "dnd-branch-debug",
          hypothesisId: "H6",
          location: "App.tsx:connectToHost",
          message: "new session started",
          data: { hostAlias: host.host, sessionId: started.session_id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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

  const connectToHostInNewPane = async (host: HostConfig): Promise<void> => {
    const startedSessionId = await connectToHost(host);
    if (!startedSessionId) {
      return;
    }
    const firstFreePaneIndex = paneOrder.find((paneIndex) => splitSlots[paneIndex] === null);
    const usedExistingEmptyPane = typeof firstFreePaneIndex === "number" && firstFreePaneIndex >= 0;
    const targetPaneIndex = usedExistingEmptyPane ? firstFreePaneIndex : splitFocusedPane("right");
    setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, startedSessionId));
    setActivePaneIndex(targetPaneIndex);
    setActiveSession(startedSessionId);
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
      body: JSON.stringify({
        sessionId: "be74dc",
        runId: "connect-new-pane",
        hypothesisId: "H18",
        location: "App.tsx:connectToHostInNewPane",
        message: "host list connect assigned session to target pane",
        data: { hostAlias: host.host, sessionId: startedSessionId, targetPaneIndex, usedExistingEmptyPane },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

  const setDragPayload = (event: ReactDragEvent, payload: DragPayload) => {
    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed =
      payload.type === "pane" ? "move" : payload.type === "session" ? "copyMove" : "copy";
    event.dataTransfer.setData(DND_PAYLOAD_MIME, serialized);
    event.dataTransfer.setData("text/plain", serialized);
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
      body: JSON.stringify({
        sessionId: "be74dc",
        runId: "dnd-broken",
        hypothesisId: "H1",
        location: "App.tsx:setDragPayload",
        message: "drag payload initialized",
        data: {
          payloadType: payload.type,
          effectAllowed: event.dataTransfer.effectAllowed,
          sessionDropMode,
          serializedLength: serialized.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };

  const parseDragPayload = (event: ReactDragEvent): DragPayload | null => {
    const encoded = event.dataTransfer.getData(DND_PAYLOAD_MIME) || event.dataTransfer.getData("text/plain");
    if (!encoded) {
      return null;
    }
    try {
      const parsed = JSON.parse(encoded) as Partial<DragPayload>;
      const result =
        parsed.type === "session" && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0
          ? ({ type: "session", sessionId: parsed.sessionId } as DragPayload)
          : parsed.type === "machine" && typeof parsed.hostAlias === "string" && parsed.hostAlias.length > 0
            ? ({ type: "machine", hostAlias: parsed.hostAlias } as DragPayload)
            : parsed.type === "pane" && typeof parsed.paneIndex === "number" && Number.isInteger(parsed.paneIndex)
              ? ({ type: "pane", paneIndex: parsed.paneIndex } as DragPayload)
              : null;
      return result;
    } catch {
      return null;
    }
  };

  const resolveSplitDirectionFromDrop = (
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, "left" | "top" | "width" | "height"> | null,
  ): "left" | "right" | "top" | "bottom" => {
    if (!bounds) {
      return "right";
    }
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      return deltaX < 0 ? "left" : "right";
    }
    return deltaY < 0 ? "top" : "bottom";
  };

  const handlePaneDrop = async (event: ReactDragEvent<HTMLDivElement>, paneIndex: number) => {
    event.preventDefault();
    setDragOverPaneIndex(null);
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
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
      body: JSON.stringify({
        sessionId: "be74dc",
        runId: "dnd-broken",
        hypothesisId: "H2",
        location: "App.tsx:handlePaneDrop",
        message: "pane drop received",
        data: {
          paneIndex,
          payloadType: payload?.type ?? null,
          shiftKey: event.shiftKey,
          dataTransferTypes: [...event.dataTransfer.types],
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!payload) {
      return;
    }
    if (payload.type === "pane") {
      if (payload.paneIndex === paneIndex) {
        return;
      }
      swapPaneIndices(payload.paneIndex, paneIndex, "native-drop");
      return;
    }
    const placeSessionOnPane = (sessionId: string) => {
      const targetHasSession = Boolean(splitSlots[paneIndex]);
      if (!targetHasSession) {
        setActivePaneIndex(paneIndex);
        setActiveSession(sessionId);
        setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, sessionId));
        return;
      }
      const splitDirection = resolveSplitDirectionFromDrop(dropClientX, dropClientY, dropBounds);
      const adjacentPaneIndex = splitFocusedPane(splitDirection, paneIndex);
      setActivePaneIndex(adjacentPaneIndex);
      setActiveSession(sessionId);
      setSplitSlots((prev) => assignSessionToPane(prev, adjacentPaneIndex, sessionId));
    };
    if (payload.type === "session") {
      const shouldMoveExisting = sessionDropMode === "move";
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
        body: JSON.stringify({
          sessionId: "be74dc",
          runId: "dnd-branch-debug",
          hypothesisId: "H5",
          location: "App.tsx:handlePaneDrop.sessionBranch",
          message: "session drop policy decision",
          data: {
            shiftKey: event.shiftKey,
            sessionDropMode,
            policy: SESSION_DROP_POLICY,
            shouldMoveExisting,
            sourceSessionId: payload.sessionId,
            sourcePaneIndex: splitSlots.findIndex((slot) => slot === payload.sessionId),
            targetPaneIndex: paneIndex,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (shouldMoveExisting) {
        setActivePaneIndex(paneIndex);
        setActiveSession(payload.sessionId);
        setSplitSlots((prev) => {
          const cleared = removeSessionFromSlots(prev, payload.sessionId);
          const moved = assignSessionToPane(cleared, paneIndex, payload.sessionId);
          // #region agent log
          fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
            body: JSON.stringify({
              sessionId: "be74dc",
              runId: "post-fix",
              hypothesisId: "H11",
              location: "App.tsx:handlePaneDrop.moveApply",
              message: "session moved with source cleanup",
              data: {
                sessionId: payload.sessionId,
                targetPaneIndex: paneIndex,
                occurrenceCountAfterMove: moved.filter((slot) => slot === payload.sessionId).length,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return moved;
        });
        return;
      }
      const sourceSession = sessions.find((session) => session.id === payload.sessionId) ?? null;
      if (!sourceSession) {
        return;
      }
      const spawnedSessionId = await spawnSessionFromHostAlias(sourceSession.host);
      if (!spawnedSessionId) {
        return;
      }
      placeSessionOnPane(spawnedSessionId);
      return;
    }
    if (sessionDropMode === "move") {
      const existingSession = sessions.find((session) => session.host === payload.hostAlias) ?? null;
      if (existingSession) {
        placeSessionOnPane(existingSession.id);
        return;
      }
    }
    const sessionId = await ensureSessionForHost(payload.hostAlias);
    if (sessionId) {
      placeSessionOnPane(sessionId);
    }
  };

  const resolveDropEffect = (event: ReactDragEvent): DataTransfer["dropEffect"] => {
    const payload = parseDragPayload(event);
    if (!payload) {
      if (!missingDragPayloadLoggedRef.current && draggingKind !== null) {
        missingDragPayloadLoggedRef.current = true;
        // #region agent log
        fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
          body: JSON.stringify({
            sessionId: "be74dc",
            runId: "dnd-broken",
            hypothesisId: "H3",
            location: "App.tsx:resolveDropEffect",
            message: "dragover payload missing",
            data: {
              draggingKind,
              shiftKey: event.shiftKey,
              sessionDropMode,
              effectAllowed: event.dataTransfer.effectAllowed,
              fallbackDropEffect:
                draggingKind === "pane"
                  ? "move"
                  : draggingKind === "session"
                    ? sessionDropMode === "move"
                      ? "move"
                      : "copy"
                    : draggingKind === "machine"
                      ? "copy"
                      : "none",
              dataTransferTypes: [...event.dataTransfer.types],
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
      if (draggingKind === "pane") {
        return "move";
      }
      if (draggingKind === "session") {
        return sessionDropMode === "move" ? "move" : "copy";
      }
      if (draggingKind === "machine") {
        return "copy";
      }
      return "none";
    }
    missingDragPayloadLoggedRef.current = false;
    if (payload.type === "pane") {
      return "move";
    }
    if (payload.type === "session") {
      return sessionDropMode === "move" ? "move" : "copy";
    }
    return "copy";
  };

  const getEmptyPaneDropHint = (): string => {
    if (draggingKind === "pane") {
      return "Drop pane here to swap.";
    }
    if (draggingKind === "machine") {
      return sessionDropMode === "move"
        ? "Drop host to move an existing session."
        : "Drop host to open a new session.";
    }
    return "Drag a host here.";
  };
  const getSessionModifierModeText = (): string =>
    sessionDropMode === "move" ? "Move existing session" : "Open new session from host";

  const swapPaneIndices = (
    fromPaneIndex: number,
    toPaneIndex: number,
    _source: "native-drop" | "pointer-fallback",
  ) => {
    if (fromPaneIndex === toPaneIndex) {
      return;
    }
    setSplitTree((prev) => swapPaneIndicesInTree(prev, fromPaneIndex, toPaneIndex));
    setActivePaneIndex(toPaneIndex);
    setSwapPulsePaneIndices([fromPaneIndex, toPaneIndex]);
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

  const closeSessionById = async (sessionId: string) => {
    await closeSession(sessionId);
    const next = sessions.filter((session) => session.id !== sessionId);
    setSessions(next);
    if (activeSession === sessionId) {
      setActiveSession(next[0]?.id ?? "");
    }
    setSplitSlots((prev) => removeSessionFromSlots(prev, sessionId));
    setBroadcastTargets((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(sessionId);
      return nextSet;
    });
    setTrustPromptQueue((prev) => prev.filter((entry) => entry.sessionId !== sessionId));
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
      if (saveTrustHostAsDefault && activeTrustPrompt.hostAlias !== "unknown") {
        await upsertHostMetadata(activeTrustPrompt.hostAlias, (current) => ({
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
    const targets = splitSlots.filter((slot): slot is string => Boolean(slot));
    setBroadcastTargets(new Set(targets));
  };

  const setBroadcastMode = (enabled: boolean) => {
    setIsBroadcastModeEnabled(enabled);
    if (!enabled) {
      setBroadcastTargets(new Set());
    }
  };

  const handleContextAction = async (actionId: ContextActionId, paneIndex: number) => {
    setActivePaneIndex(paneIndex);
    switch (actionId) {
      case "pane.clear":
        setSplitSlots((prev) => clearPaneAtIndex(prev, paneIndex));
        break;
      case "pane.close":
        await closePaneAndSession(paneIndex);
        break;
      case "layout.split.left":
        splitFocusedPane("left", paneIndex);
        break;
      case "layout.split.right":
        splitFocusedPane("right", paneIndex);
        break;
      case "layout.split.top":
        splitFocusedPane("top", paneIndex);
        break;
      case "layout.split.bottom":
        splitFocusedPane("bottom", paneIndex);
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
    setIsSidebarPinned((prev) => {
      const next = !prev;
      if (!next) {
        setIsSidebarVisible(false);
      } else {
        setIsSidebarVisible(true);
      }
      return next;
    });
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
    hideSidebarTimeoutRef.current = window.setTimeout(() => {
      setIsSidebarVisible(false);
      hideSidebarTimeoutRef.current = null;
    }, SIDEBAR_AUTO_HIDE_DELAY_MS);
  };

  const splitFocusedPane = (direction: "left" | "right" | "top" | "bottom", paneIndex = activePaneIndex) => {
    const targetPane = paneOrder.includes(paneIndex) ? paneIndex : (paneOrder[0] ?? 0);
    const newPaneIndex = nextPaneIndexRef.current;
    nextPaneIndexRef.current += 1;
    const splitId = `split-${nextSplitIdRef.current}`;
    nextSplitIdRef.current += 1;
    setSplitSlots((prev) => {
      const next = [...prev];
      if (next[newPaneIndex] === undefined) {
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
        if (direction === "left") {
          return {
            id: splitId,
            type: "split",
            axis: "horizontal",
            ratio: DEFAULT_SPLIT_RATIO,
            first: insertedLeaf,
            second: leaf,
          };
        }
        if (direction === "right") {
          return {
            id: splitId,
            type: "split",
            axis: "horizontal",
            ratio: DEFAULT_SPLIT_RATIO,
            first: leaf,
            second: insertedLeaf,
          };
        }
        if (direction === "top") {
          return {
            id: splitId,
            type: "split",
            axis: "vertical",
            ratio: DEFAULT_SPLIT_RATIO,
            first: insertedLeaf,
            second: leaf,
          };
        }
        return {
          id: splitId,
          type: "split",
          axis: "vertical",
          ratio: DEFAULT_SPLIT_RATIO,
          first: leaf,
          second: insertedLeaf,
        };
      }),
    );
    setActivePaneIndex(newPaneIndex);
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
        const hostAlias = sessionId ? sessions.find((session) => session.id === sessionId)?.host ?? null : null;
        return {
          width: pane.width,
          height: pane.height,
          hostAlias: saveLayoutWithHosts ? hostAlias : null,
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
      if (selectedLayoutProfile.withHosts && pane.hostAlias) {
        const existingSession = sessions.find(
          (session) => session.host === pane.hostAlias && !consumedSessionIds.has(session.id),
        );
        if (existingSession) {
          sessionId = existingSession.id;
        } else if (hosts.some((host) => host.host === pane.hostAlias)) {
          const hostConfig = hosts.find((host) => host.host === pane.hostAlias) ?? null;
          if (hostConfig) {
            sessionId = await connectToHost(hostConfig);
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

  const renderSplitNode = (node: SplitTreeNode) => {
    if (node.type === "leaf") {
      const paneIndex = node.paneIndex;
      const paneSessionId = splitSlots[paneIndex] ?? null;
      const paneIdentity = resolvePaneIdentity(paneIndex);
      const isHoverTarget = hoveredHostPaneIndices.has(paneIndex);
      const isHoverDimmed = hasHoveredHostTargets && !isHoverTarget;
      return (
        <div
          key={`pane-${paneIndex}`}
          data-pane-index={paneIndex}
          className={`split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${
            dragOverPaneIndex === paneIndex ? "is-drag-over" : ""
          } ${panePointerDragSource === paneIndex ? "is-being-dragged" : ""} ${
            swapPulsePaneSet.has(paneIndex) ? "is-swap-pulse" : ""
          } ${isHoverTarget ? "is-host-hover-target" : ""} ${isHoverDimmed ? "is-host-hover-dimmed" : ""} ${
            hoveredHostAlias ? "is-host-hovering" : ""
          }`}
          draggable={false}
          onClick={() => {
            setActivePaneIndex(paneIndex);
            if (paneSessionId) {
              setActiveSession(paneSessionId);
              requestTerminalFocus(paneSessionId);
            }
          }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement | null;
            const inPaneLabel = Boolean(target?.closest(".split-pane-label"));
            if (!inPaneLabel || event.button !== 0) {
              return;
            }
            setPanePointerDragSource(paneIndex);
            setPaneDragPointer({ x: event.clientX, y: event.clientY });
          }}
          onPointerEnter={() => {
            if (panePointerDragSource !== null && panePointerDragSource !== paneIndex) {
              setDragOverPaneIndex(paneIndex);
            }
          }}
          onPointerUp={() => {
            if (panePointerDragSource === null) {
              return;
            }
            if (panePointerDragSource !== paneIndex) {
              swapPaneIndices(panePointerDragSource, paneIndex, "pointer-fallback");
            }
            setPanePointerDragSource(null);
            setDragOverPaneIndex(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = resolveDropEffect(event);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOverPaneIndex(paneIndex);
            // #region agent log
            fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
              body: JSON.stringify({
                sessionId: "be74dc",
                runId: "dnd-drop-entry",
                hypothesisId: "H8",
                location: "App.tsx:splitPane.onDragEnter",
                message: "drag entered pane",
                data: { paneIndex, draggingKind, shiftKey: event.shiftKey, sessionDropMode },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
          }}
          onDrop={(event) => {
            // #region agent log
            fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
              body: JSON.stringify({
                sessionId: "be74dc",
                runId: "dnd-drop-entry",
                hypothesisId: "H9",
                location: "App.tsx:splitPane.onDrop",
                message: "drop event on pane wrapper",
                data: { paneIndex, draggingKind, shiftKey: event.shiftKey, types: [...event.dataTransfer.types] },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            void handlePaneDrop(event, paneIndex);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({
              visible: true,
              x: event.clientX,
              y: event.clientY,
              paneIndex,
            });
          }}
        >
          <div className="split-pane-label">
            <div className="pane-label-actions">
              <button
                className="btn action-icon-btn pane-label-action-btn"
                title="Clear this pane"
                aria-label={`Clear pane ${paneIndex + 1}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("pane.clear", paneIndex);
                }}
              >
                <span aria-hidden="true">⌫</span>
              </button>
              <button
                className="btn action-icon-btn action-icon-btn-danger pane-label-action-btn"
                title="Close pane and session"
                aria-label={`Close pane ${paneIndex + 1} and its session`}
                disabled={paneOrder.length <= 1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("pane.close", paneIndex);
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
              <button
                className="btn action-icon-btn pane-label-action-btn"
                title="Split pane left"
                aria-label={`Split pane ${paneIndex + 1} left`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.left", paneIndex);
                }}
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                className="btn action-icon-btn pane-label-action-btn"
                title="Split pane right"
                aria-label={`Split pane ${paneIndex + 1} right`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.right", paneIndex);
                }}
              >
                <span aria-hidden="true">→</span>
              </button>
              <button
                className="btn action-icon-btn pane-label-action-btn"
                title="Split pane top"
                aria-label={`Split pane ${paneIndex + 1} top`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.top", paneIndex);
                }}
              >
                <span aria-hidden="true">┬</span>
              </button>
              <button
                className="btn action-icon-btn pane-label-action-btn"
                title="Split pane bottom"
                aria-label={`Split pane ${paneIndex + 1} bottom`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleContextAction("layout.split.bottom", paneIndex);
                }}
              >
                <span aria-hidden="true">┴</span>
              </button>
              <button
                className={`btn action-icon-btn pane-label-action-btn ${isBroadcastModeEnabled ? "is-broadcast-active" : ""}`}
                title={`Broadcast ${isBroadcastModeEnabled ? "ON" : "OFF"}`}
                aria-label={`Broadcast ${isBroadcastModeEnabled ? "on" : "off"}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setBroadcastMode(!isBroadcastModeEnabled);
                }}
              >
                <span aria-hidden="true">@</span>
              </button>
            </div>
            <button
              type="button"
              className={`pane-swap-handle ${panePointerDragSource === paneIndex ? "is-active" : ""}`}
              title="Drag pane to another pane"
              aria-label={`Drag pane ${paneIndex + 1} to swap`}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                setPanePointerDragSource(paneIndex);
                setPaneDragPointer({ x: event.clientX, y: event.clientY });
              }}
            >
              ↕
            </button>
            <div className="split-pane-label-meta">
              <span className="split-pane-index-pill">{`Pane ${paneIndex + 1}`}</span>
              <span className="split-pane-label-title">{paneIdentity}</span>
            </div>
          </div>
          {paneSessionId ? (
            <TerminalPane sessionId={paneSessionId} onUserInput={handleTerminalInput} />
          ) : (
            <div className="empty-pane split-empty-pane">
              <p>Empty pane.</p>
              <span>{getEmptyPaneDropHint()}</span>
              {draggingKind === "session" && (
                <span className={`split-empty-pane-mode-hint ${sessionDropMode === "move" ? "is-move" : "is-spawn"}`}>
                  <strong>Mode:</strong> {getSessionModifierModeText()}
                </span>
              )}
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
    <div key={key} className="host-row">
      <button
        className={`host-favorite-btn host-favorite-btn-inline ${row.metadata.favorite ? "is-active" : ""}`}
        aria-label={`Toggle favorite for ${row.host.host}`}
        onClick={(event) => {
          event.stopPropagation();
          void toggleFavoriteForHost(row.host.host);
        }}
      >
        ★
      </button>
      <button
        className={`host-item ${row.connected ? "is-connected" : "is-disconnected"} ${
          activeHost === row.host.host ? "is-active" : ""
        }`}
        onMouseEnter={() => setHoveredHostAlias(row.host.host)}
        onMouseLeave={() => setHoveredHostAlias((prev) => (prev === row.host.host ? null : prev))}
        onClick={() => selectHost(row.host.host)}
        onDoubleClick={() => {
          void connectToHostInNewPane(row.host);
        }}
        draggable
        onDragStart={(event) => {
          // #region agent log
          fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
            body: JSON.stringify({
              sessionId: "be74dc",
              runId: "right-drag-check",
              hypothesisId: "H12",
              location: "App.tsx:host.onDragStart",
              message: "host dragstart pointer button info",
              data: {
                button: event.nativeEvent.button,
                buttons: event.nativeEvent.buttons,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          setDragPayload(event, { type: "machine", hostAlias: row.host.host });
          setDraggingKind("machine");
          missingDragPayloadLoggedRef.current = false;
        }}
        onContextMenu={(event) => {
          // #region agent log
          fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
            body: JSON.stringify({
              sessionId: "be74dc",
              runId: "right-drag-check",
              hypothesisId: "H13",
              location: "App.tsx:host.onContextMenu",
              message: "host context menu triggered",
              data: { button: event.button, buttons: event.buttons },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        }}
        onDragEnd={(event) => {
          // #region agent log
          fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "be74dc" },
            body: JSON.stringify({
              sessionId: "be74dc",
              runId: "dnd-drop-entry",
              hypothesisId: "H10",
              location: "App.tsx:hostDragEnd",
              message: "host drag ended",
              data: { dropEffect: event.dataTransfer.dropEffect, dragOverPaneIndex },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          setDraggingKind(null);
          setDragOverPaneIndex(null);
          missingDragPayloadLoggedRef.current = false;
        }}
      >
        <span className="host-item-main">{row.host.host}</span>
        <span className="host-user-badge">{row.displayUser}</span>
      </button>
      <div className="host-row-actions">
        <button
          className={`host-gear-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`}
          aria-label={`Open host settings for ${row.host.host}`}
          title={`Open host settings for ${row.host.host}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleHostMenu(row.host);
          }}
        >
          ⋯
        </button>
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
  } as CSSProperties;

  return (
    <main
      className={`app-shell ${isSidebarResizing ? "is-resizing" : ""} ${
        isSidebarOpen ? "is-sidebar-open" : "is-sidebar-hidden"
      } ${isSidebarPinned ? "is-sidebar-pinned" : "is-sidebar-unpinned"}`}
      style={appShellStyle}
    >
      <button
        type="button"
        className={`left-rail-edge-handle ${isSidebarPinned ? "is-hidden" : ""}`}
        aria-label={isSidebarVisible ? "Hide host sidebar" : "Show host sidebar"}
        title={isSidebarVisible ? "Hide host sidebar" : "Show host sidebar"}
        onMouseEnter={revealSidebar}
        onClick={() => setIsSidebarVisible((prev) => !prev)}
      >
        {isSidebarVisible ? "‹" : "›"}
      </button>
      <aside
        className={`left-rail panel ${isSidebarOpen ? "is-visible" : "is-hidden"} ${
          isSidebarPinned ? "is-pinned" : "is-unpinned"
        }`}
        onMouseEnter={revealSidebar}
        onMouseLeave={maybeHideSidebar}
      >
        <header className="brand">
          <div className="brand-logo-card">
            <img src={logoTextTransparent} alt="NoSuckShell logo" className="brand-logo" />
          </div>
        </header>

        <section className="host-actions-card">
          <div className="left-rail-actions">
            <button
              className={`btn sidebar-pin-btn ${isSidebarPinned ? "is-active" : ""}`}
              aria-pressed={isSidebarPinned}
              aria-label={isSidebarPinned ? "Unpin host sidebar" : "Pin host sidebar"}
              title={isSidebarPinned ? "Unpin sidebar (auto-hide)" : "Pin sidebar"}
              onClick={toggleSidebarPinned}
            >
              {isSidebarPinned ? "Pin on" : "Pin off"}
            </button>
            <button
              className="app-gear-btn"
              aria-label="Open app settings"
              onClick={() => setIsAppSettingsOpen((prev) => !prev)}
            >
              ⚙
            </button>
          </div>
        </section>

        <section className="host-filter-card">
          <div className="filter-head-row">
            <div className="quick-add-wrap" ref={quickAddMenuRef}>
              <button
                className="btn host-plus-btn"
                aria-label="Open add menu"
                title="Add host"
                onClick={() => setIsQuickAddMenuOpen((prev) => !prev)}
              >
                +
              </button>
              {isQuickAddMenuOpen && (
                <div className="quick-add-menu" role="menu">
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
        <div className="sessions-workspace">
          <div className="sessions-zone">
            {draggingKind === "machine" && (
              <div className={`session-dnd-mode-hint ${sessionDropMode === "move" ? "is-move" : "is-spawn"}`} role="status" aria-live="polite">
                <span className="session-dnd-mode-key">Host drop mode</span>
                <span className="session-dnd-mode-text">
                  {sessionDropMode === "move" ? "Move existing host session" : "Spawn new session from host"}
                </span>
              </div>
            )}

            <div className="session-pane-canvas">
              <div
                className={`terminal-grid ${splitResizeState ? "is-pane-resizing is-pane-resizing-${splitResizeState.axis}" : ""}`}
              >
                {renderSplitNode(splitTree)}
              </div>
              {panePointerDragSource !== null && paneDragPointer ? (
                <div
                  className={`pane-drag-ghost ${dragOverPaneIndex !== null ? "has-target" : ""}`}
                  style={
                    {
                      "--ghost-x": `${paneDragPointer.x + 14}px`,
                      "--ghost-y": `${paneDragPointer.y + 14}px`,
                    } as CSSProperties
                  }
                >
                  <span className="pane-drag-ghost-title">{dragGhostLabel}</span>
                  <span className="pane-drag-ghost-subtitle">Moving pane</span>
                </div>
              ) : null}
            </div>
            <div className="sessions-footer" role="status">
              <div className="sessions-footer-meta">
                <div className="footer-layout-controls">
                  <button
                    className="btn footer-layout-btn footer-action-btn"
                    onClick={resetPaneLayout}
                    disabled={paneOrder.length === 1 && !hasAssignedPaneSessions}
                    aria-label="Reset pane layout"
                    title="Reset pane layout"
                  >
                    Reset
                  </button>
                  <button
                    className={`btn footer-layout-btn footer-action-btn ${
                      pendingCloseAllIntent === "close" ? "btn-danger-confirm" : "btn-danger"
                    }`}
                    onClick={() => void handleCloseAllIntent(false)}
                    disabled={sessions.length === 0}
                    aria-label={pendingCloseAllIntent === "close" ? "Confirm close all sessions" : "Close all sessions"}
                    title={pendingCloseAllIntent === "close" ? "Confirm close all sessions" : "Close all sessions"}
                  >
                    {pendingCloseAllIntent === "close" ? "Confirm close all" : "Close all"}
                  </button>
                  <button
                    className={`btn footer-layout-btn footer-action-btn ${
                      pendingCloseAllIntent === "reset" ? "btn-danger-confirm" : "btn-danger"
                    }`}
                    onClick={() => void handleCloseAllIntent(true)}
                    disabled={sessions.length === 0}
                    aria-label={
                      pendingCloseAllIntent === "reset"
                        ? "Confirm close all sessions and reset layout"
                        : "Close all sessions and reset layout"
                    }
                    title={
                      pendingCloseAllIntent === "reset"
                        ? "Confirm close all sessions and reset layout"
                        : "Close all sessions and reset layout"
                    }
                  >
                    {pendingCloseAllIntent === "reset" ? "Confirm close+reset" : "Close + reset"}
                  </button>
                  <div className="session-drop-mode-toggle" role="group" aria-label="Host drop mode">
                    <button
                      type="button"
                      className={`btn session-drop-mode-btn ${sessionDropMode === "spawn" ? "is-active" : ""}`}
                      aria-pressed={sessionDropMode === "spawn"}
                      onClick={() => setSessionDropMode("spawn")}
                      title="Host drop opens a new session"
                    >
                      Spawn
                    </button>
                    <button
                      type="button"
                      className={`btn session-drop-mode-btn ${sessionDropMode === "move" ? "is-active" : ""}`}
                      aria-pressed={sessionDropMode === "move"}
                      onClick={() => setSessionDropMode("move")}
                      title="Host drop moves an existing session"
                    >
                      Move
                    </button>
                  </div>
                  <select
                    className="input split-profile-select footer-layout-select"
                    value={selectedLayoutProfileId}
                    onChange={(event) => {
                      setSelectedLayoutProfileId(event.target.value);
                      setPendingLayoutProfileDeleteId("");
                    }}
                    aria-label="Select layout profile"
                  >
                    <option value="">Select profile</option>
                    {layoutProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn footer-layout-btn footer-icon-btn"
                    onClick={() => void loadSelectedLayoutProfile()}
                    disabled={!selectedLayoutProfileId}
                    aria-label="Load selected layout profile"
                    title="Load selected layout profile"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={`btn footer-layout-btn footer-icon-btn footer-layout-toggle ${isFooterLayoutPanelOpen ? "is-open" : ""}`}
                    onClick={toggleFooterLayoutPanel}
                    aria-expanded={isFooterLayoutPanelOpen}
                    aria-controls="footer-layout-advanced-controls"
                    aria-label={isFooterLayoutPanelOpen ? "Collapse layout actions" : "Expand layout actions"}
                    title={isFooterLayoutPanelOpen ? "Collapse layout actions" : "Expand layout actions"}
                  >
                    {isFooterLayoutPanelOpen ? "⌃" : "⌄"}
                  </button>
                </div>
                <div
                  id="footer-layout-advanced-controls"
                  className={`footer-layout-slide ${isFooterLayoutPanelOpen ? "is-open" : ""}`}
                  aria-hidden={!isFooterLayoutPanelOpen}
                >
                  <div className="layout-profile-controls footer-layout-advanced">
                    <input
                      className="input split-profile-name"
                      value={layoutProfileName}
                      onChange={(event) => setLayoutProfileName(event.target.value)}
                      placeholder="Layout profile name"
                    />
                    <button
                      type="button"
                      className={`btn split-profile-toggle-btn ${saveLayoutWithHosts ? "is-active" : ""}`}
                      onClick={() => setSaveLayoutWithHosts((prev) => !prev)}
                      aria-pressed={saveLayoutWithHosts}
                      title={`With hosts ${saveLayoutWithHosts ? "on" : "off"}`}
                    >
                      {saveLayoutWithHosts ? "with hosts: on" : "with hosts: off"}
                    </button>
                    <button
                      className="btn footer-layout-btn footer-action-btn"
                      onClick={() => void saveCurrentLayoutProfile()}
                      aria-label="Save current layout profile"
                      title="Save current layout profile"
                    >
                      Save
                    </button>
                    <button
                      className={`btn btn-danger footer-layout-btn footer-action-btn ${
                        pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                          ? "btn-danger-confirm"
                          : ""
                      }`}
                      onClick={() => void handleDeleteSelectedLayoutProfileIntent()}
                      disabled={!selectedLayoutProfileId}
                      aria-label={
                        pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                          ? "Confirm delete selected layout profile"
                          : "Delete selected layout profile"
                      }
                      title={
                        pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                          ? "Confirm delete selected layout profile"
                          : "Delete selected layout profile"
                      }
                    >
                      {pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                        ? "Confirm"
                        : "Delete"}
                    </button>
                  </div>
                </div>
                {!isFooterLayoutPanelOpen && (
                  <div className="sessions-footer-status">
                    <span className={`context-pill footer-broadcast-pill ${isBroadcastModeEnabled ? "is-active" : ""}`}>
                      Broadcast: {isBroadcastModeEnabled ? "ON" : "OFF"} ({broadcastTargets.size})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      {isAppSettingsOpen && (
        <div className="app-settings-overlay" onClick={() => setIsAppSettingsOpen(false)}>
          <section className="app-settings-modal panel" onClick={(event) => event.stopPropagation()}>
            <header className="panel-header">
              <h2>App settings</h2>
              <button className="btn" onClick={() => setIsAppSettingsOpen(false)}>
                Close
              </button>
            </header>
            <div className="app-settings-tabs">
              {appSettingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-pill ${activeAppSettingsTab === tab.id ? "is-active" : ""}`}
                  onClick={() => setActiveAppSettingsTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="app-settings-content">
              {activeAppSettingsTab === "general" && (
                <div className="host-form-grid">
                  <label className="field field-span-2">
                    <span className="field-label">Default login user</span>
                    <input
                      className="input"
                      value={metadataStore.defaultUser}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                      }}
                      onBlur={(event) => {
                        void applyDefaultUser(event.target.value).catch((e: unknown) => setError(String(e)));
                      }}
                      placeholder="ubuntu"
                    />
                    <span className="field-help">Used when a host does not define a user.</span>
                  </label>
                </div>
              )}
              {activeAppSettingsTab === "backup" && (
                <div className="backup-panel">
                  <label className="field">
                    <span className="field-label">Export path</span>
                    <input
                      className="input"
                      value={backupExportPath}
                      onChange={(event) => setBackupExportPath(event.target.value)}
                      placeholder={DEFAULT_BACKUP_PATH}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Export password</span>
                    <input
                      className="input"
                      type="password"
                      value={backupExportPassword}
                      onChange={(event) => setBackupExportPassword(event.target.value)}
                      placeholder="Enter backup password"
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="btn" onClick={() => void handleExportBackup()} disabled={!backupExportPassword}>
                    Export backup
                  </button>
                  <label className="field">
                    <span className="field-label">Import path</span>
                    <input
                      className="input"
                      value={backupImportPath}
                      onChange={(event) => setBackupImportPath(event.target.value)}
                      placeholder={DEFAULT_BACKUP_PATH}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Import password</span>
                    <input
                      className="input"
                      type="password"
                      value={backupImportPassword}
                      onChange={(event) => setBackupImportPassword(event.target.value)}
                      placeholder="Enter backup password"
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="btn" onClick={() => void handleImportBackup()} disabled={!backupImportPassword}>
                    Import backup
                  </button>
                  <p className="muted-copy">Backups are always encrypted. Passwords are never stored.</p>
                  {backupMessage && <p className="muted-copy">{backupMessage}</p>}
                </div>
              )}
              {activeAppSettingsTab === "extras" && <p className="muted-copy">Extras settings placeholder.</p>}
              {activeAppSettingsTab === "help" && <p className="muted-copy">Help settings placeholder.</p>}
              {activeAppSettingsTab === "about" && (
                <section className="about-hero">
                  <img src={logoTerminal} alt="NoSuckShell hero" className="about-hero-image" />
                  <p className="muted-copy">NoSuckShell helps you manage SSH hosts and sessions in one clean desktop workspace.</p>
                </section>
              )}
            </div>
          </section>
        </div>
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
      {activeTrustPrompt && (
        <div className="app-settings-overlay" onClick={() => dismissTrustPrompt(activeTrustPrompt.sessionId)}>
          <section className="app-settings-modal panel trust-host-modal" onClick={(event) => event.stopPropagation()}>
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
                <button className="btn btn-primary" onClick={() => void acceptTrustPrompt()}>
                  Trust host
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {contextMenu.visible && contextMenu.paneIndex !== null && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu">
          {buildPaneContextActions({
            paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
            canClosePane: paneOrder.length > 1,
            broadcastModeEnabled: isBroadcastModeEnabled,
            broadcastCount: broadcastTargets.size,
          }).map((action) => (
            <button
              key={action.id}
              className={`context-menu-item ${action.separatorAbove ? "separator-above" : ""}`}
              disabled={action.disabled}
              onClick={() => void handleContextAction(action.id, contextMenu.paneIndex ?? 0)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
