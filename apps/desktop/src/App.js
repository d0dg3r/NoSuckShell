import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
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
const SIDEBAR_WIDTH_STORAGE_KEY = "nosuckshell.sidebar.width";
const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";
const clampSidebarWidth = (value) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const createDefaultMetadataStore = () => ({ defaultUser: "", hosts: {} });
const createDefaultHostMetadata = () => ({ favorite: false, tags: [], lastUsedAt: null });
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
    const [pendingTrustSessions, setPendingTrustSessions] = useState(new Set());
    const [viewMode, setViewMode] = useState("single");
    const [splitSlots, setSplitSlots] = useState(() => createInitialPaneState());
    const [paneLayouts, setPaneLayouts] = useState(() => createPaneLayoutsFromSlots(createInitialPaneState()));
    const [splitTree, setSplitTree] = useState(() => createLeafNode(0));
    const [activePaneIndex, setActivePaneIndex] = useState(0);
    const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState(false);
    const [broadcastTargets, setBroadcastTargets] = useState(new Set());
    const [layoutProfiles, setLayoutProfiles] = useState([]);
    const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState("");
    const [layoutProfileName, setLayoutProfileName] = useState("");
    const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState(false);
    const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState("");
    const [draggingKind, setDraggingKind] = useState(null);
    const [dragOverPaneIndex, setDragOverPaneIndex] = useState(null);
    const [splitResizeState, setSplitResizeState] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window === "undefined") {
            return SIDEBAR_DEFAULT_WIDTH;
        }
        const persisted = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
        return Number.isFinite(persisted) ? clampSidebarWidth(persisted) : SIDEBAR_DEFAULT_WIDTH;
    });
    const [isSidebarResizing, setIsSidebarResizing] = useState(false);
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
    const quickAddMenuRef = useRef(null);
    const removeConfirmResetTimerRef = useRef(null);
    const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState(null);
    const canSave = useMemo(() => currentHost.host.trim().length > 0 && currentHost.hostName.trim().length > 0, [currentHost]);
    const canCreateHost = useMemo(() => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0, [newHostDraft]);
    const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
    const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
    const selectedLayoutProfile = useMemo(() => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null, [layoutProfiles, selectedLayoutProfileId]);
    const connectedHosts = useMemo(() => new Set(sessions.map((session) => session.host)), [sessions]);
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
        }).catch(() => { });
        // #endregion
    }, []);
    useEffect(() => {
        let unlisten = null;
        void listen("session-output", (event) => {
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
        };
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
    const connectToHost = async (host, options) => {
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
            }).catch(() => { });
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
                }).catch(() => { });
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
            void touchHostLastUsed(host.host).catch((touchError) => setError(String(touchError)));
            return started.session_id;
        }
        catch (e) {
            setError(String(e));
            return null;
        }
    };
    const ensureSessionForHost = async (hostAlias, options) => {
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
            }).catch(() => { });
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
    const setDragPayload = (event, payload) => {
        const serialized = JSON.stringify(payload);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DND_PAYLOAD_MIME, serialized);
        event.dataTransfer.setData("text/plain", serialized);
    };
    const parseDragPayload = (event) => {
        const encoded = event.dataTransfer.getData(DND_PAYLOAD_MIME) || event.dataTransfer.getData("text/plain");
        if (!encoded) {
            return null;
        }
        try {
            const parsed = JSON.parse(encoded);
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
        }
        catch {
            return null;
        }
    };
    const handlePaneDrop = async (event, paneIndex) => {
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
        }).catch(() => { });
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
        }).catch(() => { });
        // #endregion
        setActivePaneIndex(paneIndex);
        setActiveSession(sessionId);
        setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, sessionId));
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
    const handleTerminalInput = useCallback((originSessionId, data) => {
        const targets = isBroadcastModeEnabled
            ? resolveInputTargets(originSessionId, broadcastTargets, sessionIds)
            : [originSessionId];
        for (const target of targets) {
            void sendInput(target, data);
        }
    }, [broadcastTargets, isBroadcastModeEnabled, sessionIds]);
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
        }).catch(() => { });
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
    const startSidebarResize = (event) => {
        event.preventDefault();
        sidebarDragStartXRef.current = event.clientX;
        sidebarDragStartWidthRef.current = sidebarWidth;
        setIsSidebarResizing(true);
    };
    const splitFocusedPane = (direction) => {
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
        setViewMode("split2x2");
        const parsedTree = parseSplitTree(selectedLayoutProfile.splitTree);
        const profilePaneOrder = parsedTree ? collectPaneOrder(parsedTree) : selectedLayoutProfile.panes.map((_, index) => index);
        const mappedSlots = [];
        const mappedLayouts = [];
        for (let index = 0; index < selectedLayoutProfile.panes.length; index += 1) {
            const pane = selectedLayoutProfile.panes[index];
            const paneIndex = profilePaneOrder[index] ?? index;
            let sessionId = null;
            if (selectedLayoutProfile.withHosts && pane.hostAlias) {
                const existingSession = sessions.find((session) => session.host === pane.hostAlias);
                if (existingSession) {
                    sessionId = existingSession.id;
                }
                else if (hosts.some((host) => host.host === pane.hostAlias)) {
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
        const normalizedLayouts = Array.from({ length: maxPaneIndex + 1 }, (_, paneIndex) => mappedLayouts[paneIndex] ?? createPaneLayoutItem());
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
    const renderSplitNode = (node) => {
        if (node.type === "leaf") {
            const paneIndex = node.paneIndex;
            const paneSessionId = splitSlots[paneIndex] ?? null;
            return (_jsxs("div", { className: `split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${dragOverPaneIndex === paneIndex ? "is-drag-over" : ""}`, draggable: viewMode === "split2x2", onClick: () => {
                    setActivePaneIndex(paneIndex);
                    if (paneSessionId) {
                        setActiveSession(paneSessionId);
                    }
                }, onDragStart: (event) => {
                    setDragPayload(event, { type: "pane", paneIndex });
                    setDraggingKind("pane");
                }, onDragEnd: () => {
                    setDraggingKind(null);
                    setDragOverPaneIndex(null);
                }, onDragOver: (event) => {
                    if (viewMode !== "split2x2") {
                        return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                }, onDragEnter: (event) => {
                    if (viewMode !== "split2x2") {
                        return;
                    }
                    event.preventDefault();
                    setDragOverPaneIndex(paneIndex);
                }, onDragLeave: (event) => {
                    if (event.currentTarget.contains(event.relatedTarget)) {
                        return;
                    }
                    setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
                }, onDrop: (event) => {
                    void handlePaneDrop(event, paneIndex);
                }, onContextMenu: (event) => {
                    event.preventDefault();
                    setContextMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        paneIndex,
                    });
                }, children: [_jsxs("div", { className: "split-pane-label", children: ["Pane ", paneIndex + 1, paneSessionId ? ` - ${sessions.find((session) => session.id === paneSessionId)?.host ?? "session"}` : ""] }), paneSessionId ? (_jsx(TerminalPane, { sessionId: paneSessionId, onUserInput: handleTerminalInput })) : (_jsxs("div", { className: "empty-pane split-empty-pane", children: [_jsx("p", { children: "Empty pane." }), _jsx("span", { children: draggingKind === "pane"
                                    ? "Drop pane here to swap."
                                    : draggingKind
                                        ? "Drop machine or session here."
                                        : "Drag a machine or session here." })] }))] }, `pane-${paneIndex}`));
        }
        const firstRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, node.ratio));
        const secondRatio = 1 - firstRatio;
        const dividerClass = node.axis === "horizontal" ? "split-node-divider vertical" : "split-node-divider horizontal";
        return (_jsxs("div", { className: `split-node split-node-${node.axis}`, ref: (element) => {
                splitNodeRefs.current[node.id] = element;
            }, children: [_jsx("div", { className: "split-node-child", style: { flexBasis: `${firstRatio * 100}%` }, children: renderSplitNode(node.first) }), _jsx("div", { className: dividerClass, role: "separator", "aria-orientation": node.axis === "horizontal" ? "vertical" : "horizontal", onPointerDown: startSplitResize(node.id, node.axis) }), _jsx("div", { className: "split-node-child", style: { flexBasis: `${secondRatio * 100}%` }, children: renderSplitNode(node.second) })] }, node.id));
    };
    const appShellStyle = {
        "--sidebar-width": `${sidebarWidth}px`,
    };
    return (_jsxs("main", { className: `app-shell ${isSidebarResizing ? "is-resizing" : ""}`, style: appShellStyle, children: [_jsxs("aside", { className: "left-rail panel", children: [_jsx("header", { className: "brand", children: _jsx("div", { className: "brand-logo-card", children: _jsx("img", { src: logoTextTransparent, alt: "NoSuckShell logo", className: "brand-logo" }) }) }), _jsx("section", { className: "host-actions-card", children: _jsx("div", { className: "left-rail-actions", children: _jsx("button", { className: "app-gear-btn", "aria-label": "Open app settings", onClick: () => setIsAppSettingsOpen((prev) => !prev), children: "\u2699" }) }) }), _jsxs("section", { className: "host-filter-card", children: [_jsxs("div", { className: "filter-head-row", children: [_jsxs("div", { className: "quick-add-wrap", ref: quickAddMenuRef, children: [_jsx("button", { className: "btn host-plus-btn", "aria-label": "Open add menu", title: "Add host", onClick: () => setIsQuickAddMenuOpen((prev) => !prev), children: "+" }), isQuickAddMenuOpen && (_jsxs("div", { className: "quick-add-menu", role: "menu", children: [_jsx("button", { className: "quick-add-menu-item", onClick: openAddHostModal, children: "Add host" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add group" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add user" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add key" })] }))] }), _jsx("input", { className: "input host-search-input", value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search alias, hostname, user" }), _jsxs("button", { className: `btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`, onClick: () => setShowAdvancedFilters((prev) => !prev), "aria-expanded": showAdvancedFilters, "aria-controls": "advanced-host-filters", children: ["Filters ", showAdvancedFilters ? "−" : "+"] }), _jsx("span", { className: "pill-muted", children: filteredHostRows.length })] }), _jsxs("div", { id: "advanced-host-filters", className: `advanced-filters ${showAdvancedFilters ? "is-open" : ""}`, children: [_jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All status" }), _jsx("option", { value: "connected", children: "Connected" }), _jsx("option", { value: "disconnected", children: "Disconnected" })] }), _jsx("input", { className: "input", type: "number", value: portFilter, onChange: (event) => setPortFilter(event.target.value), placeholder: "Port" })] }), _jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: selectedTagFilter, onChange: (event) => setSelectedTagFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All tags" }), availableTags.map((tag) => (_jsx("option", { value: tag, children: tag }, tag)))] }), _jsx("button", { className: `btn ${favoritesOnly ? "btn-primary" : ""}`, onClick: () => setFavoritesOnly((prev) => !prev), children: "Favorites" })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { className: `btn ${recentOnly ? "btn-primary" : ""}`, onClick: () => setRecentOnly((prev) => !prev), children: "Recent" }), _jsx("button", { className: "btn", onClick: clearFilters, children: "Reset filters" })] })] })] }), _jsxs("div", { className: "host-list", children: [filteredHostRows.map((row, index) => (_jsxs("div", { className: "host-row", children: [_jsxs("button", { className: `host-item ${activeHost === row.host.host ? "is-active" : ""}`, onClick: () => selectHost(row.host.host), draggable: viewMode === "split2x2", onDragStart: (event) => {
                                            const existingSession = sessions.find((session) => session.host === row.host.host);
                                            if (existingSession) {
                                                setDragPayload(event, { type: "session", sessionId: existingSession.id });
                                                setDraggingKind("session");
                                                return;
                                            }
                                            setDragPayload(event, { type: "machine", hostAlias: row.host.host });
                                            setDraggingKind("machine");
                                        }, onDragEnd: () => {
                                            setDraggingKind(null);
                                            setDragOverPaneIndex(null);
                                        }, children: [_jsx("span", { className: "host-item-dot" }), _jsx("span", { className: "host-item-main", children: row.host.host }), _jsxs("span", { className: "host-user-badge", children: ["user: ", row.displayUser] }), row.connected && _jsx("span", { className: "host-status-badge", children: "connected" })] }), _jsxs("div", { className: "host-row-actions", children: [_jsx("button", { className: `host-favorite-btn ${row.metadata.favorite ? "is-active" : ""}`, "aria-label": `Toggle favorite for ${row.host.host}`, onClick: (event) => {
                                                    event.stopPropagation();
                                                    void toggleFavoriteForHost(row.host.host);
                                                }, children: "\u2605" }), _jsx("button", { className: "host-connect-btn", "aria-label": `Connect to ${row.host.host}`, title: `Connect to ${row.host.host}`, onClick: (event) => {
                                                    event.stopPropagation();
                                                    void connectToHost(row.host);
                                                }, children: "\u2197" }), _jsx("button", { className: `host-gear-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, "aria-label": `Open host settings for ${row.host.host}`, title: `Open host settings for ${row.host.host}`, onClick: (event) => {
                                                    event.stopPropagation();
                                                    toggleHostMenu(row.host);
                                                }, children: "\u22EF" })] }), _jsx("div", { className: `host-slide-menu ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, children: openHostMenuHostAlias === row.host.host && (_jsxs("div", { className: "host-slide-content", children: [_jsx(HostForm, { host: currentHost, onChange: setCurrentHost }), _jsxs("div", { className: "host-meta-edit", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Tags (comma separated)" }), _jsx("input", { className: "input", value: tagDraft, onChange: (event) => setTagDraft(event.target.value), placeholder: "prod, home, lab" })] }), _jsxs("label", { className: "field checkbox-field", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: activeHostMetadata.favorite, onChange: () => void toggleFavoriteForHost(activeHost) }), _jsx("span", { className: "field-label", children: "Favorite" })] })] }), _jsxs("div", { className: "action-row host-slide-actions", children: [_jsx("button", { className: "btn icon-btn", "aria-label": "Save tags", title: "Save tags", onClick: () => {
                                                                void saveTagsForActiveHost().catch((e) => setError(String(e)));
                                                            }, children: "#" }), _jsx("button", { className: "btn btn-primary icon-btn", "aria-label": "Save settings", title: "Save settings", onClick: onSave, disabled: !canSave, children: "\u2713" }), _jsx("button", { className: `btn btn-danger icon-btn ${pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                                                ? "btn-danger-confirm"
                                                                : ""}`, onClick: () => handleRemoveHostIntent(currentHost.host, "settings"), disabled: !currentHost.host || !hosts.some((host) => host.host === currentHost.host), "aria-label": pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                                                ? "Confirm remove host"
                                                                : "Remove host", title: pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                                                ? "Confirm remove host"
                                                                : "Remove host", children: pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                                                                ? "!"
                                                                : "×" })] }), error && _jsx("p", { className: "error-text", children: error })] })) })] }, `${row.host.host}-${row.host.hostName}-${row.host.port}-${index}`))), filteredHostRows.length === 0 && (_jsxs("div", { className: "empty-pane", children: [_jsx("p", { children: "No hosts match the active filters." }), _jsx("span", { children: "Adjust or reset filters to show hosts." })] }))] })] }), _jsx("div", { className: "sidebar-resize-handle", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize host sidebar", onPointerDown: startSidebarResize }), _jsxs("section", { className: "right-dock panel", children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Sessions" }), _jsxs("div", { className: "action-row compact", children: [_jsx("button", { className: "btn", onClick: trustHost, disabled: !activeSession || !pendingTrustSessions.has(activeSession), children: "Trust" }), _jsx("button", { className: "btn btn-danger", onClick: closeActiveSession, disabled: !activeSession, children: "Close" })] })] }), _jsxs("div", { className: "view-mode-row", children: [_jsx("button", { className: `tab-pill ${viewMode === "single" ? "is-active" : ""}`, onClick: () => setViewMode("single"), children: "Single" }), _jsx("button", { className: `tab-pill ${viewMode === "split2x2" ? "is-active" : ""}`, onClick: () => setViewMode("split2x2"), children: "Panels" })] }), _jsx("div", { className: "session-tabs", children: sessions.map((session) => (_jsxs("div", { className: `tab-chip tab-chip-row ${activeSession === session.id ? "is-active" : ""}`, draggable: viewMode === "split2x2", onDragStart: (event) => {
                                setDragPayload(event, { type: "session", sessionId: session.id });
                                setDraggingKind("session");
                            }, onDragEnd: () => {
                                setDraggingKind(null);
                                setDragOverPaneIndex(null);
                            }, children: [_jsx("button", { className: "tab-chip-main-btn", onClick: () => setActiveSession(session.id), title: session.host, children: _jsx("span", { className: "tab-chip-main", children: session.host }) }), _jsx("button", { type: "button", className: "tab-chip-close", "aria-label": `Close session ${session.host}`, title: `Close session ${session.host}`, onClick: (event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void closeSessionById(session.id);
                                    }, children: "\u00D7" })] }, session.id))) }), _jsxs("div", { className: "broadcast-controls panel", children: [_jsxs("div", { className: "broadcast-control-head", children: [_jsxs("button", { className: `btn ${isBroadcastModeEnabled ? "btn-primary" : ""}`, onClick: () => setBroadcastMode(!isBroadcastModeEnabled), children: ["Broadcast: ", isBroadcastModeEnabled ? "ON" : "OFF"] }), _jsx("button", { className: "btn", onClick: () => setBroadcastTargets(new Set()), disabled: broadcastTargets.size === 0, children: "Clear" })] }), _jsx("div", { className: "broadcast-target-list", children: sessions.map((session) => (_jsx("button", { className: `target-chip ${broadcastTargets.has(session.id) ? "is-active" : ""}`, onClick: () => toggleBroadcastTarget(session.id), disabled: !isBroadcastModeEnabled, children: session.host }, `target-${session.id}`))) })] }), _jsx("div", { className: "broadcast-indicator", role: "status", children: isBroadcastModeEnabled
                            ? `Broadcast ON: ${broadcastTargets.size} target${broadcastTargets.size === 1 ? "" : "s"}`
                            : "Broadcast OFF" }), viewMode === "split2x2" && (_jsxs("div", { className: "split-actions", children: [_jsx("button", { className: "btn", onClick: placeActiveSessionInPane, disabled: !activeSession, children: "Send active to pane" }), _jsx("button", { className: "btn", onClick: clearFocusedPane, children: "Clear pane" }), _jsx("button", { className: "btn", onClick: () => splitFocusedPane("left"), children: "Split left" }), _jsx("button", { className: "btn", onClick: () => splitFocusedPane("bottom"), children: "Split bottom" }), _jsx("input", { className: "input split-profile-name", value: layoutProfileName, onChange: (event) => setLayoutProfileName(event.target.value), placeholder: "Layout profile name" }), _jsxs("label", { className: "split-profile-toggle", children: [_jsx("input", { type: "checkbox", checked: saveLayoutWithHosts, onChange: (event) => setSaveLayoutWithHosts(event.target.checked) }), _jsx("span", { children: "with hosts" })] }), _jsx("button", { className: "btn", onClick: () => void saveCurrentLayoutProfile(), children: "Save layout" }), _jsxs("select", { className: "input split-profile-select", value: selectedLayoutProfileId, onChange: (event) => setSelectedLayoutProfileId(event.target.value), children: [_jsx("option", { value: "", children: "Select profile" }), layoutProfiles.map((profile) => (_jsx("option", { value: profile.id, children: profile.name }, profile.id)))] }), _jsx("button", { className: "btn", onClick: () => void loadSelectedLayoutProfile(), disabled: !selectedLayoutProfileId, children: "Load" }), _jsx("button", { className: "btn btn-danger", onClick: () => void deleteSelectedLayoutProfile(), disabled: !selectedLayoutProfileId, children: "Delete" })] })), viewMode === "single" ? (activeSession ? (_jsx(TerminalPane, { sessionId: activeSession, onUserInput: handleTerminalInput })) : (_jsxs("div", { className: "empty-pane", children: [_jsx("p", { children: "No active session." }), _jsx("span", { children: "Connect a host to start." })] }))) : (_jsx("div", { className: `terminal-grid ${splitResizeState ? "is-pane-resizing" : ""}`, children: renderSplitNode(splitTree) }))] }), isAppSettingsOpen && (_jsx("div", { className: "app-settings-overlay", onClick: () => setIsAppSettingsOpen(false), children: _jsxs("section", { className: "app-settings-modal panel", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "App settings" }), _jsx("button", { className: "btn", onClick: () => setIsAppSettingsOpen(false), children: "Close" })] }), _jsx("div", { className: "app-settings-tabs", children: appSettingsTabs.map((tab) => (_jsx("button", { className: `tab-pill ${activeAppSettingsTab === tab.id ? "is-active" : ""}`, onClick: () => setActiveAppSettingsTab(tab.id), children: tab.label }, tab.id))) }), _jsxs("div", { className: "app-settings-content", children: [activeAppSettingsTab === "general" && (_jsx("div", { className: "host-form-grid", children: _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Default login user" }), _jsx("input", { className: "input", value: metadataStore.defaultUser, onChange: (event) => {
                                                    const nextValue = event.target.value;
                                                    setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                                                }, onBlur: (event) => {
                                                    void applyDefaultUser(event.target.value).catch((e) => setError(String(e)));
                                                }, placeholder: "ubuntu" }), _jsx("span", { className: "field-help", children: "Used when a host does not define a user." })] }) })), activeAppSettingsTab === "backup" && (_jsxs("div", { className: "backup-panel", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export path" }), _jsx("input", { className: "input", value: backupExportPath, onChange: (event) => setBackupExportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export password" }), _jsx("input", { className: "input", type: "password", value: backupExportPassword, onChange: (event) => setBackupExportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "new-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleExportBackup(), disabled: !backupExportPassword, children: "Export backup" }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import path" }), _jsx("input", { className: "input", value: backupImportPath, onChange: (event) => setBackupImportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import password" }), _jsx("input", { className: "input", type: "password", value: backupImportPassword, onChange: (event) => setBackupImportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "current-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleImportBackup(), disabled: !backupImportPassword, children: "Import backup" }), _jsx("p", { className: "muted-copy", children: "Backups are always encrypted. Passwords are never stored." }), backupMessage && _jsx("p", { className: "muted-copy", children: backupMessage })] })), activeAppSettingsTab === "extras" && _jsx("p", { className: "muted-copy", children: "Extras settings placeholder." }), activeAppSettingsTab === "help" && _jsx("p", { className: "muted-copy", children: "Help settings placeholder." }), activeAppSettingsTab === "about" && (_jsxs("section", { className: "about-hero", children: [_jsx("img", { src: logoTerminal, alt: "NoSuckShell hero", className: "about-hero-image" }), _jsx("p", { className: "muted-copy", children: "NoSuckShell helps you manage SSH hosts and sessions in one clean desktop workspace." })] }))] })] }) })), isAddHostModalOpen && (_jsx("div", { className: "app-settings-overlay", onClick: closeAddHostModal, children: _jsxs("section", { className: "app-settings-modal panel add-host-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Add host" }), _jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsx(HostForm, { host: newHostDraft, onChange: setNewHostDraft }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" }), _jsx("button", { className: "btn btn-primary", onClick: createHost, disabled: !canCreateHost, children: "Add host" })] }), error && _jsx("p", { className: "error-text", children: error })] })] }) })), contextMenu.visible && contextMenu.paneIndex !== null && (_jsx("div", { className: "context-menu", style: { left: contextMenu.x, top: contextMenu.y }, role: "menu", children: buildPaneContextActions({
                    paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
                    activeSession,
                    viewMode,
                    broadcastModeEnabled: isBroadcastModeEnabled,
                    broadcastCount: broadcastTargets.size,
                    pendingTrustForActive: activeSession.length > 0 && pendingTrustSessions.has(activeSession),
                }).map((action) => (_jsx("button", { className: `context-menu-item ${action.separatorAbove ? "separator-above" : ""}`, disabled: action.disabled, onClick: () => void handleContextAction(action.id, contextMenu.paneIndex ?? 0), children: action.label }, action.id))) }))] }));
}
