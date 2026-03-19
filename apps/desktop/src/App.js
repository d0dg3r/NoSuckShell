import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { listen } from "@tauri-apps/api/event";
import { closeSession, deleteHost, deleteLayoutProfile, exportBackup, importBackup, listLayoutProfiles, listHostMetadata, listHosts, saveHost, saveHostMetadata, saveLayoutProfile, sendInput, startSession, touchHostLastUsed, } from "./tauri-api";
import { HostForm } from "./components/HostForm";
import { TerminalPane } from "./components/TerminalPane";
import { buildPaneContextActions } from "./features/context-actions";
import { assignSessionToPane, clearPaneAtIndex, createPaneLayoutItem, createPaneLayoutsFromSlots, createInitialPaneState, MIN_PANE_HEIGHT, MIN_PANE_WIDTH, reconcilePaneLayouts, removeSessionFromSlots, resolveInputTargets, sanitizeBroadcastTargets, } from "./features/split";
import logoTextTransparent from "../../../img/logo_text_transparent.png";
import logoTerminal from "../../../img/logo_terminal.png";
const emptyHost = () => ({
    host: "",
    hostName: "",
    user: "",
    port: 22,
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
});
const DND_PAYLOAD_MIME = "application/x-nosuckshell-dnd";
const DEFAULT_SPLIT_RATIO = 0.6;
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;
const appSettingsTabs = [
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
const SESSION_DROP_POLICY = "spawn_new_from_host";
const hasTauriTransformCallback = () => {
    if (typeof window === "undefined") {
        return false;
    }
    const tauriInternals = window
        .__TAURI_INTERNALS__;
    return typeof tauriInternals?.transformCallback === "function";
};
const clampSidebarWidth = (value) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const createDefaultMetadataStore = () => ({ defaultUser: "", hosts: {} });
const createDefaultHostMetadata = () => ({ favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false });
const createLeafNode = (paneIndex) => ({ id: `leaf-${paneIndex}`, type: "leaf", paneIndex });
const collectPaneOrder = (node) => node.type === "leaf" ? [node.paneIndex] : [...collectPaneOrder(node.first), ...collectPaneOrder(node.second)];
const replacePaneInTree = (node, targetPaneIndex, createReplacement) => {
    if (node.type === "leaf") {
        return node.paneIndex === targetPaneIndex ? createReplacement(node) : node;
    }
    return {
        ...node,
        first: replacePaneInTree(node.first, targetPaneIndex, createReplacement),
        second: replacePaneInTree(node.second, targetPaneIndex, createReplacement),
    };
};
const updateSplitRatioInTree = (node, splitId, ratio) => {
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
const swapPaneIndicesInTree = (node, firstPane, secondPane) => {
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
const removePaneFromTree = (node, targetPane) => {
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
const createTreeFromPaneCount = (paneCount) => {
    const count = Math.max(1, paneCount);
    let tree = createLeafNode(0);
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
const serializeSplitTree = (node) => {
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
const parseSplitTree = (raw) => {
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
            ratio: typeof raw.ratio === "number" && Number.isFinite(raw.ratio)
                ? Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, raw.ratio))
                : DEFAULT_SPLIT_RATIO,
            first,
            second,
        };
    }
    return null;
};
export function App() {
    const [hosts, setHosts] = useState([]);
    const [currentHost, setCurrentHost] = useState(emptyHost());
    const [activeHost, setActiveHost] = useState("");
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState("");
    const [metadataStore, setMetadataStore] = useState(() => createDefaultMetadataStore());
    const [error, setError] = useState("");
    const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
    const [activeAppSettingsTab, setActiveAppSettingsTab] = useState("general");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [recentOnly, setRecentOnly] = useState(false);
    const [selectedTagFilter, setSelectedTagFilter] = useState("all");
    const [portFilter, setPortFilter] = useState("");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [isQuickAddMenuOpen, setIsQuickAddMenuOpen] = useState(false);
    const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
    const [newHostDraft, setNewHostDraft] = useState(emptyHost());
    const [tagDraft, setTagDraft] = useState("");
    const [backupExportPath, setBackupExportPath] = useState(DEFAULT_BACKUP_PATH);
    const [backupImportPath, setBackupImportPath] = useState(DEFAULT_BACKUP_PATH);
    const [backupExportPassword, setBackupExportPassword] = useState("");
    const [backupImportPassword, setBackupImportPassword] = useState("");
    const [backupMessage, setBackupMessage] = useState("");
    const [trustPromptQueue, setTrustPromptQueue] = useState([]);
    const [saveTrustHostAsDefault, setSaveTrustHostAsDefault] = useState(true);
    const [splitSlots, setSplitSlots] = useState(() => createInitialPaneState());
    const [paneLayouts, setPaneLayouts] = useState(() => createPaneLayoutsFromSlots(createInitialPaneState()));
    const [splitTree, setSplitTree] = useState(() => createLeafNode(0));
    const [activePaneIndex, setActivePaneIndex] = useState(0);
    const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState(false);
    const [broadcastTargets, setBroadcastTargets] = useState(new Set());
    const [layoutProfiles, setLayoutProfiles] = useState([]);
    const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState("");
    const [pendingLayoutProfileDeleteId, setPendingLayoutProfileDeleteId] = useState("");
    const [layoutProfileName, setLayoutProfileName] = useState("");
    const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState(false);
    const [isFooterLayoutPanelOpen, setIsFooterLayoutPanelOpen] = useState(false);
    const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState("");
    const [draggingKind, setDraggingKind] = useState(null);
    const [sessionDropMode, setSessionDropMode] = useState("spawn");
    const [dragOverPaneIndex, setDragOverPaneIndex] = useState(null);
    const [panePointerDragSource, setPanePointerDragSource] = useState(null);
    const [paneDragPointer, setPaneDragPointer] = useState(null);
    const [swapPulsePaneIndices, setSwapPulsePaneIndices] = useState([]);
    const [splitResizeState, setSplitResizeState] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window === "undefined") {
            return SIDEBAR_DEFAULT_WIDTH;
        }
        const persisted = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
        return Number.isFinite(persisted) ? clampSidebarWidth(persisted) : SIDEBAR_DEFAULT_WIDTH;
    });
    const [isSidebarResizing, setIsSidebarResizing] = useState(false);
    const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
        if (typeof window === "undefined") {
            return true;
        }
        const persisted = window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY);
        return persisted !== "false";
    });
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [hoveredHostAlias, setHoveredHostAlias] = useState(null);
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        paneIndex: null,
    });
    const sidebarDragStartXRef = useRef(0);
    const sidebarDragStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
    const splitNodeRefs = useRef({});
    const nextSplitIdRef = useRef(1);
    const nextPaneIndexRef = useRef(1);
    const splitResizeLatestRatioRef = useRef(null);
    const splitResizeRafRef = useRef(null);
    const missingDragPayloadLoggedRef = useRef(false);
    const quickAddMenuRef = useRef(null);
    const removeConfirmResetTimerRef = useRef(null);
    const closeAllConfirmResetTimerRef = useRef(null);
    const hideSidebarTimeoutRef = useRef(null);
    const pendingProfileLoadSessionIdsRef = useRef(null);
    const sessionsRef = useRef([]);
    const metadataStoreRef = useRef(createDefaultMetadataStore());
    const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState(null);
    const [pendingCloseAllIntent, setPendingCloseAllIntent] = useState(null);
    const canSave = useMemo(() => currentHost.host.trim().length > 0 && currentHost.hostName.trim().length > 0, [currentHost]);
    const canCreateHost = useMemo(() => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0, [newHostDraft]);
    const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
    const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
    const hasAssignedPaneSessions = useMemo(() => splitSlots.some((slot) => Boolean(slot)), [splitSlots]);
    const activeTrustPrompt = useMemo(() => trustPromptQueue[0] ?? null, [trustPromptQueue]);
    const selectedLayoutProfile = useMemo(() => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null, [layoutProfiles, selectedLayoutProfileId]);
    const connectedHosts = useMemo(() => new Set(sessions.map((session) => session.host)), [sessions]);
    const isSidebarOpen = isSidebarVisible;
    const activeHostMetadata = useMemo(() => {
        if (!activeHost) {
            return createDefaultHostMetadata();
        }
        return metadataStore.hosts[activeHost] ?? createDefaultHostMetadata();
    }, [activeHost, metadataStore.hosts]);
    const availableTags = useMemo(() => {
        const tagSet = new Set();
        for (const metadata of Object.values(metadataStore.hosts)) {
            for (const tag of metadata.tags) {
                if (tag.trim().length > 0) {
                    tagSet.add(tag.trim());
                }
            }
        }
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    }, [metadataStore.hosts]);
    const hostRows = useMemo(() => {
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
    const connectedHostRows = useMemo(() => filteredHostRows.filter((row) => row.connected).sort((a, b) => a.host.host.localeCompare(b.host.host)), [filteredHostRows]);
    const otherHostRows = useMemo(() => filteredHostRows.filter((row) => !row.connected), [filteredHostRows]);
    const hoveredHostPaneIndices = useMemo(() => {
        if (!hoveredHostAlias) {
            return new Set();
        }
        const hoveredSessions = new Set(sessions.filter((session) => session.host === hoveredHostAlias).map((session) => session.id));
        const paneIndices = new Set();
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
    const resolvePaneIdentity = useCallback((paneIndex) => {
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
    }, [hosts, metadataStore.defaultUser, sessions, splitSlots]);
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
        void load().catch((e) => setError(String(e)));
    }, []);
    useEffect(() => {
        if (!hasTauriTransformCallback()) {
            return;
        }
        let unlisten = null;
        void listen("session-output", (event) => {
            if (!event.payload.host_key_prompt) {
                return;
            }
            const sessionId = event.payload.session_id;
            const hostAlias = sessionsRef.current.find((session) => session.id === sessionId)?.host ?? "";
            if (hostAlias) {
                const metadata = metadataStoreRef.current.hosts[hostAlias] ?? null;
                if (metadata?.trustHostDefault) {
                    void sendInput(sessionId, "yes\n").catch((sendError) => setError(String(sendError)));
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
        const onPointerMove = (event) => {
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
        const onPointerMove = (event) => {
            const container = splitNodeRefs.current[splitResizeState.splitId];
            if (!container) {
                return;
            }
            const bounds = container.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) {
                return;
            }
            const nextRatio = splitResizeState.axis === "horizontal"
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
        const clearPointerDragSource = (event) => {
            if (panePointerDragSource === null) {
                return;
            }
            const target = event.target;
            const dropPaneElement = target?.closest("[data-pane-index]");
            const dropPaneIndexRaw = dropPaneElement?.dataset?.paneIndex;
            const dropPaneIndex = typeof dropPaneIndexRaw === "string" && dropPaneIndexRaw.length > 0 ? Number(dropPaneIndexRaw) : null;
            if (dropPaneIndex !== null &&
                Number.isInteger(dropPaneIndex) &&
                dropPaneIndex >= 0 &&
                dropPaneIndex !== panePointerDragSource) {
                swapPaneIndices(panePointerDragSource, dropPaneIndex, "pointer-fallback");
            }
            setPanePointerDragSource(null);
            setPaneDragPointer(null);
            setDragOverPaneIndex(null);
        };
        const updatePointerDragPosition = (event) => {
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
        const onPointerDown = (event) => {
            const target = event.target;
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
    const selectHost = (hostAlias) => {
        const found = hosts.find((item) => item.host === hostAlias);
        if (!found) {
            return;
        }
        setActiveHost(found.host);
        setCurrentHost(found);
        setOpenHostMenuHostAlias("");
        setTagDraft((metadataStore.hosts[found.host]?.tags ?? []).join(", "));
    };
    const toggleHostMenu = (host) => {
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
    const armPendingRemoveConfirm = useCallback((hostAlias, scope) => {
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
    const armPendingCloseAllIntent = useCallback((intent) => {
        if (closeAllConfirmResetTimerRef.current) {
            clearTimeout(closeAllConfirmResetTimerRef.current);
        }
        setPendingCloseAllIntent(intent);
        closeAllConfirmResetTimerRef.current = setTimeout(() => {
            setPendingCloseAllIntent(null);
            closeAllConfirmResetTimerRef.current = null;
        }, 2600);
    }, []);
    const persistMetadataStore = async (next) => {
        setMetadataStore(next);
        await saveHostMetadata(next);
    };
    const upsertHostMetadata = async (hostAlias, updater) => {
        const current = metadataStore.hosts[hostAlias] ?? createDefaultHostMetadata();
        const nextMetadata = updater(current);
        const nextStore = {
            ...metadataStore,
            hosts: {
                ...metadataStore.hosts,
                [hostAlias]: nextMetadata,
            },
        };
        await persistMetadataStore(nextStore);
    };
    const applyDefaultUser = async (value) => {
        const nextStore = {
            ...metadataStore,
            defaultUser: value.trim(),
        };
        await persistMetadataStore(nextStore);
    };
    const saveTagsForHost = async (hostAlias) => {
        if (!hostAlias.trim()) {
            return;
        }
        const normalizedTags = Array.from(new Set(tagDraft
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)));
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
    const toggleFavoriteForHost = async (hostAlias) => {
        try {
            await upsertHostMetadata(hostAlias, (current) => ({
                ...current,
                favorite: !current.favorite,
            }));
        }
        catch (e) {
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
        }
        catch (e) {
            setBackupMessage(`Export failed: ${String(e)}`);
        }
        finally {
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
        }
        catch (e) {
            setBackupMessage(`Import failed: ${String(e)}`);
        }
        finally {
            setBackupImportPassword("");
        }
    };
    const onSave = async () => {
        setError("");
        try {
            const normalizedAlias = currentHost.host.trim();
            await Promise.all([saveHost(currentHost), saveTagsForHost(normalizedAlias)]);
            await load();
        }
        catch (e) {
            setError(String(e));
        }
    };
    const onDelete = async (hostAlias) => {
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
        }
        catch (e) {
            setError(String(e));
        }
    };
    const handleRemoveHostIntent = (hostAlias, scope) => {
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
        }
        catch (e) {
            setError(String(e));
        }
    };
    const connectToHost = async (host) => {
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
            }).catch(() => { });
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
            void touchHostLastUsed(host.host).catch((touchError) => setError(String(touchError)));
            return started.session_id;
        }
        catch (e) {
            setError(String(e));
            return null;
        }
    };
    const connectToHostInNewPane = async (host) => {
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
        }).catch(() => { });
        // #endregion
    };
    const ensureSessionForHost = async (hostAlias) => {
        const host = hosts.find((entry) => entry.host === hostAlias);
        if (!host) {
            setError(`Host '${hostAlias}' not found.`);
            return null;
        }
        return connectToHost(host);
    };
    const spawnSessionFromHostAlias = async (hostAlias) => {
        const host = hosts.find((entry) => entry.host === hostAlias);
        if (!host) {
            setError(`Host '${hostAlias}' not found.`);
            return null;
        }
        return connectToHost(host);
    };
    const setDragPayload = (event, payload) => {
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
        }).catch(() => { });
        // #endregion
    };
    const parseDragPayload = (event) => {
        const encoded = event.dataTransfer.getData(DND_PAYLOAD_MIME) || event.dataTransfer.getData("text/plain");
        if (!encoded) {
            return null;
        }
        try {
            const parsed = JSON.parse(encoded);
            const result = parsed.type === "session" && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0
                ? { type: "session", sessionId: parsed.sessionId }
                : parsed.type === "machine" && typeof parsed.hostAlias === "string" && parsed.hostAlias.length > 0
                    ? { type: "machine", hostAlias: parsed.hostAlias }
                    : parsed.type === "pane" && typeof parsed.paneIndex === "number" && Number.isInteger(parsed.paneIndex)
                        ? { type: "pane", paneIndex: parsed.paneIndex }
                        : null;
            return result;
        }
        catch {
            return null;
        }
    };
    const resolveSplitDirectionFromDrop = (clientX, clientY, bounds) => {
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
    const handlePaneDrop = async (event, paneIndex) => {
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
        }).catch(() => { });
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
        const placeSessionOnPane = (sessionId) => {
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
            }).catch(() => { });
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
                    }).catch(() => { });
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
    const resolveDropEffect = (event) => {
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
                            fallbackDropEffect: draggingKind === "pane"
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
                }).catch(() => { });
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
    const getEmptyPaneDropHint = () => {
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
    const getSessionModifierModeText = () => sessionDropMode === "move" ? "Move existing session" : "Open new session from host";
    const swapPaneIndices = (fromPaneIndex, toPaneIndex, _source) => {
        if (fromPaneIndex === toPaneIndex) {
            return;
        }
        setSplitTree((prev) => swapPaneIndicesInTree(prev, fromPaneIndex, toPaneIndex));
        setActivePaneIndex(toPaneIndex);
        setSwapPulsePaneIndices([fromPaneIndex, toPaneIndex]);
    };
    const toggleBroadcastTarget = (sessionId) => {
        if (!isBroadcastModeEnabled) {
            return;
        }
        setBroadcastTargets((prev) => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                next.delete(sessionId);
            }
            else {
                next.add(sessionId);
            }
            return next;
        });
    };
    const requestTerminalFocus = useCallback((sessionId) => {
        window.dispatchEvent(new CustomEvent("nosuckshell:terminal-focus-request", { detail: { sessionId } }));
    }, []);
    const closeSessionById = async (sessionId) => {
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
    const closeAllSessions = async (withLayoutReset) => {
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
    const handleCloseAllIntent = async (withLayoutReset) => {
        const intent = withLayoutReset ? "reset" : "close";
        if (pendingCloseAllIntent !== intent) {
            armPendingCloseAllIntent(intent);
            return;
        }
        clearPendingCloseAllIntent();
        await closeAllSessions(withLayoutReset);
    };
    const dismissTrustPrompt = (sessionId) => {
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
        }
        catch (e) {
            setError(String(e));
        }
    };
    const closePaneAndSession = async (paneIndex) => {
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
        const resetSlots = [null];
        setSplitSlots(resetSlots);
        setPaneLayouts(createPaneLayoutsFromSlots(resetSlots));
        setSplitTree(createLeafNode(0));
        setActivePaneIndex(0);
        nextPaneIndexRef.current = 1;
        nextSplitIdRef.current = 1;
    };
    const togglePaneTarget = (paneIndex) => {
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
        const targets = splitSlots.filter((slot) => Boolean(slot));
        setBroadcastTargets(new Set(targets));
    };
    const setBroadcastMode = (enabled) => {
        setIsBroadcastModeEnabled(enabled);
        if (!enabled) {
            setBroadcastTargets(new Set());
        }
    };
    const handleContextAction = async (actionId, paneIndex) => {
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
    const handleTerminalInput = useCallback((originSessionId, data) => {
        const targets = isBroadcastModeEnabled
            ? resolveInputTargets(originSessionId, broadcastTargets, sessionIds)
            : [originSessionId];
        for (const target of targets) {
            void sendInput(target, data);
        }
    }, [broadcastTargets, isBroadcastModeEnabled, sessionIds]);
    const startSidebarResize = (event) => {
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
        hideSidebarTimeoutRef.current = window.setTimeout(() => {
            setIsSidebarVisible(false);
            hideSidebarTimeoutRef.current = null;
        }, SIDEBAR_AUTO_HIDE_DELAY_MS);
    };
    const splitFocusedPane = (direction, paneIndex = activePaneIndex) => {
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
        setSplitTree((prev) => replacePaneInTree(prev, targetPane, (leaf) => {
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
        }));
        setActivePaneIndex(newPaneIndex);
        return newPaneIndex;
    };
    const startSplitResize = (splitId, axis) => (event) => {
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
        const profileId = selectedLayoutProfile?.id ??
            (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `layout-${Date.now()}`);
        const profile = {
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
        const mappedSlots = [];
        const mappedLayouts = [];
        const consumedSessionIds = new Set();
        for (let index = 0; index < selectedLayoutProfile.panes.length; index += 1) {
            const pane = selectedLayoutProfile.panes[index];
            const paneIndex = profilePaneOrder[index] ?? index;
            let sessionId = null;
            if (selectedLayoutProfile.withHosts && pane.hostAlias) {
                const existingSession = sessions.find((session) => session.host === pane.hostAlias && !consumedSessionIds.has(session.id));
                if (existingSession) {
                    sessionId = existingSession.id;
                }
                else if (hosts.some((host) => host.host === pane.hostAlias)) {
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
        const normalizedLayouts = Array.from({ length: maxPaneIndex + 1 }, (_, paneIndex) => mappedLayouts[paneIndex] ?? createPaneLayoutItem());
        pendingProfileLoadSessionIdsRef.current = new Set(normalizedSlots.filter((slot) => Boolean(slot)));
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
    const renderSplitNode = (node) => {
        if (node.type === "leaf") {
            const paneIndex = node.paneIndex;
            const paneSessionId = splitSlots[paneIndex] ?? null;
            const paneIdentity = resolvePaneIdentity(paneIndex);
            const isHoverTarget = hoveredHostPaneIndices.has(paneIndex);
            const isHoverDimmed = hasHoveredHostTargets && !isHoverTarget;
            return (_jsxs("div", { "data-pane-index": paneIndex, className: `split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${dragOverPaneIndex === paneIndex ? "is-drag-over" : ""} ${panePointerDragSource === paneIndex ? "is-being-dragged" : ""} ${swapPulsePaneSet.has(paneIndex) ? "is-swap-pulse" : ""} ${isHoverTarget ? "is-host-hover-target" : ""} ${isHoverDimmed ? "is-host-hover-dimmed" : ""} ${hoveredHostAlias ? "is-host-hovering" : ""}`, draggable: false, onClick: () => {
                    setActivePaneIndex(paneIndex);
                    if (paneSessionId) {
                        setActiveSession(paneSessionId);
                        requestTerminalFocus(paneSessionId);
                    }
                }, onPointerDown: (event) => {
                    const target = event.target;
                    const inPaneLabel = Boolean(target?.closest(".split-pane-label"));
                    if (!inPaneLabel || event.button !== 0) {
                        return;
                    }
                    setPanePointerDragSource(paneIndex);
                    setPaneDragPointer({ x: event.clientX, y: event.clientY });
                }, onPointerEnter: () => {
                    if (panePointerDragSource !== null && panePointerDragSource !== paneIndex) {
                        setDragOverPaneIndex(paneIndex);
                    }
                }, onPointerUp: () => {
                    if (panePointerDragSource === null) {
                        return;
                    }
                    if (panePointerDragSource !== paneIndex) {
                        swapPaneIndices(panePointerDragSource, paneIndex, "pointer-fallback");
                    }
                    setPanePointerDragSource(null);
                    setDragOverPaneIndex(null);
                }, onDragOver: (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = resolveDropEffect(event);
                }, onDragEnter: (event) => {
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
                    }).catch(() => { });
                    // #endregion
                }, onDragLeave: (event) => {
                    if (event.currentTarget.contains(event.relatedTarget)) {
                        return;
                    }
                    setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
                }, onDrop: (event) => {
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
                    }).catch(() => { });
                    // #endregion
                    void handlePaneDrop(event, paneIndex);
                }, onContextMenu: (event) => {
                    event.preventDefault();
                    setContextMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        paneIndex,
                    });
                }, children: [_jsxs("div", { className: "split-pane-label", children: [_jsxs("div", { className: "pane-label-actions", children: [_jsx("button", { className: "btn action-icon-btn pane-label-action-btn", title: "Clear this pane", "aria-label": `Clear pane ${paneIndex + 1}`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("pane.clear", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u232B" }) }), _jsx("button", { className: "btn action-icon-btn action-icon-btn-danger pane-label-action-btn", title: "Close pane and session", "aria-label": `Close pane ${paneIndex + 1} and its session`, disabled: paneOrder.length <= 1, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("pane.close", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u00D7" }) }), _jsx("button", { className: "btn action-icon-btn pane-label-action-btn", title: "Split pane left", "aria-label": `Split pane ${paneIndex + 1} left`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.left", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u2190" }) }), _jsx("button", { className: "btn action-icon-btn pane-label-action-btn", title: "Split pane right", "aria-label": `Split pane ${paneIndex + 1} right`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.right", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u2192" }) }), _jsx("button", { className: "btn action-icon-btn pane-label-action-btn", title: "Split pane top", "aria-label": `Split pane ${paneIndex + 1} top`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.top", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u252C" }) }), _jsx("button", { className: "btn action-icon-btn pane-label-action-btn", title: "Split pane bottom", "aria-label": `Split pane ${paneIndex + 1} bottom`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.bottom", paneIndex);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "\u2534" }) }), _jsx("button", { className: `btn action-icon-btn pane-label-action-btn ${isBroadcastModeEnabled ? "is-broadcast-active" : ""}`, title: `Broadcast ${isBroadcastModeEnabled ? "ON" : "OFF"}`, "aria-label": `Broadcast ${isBroadcastModeEnabled ? "on" : "off"}`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            setBroadcastMode(!isBroadcastModeEnabled);
                                        }, children: _jsx("span", { "aria-hidden": "true", children: "@" }) })] }), _jsx("button", { type: "button", className: `pane-swap-handle ${panePointerDragSource === paneIndex ? "is-active" : ""}`, title: "Drag pane to another pane", "aria-label": `Drag pane ${paneIndex + 1} to swap`, onPointerDown: (event) => {
                                    if (event.button !== 0) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setPanePointerDragSource(paneIndex);
                                    setPaneDragPointer({ x: event.clientX, y: event.clientY });
                                }, children: "\u2195" }), _jsxs("div", { className: "split-pane-label-meta", children: [_jsx("span", { className: "split-pane-index-pill", children: `Pane ${paneIndex + 1}` }), _jsx("span", { className: "split-pane-label-title", children: paneIdentity })] })] }), paneSessionId ? (_jsx(TerminalPane, { sessionId: paneSessionId, onUserInput: handleTerminalInput })) : (_jsxs("div", { className: "empty-pane split-empty-pane", children: [_jsx("p", { children: "Empty pane." }), _jsx("span", { children: getEmptyPaneDropHint() }), draggingKind === "session" && (_jsxs("span", { className: `split-empty-pane-mode-hint ${sessionDropMode === "move" ? "is-move" : "is-spawn"}`, children: [_jsx("strong", { children: "Mode:" }), " ", getSessionModifierModeText()] }))] }))] }, `pane-${paneIndex}`));
        }
        const firstRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, node.ratio));
        const secondRatio = 1 - firstRatio;
        const dividerClass = node.axis === "horizontal" ? "split-node-divider vertical" : "split-node-divider horizontal";
        return (_jsxs("div", { className: `split-node split-node-${node.axis}`, ref: (element) => {
                splitNodeRefs.current[node.id] = element;
            }, children: [_jsx("div", { className: "split-node-child", style: { flexBasis: `${firstRatio * 100}%` }, children: renderSplitNode(node.first) }), _jsx("div", { className: dividerClass, role: "separator", "aria-orientation": node.axis === "horizontal" ? "vertical" : "horizontal", onPointerDown: startSplitResize(node.id, node.axis) }), _jsx("div", { className: "split-node-child", style: { flexBasis: `${secondRatio * 100}%` }, children: renderSplitNode(node.second) })] }, node.id));
    };
    const renderHostRow = (row, key) => (_jsxs("div", { className: "host-row", children: [_jsx("button", { className: `host-favorite-btn host-favorite-btn-inline ${row.metadata.favorite ? "is-active" : ""}`, "aria-label": `Toggle favorite for ${row.host.host}`, onClick: (event) => {
                    event.stopPropagation();
                    void toggleFavoriteForHost(row.host.host);
                }, children: "\u2605" }), _jsxs("button", { className: `host-item ${row.connected ? "is-connected" : "is-disconnected"} ${activeHost === row.host.host ? "is-active" : ""}`, onMouseEnter: () => setHoveredHostAlias(row.host.host), onMouseLeave: () => setHoveredHostAlias((prev) => (prev === row.host.host ? null : prev)), onClick: () => selectHost(row.host.host), onDoubleClick: () => {
                    void connectToHostInNewPane(row.host);
                }, draggable: true, onDragStart: (event) => {
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
                    }).catch(() => { });
                    // #endregion
                    setDragPayload(event, { type: "machine", hostAlias: row.host.host });
                    setDraggingKind("machine");
                    missingDragPayloadLoggedRef.current = false;
                }, onContextMenu: (event) => {
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
                    }).catch(() => { });
                    // #endregion
                }, onDragEnd: (event) => {
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
                    }).catch(() => { });
                    // #endregion
                    setDraggingKind(null);
                    setDragOverPaneIndex(null);
                    missingDragPayloadLoggedRef.current = false;
                }, children: [_jsx("span", { className: "host-item-main", children: row.host.host }), _jsx("span", { className: "host-user-badge", children: row.displayUser })] }), _jsx("div", { className: "host-row-actions", children: _jsx("button", { className: `host-gear-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, "aria-label": `Open host settings for ${row.host.host}`, title: `Open host settings for ${row.host.host}`, onClick: (event) => {
                        event.stopPropagation();
                        toggleHostMenu(row.host);
                    }, children: "\u22EF" }) }), _jsx("div", { className: `host-slide-menu ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, children: openHostMenuHostAlias === row.host.host && (_jsxs("div", { className: "host-slide-content", children: [_jsx(HostForm, { host: currentHost, onChange: setCurrentHost }), _jsxs("div", { className: "host-meta-edit", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Tags (comma separated)" }), _jsx("input", { className: "input", value: tagDraft, onChange: (event) => setTagDraft(event.target.value), placeholder: "prod, home, lab" })] }), _jsxs("label", { className: "field checkbox-field", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: activeHostMetadata.favorite, onChange: () => void toggleFavoriteForHost(activeHost) }), _jsx("span", { className: "field-label", children: "Favorite" })] })] }), _jsxs("div", { className: "action-row host-slide-actions", children: [_jsx("button", { className: "btn icon-btn", "aria-label": "Save tags", title: "Save tags", onClick: () => {
                                        void saveTagsForActiveHost().catch((e) => setError(String(e)));
                                    }, children: "#" }), _jsx("button", { className: "btn btn-primary icon-btn", "aria-label": "Save settings", title: "Save settings", onClick: onSave, disabled: !canSave, children: "\u2713" }), _jsx("button", { className: `btn btn-danger icon-btn ${pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                        ? "btn-danger-confirm"
                                        : ""}`, onClick: () => handleRemoveHostIntent(currentHost.host, "settings"), disabled: !currentHost.host || !hosts.some((host) => host.host === currentHost.host), "aria-label": pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                        ? "Confirm remove host"
                                        : "Remove host", title: pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                        ? "Confirm remove host"
                                        : "Remove host", children: pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings" ? "!" : "×" })] }), error && _jsx("p", { className: "error-text", children: error })] })) })] }, key));
    const appShellStyle = {
        "--sidebar-width": `${sidebarWidth}px`,
        "--sidebar-layout-width": isSidebarOpen ? `${sidebarWidth}px` : "18px",
    };
    return (_jsxs("main", { className: `app-shell ${isSidebarResizing ? "is-resizing" : ""} ${isSidebarOpen ? "is-sidebar-open" : "is-sidebar-hidden"} ${isSidebarPinned ? "is-sidebar-pinned" : "is-sidebar-unpinned"}`, style: appShellStyle, children: [_jsx("button", { type: "button", className: `left-rail-edge-handle ${isSidebarPinned ? "is-hidden" : ""}`, "aria-label": isSidebarVisible ? "Hide host sidebar" : "Show host sidebar", title: isSidebarVisible ? "Hide host sidebar" : "Show host sidebar", onMouseEnter: revealSidebar, onClick: () => setIsSidebarVisible((prev) => !prev), children: isSidebarVisible ? "‹" : "›" }), _jsxs("aside", { className: `left-rail panel ${isSidebarOpen ? "is-visible" : "is-hidden"} ${isSidebarPinned ? "is-pinned" : "is-unpinned"}`, onMouseEnter: revealSidebar, onMouseLeave: maybeHideSidebar, children: [_jsx("header", { className: "brand", children: _jsx("div", { className: "brand-logo-card", children: _jsx("img", { src: logoTextTransparent, alt: "NoSuckShell logo", className: "brand-logo" }) }) }), _jsx("section", { className: "host-actions-card", children: _jsxs("div", { className: "left-rail-actions", children: [_jsx("button", { className: `btn sidebar-pin-btn ${isSidebarPinned ? "is-active" : ""}`, "aria-pressed": isSidebarPinned, "aria-label": isSidebarPinned ? "Unpin host sidebar" : "Pin host sidebar", title: isSidebarPinned ? "Unpin sidebar (auto-hide)" : "Pin sidebar", onClick: toggleSidebarPinned, children: isSidebarPinned ? "Pin on" : "Pin off" }), _jsx("button", { className: "app-gear-btn", "aria-label": "Open app settings", onClick: () => setIsAppSettingsOpen((prev) => !prev), children: "\u2699" })] }) }), _jsxs("section", { className: "host-filter-card", children: [_jsxs("div", { className: "filter-head-row", children: [_jsxs("div", { className: "quick-add-wrap", ref: quickAddMenuRef, children: [_jsx("button", { className: "btn host-plus-btn", "aria-label": "Open add menu", title: "Add host", onClick: () => setIsQuickAddMenuOpen((prev) => !prev), children: "+" }), isQuickAddMenuOpen && (_jsxs("div", { className: "quick-add-menu", role: "menu", children: [_jsx("button", { className: "quick-add-menu-item", onClick: openAddHostModal, children: "Add host" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add group" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add user" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add key" })] }))] }), _jsx("input", { className: "input host-search-input", value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search alias, hostname, user" }), _jsxs("button", { className: `btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`, onClick: () => setShowAdvancedFilters((prev) => !prev), "aria-expanded": showAdvancedFilters, "aria-controls": "advanced-host-filters", children: ["Filters ", showAdvancedFilters ? "−" : "+"] }), _jsx("span", { className: "pill-muted", children: filteredHostRows.length })] }), _jsxs("div", { id: "advanced-host-filters", className: `advanced-filters ${showAdvancedFilters ? "is-open" : ""}`, children: [_jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All status" }), _jsx("option", { value: "connected", children: "Connected" }), _jsx("option", { value: "disconnected", children: "Disconnected" })] }), _jsx("input", { className: "input", type: "number", value: portFilter, onChange: (event) => setPortFilter(event.target.value), placeholder: "Port" })] }), _jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: selectedTagFilter, onChange: (event) => setSelectedTagFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All tags" }), availableTags.map((tag) => (_jsx("option", { value: tag, children: tag }, tag)))] }), _jsx("button", { className: `btn ${favoritesOnly ? "btn-primary" : ""}`, onClick: () => setFavoritesOnly((prev) => !prev), children: "Favorites" })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { className: `btn ${recentOnly ? "btn-primary" : ""}`, onClick: () => setRecentOnly((prev) => !prev), children: "Recent" }), _jsx("button", { className: "btn", onClick: clearFilters, children: "Reset filters" })] })] })] }), _jsx("div", { className: "host-list", children: filteredHostRows.length === 0 ? (_jsxs("div", { className: "empty-pane", children: [_jsx("p", { children: "No hosts match the active filters." }), _jsx("span", { children: "Adjust or reset filters to show hosts." })] })) : (_jsxs(_Fragment, { children: [connectedHostRows.length > 0 && (_jsxs("div", { className: "host-list-top", children: [_jsx("p", { className: "host-list-section-title", children: "Connected" }), connectedHostRows.map((row, index) => renderHostRow(row, `connected-${row.host.host}-${row.host.port}-${index}`))] })), _jsx("div", { className: "host-list-scroll", children: otherHostRows.map((row, index) => renderHostRow(row, `other-${row.host.host}-${row.host.port}-${index}`)) })] })) })] }), _jsx("div", { className: `sidebar-resize-handle ${isSidebarOpen ? "" : "is-hidden"}`, role: "separator", "aria-orientation": "vertical", "aria-label": "Resize host sidebar", onPointerDown: startSidebarResize }), _jsx("section", { className: "right-dock panel", children: _jsx("div", { className: "sessions-workspace", children: _jsxs("div", { className: "sessions-zone", children: [draggingKind === "machine" && (_jsxs("div", { className: `session-dnd-mode-hint ${sessionDropMode === "move" ? "is-move" : "is-spawn"}`, role: "status", "aria-live": "polite", children: [_jsx("span", { className: "session-dnd-mode-key", children: "Host drop mode" }), _jsx("span", { className: "session-dnd-mode-text", children: sessionDropMode === "move" ? "Move existing host session" : "Spawn new session from host" })] })), _jsxs("div", { className: "session-pane-canvas", children: [_jsx("div", { className: `terminal-grid ${splitResizeState ? "is-pane-resizing is-pane-resizing-${splitResizeState.axis}" : ""}`, children: renderSplitNode(splitTree) }), panePointerDragSource !== null && paneDragPointer ? (_jsxs("div", { className: `pane-drag-ghost ${dragOverPaneIndex !== null ? "has-target" : ""}`, style: {
                                            "--ghost-x": `${paneDragPointer.x + 14}px`,
                                            "--ghost-y": `${paneDragPointer.y + 14}px`,
                                        }, children: [_jsx("span", { className: "pane-drag-ghost-title", children: dragGhostLabel }), _jsx("span", { className: "pane-drag-ghost-subtitle", children: "Moving pane" })] })) : null] }), _jsx("div", { className: "sessions-footer", role: "status", children: _jsxs("div", { className: "sessions-footer-meta", children: [_jsxs("div", { className: "footer-layout-controls", children: [_jsx("button", { className: "btn footer-layout-btn footer-action-btn", onClick: resetPaneLayout, disabled: paneOrder.length === 1 && !hasAssignedPaneSessions, "aria-label": "Reset pane layout", title: "Reset pane layout", children: "Reset" }), _jsx("button", { className: `btn footer-layout-btn footer-action-btn ${pendingCloseAllIntent === "close" ? "btn-danger-confirm" : "btn-danger"}`, onClick: () => void handleCloseAllIntent(false), disabled: sessions.length === 0, "aria-label": pendingCloseAllIntent === "close" ? "Confirm close all sessions" : "Close all sessions", title: pendingCloseAllIntent === "close" ? "Confirm close all sessions" : "Close all sessions", children: pendingCloseAllIntent === "close" ? "Confirm close all" : "Close all" }), _jsx("button", { className: `btn footer-layout-btn footer-action-btn ${pendingCloseAllIntent === "reset" ? "btn-danger-confirm" : "btn-danger"}`, onClick: () => void handleCloseAllIntent(true), disabled: sessions.length === 0, "aria-label": pendingCloseAllIntent === "reset"
                                                        ? "Confirm close all sessions and reset layout"
                                                        : "Close all sessions and reset layout", title: pendingCloseAllIntent === "reset"
                                                        ? "Confirm close all sessions and reset layout"
                                                        : "Close all sessions and reset layout", children: pendingCloseAllIntent === "reset" ? "Confirm close+reset" : "Close + reset" }), _jsxs("div", { className: "session-drop-mode-toggle", role: "group", "aria-label": "Host drop mode", children: [_jsx("button", { type: "button", className: `btn session-drop-mode-btn ${sessionDropMode === "spawn" ? "is-active" : ""}`, "aria-pressed": sessionDropMode === "spawn", onClick: () => setSessionDropMode("spawn"), title: "Host drop opens a new session", children: "Spawn" }), _jsx("button", { type: "button", className: `btn session-drop-mode-btn ${sessionDropMode === "move" ? "is-active" : ""}`, "aria-pressed": sessionDropMode === "move", onClick: () => setSessionDropMode("move"), title: "Host drop moves an existing session", children: "Move" })] }), _jsxs("select", { className: "input split-profile-select footer-layout-select", value: selectedLayoutProfileId, onChange: (event) => {
                                                        setSelectedLayoutProfileId(event.target.value);
                                                        setPendingLayoutProfileDeleteId("");
                                                    }, "aria-label": "Select layout profile", children: [_jsx("option", { value: "", children: "Select profile" }), layoutProfiles.map((profile) => (_jsx("option", { value: profile.id, children: profile.name }, profile.id)))] }), _jsx("button", { className: "btn footer-layout-btn footer-icon-btn", onClick: () => void loadSelectedLayoutProfile(), disabled: !selectedLayoutProfileId, "aria-label": "Load selected layout profile", title: "Load selected layout profile", children: "\u2713" }), _jsx("button", { type: "button", className: `btn footer-layout-btn footer-icon-btn footer-layout-toggle ${isFooterLayoutPanelOpen ? "is-open" : ""}`, onClick: toggleFooterLayoutPanel, "aria-expanded": isFooterLayoutPanelOpen, "aria-controls": "footer-layout-advanced-controls", "aria-label": isFooterLayoutPanelOpen ? "Collapse layout actions" : "Expand layout actions", title: isFooterLayoutPanelOpen ? "Collapse layout actions" : "Expand layout actions", children: isFooterLayoutPanelOpen ? "⌃" : "⌄" })] }), _jsx("div", { id: "footer-layout-advanced-controls", className: `footer-layout-slide ${isFooterLayoutPanelOpen ? "is-open" : ""}`, "aria-hidden": !isFooterLayoutPanelOpen, children: _jsxs("div", { className: "layout-profile-controls footer-layout-advanced", children: [_jsx("input", { className: "input split-profile-name", value: layoutProfileName, onChange: (event) => setLayoutProfileName(event.target.value), placeholder: "Layout profile name" }), _jsx("button", { type: "button", className: `btn split-profile-toggle-btn ${saveLayoutWithHosts ? "is-active" : ""}`, onClick: () => setSaveLayoutWithHosts((prev) => !prev), "aria-pressed": saveLayoutWithHosts, title: `With hosts ${saveLayoutWithHosts ? "on" : "off"}`, children: saveLayoutWithHosts ? "with hosts: on" : "with hosts: off" }), _jsx("button", { className: "btn footer-layout-btn footer-action-btn", onClick: () => void saveCurrentLayoutProfile(), "aria-label": "Save current layout profile", title: "Save current layout profile", children: "Save" }), _jsx("button", { className: `btn btn-danger footer-layout-btn footer-action-btn ${pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                                                            ? "btn-danger-confirm"
                                                            : ""}`, onClick: () => void handleDeleteSelectedLayoutProfileIntent(), disabled: !selectedLayoutProfileId, "aria-label": pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                                                            ? "Confirm delete selected layout profile"
                                                            : "Delete selected layout profile", title: pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                                                            ? "Confirm delete selected layout profile"
                                                            : "Delete selected layout profile", children: pendingLayoutProfileDeleteId === selectedLayoutProfileId && selectedLayoutProfileId
                                                            ? "Confirm"
                                                            : "Delete" })] }) }), !isFooterLayoutPanelOpen && (_jsx("div", { className: "sessions-footer-status", children: _jsxs("span", { className: `context-pill footer-broadcast-pill ${isBroadcastModeEnabled ? "is-active" : ""}`, children: ["Broadcast: ", isBroadcastModeEnabled ? "ON" : "OFF", " (", broadcastTargets.size, ")"] }) }))] }) })] }) }) }), isAppSettingsOpen && (_jsx("div", { className: "app-settings-overlay", onClick: () => setIsAppSettingsOpen(false), children: _jsxs("section", { className: "app-settings-modal panel", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "App settings" }), _jsx("button", { className: "btn", onClick: () => setIsAppSettingsOpen(false), children: "Close" })] }), _jsx("div", { className: "app-settings-tabs", children: appSettingsTabs.map((tab) => (_jsx("button", { className: `tab-pill ${activeAppSettingsTab === tab.id ? "is-active" : ""}`, onClick: () => setActiveAppSettingsTab(tab.id), children: tab.label }, tab.id))) }), _jsxs("div", { className: "app-settings-content", children: [activeAppSettingsTab === "general" && (_jsx("div", { className: "host-form-grid", children: _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Default login user" }), _jsx("input", { className: "input", value: metadataStore.defaultUser, onChange: (event) => {
                                                    const nextValue = event.target.value;
                                                    setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                                                }, onBlur: (event) => {
                                                    void applyDefaultUser(event.target.value).catch((e) => setError(String(e)));
                                                }, placeholder: "ubuntu" }), _jsx("span", { className: "field-help", children: "Used when a host does not define a user." })] }) })), activeAppSettingsTab === "backup" && (_jsxs("div", { className: "backup-panel", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export path" }), _jsx("input", { className: "input", value: backupExportPath, onChange: (event) => setBackupExportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export password" }), _jsx("input", { className: "input", type: "password", value: backupExportPassword, onChange: (event) => setBackupExportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "new-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleExportBackup(), disabled: !backupExportPassword, children: "Export backup" }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import path" }), _jsx("input", { className: "input", value: backupImportPath, onChange: (event) => setBackupImportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import password" }), _jsx("input", { className: "input", type: "password", value: backupImportPassword, onChange: (event) => setBackupImportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "current-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleImportBackup(), disabled: !backupImportPassword, children: "Import backup" }), _jsx("p", { className: "muted-copy", children: "Backups are always encrypted. Passwords are never stored." }), backupMessage && _jsx("p", { className: "muted-copy", children: backupMessage })] })), activeAppSettingsTab === "extras" && _jsx("p", { className: "muted-copy", children: "Extras settings placeholder." }), activeAppSettingsTab === "help" && _jsx("p", { className: "muted-copy", children: "Help settings placeholder." }), activeAppSettingsTab === "about" && (_jsxs("section", { className: "about-hero", children: [_jsx("img", { src: logoTerminal, alt: "NoSuckShell hero", className: "about-hero-image" }), _jsx("p", { className: "muted-copy", children: "NoSuckShell helps you manage SSH hosts and sessions in one clean desktop workspace." })] }))] })] }) })), isAddHostModalOpen && (_jsx("div", { className: "app-settings-overlay", onClick: closeAddHostModal, children: _jsxs("section", { className: "app-settings-modal panel add-host-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Add host" }), _jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsx(HostForm, { host: newHostDraft, onChange: setNewHostDraft }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" }), _jsx("button", { className: "btn btn-primary", onClick: createHost, disabled: !canCreateHost, children: "Add host" })] }), error && _jsx("p", { className: "error-text", children: error })] })] }) })), activeTrustPrompt && (_jsx("div", { className: "app-settings-overlay", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: _jsxs("section", { className: "app-settings-modal panel trust-host-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Trust host key" }), _jsx("button", { className: "btn", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: "Close" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsxs("p", { className: "muted-copy", children: ["Session ", _jsx("strong", { children: activeTrustPrompt.sessionId }), " requests trust confirmation for host", " ", _jsx("strong", { children: activeTrustPrompt.hostAlias }), "."] }), _jsxs("label", { className: "field checkbox-field trust-default-checkbox", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: saveTrustHostAsDefault, onChange: (event) => setSaveTrustHostAsDefault(event.target.checked) }), _jsx("span", { className: "field-label", children: "Save as default for this host" })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: "Dismiss" }), _jsx("button", { className: "btn btn-primary", onClick: () => void acceptTrustPrompt(), children: "Trust host" })] })] })] }) })), contextMenu.visible && contextMenu.paneIndex !== null && (_jsx("div", { className: "context-menu", style: { left: contextMenu.x, top: contextMenu.y }, role: "menu", children: buildPaneContextActions({
                    paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
                    canClosePane: paneOrder.length > 1,
                    broadcastModeEnabled: isBroadcastModeEnabled,
                    broadcastCount: broadcastTargets.size,
                }).map((action) => (_jsx("button", { className: `context-menu-item ${action.separatorAbove ? "separator-above" : ""}`, disabled: action.disabled, onClick: () => void handleContextAction(action.id, contextMenu.paneIndex ?? 0), children: action.label }, action.id))) }))] }));
}
