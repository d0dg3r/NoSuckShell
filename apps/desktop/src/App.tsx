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

type ViewMode = "single" | "split2x2";
type AppSettingsTab = "general" | "backup" | "extras" | "help" | "about";
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
const SIDEBAR_WIDTH_STORAGE_KEY = "nosuckshell.sidebar.width";
const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";

const clampSidebarWidth = (value: number): number => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const createDefaultMetadataStore = (): HostMetadataStore => ({ defaultUser: "", hosts: {} });
const createDefaultHostMetadata = (): HostMetadata => ({ favorite: false, tags: [], lastUsedAt: null });
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
  const [pendingTrustSessions, setPendingTrustSessions] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [splitSlots, setSplitSlots] = useState<Array<string | null>>(() => createInitialPaneState());
  const [paneLayouts, setPaneLayouts] = useState<PaneLayoutItem[]>(() => createPaneLayoutsFromSlots(createInitialPaneState()));
  const [splitTree, setSplitTree] = useState<SplitTreeNode>(() => createLeafNode(0));
  const [activePaneIndex, setActivePaneIndex] = useState<number>(0);
  const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState<boolean>(false);
  const [broadcastTargets, setBroadcastTargets] = useState<Set<string>>(new Set());
  const [layoutProfiles, setLayoutProfiles] = useState<LayoutProfile[]>([]);
  const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState<string>("");
  const [layoutProfileName, setLayoutProfileName] = useState<string>("");
  const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState<boolean>(false);
  const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState<string>("");
  const [draggingKind, setDraggingKind] = useState<DragPayload["type"] | null>(null);
  const [dragOverPaneIndex, setDragOverPaneIndex] = useState<number | null>(null);
  const [splitResizeState, setSplitResizeState] = useState<SplitResizeState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    const persisted = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(persisted) ? clampSidebarWidth(persisted) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState<boolean>(false);
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
  const quickAddMenuRef = useRef<HTMLDivElement | null>(null);
  const removeConfirmResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState<{ hostAlias: string; scope: "settings" } | null>(null);

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
  const selectedLayoutProfile = useMemo(
    () => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null,
    [layoutProfiles, selectedLayoutProfileId],
  );
  const connectedHosts = useMemo(() => new Set(sessions.map((session) => session.host)), [sessions]);
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
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
      body: JSON.stringify({
        sessionId: "608500",
        runId: "pre-fix-source-check",
        hypothesisId: "H14",
        location: "App.tsx:224",
        message: "app_source_marker",
        data: { source: "App.tsx" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    void listen<SessionOutputEvent>("session-output", (event) => {
      if (!event.payload.host_key_prompt) {
        return;
      }
      setPendingTrustSessions((prev) => {
        const next = new Set(prev);
        next.add(event.payload.session_id);
        return next;
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        void unlisten();
      }
    };
  }, []);

  useEffect(() => {
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
    setPendingTrustSessions((prev) => sanitizeBroadcastTargets(prev, sessionIds));
  }, [sessionIds]);

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
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

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
      setSplitTree((prev) => updateSplitRatioInTree(prev, splitResizeState.splitId, nextRatio));
    };
    const onPointerUp = () => {
      setSplitResizeState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
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
    };
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

  const connectToHost = async (
    host: HostConfig,
    options?: { autoAssignToFirstFreePane?: boolean },
  ): Promise<string | null> => {
    if (!host.host.trim() || !host.hostName.trim()) {
      setError("Host alias and HostName are required.");
      return null;
    }
    setError("");

    try {
      const started = await startSession(host);
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix-dup-v2",
          hypothesisId: "H11",
          location: "App.tsx:541",
          message: "connect_started",
          data: { hostAlias: host.host, startedSessionId: started.session_id, viewMode },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const next = [...sessions, { id: started.session_id, host: host.host }];
      setSessions(next);
      setActiveSession(started.session_id);
      setActiveHost(host.host);
      setCurrentHost(host);
      const shouldAutoAssign = options?.autoAssignToFirstFreePane ?? true;
      setSplitSlots((prev) => {
        if (viewMode !== "split2x2" || !shouldAutoAssign) {
          return prev;
        }
        if (prev.includes(started.session_id)) {
          return prev;
        }
        const firstFree = paneOrder.find((paneIndex) => prev[paneIndex] === null);
        // #region agent log
        fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
          body: JSON.stringify({
            sessionId: "608500",
            runId: "pre-fix-dup-v2",
            hypothesisId: "H11",
            location: "App.tsx:560",
            message: "connect_auto_assign_first_free",
            data: { startedSessionId: started.session_id, firstFreePane: firstFree, paneCountBefore: prev.length },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (typeof firstFree === "number" && firstFree >= 0) {
          return assignSessionToPane(prev, firstFree, started.session_id);
        }
        return assignSessionToPane(prev, activePaneIndex, started.session_id);
      });
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

  const ensureSessionForHost = async (
    hostAlias: string,
    options?: { autoAssignToFirstFreePane?: boolean },
  ): Promise<string | null> => {
    const existingSession = sessions.find((session) => session.host === hostAlias);
    if (existingSession) {
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix-dup-v2",
          hypothesisId: "H13",
          location: "App.tsx:590",
          message: "ensure_existing_session",
          data: { hostAlias, existingSessionId: existingSession.id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setActiveSession(existingSession.id);
      return existingSession.id;
    }
    const host = hosts.find((entry) => entry.host === hostAlias);
    if (!host) {
      setError(`Host '${hostAlias}' not found.`);
      return null;
    }
    return connectToHost(host, options);
  };

  const setDragPayload = (event: ReactDragEvent, payload: DragPayload) => {
    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DND_PAYLOAD_MIME, serialized);
    event.dataTransfer.setData("text/plain", serialized);
  };

  const parseDragPayload = (event: ReactDragEvent): DragPayload | null => {
    const encoded = event.dataTransfer.getData(DND_PAYLOAD_MIME) || event.dataTransfer.getData("text/plain");
    if (!encoded) {
      return null;
    }
    try {
      const parsed = JSON.parse(encoded) as Partial<DragPayload>;
      if (parsed.type === "session" && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0) {
        return { type: "session", sessionId: parsed.sessionId };
      }
      if (parsed.type === "machine" && typeof parsed.hostAlias === "string" && parsed.hostAlias.length > 0) {
        return { type: "machine", hostAlias: parsed.hostAlias };
      }
      if (parsed.type === "pane" && typeof parsed.paneIndex === "number" && Number.isInteger(parsed.paneIndex)) {
        return { type: "pane", paneIndex: parsed.paneIndex };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handlePaneDrop = async (event: ReactDragEvent<HTMLDivElement>, paneIndex: number) => {
    event.preventDefault();
    setDragOverPaneIndex(null);
    const payload = parseDragPayload(event);
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
      body: JSON.stringify({
        sessionId: "608500",
        runId: "pre-fix-dup-v2",
        hypothesisId: "H12",
        location: "App.tsx:628",
        message: "pane_drop_received",
        data: { paneIndex, payloadType: payload?.type ?? null },
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
      setSplitTree((prev) => swapPaneIndicesInTree(prev, payload.paneIndex, paneIndex));
      setActivePaneIndex((prev) => {
        if (prev === payload.paneIndex) {
          return paneIndex;
        }
        if (prev === paneIndex) {
          return payload.paneIndex;
        }
        return prev;
      });
      return;
    }
    if (payload.type === "session") {
      setActivePaneIndex(paneIndex);
      setActiveSession(payload.sessionId);
      setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, payload.sessionId));
      return;
    }
    const sessionId = await ensureSessionForHost(payload.hostAlias, { autoAssignToFirstFreePane: false });
    if (!sessionId) {
      return;
    }
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
      body: JSON.stringify({
        sessionId: "608500",
        runId: "pre-fix-dup-v2",
        hypothesisId: "H11",
        location: "App.tsx:651",
        message: "pane_drop_assign_target",
        data: { paneIndex, assignedSessionId: sessionId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setActivePaneIndex(paneIndex);
    setActiveSession(sessionId);
    setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, sessionId));
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
    setPendingTrustSessions((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(sessionId);
      return nextSet;
    });
  };

  const placeActiveSessionInPane = () => {
    if (!activeSession || viewMode !== "split2x2") {
      return;
    }
    setSplitSlots((prev) => assignSessionToPane(prev, activePaneIndex, activeSession));
  };

  const clearFocusedPane = () => {
    if (viewMode !== "split2x2") {
      return;
    }
    setSplitSlots((prev) => clearPaneAtIndex(prev, activePaneIndex));
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
    const paneSessionId = splitSlots[paneIndex] ?? null;
    setActivePaneIndex(paneIndex);
    switch (actionId) {
      case "pane.focus":
        if (paneSessionId) {
          setActiveSession(paneSessionId);
        }
        break;
      case "pane.assignActiveSession":
        if (activeSession) {
          setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, activeSession));
        }
        break;
      case "pane.clear":
        setSplitSlots((prev) => clearPaneAtIndex(prev, paneIndex));
        break;
      case "pane.closeSession":
        if (paneSessionId) {
          await closeSessionById(paneSessionId);
        }
        break;
      case "layout.single.enable":
        setViewMode("single");
        break;
      case "layout.split2x2.enable":
        setViewMode("split2x2");
        break;
      case "layout.reset":
        setSplitSlots(createInitialPaneState());
        setPaneLayouts(createPaneLayoutsFromSlots(createInitialPaneState()));
        setSplitTree(createLeafNode(0));
        setActivePaneIndex(0);
        nextPaneIndexRef.current = 1;
        nextSplitIdRef.current = 1;
        break;
      case "broadcast.off":
        setBroadcastMode(false);
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
      case "session.close":
        if (activeSession) {
          await closeSessionById(activeSession);
        }
        break;
      case "session.trustHost":
        await trustHost();
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

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
      body: JSON.stringify({
        sessionId: "608500",
        runId: "pre-fix-resize",
        hypothesisId: "H15",
        location: "App.tsx:858",
        message: "terminal_input_callback_changed",
        data: {
          sessionCount: sessionIds.length,
          broadcastEnabled: isBroadcastModeEnabled,
          broadcastTargetCount: broadcastTargets.size,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [broadcastTargets.size, handleTerminalInput, isBroadcastModeEnabled, sessionIds.length]);

  const trustHost = async () => {
    if (!activeSession) {
      return;
    }
    if (!pendingTrustSessions.has(activeSession)) {
      return;
    }
    await sendInput(activeSession, "yes\n");
    setPendingTrustSessions((prev) => {
      const next = new Set(prev);
      next.delete(activeSession);
      return next;
    });
  };

  const closeActiveSession = async () => {
    if (!activeSession) {
      return;
    }
    await closeSessionById(activeSession);
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    sidebarDragStartXRef.current = event.clientX;
    sidebarDragStartWidthRef.current = sidebarWidth;
    setIsSidebarResizing(true);
  };

  const splitFocusedPane = (direction: "left" | "bottom") => {
    const targetPane = paneOrder.includes(activePaneIndex) ? activePaneIndex : (paneOrder[0] ?? 0);
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
    setViewMode("split2x2");
    const parsedTree = parseSplitTree(selectedLayoutProfile.splitTree);
    const profilePaneOrder = parsedTree ? collectPaneOrder(parsedTree) : selectedLayoutProfile.panes.map((_, index) => index);
    const mappedSlots: Array<string | null> = [];
    const mappedLayouts: PaneLayoutItem[] = [];
    for (let index = 0; index < selectedLayoutProfile.panes.length; index += 1) {
      const pane = selectedLayoutProfile.panes[index];
      const paneIndex = profilePaneOrder[index] ?? index;
      let sessionId: string | null = null;
      if (selectedLayoutProfile.withHosts && pane.hostAlias) {
        const existingSession = sessions.find((session) => session.host === pane.hostAlias);
        if (existingSession) {
          sessionId = existingSession.id;
        } else if (hosts.some((host) => host.host === pane.hostAlias)) {
          sessionId = await ensureSessionForHost(pane.hostAlias, { autoAssignToFirstFreePane: false });
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
  };

  const renderSplitNode = (node: SplitTreeNode) => {
    if (node.type === "leaf") {
      const paneIndex = node.paneIndex;
      const paneSessionId = splitSlots[paneIndex] ?? null;
      return (
        <div
          key={`pane-${paneIndex}`}
          className={`split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${
            dragOverPaneIndex === paneIndex ? "is-drag-over" : ""
          }`}
          draggable={viewMode === "split2x2"}
          onClick={() => {
            setActivePaneIndex(paneIndex);
            if (paneSessionId) {
              setActiveSession(paneSessionId);
            }
          }}
          onDragStart={(event) => {
            setDragPayload(event, { type: "pane", paneIndex });
            setDraggingKind("pane");
          }}
          onDragEnd={() => {
            setDraggingKind(null);
            setDragOverPaneIndex(null);
          }}
          onDragOver={(event) => {
            if (viewMode !== "split2x2") {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={(event) => {
            if (viewMode !== "split2x2") {
              return;
            }
            event.preventDefault();
            setDragOverPaneIndex(paneIndex);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
          }}
          onDrop={(event) => {
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
            Pane {paneIndex + 1}
            {paneSessionId ? ` - ${sessions.find((session) => session.id === paneSessionId)?.host ?? "session"}` : ""}
          </div>
          {paneSessionId ? (
            <TerminalPane sessionId={paneSessionId} onUserInput={handleTerminalInput} />
          ) : (
            <div className="empty-pane split-empty-pane">
              <p>Empty pane.</p>
              <span>
                {draggingKind === "pane"
                  ? "Drop pane here to swap."
                  : draggingKind
                    ? "Drop machine or session here."
                    : "Drag a machine or session here."}
              </span>
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

  const appShellStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
  } as CSSProperties;

  return (
    <main className={`app-shell ${isSidebarResizing ? "is-resizing" : ""}`} style={appShellStyle}>
      <aside className="left-rail panel">
        <header className="brand">
          <div className="brand-logo-card">
            <img src={logoTextTransparent} alt="NoSuckShell logo" className="brand-logo" />
          </div>
        </header>

        <section className="host-actions-card">
          <div className="left-rail-actions">
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
          {filteredHostRows.map((row, index) => (
            <div key={`${row.host.host}-${row.host.hostName}-${row.host.port}-${index}`} className="host-row">
              <button
                className={`host-item ${activeHost === row.host.host ? "is-active" : ""}`}
                onClick={() => selectHost(row.host.host)}
                draggable={viewMode === "split2x2"}
                onDragStart={(event) => {
                  const existingSession = sessions.find((session) => session.host === row.host.host);
                  if (existingSession) {
                    setDragPayload(event, { type: "session", sessionId: existingSession.id });
                    setDraggingKind("session");
                    return;
                  }
                  setDragPayload(event, { type: "machine", hostAlias: row.host.host });
                  setDraggingKind("machine");
                }}
                onDragEnd={() => {
                  setDraggingKind(null);
                  setDragOverPaneIndex(null);
                }}
              >
                <span className="host-item-dot" />
                <span className="host-item-main">{row.host.host}</span>
                <span className="host-user-badge">user: {row.displayUser}</span>
                {row.connected && <span className="host-status-badge">connected</span>}
              </button>
              <div className="host-row-actions">
                <button
                  className={`host-favorite-btn ${row.metadata.favorite ? "is-active" : ""}`}
                  aria-label={`Toggle favorite for ${row.host.host}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleFavoriteForHost(row.host.host);
                  }}
                >
                  ★
                </button>
                <button
                  className="host-connect-btn"
                  aria-label={`Connect to ${row.host.host}`}
                  title={`Connect to ${row.host.host}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void connectToHost(row.host);
                  }}
                >
                  ↗
                </button>
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
                        {pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                          ? "!"
                          : "×"}
                      </button>
                    </div>
                    {error && <p className="error-text">{error}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredHostRows.length === 0 && (
            <div className="empty-pane">
              <p>No hosts match the active filters.</p>
              <span>Adjust or reset filters to show hosts.</span>
            </div>
          )}
        </div>
      </aside>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize host sidebar"
        onPointerDown={startSidebarResize}
      />

      <section className="right-dock panel">
        <header className="panel-header">
          <h2>Sessions</h2>
          <div className="action-row compact">
            <button
              className="btn"
              onClick={trustHost}
              disabled={!activeSession || !pendingTrustSessions.has(activeSession)}
            >
              Trust
            </button>
            <button className="btn btn-danger" onClick={closeActiveSession} disabled={!activeSession}>
              Close
            </button>
          </div>
        </header>

        <div className="view-mode-row">
          <button className={`tab-pill ${viewMode === "single" ? "is-active" : ""}`} onClick={() => setViewMode("single")}>
            Single
          </button>
          <button
            className={`tab-pill ${viewMode === "split2x2" ? "is-active" : ""}`}
            onClick={() => setViewMode("split2x2")}
          >
            Panels
          </button>
        </div>

        <div className="session-tabs">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`tab-chip tab-chip-row ${activeSession === session.id ? "is-active" : ""}`}
              draggable={viewMode === "split2x2"}
              onDragStart={(event) => {
                setDragPayload(event, { type: "session", sessionId: session.id });
                setDraggingKind("session");
              }}
              onDragEnd={() => {
                setDraggingKind(null);
                setDragOverPaneIndex(null);
              }}
            >
              <button
                className="tab-chip-main-btn"
                onClick={() => setActiveSession(session.id)}
                title={session.host}
              >
                <span className="tab-chip-main">{session.host}</span>
              </button>
              <button
                type="button"
                className="tab-chip-close"
                aria-label={`Close session ${session.host}`}
                title={`Close session ${session.host}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void closeSessionById(session.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="broadcast-controls panel">
          <div className="broadcast-control-head">
            <button
              className={`btn ${isBroadcastModeEnabled ? "btn-primary" : ""}`}
              onClick={() => setBroadcastMode(!isBroadcastModeEnabled)}
            >
              Broadcast: {isBroadcastModeEnabled ? "ON" : "OFF"}
            </button>
            <button className="btn" onClick={() => setBroadcastTargets(new Set())} disabled={broadcastTargets.size === 0}>
              Clear
            </button>
          </div>
          <div className="broadcast-target-list">
            {sessions.map((session) => (
              <button
                key={`target-${session.id}`}
                className={`target-chip ${broadcastTargets.has(session.id) ? "is-active" : ""}`}
                onClick={() => toggleBroadcastTarget(session.id)}
                disabled={!isBroadcastModeEnabled}
              >
                {session.host}
              </button>
            ))}
          </div>
        </div>

        <div className="broadcast-indicator" role="status">
          {isBroadcastModeEnabled
            ? `Broadcast ON: ${broadcastTargets.size} target${broadcastTargets.size === 1 ? "" : "s"}`
            : "Broadcast OFF"}
        </div>

        {viewMode === "split2x2" && (
          <div className="split-actions">
            <button className="btn" onClick={placeActiveSessionInPane} disabled={!activeSession}>
              Send active to pane
            </button>
            <button className="btn" onClick={clearFocusedPane}>
              Clear pane
            </button>
            <button className="btn" onClick={() => splitFocusedPane("left")}>
              Split left
            </button>
            <button className="btn" onClick={() => splitFocusedPane("bottom")}>
              Split bottom
            </button>
            <input
              className="input split-profile-name"
              value={layoutProfileName}
              onChange={(event) => setLayoutProfileName(event.target.value)}
              placeholder="Layout profile name"
            />
            <label className="split-profile-toggle">
              <input
                type="checkbox"
                checked={saveLayoutWithHosts}
                onChange={(event) => setSaveLayoutWithHosts(event.target.checked)}
              />
              <span>with hosts</span>
            </label>
            <button className="btn" onClick={() => void saveCurrentLayoutProfile()}>
              Save layout
            </button>
            <select
              className="input split-profile-select"
              value={selectedLayoutProfileId}
              onChange={(event) => setSelectedLayoutProfileId(event.target.value)}
            >
              <option value="">Select profile</option>
              {layoutProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => void loadSelectedLayoutProfile()} disabled={!selectedLayoutProfileId}>
              Load
            </button>
            <button className="btn btn-danger" onClick={() => void deleteSelectedLayoutProfile()} disabled={!selectedLayoutProfileId}>
              Delete
            </button>
          </div>
        )}

        {viewMode === "single" ? (
          activeSession ? (
            <TerminalPane sessionId={activeSession} onUserInput={handleTerminalInput} />
          ) : (
            <div className="empty-pane">
              <p>No active session.</p>
              <span>Connect a host to start.</span>
            </div>
          )
        ) : (
          <div className={`terminal-grid ${splitResizeState ? "is-pane-resizing" : ""}`}>{renderSplitNode(splitTree)}
          </div>
        )}
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
      {contextMenu.visible && contextMenu.paneIndex !== null && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu">
          {buildPaneContextActions({
            paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
            activeSession,
            viewMode,
            broadcastModeEnabled: isBroadcastModeEnabled,
            broadcastCount: broadcastTargets.size,
            pendingTrustForActive: activeSession.length > 0 && pendingTrustSessions.has(activeSession),
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
