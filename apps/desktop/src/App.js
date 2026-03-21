import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { listen } from "@tauri-apps/api/event";
import { closeSession, deleteHost, deleteLayoutProfile, exportBackup, importBackup, listLayoutProfiles, listViewProfiles, listHostMetadata, listHosts, saveHost, saveHostMetadata, saveLayoutProfile, saveViewProfile, deleteViewProfile, reorderViewProfiles, sendInput, listStoreObjects, saveStoreObjects, createEncryptedKey, unlockKeyMaterial, deleteKeyById, startLocalSession, startQuickSshSession, startSession, touchHostLastUsed, } from "./tauri-api";
import { HostForm } from "./components/HostForm";
import { HelpPanel } from "./components/HelpPanel";
import { LayoutCommandCenter } from "./components/LayoutCommandCenter";
import { TerminalPane } from "./components/TerminalPane";
import { LAYOUT_PRESET_DEFINITIONS } from "./layoutPresets";
import { buildPaneContextActions } from "./features/context-actions";
import { buildQuickConnectUserCandidates, parseHostPortInput, parseQuickConnectCommandInput, } from "./features/quick-connect";
import { assignSessionToPane, clearPaneAtIndex, createPaneLayoutItem, createPaneLayoutsFromSlots, createInitialPaneState, ensurePaneIndex, MIN_PANE_HEIGHT, MIN_PANE_WIDTH, reconcilePaneLayouts, removeSessionFromSlots, resolveInputTargets, sanitizeBroadcastTargets, } from "./features/split";
import { sortRowsByFavoriteThenAlias } from "./features/host-order";
import logoTextTransparent from "../../../img/logo_text_transparent.png";
import logoTransparent from "../../../img/logo_tranparent.png";
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
const createQuickConnectDraft = (defaultUser = "") => ({
    hostName: "",
    user: defaultUser.trim(),
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
});
const DND_PAYLOAD_MIME = "application/x-nosuckshell-dnd";
const DEFAULT_SPLIT_RATIO = 0.6;
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;
const appSettingsTabs = [
    { id: "appearance", label: "Appearance" },
    { id: "layout", label: "Layout & Navigation" },
    { id: "connections", label: "Connections" },
    { id: "data", label: "Data & Backup" },
    { id: "views", label: "Views" },
    { id: "store", label: "Identity Store" },
    { id: "help", label: "Help" },
    { id: "about", label: "About" },
];
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
const parseStoredAutoArrangeMode = (raw) => {
    if (raw === "off" || raw === "a" || raw === "b" || raw === "c" || raw === "free") {
        return raw;
    }
    return "c";
};
const WORKSPACES_STORAGE_KEY = "nosuckshell.layout.workspaces.v1";
const SETTINGS_OPEN_MODE_STORAGE_KEY = "nosuckshell.settings.openMode";
const DEFAULT_BACKUP_PATH = "~/.ssh/nosuckshell.backup.json";
const DEFAULT_WORKSPACE_ID = "workspace-main";
const SPLIT_RATIO_PRESET_VALUE = {
    "50-50": 0.5,
    "60-40": 0.6,
    "70-30": 0.7,
};
const TERMINAL_FONT_FAMILY_BY_PRESET = {
    "jetbrains-mono": '"JetBrains Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
    "ibm-plex-mono": '"IBM Plex Mono", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
    "source-code-pro": '"Source Code Pro", "NoSuckShell Nerd Font", "JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", monospace',
};
const DENSITY_TERMINAL_BASE_FONT = {
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
const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const createEmptyFilterGroup = () => ({
    id: createId(),
    mode: "and",
    rules: [],
    groups: [],
});
const createDefaultViewProfile = () => ({
    id: createId(),
    name: "New view",
    order: 0,
    filterGroup: createEmptyFilterGroup(),
    sortRules: [{ field: "host", direction: "asc" }],
    createdAt: 0,
    updatedAt: 0,
});
const parseBooleanRuleValue = (value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
    }
    return null;
};
const hasTauriTransformCallback = () => {
    if (import.meta.env.VITE_E2E === "true") {
        return true;
    }
    if (typeof window === "undefined") {
        return false;
    }
    const tauriInternals = window
        .__TAURI_INTERNALS__;
    return typeof tauriInternals?.transformCallback === "function";
};
const clampSidebarWidth = (value) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
const readLayoutMode = () => {
    if (typeof window === "undefined") {
        return "auto";
    }
    const persisted = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
    return persisted === "wide" || persisted === "compact" ? persisted : "auto";
};
const readSplitRatioPreset = () => {
    if (typeof window === "undefined") {
        return "60-40";
    }
    const persisted = window.localStorage.getItem(SPLIT_RATIO_PRESET_STORAGE_KEY);
    return persisted === "50-50" || persisted === "60-40" || persisted === "70-30" ? persisted : "60-40";
};
const createDefaultMetadataStore = () => ({ defaultUser: "", hosts: {} });
const createDefaultEntityStore = () => ({
    schemaVersion: 1,
    updatedAt: 0,
    users: {},
    groups: {},
    keys: {},
    tags: {},
    hostBindings: {},
});
const createDefaultHostMetadata = () => ({ favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false });
const createLeafNode = (paneIndex) => ({ id: `leaf-${paneIndex}`, type: "leaf", paneIndex });
const cloneSplitTree = (node) => node.type === "leaf"
    ? { ...node }
    : {
        ...node,
        first: cloneSplitTree(node.first),
        second: cloneSplitTree(node.second),
    };
const clonePaneLayouts = (layouts) => layouts.map((entry) => ({ ...entry }));
const cloneWorkspaceSnapshot = (snapshot) => ({
    ...snapshot,
    splitSlots: [...snapshot.splitSlots],
    paneLayouts: clonePaneLayouts(snapshot.paneLayouts),
    splitTree: cloneSplitTree(snapshot.splitTree),
});
const rebalanceSplitTree = (node) => {
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
const compactSplitSlotsByPaneOrder = (slots, paneOrder) => {
    if (paneOrder.length === 0) {
        return slots;
    }
    const maxPaneIndex = Math.max(0, ...paneOrder);
    const next = Array.from({ length: maxPaneIndex + 1 }, () => null);
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
};
const getPaneDropOverlaySize = (paneWidth, paneHeight) => {
    const w = Math.min(PANE_DROP_OVERLAY.widthCap, Math.min(PANE_DROP_OVERLAY.widthPx, paneWidth * PANE_DROP_OVERLAY.widthMaxPct));
    const h = Math.min(PANE_DROP_OVERLAY.heightCap, Math.min(PANE_DROP_OVERLAY.heightPx, paneHeight * PANE_DROP_OVERLAY.heightMaxPct));
    return { w, h };
};
const resolvePaneDropZoneFromOverlay = (clientX, clientY, bounds) => {
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
    if (row === 1 && col === 1)
        return "center";
    if (row === 0 && col === 1)
        return "top";
    if (row === 2 && col === 1)
        return "bottom";
    if (row === 1 && col === 0)
        return "left";
    if (row === 1 && col === 2)
        return "right";
    const midTop = { x: w / 2, y: 0 };
    const midBottom = { x: w / 2, y: h };
    const midLeft = { x: 0, y: h / 2 };
    const midRight = { x: w, y: h / 2 };
    const dist = (ax, ay) => Math.hypot(lx - ax, ly - ay);
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
const createEmptyWorkspaceSnapshot = (id, name) => {
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
const getRuleFieldValue = (row, field) => {
    switch (field) {
        case "host":
            return row.host.host;
        case "hostName":
            return row.host.hostName;
        case "user":
            return row.displayUser;
        case "port":
            return String(row.host.port);
        case "status":
            return row.connected ? "connected" : "disconnected";
        case "favorite":
            return row.metadata.favorite ? "true" : "false";
        case "recent":
            return row.metadata.lastUsedAt ? "true" : "false";
        case "tag":
            return row.metadata.tags.join(",");
        default:
            return "";
    }
};
const evaluateRule = (row, rule) => {
    if (rule.field === "favorite" || rule.field === "recent") {
        const parsed = parseBooleanRuleValue(rule.value);
        if (parsed !== null && (rule.operator === "equals" || rule.operator === "not_equals")) {
            const current = rule.field === "favorite" ? row.metadata.favorite : Boolean(row.metadata.lastUsedAt);
            return rule.operator === "equals" ? current === parsed : current !== parsed;
        }
    }
    const sourceValue = getRuleFieldValue(row, rule.field);
    const sourceLower = sourceValue.toLowerCase();
    const ruleValue = rule.value.trim();
    const ruleLower = ruleValue.toLowerCase();
    switch (rule.operator) {
        case "equals":
            return sourceLower === ruleLower;
        case "not_equals":
            return sourceLower !== ruleLower;
        case "contains":
            return sourceLower.includes(ruleLower);
        case "starts_with":
            return sourceLower.startsWith(ruleLower);
        case "ends_with":
            return sourceLower.endsWith(ruleLower);
        case "greater_than": {
            const left = Number(sourceValue);
            const right = Number(ruleValue);
            return Number.isFinite(left) && Number.isFinite(right) ? left > right : sourceLower > ruleLower;
        }
        case "less_than": {
            const left = Number(sourceValue);
            const right = Number(ruleValue);
            return Number.isFinite(left) && Number.isFinite(right) ? left < right : sourceLower < ruleLower;
        }
        case "in": {
            const options = ruleValue
                .split(",")
                .map((entry) => entry.trim().toLowerCase())
                .filter((entry) => entry.length > 0);
            if (rule.field === "tag") {
                const tags = row.metadata.tags.map((entry) => entry.trim().toLowerCase());
                return options.some((entry) => tags.includes(entry));
            }
            return options.includes(sourceLower);
        }
        default:
            return true;
    }
};
const evaluateGroup = (row, group) => {
    const ruleResults = group.rules.map((rule) => evaluateRule(row, rule));
    const groupResults = group.groups.map((child) => evaluateGroup(row, child));
    const allResults = [...ruleResults, ...groupResults];
    if (allResults.length === 0) {
        return true;
    }
    return group.mode === "or" ? allResults.some(Boolean) : allResults.every(Boolean);
};
export function App() {
    const [hosts, setHosts] = useState([]);
    const [currentHost, setCurrentHost] = useState(emptyHost());
    const [activeHost, setActiveHost] = useState("");
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState("");
    const [metadataStore, setMetadataStore] = useState(() => createDefaultMetadataStore());
    const [entityStore, setEntityStore] = useState(() => createDefaultEntityStore());
    const [storePassphrase, setStorePassphrase] = useState("");
    const [storeUserDraft, setStoreUserDraft] = useState("");
    const [storeGroupDraft, setStoreGroupDraft] = useState("");
    const [storeTagDraft, setStoreTagDraft] = useState("");
    const [storePathKeyNameDraft, setStorePathKeyNameDraft] = useState("");
    const [storePathKeyPathDraft, setStorePathKeyPathDraft] = useState("");
    const [storeEncryptedKeyNameDraft, setStoreEncryptedKeyNameDraft] = useState("");
    const [storeEncryptedPrivateKeyDraft, setStoreEncryptedPrivateKeyDraft] = useState("");
    const [storeEncryptedPublicKeyDraft, setStoreEncryptedPublicKeyDraft] = useState("");
    const [storeSelectedHostForBinding, setStoreSelectedHostForBinding] = useState("");
    const [storeBindingDraft, setStoreBindingDraft] = useState({
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
    const [error, setError] = useState("");
    const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
    const [settingsOpenMode, setSettingsOpenMode] = useState(() => {
        if (typeof window === "undefined") {
            return "modal";
        }
        const persisted = window.localStorage.getItem(SETTINGS_OPEN_MODE_STORAGE_KEY);
        return persisted === "docked" || persisted === "modal" ? persisted : "modal";
    });
    const [isSettingsDragging, setIsSettingsDragging] = useState(false);
    const [settingsModalPosition, setSettingsModalPosition] = useState(null);
    const [activeAppSettingsTab, setActiveAppSettingsTab] = useState("appearance");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [recentOnly, setRecentOnly] = useState(false);
    const [selectedTagFilter, setSelectedTagFilter] = useState("all");
    const [portFilter, setPortFilter] = useState("");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [isQuickAddMenuOpen, setIsQuickAddMenuOpen] = useState(false);
    const [isAddHostModalOpen, setIsAddHostModalOpen] = useState(false);
    const [isQuickConnectModalOpen, setIsQuickConnectModalOpen] = useState(false);
    const [pendingQuickConnectPaneIndex, setPendingQuickConnectPaneIndex] = useState(null);
    const [newHostDraft, setNewHostDraft] = useState(emptyHost());
    const [quickConnectDraft, setQuickConnectDraft] = useState(() => createQuickConnectDraft());
    const [quickConnectCommandInput, setQuickConnectCommandInput] = useState("");
    const [quickConnectWizardStep, setQuickConnectWizardStep] = useState(1);
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
    const [expandedPaneToolbarIndices, setExpandedPaneToolbarIndices] = useState(new Set());
    const [isBroadcastModeEnabled, setIsBroadcastModeEnabled] = useState(false);
    const [broadcastTargets, setBroadcastTargets] = useState(new Set());
    const [layoutProfiles, setLayoutProfiles] = useState([]);
    const [viewProfiles, setViewProfiles] = useState([]);
    const [selectedSidebarViewId, setSelectedSidebarViewId] = useState(() => {
        if (typeof window === "undefined") {
            return "builtin:all";
        }
        const persisted = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
        if (persisted === "builtin:all" || persisted === "builtin:favorites" || persisted?.startsWith("custom:")) {
            return persisted;
        }
        return "builtin:all";
    });
    const [selectedViewProfileIdInSettings, setSelectedViewProfileIdInSettings] = useState("");
    const [viewDraft, setViewDraft] = useState(() => createDefaultViewProfile());
    const [selectedLayoutProfileId, setSelectedLayoutProfileId] = useState("");
    const [pendingLayoutProfileDeleteId, setPendingLayoutProfileDeleteId] = useState("");
    const [layoutProfileName, setLayoutProfileName] = useState("");
    const [saveLayoutWithHosts, setSaveLayoutWithHosts] = useState(false);
    const [isLayoutCommandCenterOpen, setIsLayoutCommandCenterOpen] = useState(false);
    const [openHostMenuHostAlias, setOpenHostMenuHostAlias] = useState("");
    const [draggingKind, setDraggingKind] = useState(null);
    const [dragOverPaneIndex, setDragOverPaneIndex] = useState(null);
    const [activeDropZonePaneIndex, setActiveDropZonePaneIndex] = useState(null);
    const [activeDropZone, setActiveDropZone] = useState(null);
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
    const [densityProfile, setDensityProfile] = useState(() => {
        if (typeof window === "undefined") {
            return "balanced";
        }
        const persisted = window.localStorage.getItem(DENSITY_PROFILE_STORAGE_KEY);
        return persisted === "aggressive" || persisted === "safe" || persisted === "balanced" ? persisted : "balanced";
    });
    const [listTonePreset, setListTonePreset] = useState(() => {
        if (typeof window === "undefined") {
            return "subtle";
        }
        const persisted = window.localStorage.getItem(LIST_TONE_PRESET_STORAGE_KEY);
        return persisted === "strong" ? "strong" : "subtle";
    });
    const [frameModePreset, setFrameModePreset] = useState(() => {
        if (typeof window === "undefined") {
            return "balanced";
        }
        const persisted = window.localStorage.getItem(FRAME_MODE_PRESET_STORAGE_KEY);
        return persisted === "cleaner" || persisted === "clearer" || persisted === "balanced" ? persisted : "balanced";
    });
    const [terminalFontOffset, setTerminalFontOffset] = useState(() => {
        if (typeof window === "undefined") {
            return 0;
        }
        const persisted = Number(window.localStorage.getItem(TERMINAL_FONT_OFFSET_STORAGE_KEY));
        if (!Number.isFinite(persisted)) {
            return 0;
        }
        return Math.min(TERMINAL_FONT_OFFSET_MAX, Math.max(TERMINAL_FONT_OFFSET_MIN, Math.round(persisted)));
    });
    const [uiFontPreset, setUiFontPreset] = useState(() => {
        if (typeof window === "undefined") {
            return "inter";
        }
        const persisted = window.localStorage.getItem(UI_FONT_PRESET_STORAGE_KEY);
        return persisted === "manrope" || persisted === "ibm-plex-sans" || persisted === "inter" ? persisted : "inter";
    });
    const [terminalFontPreset, setTerminalFontPreset] = useState(() => {
        if (typeof window === "undefined") {
            return "jetbrains-mono";
        }
        const persisted = window.localStorage.getItem(TERMINAL_FONT_PRESET_STORAGE_KEY);
        return persisted === "ibm-plex-mono" || persisted === "source-code-pro" || persisted === "jetbrains-mono"
            ? persisted
            : "jetbrains-mono";
    });
    const [quickConnectMode, setQuickConnectMode] = useState(() => {
        if (typeof window === "undefined") {
            return "smart";
        }
        const persisted = window.localStorage.getItem(QUICK_CONNECT_MODE_STORAGE_KEY);
        return persisted === "wizard" || persisted === "command" || persisted === "smart" ? persisted : "smart";
    });
    const [quickConnectAutoTrust, setQuickConnectAutoTrust] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return window.localStorage.getItem(QUICK_CONNECT_AUTO_TRUST_STORAGE_KEY) === "true";
    });
    const [splitRatioPreset, setSplitRatioPreset] = useState(() => readSplitRatioPreset());
    const [autoArrangeMode, setAutoArrangeMode] = useState(() => {
        if (typeof window === "undefined") {
            return "c";
        }
        const persisted = window.localStorage.getItem(AUTO_ARRANGE_MODE_STORAGE_KEY);
        return parseStoredAutoArrangeMode(persisted);
    });
    const [layoutMode, setLayoutMode] = useState(() => readLayoutMode());
    const [workspaceOrder, setWorkspaceOrder] = useState([DEFAULT_WORKSPACE_ID]);
    const [workspaceSnapshots, setWorkspaceSnapshots] = useState({
        [DEFAULT_WORKSPACE_ID]: createEmptyWorkspaceSnapshot(DEFAULT_WORKSPACE_ID, "Main"),
    });
    const [activeWorkspaceId, setActiveWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
    const [viewportStacked, setViewportStacked] = useState(() => typeof window === "undefined" ? false : window.matchMedia(MOBILE_STACKED_MEDIA).matches);
    const [mobileShellTab, setMobileShellTab] = useState("terminal");
    const [hoveredHostAlias, setHoveredHostAlias] = useState(null);
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        paneIndex: null,
        splitMode: "duplicate",
    });
    const sidebarDragStartXRef = useRef(0);
    const sidebarDragStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
    const splitNodeRefs = useRef({});
    const settingsModalRef = useRef(null);
    const settingsDragOffsetRef = useRef(null);
    const mobilePagerRef = useRef(null);
    const skipMobilePagerScrollRef = useRef(false);
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
    const quickConnectAutoTrustRef = useRef(false);
    const orphanSeenSessionIdsRef = useRef(new Set());
    const orphanClosingSessionIdsRef = useRef(new Set());
    const lastInternalDragPayloadRef = useRef(null);
    const draggingSessionIdRef = useRef(null);
    const suppressHostClickAliasRef = useRef(null);
    const isApplyingWorkspaceSnapshotRef = useRef(false);
    const isAutoArrangeApplyingRef = useRef(false);
    const lastAutoArrangeBeforeFreeRef = useRef("c");
    const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState(null);
    const [pendingCloseAllIntent, setPendingCloseAllIntent] = useState(null);
    const shouldSplitAsEmpty = (eventLike) => {
        if (!eventLike) {
            return false;
        }
        const modifierKey = eventLike.key === "Alt" ||
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
    const canSave = useMemo(() => currentHost.host.trim().length > 0 && currentHost.hostName.trim().length > 0, [currentHost]);
    const canCreateHost = useMemo(() => newHostDraft.host.trim().length > 0 && newHostDraft.hostName.trim().length > 0, [newHostDraft]);
    const sessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
    const sessionById = useMemo(() => {
        return new Map(sessions.map((session) => [session.id, session]));
    }, [sessions]);
    const paneOrder = useMemo(() => collectPaneOrder(splitTree), [splitTree]);
    const visiblePaneSessionIds = useMemo(() => splitSlots.filter((slot) => Boolean(slot)), [splitSlots]);
    const activeTrustPrompt = useMemo(() => trustPromptQueue[0] ?? null, [trustPromptQueue]);
    const selectedLayoutProfile = useMemo(() => layoutProfiles.find((profile) => profile.id === selectedLayoutProfileId) ?? null, [layoutProfiles, selectedLayoutProfileId]);
    const layoutCommandCenterPreviewTree = useMemo(() => {
        return selectedLayoutProfile?.splitTree ?? null;
    }, [selectedLayoutProfile]);
    const connectedHosts = useMemo(() => {
        return new Set(sessions
            .filter((session) => session.kind === "sshSaved")
            .map((session) => session.hostAlias));
    }, [sessions]);
    const isSidebarOpen = isSidebarVisible;
    const terminalFontSize = useMemo(() => {
        const base = DENSITY_TERMINAL_BASE_FONT[densityProfile];
        const next = base + terminalFontOffset;
        return Math.min(TERMINAL_FONT_MAX, Math.max(TERMINAL_FONT_MIN, next));
    }, [densityProfile, terminalFontOffset]);
    const terminalFontFamily = useMemo(() => TERMINAL_FONT_FAMILY_BY_PRESET[terminalFontPreset], [terminalFontPreset]);
    const splitRatioDefaultValue = SPLIT_RATIO_PRESET_VALUE[splitRatioPreset];
    const workspaceTabs = useMemo(() => workspaceOrder
        .map((workspaceId) => workspaceSnapshots[workspaceId])
        .filter((workspace) => Boolean(workspace)), [workspaceOrder, workspaceSnapshots]);
    const isStackedShell = layoutMode === "compact" || (layoutMode === "auto" && viewportStacked);
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
    const sortedViewProfiles = useMemo(() => [...viewProfiles].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [viewProfiles]);
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
                    switch (sortRule.field) {
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
    const connectedHostRows = useMemo(() => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => row.connected)), [filteredHostRows]);
    const otherHostRows = useMemo(() => sortRowsByFavoriteThenAlias(filteredHostRows.filter((row) => !row.connected)), [filteredHostRows]);
    const sidebarViews = useMemo(() => [
        { id: "builtin:all", label: "Alle" },
        { id: "builtin:favorites", label: "Favoriten" },
        ...sortedViewProfiles.map((profile) => ({
            id: `custom:${profile.id}`,
            label: profile.name,
        })),
    ], [sortedViewProfiles]);
    const highlightedHostAlias = useMemo(() => {
        if (hoveredHostAlias) {
            return hoveredHostAlias;
        }
        const normalized = activeHost.trim();
        return normalized.length > 0 ? normalized : null;
    }, [activeHost, hoveredHostAlias]);
    const highlightedHostPaneIndices = useMemo(() => {
        if (!highlightedHostAlias) {
            return new Set();
        }
        const highlightedSessions = new Set(sessions
            .filter((session) => session.kind === "sshSaved")
            .filter((session) => session.hostAlias === highlightedHostAlias)
            .map((session) => session.id));
        const paneIndices = new Set();
        splitSlots.forEach((slot, paneIndex) => {
            if (slot && highlightedSessions.has(slot)) {
                paneIndices.add(paneIndex);
            }
        });
        return paneIndices;
    }, [highlightedHostAlias, sessions, splitSlots]);
    const hasHighlightedHostTargets = highlightedHostAlias !== null && highlightedHostPaneIndices.size > 0;
    const resolveSessionTitle = useCallback((session) => {
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
    }, [hosts, metadataStore.defaultUser]);
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
    const resolvePaneIdentity = useCallback((paneIndex) => {
        const paneSessionId = splitSlots[paneIndex] ?? null;
        if (!paneSessionId) {
            return "Drop it on me";
        }
        const paneSession = sessionById.get(paneSessionId) ?? null;
        return resolveSessionTitle(paneSession);
    }, [resolveSessionTitle, sessionById, splitSlots]);
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
    useEffect(() => {
        void load().catch((e) => setError(String(e)));
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
            const parsed = JSON.parse(raw);
            const order = Array.isArray(parsed.order) ? parsed.order.filter((entry) => typeof entry === "string") : [];
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
            const normalizedSnapshots = normalizedOrder.reduce((acc, workspaceId) => {
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
            const nextActiveWorkspaceId = typeof parsed.activeWorkspaceId === "string" && normalizedSnapshots[parsed.activeWorkspaceId]
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
        }
        catch {
            // ignore broken persisted workspace data
        }
    }, []);
    const storeUsers = useMemo(() => Object.values(entityStore.users), [entityStore.users]);
    const storeGroups = useMemo(() => Object.values(entityStore.groups), [entityStore.groups]);
    const storeTags = useMemo(() => Object.values(entityStore.tags), [entityStore.tags]);
    const storeKeys = useMemo(() => Object.values(entityStore.keys), [entityStore.keys]);
    const quickConnectUserOptions = useMemo(() => buildQuickConnectUserCandidates(metadataStore.defaultUser, storeUsers.map((entry) => entry.username || entry.name)), [metadataStore.defaultUser, storeUsers]);
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
    const persistEntityStore = useCallback(async (next) => {
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
        const next = {
            ...entityStore,
            users: {
                ...entityStore.users,
                [id]: { id, name: username, username, createdAt: now, updatedAt: now },
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
        const next = {
            ...entityStore,
            groups: {
                ...entityStore.groups,
                [id]: { id, name, memberUserIds: [], createdAt: now, updatedAt: now },
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
        const next = {
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
    const addStorePathKey = useCallback(async () => {
        const name = storePathKeyNameDraft.trim();
        const identityFilePath = storePathKeyPathDraft.trim();
        if (!name || !identityFilePath) {
            return;
        }
        const now = Date.now();
        const id = `key-path-${createId()}`;
        const key = {
            type: "path",
            id,
            name,
            identityFilePath,
            createdAt: now,
            updatedAt: now,
        };
        const next = {
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
        const created = await createEncryptedKey(name, privateKeyPem, storeEncryptedPublicKeyDraft.trim(), storePassphrase.trim() || undefined);
        const next = {
            ...entityStore,
            keys: {
                ...entityStore.keys,
                [created.id]: created,
            },
            updatedAt: Date.now(),
        };
        setStoreEncryptedKeyNameDraft("");
        setStoreEncryptedPrivateKeyDraft("");
        setStoreEncryptedPublicKeyDraft("");
        await persistEntityStore(next);
    }, [
        entityStore,
        persistEntityStore,
        storeEncryptedKeyNameDraft,
        storeEncryptedPrivateKeyDraft,
        storeEncryptedPublicKeyDraft,
        storePassphrase,
    ]);
    const removeStoreKey = useCallback(async (keyId) => {
        await deleteKeyById(keyId);
        const nextKeys = { ...entityStore.keys };
        delete nextKeys[keyId];
        const nextBindings = Object.fromEntries(Object.entries(entityStore.hostBindings).map(([alias, binding]) => [
            alias,
            { ...binding, keyRefs: binding.keyRefs.filter((entry) => entry.keyId !== keyId) },
        ]));
        await persistEntityStore({
            ...entityStore,
            keys: nextKeys,
            hostBindings: nextBindings,
            updatedAt: Date.now(),
        });
    }, [entityStore, persistEntityStore]);
    const unlockStoreKey = useCallback(async (keyId) => {
        await unlockKeyMaterial(keyId, storePassphrase.trim() || undefined);
    }, [storePassphrase]);
    const saveHostBindingDraft = useCallback(async () => {
        const hostAlias = storeSelectedHostForBinding.trim();
        if (!hostAlias) {
            return;
        }
        const nextBindings = {
            ...entityStore.hostBindings,
            [hostAlias]: storeBindingDraft,
        };
        const next = {
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
        let unlisten = null;
        void listen("session-output", (event) => {
            if (!event.payload.host_key_prompt) {
                return;
            }
            const sessionId = event.payload.session_id;
            const session = sessionsRef.current.find((entry) => entry.id === sessionId) ?? null;
            if (session?.kind === "sshQuick" && quickConnectAutoTrustRef.current) {
                void sendInput(sessionId, "yes\n").catch((sendError) => setError(String(sendError)));
                return;
            }
            const trustHostAlias = session?.kind === "sshSaved" ? session.hostAlias : "";
            if (trustHostAlias) {
                const metadata = metadataStoreRef.current.hosts[trustHostAlias] ?? null;
                if (metadata?.trustHostDefault) {
                    void sendInput(sessionId, "yes\n").catch((sendError) => setError(String(sendError)));
                    return;
                }
            }
            const promptHostLabel = session?.kind === "sshSaved"
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
        const assignedSessionIds = new Set([
            ...Object.values(workspaceSnapshots).flatMap((workspace) => workspace.splitSlots),
            ...splitSlots,
        ].filter((slot) => Boolean(slot)));
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
                setWorkspaceSnapshots((prev) => Object.fromEntries(Object.entries(prev).map(([workspaceId, snapshot]) => [
                    workspaceId,
                    {
                        ...snapshot,
                        splitSlots: removeSessionFromSlots(snapshot.splitSlots, sessionId),
                        activeSessionId: snapshot.activeSessionId === sessionId ? "" : snapshot.activeSessionId,
                    },
                ])));
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
            const sameSlots = current.splitSlots.length === splitSlots.length &&
                current.splitSlots.every((slot, index) => slot === splitSlots[index]);
            const sameLayouts = current.paneLayouts.length === paneLayouts.length &&
                current.paneLayouts.every((entry, index) => entry.id === paneLayouts[index]?.id &&
                    entry.width === paneLayouts[index]?.width &&
                    entry.height === paneLayouts[index]?.height);
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
        if (!contextMenu.visible) {
            return;
        }
        const syncSplitModeFromModifier = (event) => {
            setContextMenu((prev) => {
                if (!prev.visible) {
                    return prev;
                }
                const nextMode = shouldSplitAsEmpty(event) ? "empty" : "duplicate";
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
        window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify({
            order: workspaceOrder,
            activeWorkspaceId,
            snapshots: workspaceSnapshots,
        }));
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
        const onPointerMove = (event) => {
            const dragOffset = settingsDragOffsetRef.current;
            const modal = settingsModalRef.current;
            if (!dragOffset || !modal) {
                return;
            }
            const modalWidth = modal.offsetWidth;
            const modalHeight = modal.offsetHeight;
            const nextX = Math.min(Math.max(8, event.clientX - dragOffset.x), Math.max(8, window.innerWidth - modalWidth - 8));
            const nextY = Math.min(Math.max(8, event.clientY - dragOffset.y), Math.max(8, window.innerHeight - modalHeight - 8));
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
    const toggleHostSelection = (host) => {
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
    const selectViewProfileForSettings = (profileId) => {
        setSelectedViewProfileIdInSettings(profileId);
        const profile = viewProfiles.find((entry) => entry.id === profileId);
        if (profile) {
            setViewDraft(profile);
        }
    };
    const createViewRule = () => ({
        id: createId(),
        field: "host",
        operator: "contains",
        value: "",
    });
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
        const nextProfile = {
            ...viewDraft,
            name: normalizedName,
            order: selectedViewProfileIdInSettings.length > 0
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
        }
        catch (e) {
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
        }
        catch (e) {
            setError(String(e));
        }
    };
    const reorderView = async (direction) => {
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
        }
        catch (e) {
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
    const openQuickConnectModal = (paneIndex = null) => {
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
    const handleSettingsHeaderPointerDown = useCallback((event) => {
        if (!isAppSettingsOpen || settingsOpenMode !== "modal") {
            return;
        }
        const target = event.target;
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
    }, [isAppSettingsOpen, settingsOpenMode]);
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
            void touchHostLastUsed(host.host).catch((touchError) => setError(String(touchError)));
            return started.session_id;
        }
        catch (e) {
            setError(String(e));
            return null;
        }
    };
    const placeSessionIntoNewOrFreePane = (sessionId, splitFromPaneIndex) => {
        const firstFreePaneIndex = paneOrder.find((paneIndex) => splitSlots[paneIndex] === null);
        const usedExistingEmptyPane = typeof firstFreePaneIndex === "number" && firstFreePaneIndex >= 0;
        const targetPaneIndex = usedExistingEmptyPane ? firstFreePaneIndex : splitFocusedPane("right", splitFromPaneIndex, "empty");
        setSplitSlots((prev) => assignSessionToPane(prev, targetPaneIndex, sessionId));
        setActivePaneIndex(targetPaneIndex);
        setActiveSession(sessionId);
    };
    const connectToHostInNewPane = async (host) => {
        const splitFromPaneIndex = activePaneIndex;
        const startedSessionId = await connectToHost(host);
        if (!startedSessionId) {
            return;
        }
        placeSessionIntoNewOrFreePane(startedSessionId, splitFromPaneIndex);
    };
    const connectLocalShellInNewPane = async (splitFromPaneIndex) => {
        setError("");
        try {
            const started = await startLocalSession();
            setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
            placeSessionIntoNewOrFreePane(started.session_id, splitFromPaneIndex);
        }
        catch (e) {
            setError(String(e));
        }
    };
    const connectLocalShellInPane = async (paneIndex) => {
        setError("");
        try {
            const started = await startLocalSession();
            setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
            setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, started.session_id));
            setActivePaneIndex(paneIndex);
            setActiveSession(started.session_id);
        }
        catch (e) {
            setError(String(e));
        }
    };
    const applyQuickConnectUser = (user) => {
        setQuickConnectDraft((prev) => ({ ...prev, user }));
    };
    const shiftQuickConnectUserOption = (direction) => {
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
    const buildQuickSshRequestFromDraft = () => {
        const defaultUser = metadataStore.defaultUser.trim();
        let normalizedDraft = {
            ...quickConnectDraft,
            user: quickConnectDraft.user.trim() || defaultUser,
            hostName: quickConnectDraft.hostName.trim(),
            identityFile: quickConnectDraft.identityFile.trim(),
            proxyJump: quickConnectDraft.proxyJump.trim(),
            proxyCommand: quickConnectDraft.proxyCommand.trim(),
        };
        let parsedPort;
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
        }
        else {
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
    const handleQuickConnectUserInputKeyDown = (event) => {
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
            }
            else {
                void connectQuickSshInNewPane();
            }
        }
    };
    const handleQuickConnectModalKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeQuickConnectModal();
        }
    };
    const handleQuickConnectCommandInputKeyDown = (event) => {
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
    const connectQuickSshInNewPane = async () => {
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
            const canAttachToRequestedPane = typeof requestedPaneIndex === "number" &&
                requestedPaneIndex >= 0 &&
                paneOrder.includes(requestedPaneIndex);
            if (canAttachToRequestedPane) {
                setSplitSlots((prev) => assignSessionToPane(prev, requestedPaneIndex, started.session_id));
                setActivePaneIndex(requestedPaneIndex);
                setActiveSession(started.session_id);
            }
            else {
                placeSessionIntoNewOrFreePane(started.session_id, splitFromPaneIndex);
            }
            closeQuickConnectModal();
        }
        catch (e) {
            setError(String(e));
        }
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
    const spawnSessionFromExistingSession = async (sourceSession) => {
        if (sourceSession.kind === "sshSaved") {
            return spawnSessionFromHostAlias(sourceSession.hostAlias);
        }
        if (sourceSession.kind === "local") {
            try {
                const started = await startLocalSession();
                setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: sourceSession.label }]);
                return started.session_id;
            }
            catch (error) {
                setError(String(error));
                return null;
            }
        }
        try {
            const started = await startQuickSshSession(sourceSession.request);
            setSessions((prev) => [...prev, { ...sourceSession, id: started.session_id }]);
            return started.session_id;
        }
        catch (error) {
            setError(String(error));
            return null;
        }
    };
    const setDragPayload = (event, payload) => {
        const serialized = JSON.stringify(payload);
        event.dataTransfer.effectAllowed = payload.type === "session" ? "copyMove" : "copy";
        event.dataTransfer.setData(DND_PAYLOAD_MIME, serialized);
        event.dataTransfer.setData("text/plain", serialized);
        lastInternalDragPayloadRef.current = payload;
    };
    const parseDragPayload = (event) => {
        const customPayload = event.dataTransfer.getData(DND_PAYLOAD_MIME);
        const plainPayload = event.dataTransfer.getData("text/plain");
        const encoded = customPayload || plainPayload;
        if (!encoded) {
            return lastInternalDragPayloadRef.current;
        }
        try {
            const parsed = JSON.parse(encoded);
            const result = parsed.type === "session" && typeof parsed.sessionId === "string" && parsed.sessionId.length > 0
                ? { type: "session", sessionId: parsed.sessionId }
                : parsed.type === "machine" && typeof parsed.hostAlias === "string" && parsed.hostAlias.length > 0
                    ? { type: "machine", hostAlias: parsed.hostAlias }
                    : null;
            return result ?? lastInternalDragPayloadRef.current;
        }
        catch {
            return lastInternalDragPayloadRef.current;
        }
    };
    const resolvePaneDropZone = (clientX, clientY, bounds) => {
        if (!bounds) {
            return "center";
        }
        return resolvePaneDropZoneFromOverlay(clientX, clientY, bounds);
    };
    const handlePaneDrop = async (event, paneIndex) => {
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
        const sourcePaneIndex = payload.type === "session" ? splitSlots.findIndex((slot) => slot === payload.sessionId) : -1;
        const isSamePane = payload.type === "session" && sourcePaneIndex >= 0 && sourcePaneIndex === paneIndex;
        const resolvedDropZone = resolvePaneDropZone(dropClientX, dropClientY, dropBounds);
        if (isSamePane && resolvedDropZone === "center") {
            return;
        }
        const assignSessionToZone = (sessionId, zone, moveExistingSession = false) => {
            const targetPane = zone === "center" ? paneIndex : splitFocusedPane(zone, paneIndex, "empty");
            setActivePaneIndex(targetPane);
            setActiveSession(sessionId);
            setSplitSlots((prev) => {
                const base = moveExistingSession ? removeSessionFromSlots(prev, sessionId) : prev;
                return assignSessionToPane(base, targetPane, sessionId);
            });
        };
        const placeSessionOnPane = (sessionId) => {
            assignSessionToZone(sessionId, resolvedDropZone, false);
        };
        if (payload.type === "session") {
            if (isSamePane) {
                const sourceSession = sessions.find((session) => session.id === payload.sessionId) ?? null;
                if (!sourceSession)
                    return;
                const spawnedSessionId = await spawnSessionFromExistingSession(sourceSession);
                if (!spawnedSessionId)
                    return;
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
                            if (!next)
                                return prev;
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
                        if (!next)
                            return prev;
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
            if (!sourceSession)
                return;
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
            const machineDropZone = targetPaneEmpty ? "center" : resolvedDropZone;
            if (machineDropZone === "center") {
                const oldSessionId = splitSlots[paneIndex] ?? null;
                const existingSession = sessions.find((session) => session.kind === "sshSaved" && session.hostAlias === payload.hostAlias) ?? null;
                if (existingSession) {
                    if (oldSessionId && oldSessionId !== existingSession.id) {
                        await closeSessionById(oldSessionId);
                    }
                    setSplitSlots((prev) => assignSessionToPane(removeSessionFromSlots(prev, existingSession.id), paneIndex, existingSession.id));
                    setActivePaneIndex(paneIndex);
                    setActiveSession(existingSession.id);
                    lastInternalDragPayloadRef.current = null;
                    return;
                }
                if (oldSessionId) {
                    await closeSessionById(oldSessionId);
                }
                const newSessionId = await connectToHost(hostConfig);
                if (newSessionId) {
                    setSplitSlots((prev) => assignSessionToPane(prev, paneIndex, newSessionId));
                    setActivePaneIndex(paneIndex);
                    setActiveSession(newSessionId);
                }
                lastInternalDragPayloadRef.current = null;
                return;
            }
            const existingHostSession = sessions.find((session) => session.kind === "sshSaved" && session.hostAlias === payload.hostAlias) ?? null;
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
    const resolveDropEffect = (event) => {
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
    const nudgeMobilePager = useCallback((delta) => {
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
    const closeSessionById = async (sessionId) => {
        await closeSession(sessionId);
        setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        setActiveSession((prev) => (prev === sessionId ? "" : prev));
        setSplitSlots((prev) => removeSessionFromSlots(prev, sessionId));
        setWorkspaceSnapshots((prev) => Object.fromEntries(Object.entries(prev).map(([workspaceId, snapshot]) => [
            workspaceId,
            {
                ...snapshot,
                splitSlots: removeSessionFromSlots(snapshot.splitSlots, sessionId),
                activeSessionId: snapshot.activeSessionId === sessionId ? "" : snapshot.activeSessionId,
            },
        ])));
        setBroadcastTargets((prev) => {
            const nextSet = new Set(prev);
            nextSet.delete(sessionId);
            return nextSet;
        });
        setTrustPromptQueue((prev) => prev.filter((entry) => entry.sessionId !== sessionId));
    };
    const closeSessionInPane = async (paneIndex) => {
        const paneSessionId = splitSlots[paneIndex] ?? null;
        if (!paneSessionId) {
            setSplitSlots((prev) => clearPaneAtIndex(prev, paneIndex));
            return;
        }
        await closeSessionById(paneSessionId);
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
        setWorkspaceSnapshots((prev) => Object.fromEntries(Object.entries(prev).map(([workspaceId, snapshot]) => [
            workspaceId,
            {
                ...snapshot,
                splitSlots: snapshot.splitSlots.map(() => null),
                activeSessionId: "",
            },
        ])));
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
            const promptSession = sessionsRef.current.find((session) => session.id === activeTrustPrompt.sessionId) ?? null;
            if (saveTrustHostAsDefault && promptSession?.kind === "sshSaved") {
                await upsertHostMetadata(promptSession.hostAlias, (current) => ({
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
    const handleTrustPromptKeyDown = (event) => {
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
        const target = event.target;
        if (target?.closest("button")) {
            return;
        }
        event.preventDefault();
        void acceptTrustPrompt();
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
        if (visiblePaneSessionIds.length === 0) {
            return;
        }
        setBroadcastTargets((prev) => {
            const next = new Set(prev);
            const allVisibleAlreadyTargeted = visiblePaneSessionIds.every((sessionId) => next.has(sessionId));
            if (allVisibleAlreadyTargeted) {
                visiblePaneSessionIds.forEach((sessionId) => next.delete(sessionId));
            }
            else {
                visiblePaneSessionIds.forEach((sessionId) => next.add(sessionId));
            }
            return next;
        });
    };
    const setBroadcastMode = (enabled) => {
        setIsBroadcastModeEnabled(enabled);
        if (!enabled) {
            setBroadcastTargets(new Set());
        }
    };
    const applyWorkspaceSnapshot = useCallback((snapshot) => {
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
    const switchWorkspace = useCallback((workspaceId) => {
        if (workspaceId === activeWorkspaceId) {
            return;
        }
        const currentSnapshot = {
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
    }, [activePaneIndex, activeSession, activeWorkspaceId, applyWorkspaceSnapshot, paneLayouts, splitSlots, splitTree, workspaceSnapshots]);
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
    const removeWorkspace = useCallback((workspaceId) => {
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
    }, [activeWorkspaceId, applyWorkspaceSnapshot, workspaceOrder, workspaceSnapshots]);
    const sendSessionToWorkspace = useCallback((sessionId, targetWorkspaceId) => {
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
        const nextTargetPaneIndex = typeof firstFreePaneIndex === "number"
            ? firstFreePaneIndex
            : Math.max(-1, ...targetPaneOrder) + 1;
        const nextTargetSlots = assignSessionToPane(targetSnapshot.splitSlots, nextTargetPaneIndex, sessionId);
        const nextTargetPaneLayouts = clonePaneLayouts(targetSnapshot.paneLayouts);
        if (!nextTargetPaneLayouts[nextTargetPaneIndex]) {
            nextTargetPaneLayouts[nextTargetPaneIndex] = createPaneLayoutItem();
        }
        const nextTargetSplitTree = typeof firstFreePaneIndex === "number"
            ? cloneSplitTree(targetSnapshot.splitTree)
            : {
                id: `split-workspace-${createId()}`,
                type: "split",
                axis: "vertical",
                ratio: splitRatioDefaultValue,
                first: cloneSplitTree(targetSnapshot.splitTree),
                second: createLeafNode(nextTargetPaneIndex),
            };
        const nextTargetSnapshot = {
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
    }, [activeSession, activeWorkspaceId, paneOrder, splitRatioDefaultValue, splitSlots, workspaceSnapshots]);
    const handleContextAction = async (actionId, paneIndex, options) => {
        setActivePaneIndex(paneIndex);
        const preferredSplitMode = options?.preferredSplitMode ?? "duplicate";
        const splitMode = shouldSplitAsEmpty(options?.eventLike) ? "empty" : preferredSplitMode;
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
        hideSidebarTimeoutRef.current = setTimeout(() => {
            setIsSidebarVisible(false);
            hideSidebarTimeoutRef.current = null;
        }, SIDEBAR_AUTO_HIDE_DELAY_MS);
    };
    const splitFocusedPane = (direction, paneIndex = activePaneIndex, splitMode = "duplicate") => {
        const targetPane = paneOrder.includes(paneIndex) ? paneIndex : (paneOrder[0] ?? 0);
        let sourceSessionId = splitSlots[targetPane] ?? null;
        if (splitMode === "duplicate" && !sourceSessionId) {
            const fallbackSessionId = splitSlots[activePaneIndex] ??
                paneOrder.map((pi) => splitSlots[pi]).find((sid) => Boolean(sid)) ??
                splitSlots.find((sid) => Boolean(sid)) ??
                sessions[0]?.id ??
                null;
            sourceSessionId = fallbackSessionId;
        }
        const newPaneIndex = nextPaneIndexRef.current;
        nextPaneIndexRef.current += 1;
        const splitId = `split-${nextSplitIdRef.current}`;
        nextSplitIdRef.current += 1;
        const optimisticDuplicateSessionId = splitMode === "duplicate" && sourceSessionId ? sourceSessionId : null;
        setSplitSlots((prev) => {
            const next = ensurePaneIndex(prev, newPaneIndex);
            if (optimisticDuplicateSessionId != null) {
                next[newPaneIndex] = optimisticDuplicateSessionId;
            }
            else if (next[newPaneIndex] === undefined) {
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
            }
            else if (direction === "right") {
                splitNode = {
                    id: splitId,
                    type: "split",
                    axis: "horizontal",
                    ratio: splitRatioDefaultValue,
                    first: leaf,
                    second: insertedLeaf,
                };
            }
            else if (direction === "top") {
                splitNode = {
                    id: splitId,
                    type: "split",
                    axis: "vertical",
                    ratio: splitRatioDefaultValue,
                    first: insertedLeaf,
                    second: leaf,
                };
            }
            else {
                splitNode = {
                    id: splitId,
                    type: "split",
                    axis: "vertical",
                    ratio: splitRatioDefaultValue,
                    first: leaf,
                    second: insertedLeaf,
                };
            }
            return splitNode;
        }));
        setActivePaneIndex(newPaneIndex);
        if (splitMode === "duplicate" && sourceSessionId) {
            const sourceSession = sessions.find((session) => session.id === sourceSessionId) ?? null;
            if (!sourceSession) {
                setSplitSlots((prev) => clearPaneAtIndex(prev, newPaneIndex));
            }
            else {
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
                        sessionKind: "sshSaved",
                    };
                }
                if (paneSession.kind === "local") {
                    return {
                        width: pane.width,
                        height: pane.height,
                        hostAlias: null,
                        sessionKind: "local",
                    };
                }
                return {
                    width: pane.width,
                    height: pane.height,
                    hostAlias: null,
                    sessionKind: "sshQuick",
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
        const mappedSlots = [];
        const mappedLayouts = [];
        const consumedSessionIds = new Set();
        for (let index = 0; index < selectedLayoutProfile.panes.length; index += 1) {
            const pane = selectedLayoutProfile.panes[index];
            const paneIndex = profilePaneOrder[index] ?? index;
            let sessionId = null;
            if (selectedLayoutProfile.withHosts) {
                const restoreKind = pane.sessionKind ?? (pane.hostAlias ? "sshSaved" : null);
                if (restoreKind === "sshSaved" && pane.hostAlias) {
                    const existingSession = sessions.find((session) => session.kind === "sshSaved" &&
                        session.hostAlias === pane.hostAlias &&
                        !consumedSessionIds.has(session.id));
                    if (existingSession) {
                        sessionId = existingSession.id;
                    }
                    else if (hosts.some((host) => host.host === pane.hostAlias)) {
                        const hostConfig = hosts.find((host) => host.host === pane.hostAlias) ?? null;
                        if (hostConfig) {
                            sessionId = await connectToHost(hostConfig);
                        }
                    }
                }
                else if (restoreKind === "local") {
                    try {
                        const started = await startLocalSession();
                        setSessions((prev) => [...prev, { id: started.session_id, kind: "local", label: "Local terminal" }]);
                        sessionId = started.session_id;
                    }
                    catch (e) {
                        setError(String(e));
                        sessionId = null;
                    }
                }
                else if (restoreKind === "sshQuick" && pane.quickSsh && pane.quickSsh.hostName.trim().length > 0) {
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
                    }
                    catch (e) {
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
        const normalizedLayouts = Array.from({ length: maxPaneIndex + 1 }, (_, paneIndex) => mappedLayouts[paneIndex] ?? createPaneLayoutItem());
        pendingProfileLoadSessionIdsRef.current = new Set(normalizedSlots.filter((slot) => Boolean(slot)));
        setSplitTree(nextTree);
        setSplitSlots(normalizedSlots);
        setPaneLayouts(normalizedLayouts);
        setActivePaneIndex(nextPaneOrder[0] ?? 0);
        nextPaneIndexRef.current = maxPaneIndex + 1;
        nextSplitIdRef.current = Math.max(1, nextPaneOrder.length);
    };
    const applyLayoutPresetTree = (serialized) => {
        const parsed = parseSplitTree(serialized);
        if (!parsed) {
            return;
        }
        const nextPaneOrder = collectPaneOrder(parsed);
        const maxPaneIndex = Math.max(0, ...nextPaneOrder);
        const newSlots = Array.from({ length: maxPaneIndex + 1 }, () => null);
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
    const renderSplitNode = (node) => {
        if (node.type === "leaf") {
            const paneIndex = node.paneIndex;
            const paneSessionId = splitSlots[paneIndex] ?? null;
            const paneIdentity = resolvePaneIdentity(paneIndex);
            const isHoverTarget = highlightedHostPaneIndices.has(paneIndex);
            const isHoverDimmed = hasHighlightedHostTargets && !isHoverTarget;
            const isDropOverlayVisible = (draggingKind === "machine" || draggingKind === "session") &&
                dragOverPaneIndex === paneIndex &&
                activeDropZonePaneIndex === paneIndex;
            const isSelfPaneDrop = draggingKind === "session" &&
                draggingSessionIdRef.current != null &&
                splitSlots.findIndex((s) => s === draggingSessionIdRef.current) === paneIndex;
            const hasPaneSession = Boolean(paneSessionId);
            const canClosePane = paneOrder.length > 1;
            const isPaneBroadcastTarget = paneSessionId ? broadcastTargets.has(paneSessionId) : false;
            const isToolbarExpanded = expandedPaneToolbarIndices.has(paneIndex);
            const allVisibleAlreadyTargeted = isBroadcastModeEnabled &&
                visiblePaneSessionIds.length > 0 &&
                visiblePaneSessionIds.every((sessionId) => broadcastTargets.has(sessionId));
            return (_jsxs("div", { "data-pane-index": paneIndex, className: `split-pane ${activePaneIndex === paneIndex ? "is-focused" : ""} ${dragOverPaneIndex === paneIndex ? "is-drag-over" : ""} ${paneSessionId ? "is-connected" : "is-empty"} ${isHoverTarget ? "is-host-hover-target" : ""} ${isHoverDimmed ? "is-host-hover-dimmed" : ""} ${highlightedHostAlias ? "is-host-hovering" : ""}`, draggable: false, onClick: () => {
                    setActivePaneIndex(paneIndex);
                    if (paneSessionId) {
                        setActiveSession(paneSessionId);
                        requestTerminalFocus(paneSessionId);
                    }
                }, onDragOverCapture: (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = resolveDropEffect(event);
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setDragOverPaneIndex(paneIndex);
                    setActiveDropZonePaneIndex(paneIndex);
                    const emptyForHostOverlay = draggingKind === "machine" && !paneSessionId;
                    setActiveDropZone(emptyForHostOverlay ? "center" : resolvePaneDropZone(event.clientX, event.clientY, bounds));
                }, onDragEnterCapture: (event) => {
                    event.preventDefault();
                    setDragOverPaneIndex(paneIndex);
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setActiveDropZonePaneIndex(paneIndex);
                    const emptyForHostOverlay = draggingKind === "machine" && !paneSessionId;
                    setActiveDropZone(emptyForHostOverlay ? "center" : resolvePaneDropZone(event.clientX, event.clientY, bounds));
                }, onDragLeave: (event) => {
                    if (event.currentTarget.contains(event.relatedTarget)) {
                        return;
                    }
                    setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
                    setActiveDropZonePaneIndex((prev) => (prev === paneIndex ? null : prev));
                    setActiveDropZone(null);
                }, onDropCapture: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handlePaneDrop(event, paneIndex);
                }, onContextMenu: (event) => {
                    event.preventDefault();
                    const initialSplitMode = shouldSplitAsEmpty(event) ? "empty" : "duplicate";
                    setContextMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        paneIndex,
                        splitMode: initialSplitMode,
                    });
                }, children: [isDropOverlayVisible && draggingKind === "machine" && !hasPaneSession && (_jsx("div", { className: "pane-drop-zones pane-drop-zones-host-empty", "aria-hidden": "true", children: _jsx("span", { className: "pane-drop-host-empty-label", children: "Drop to open here" }) })), isDropOverlayVisible && !(draggingKind === "machine" && !hasPaneSession) && (_jsxs("div", { className: "pane-drop-zones", "aria-hidden": "true", children: [_jsx("div", { className: `pane-drop-zone pane-drop-zone-top ${activeDropZone === "top" ? "is-active" : ""}`, children: "Top" }), _jsx("div", { className: `pane-drop-zone pane-drop-zone-left ${activeDropZone === "left" ? "is-active" : ""}`, children: "Left" }), _jsx("div", { className: `pane-drop-zone pane-drop-zone-center ${activeDropZone === "center" ? "is-active" : ""}`, children: draggingKind === "machine"
                                    ? "Replace"
                                    : isSelfPaneDrop
                                        ? "–"
                                        : "Swap" }), _jsx("div", { className: `pane-drop-zone pane-drop-zone-right ${activeDropZone === "right" ? "is-active" : ""}`, children: "Right" }), _jsx("div", { className: `pane-drop-zone pane-drop-zone-bottom ${activeDropZone === "bottom" ? "is-active" : ""}`, children: "Bottom" })] })), _jsxs("div", { className: `split-pane-label ${activePaneIndex === paneIndex ? "is-active" : ""} ${isToolbarExpanded ? "is-toolbar-expanded" : ""}`, draggable: Boolean(paneSessionId), onDragStart: (event) => {
                            if (!paneSessionId) {
                                return;
                            }
                            draggingSessionIdRef.current = paneSessionId;
                            setDragPayload(event, { type: "session", sessionId: paneSessionId });
                            setDraggingKind("session");
                            missingDragPayloadLoggedRef.current = false;
                        }, onDragEnd: () => {
                            draggingSessionIdRef.current = null;
                            setDraggingKind(null);
                            setDragOverPaneIndex(null);
                            setActiveDropZonePaneIndex(null);
                            setActiveDropZone(null);
                            missingDragPayloadLoggedRef.current = false;
                        }, children: [_jsxs("div", { className: "split-pane-toolbar-group split-pane-toolbar-group-nav", children: [_jsx("span", { className: "split-pane-label-title", title: paneIdentity, children: paneIdentity }), _jsx("button", { className: `btn action-icon-btn pane-toolbar-btn pane-toolbar-expand-toggle ${isToolbarExpanded ? "is-expanded" : ""}`, title: isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions", "aria-label": isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions", "aria-pressed": isToolbarExpanded, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            setExpandedPaneToolbarIndices((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(paneIndex)) {
                                                    next.delete(paneIndex);
                                                }
                                                else {
                                                    next.add(paneIndex);
                                                }
                                                return next;
                                            });
                                        }, children: _jsx("span", { "aria-hidden": "true", children: isToolbarExpanded ? "▾" : "▸" }) })] }), _jsxs("div", { className: "split-pane-toolbar-group split-pane-toolbar-group-layout", children: [_jsx("button", { className: "btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split", title: "Split pane left", "aria-label": `Split pane ${paneIndex + 1} left`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.left", paneIndex, { eventLike: event });
                                        }, children: _jsx("span", { className: "split-icon split-icon-vertical split-icon-vertical-normal", "aria-hidden": "true" }) }), _jsx("button", { className: "btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split", title: "Split pane right", "aria-label": `Split pane ${paneIndex + 1} right`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.right", paneIndex, { eventLike: event });
                                        }, children: _jsx("span", { className: "split-icon split-icon-vertical split-icon-vertical-inverse", "aria-hidden": "true" }) }), _jsx("button", { className: "btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split", title: "Split pane top", "aria-label": `Split pane ${paneIndex + 1} top`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.top", paneIndex, { eventLike: event });
                                        }, children: _jsx("span", { className: "split-icon split-icon-horizontal split-icon-horizontal-normal", "aria-hidden": "true" }) }), _jsx("button", { className: "btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split", title: "Split pane bottom", "aria-label": `Split pane ${paneIndex + 1} bottom`, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("layout.split.bottom", paneIndex, { eventLike: event });
                                        }, children: _jsx("span", { className: "split-icon split-icon-horizontal split-icon-horizontal-inverse", "aria-hidden": "true" }) })] }), _jsx("span", { className: "pane-toolbar-separator", "aria-hidden": "true" }), _jsxs("div", { className: "split-pane-toolbar-group split-pane-toolbar-group-broadcast", children: [_jsx("button", { className: `btn action-icon-btn pane-toolbar-btn ${isBroadcastModeEnabled ? "is-broadcast-active" : ""}`, title: isBroadcastModeEnabled
                                            ? "Broadcast enabled — click to turn off"
                                            : "Broadcast disabled — click to send keyboard to multiple panes", "aria-label": isBroadcastModeEnabled ? "Turn off broadcast to multiple panes" : "Turn on broadcast to multiple panes", onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            setBroadcastMode(!isBroadcastModeEnabled);
                                        }, children: _jsxs("svg", { className: "pane-toolbar-svg pane-toolbar-svg-broadcast", viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "2.2" }), _jsx("path", { d: "M8.6 8.8a4.8 4.8 0 0 0 0 6.4" }), _jsx("path", { d: "M15.4 8.8a4.8 4.8 0 0 1 0 6.4" }), _jsx("path", { d: "M6.2 6.3a8.3 8.3 0 0 0 0 11.4" }), _jsx("path", { d: "M17.8 6.3a8.3 8.3 0 0 1 0 11.4" })] }) }), _jsx("button", { className: `btn action-icon-btn pane-toolbar-btn ${isBroadcastModeEnabled && isPaneBroadcastTarget ? "is-broadcast-active" : ""}`, title: "Toggle pane target", "aria-label": `Toggle pane ${paneIndex + 1} broadcast target`, disabled: !isBroadcastModeEnabled || !hasPaneSession, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("broadcast.togglePaneTarget", paneIndex);
                                        }, children: _jsxs("svg", { className: "pane-toolbar-svg pane-toolbar-svg-target", viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "6.4" }), _jsx("circle", { cx: "12", cy: "12", r: "2.3" })] }) }), _jsx("button", { className: `btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-broadcast-all ${allVisibleAlreadyTargeted ? "is-broadcast-active" : ""}`, title: "Target all visible panes", "aria-label": "Target all visible panes", disabled: !isBroadcastModeEnabled, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("broadcast.selectAllVisible", paneIndex);
                                        }, children: _jsxs("svg", { className: "pane-toolbar-svg pane-toolbar-svg-all", viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("circle", { cx: "6.2", cy: "12.4", r: "2.1" }), _jsx("circle", { cx: "12", cy: "7.1", r: "2.1" }), _jsx("circle", { cx: "17.8", cy: "12.4", r: "2.1" }), _jsx("path", { d: "M8 11.1l2.3-2.2M13.7 8.9l2.3 2.2M8.3 13.6h7.4" })] }) })] }), _jsx("span", { className: "pane-toolbar-separator", "aria-hidden": "true" }), _jsxs("div", { className: "split-pane-toolbar-group split-pane-toolbar-group-close", children: [_jsx("button", { className: "btn action-icon-btn pane-toolbar-btn", title: "Close session in pane", "aria-label": `Close session in pane ${paneIndex + 1}`, disabled: !hasPaneSession, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("pane.clear", paneIndex);
                                        }, children: _jsxs("svg", { className: "pane-toolbar-svg pane-toolbar-svg-close-session", viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("rect", { x: "5.2", y: "6.2", width: "13.6", height: "11.6", rx: "2.2" }), _jsx("path", { d: "M9.5 10l5 5M14.5 10l-5 5" })] }) }), _jsx("button", { className: "btn action-icon-btn action-icon-btn-danger pane-toolbar-btn", title: "Close pane and session", "aria-label": `Close pane ${paneIndex + 1} and its session`, disabled: !canClosePane, onPointerDown: (event) => event.stopPropagation(), onClick: (event) => {
                                            event.stopPropagation();
                                            void handleContextAction("pane.close", paneIndex);
                                        }, children: _jsx("svg", { className: "pane-toolbar-svg pane-toolbar-svg-close-pane", viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M7.6 7.6l8.8 8.8M16.4 7.6l-8.8 8.8" }) }) })] })] }), paneSessionId ? (_jsx(TerminalPane, { sessionId: paneSessionId, onUserInput: handleTerminalInput, fontSize: terminalFontSize, fontFamily: terminalFontFamily })) : (_jsxs("div", { className: "empty-pane split-empty-pane", children: [_jsx("p", { className: "split-empty-pane-copy", children: "One click and we both get what we want" }), _jsx("button", { type: "button", className: "split-empty-pane-logo-btn", title: "Open local terminal in this pane", onClick: (event) => {
                                    event.stopPropagation();
                                    void connectLocalShellInPane(paneIndex);
                                }, children: _jsx("img", { src: logoTransparent, alt: "Open local terminal in this pane", className: "split-empty-pane-image" }) }), _jsx("p", { className: "split-empty-pane-copy split-empty-pane-copy-secondary", children: "Or drop that host right here - I'm waiting" })] }))] }, `pane-${paneIndex}`));
        }
        const firstRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, node.ratio));
        const secondRatio = 1 - firstRatio;
        const dividerClass = node.axis === "horizontal" ? "split-node-divider vertical" : "split-node-divider horizontal";
        return (_jsxs("div", { className: `split-node split-node-${node.axis}`, ref: (element) => {
                splitNodeRefs.current[node.id] = element;
            }, children: [_jsx("div", { className: "split-node-child", style: { flexBasis: `${firstRatio * 100}%` }, children: renderSplitNode(node.first) }), _jsx("div", { className: dividerClass, role: "separator", "aria-orientation": node.axis === "horizontal" ? "vertical" : "horizontal", onPointerDown: startSplitResize(node.id, node.axis) }), _jsx("div", { className: "split-node-child", style: { flexBasis: `${secondRatio * 100}%` }, children: renderSplitNode(node.second) })] }, node.id));
    };
    const renderHostRow = (row, key) => (_jsxs("div", { className: "host-row", children: [_jsxs("div", { className: `host-item-shell ${row.connected ? "is-connected" : "is-disconnected"} ${activeHost === row.host.host ? "is-active" : ""} ${openHostMenuHostAlias === row.host.host ? "is-menu-open" : ""}`, children: [_jsx("button", { className: `host-favorite-btn host-favorite-btn-inline host-favorite-in-shell ${row.metadata.favorite ? "is-active" : ""}`, "aria-label": `Toggle favorite for ${row.host.host}`, onClick: (event) => {
                            event.stopPropagation();
                            void toggleFavoriteForHost(row.host.host);
                        }, children: "\u2605" }), _jsxs("div", { role: "button", tabIndex: 0, "aria-label": `SSH host ${row.host.host}`, className: "host-item", onClick: () => {
                            if (suppressHostClickAliasRef.current) {
                                const suppressedAlias = suppressHostClickAliasRef.current;
                                suppressHostClickAliasRef.current = null;
                                if (suppressedAlias === row.host.host) {
                                    return;
                                }
                            }
                            toggleHostSelection(row.host);
                        }, onMouseEnter: () => {
                            // Nur Hover-Verhalten für verbundene Hosts aktivieren, um Flackern zu vermeiden
                            if (row.connected) {
                                setHoveredHostAlias(row.host.host);
                            }
                        }, onMouseLeave: () => {
                            if (row.connected) {
                                setHoveredHostAlias((prev) => (prev === row.host.host ? null : prev));
                            }
                        }, onDoubleClick: () => {
                            void connectToHostInNewPane(row.host);
                        }, onKeyDown: (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                if (activeHost !== row.host.host) {
                                    setActiveHost(row.host.host);
                                }
                                void connectToHostInNewPane(row.host);
                            }
                        }, draggable: true, onDragStart: (event) => {
                            suppressHostClickAliasRef.current = row.host.host;
                            setDragPayload(event, { type: "machine", hostAlias: row.host.host });
                            setDraggingKind("machine");
                            missingDragPayloadLoggedRef.current = false;
                        }, onDragEnd: () => {
                            setDraggingKind(null);
                            setDragOverPaneIndex(null);
                            missingDragPayloadLoggedRef.current = false;
                        }, children: [_jsx("span", { className: "host-item-main", children: row.host.host }), _jsx("span", { className: "host-user-badge", children: row.displayUser })] }), _jsx("div", { className: "host-row-actions", children: _jsx("button", { className: `host-settings-inline-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, "aria-label": `Open host settings for ${row.host.host}`, title: `Open host settings for ${row.host.host}`, onClick: (event) => {
                                event.stopPropagation();
                                toggleHostMenu(row.host);
                            }, children: "\u22EE" }) })] }), _jsx("div", { className: `host-slide-menu ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`, children: openHostMenuHostAlias === row.host.host && (_jsxs("div", { className: "host-slide-content", children: [_jsx(HostForm, { host: currentHost, onChange: setCurrentHost }), _jsxs("div", { className: "host-meta-edit", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Tags (comma separated)" }), _jsx("input", { className: "input", value: tagDraft, onChange: (event) => setTagDraft(event.target.value), placeholder: "prod, home, lab" })] }), _jsxs("label", { className: "field checkbox-field", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: activeHostMetadata.favorite, onChange: () => void toggleFavoriteForHost(activeHost) }), _jsx("span", { className: "field-label", children: "Favorite" })] })] }), _jsxs("div", { className: "action-row host-slide-actions", children: [_jsx("button", { className: "btn icon-btn", "aria-label": "Save tags", title: "Save tags", onClick: () => {
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
    const contextMenuPaneSessionId = contextMenu.paneIndex !== null && contextMenu.paneIndex >= 0 ? (splitSlots[contextMenu.paneIndex] ?? null) : null;
    const workspaceSendTargets = contextMenuPaneSessionId && workspaceTabs.length > 1
        ? workspaceTabs.filter((workspace) => workspace.id !== activeWorkspaceId)
        : [];
    return (_jsxs("main", { className: `app-shell ${isSidebarResizing ? "is-resizing" : ""} ${isSidebarOpen ? "is-sidebar-open" : "is-sidebar-hidden"} ${isSidebarPinned ? "is-sidebar-pinned" : "is-sidebar-unpinned"}${layoutMode === "wide" ? " app-shell--layout-wide" : ""}${layoutMode === "compact" ? " app-shell--layout-compact" : ""}${isStackedShell ? " app-shell--stacked-mobile" : ""}${isStackedShell && mobileShellTab === "hosts" ? " app-shell--mobile-panel-hosts" : ""}${isStackedShell && mobileShellTab === "terminal" ? " app-shell--mobile-panel-terminal" : ""}`, "data-density": densityProfile, "data-list-tone": listTonePreset, "data-frame-mode": frameModePreset, "data-ui-font": uiFontPreset, style: appShellStyle, children: [_jsx("button", { type: "button", className: `left-rail-edge-handle ${isSidebarPinned ? "is-pinned" : "is-unpinned"}`, "aria-label": isSidebarPinned ? "Unpin sidebar (auto-hide enabled)" : "Pin sidebar (always visible)", title: isSidebarPinned ? "Pinned sidebar - click to enable auto-hide" : "Auto-hide sidebar - click to pin", onMouseEnter: revealSidebar, onMouseLeave: maybeHideSidebar, onClick: toggleSidebarPinned, children: isSidebarPinned ? "◧" : "◨" }), _jsxs("aside", { className: `left-rail panel ${isSidebarOpen ? "is-visible" : "is-hidden"} ${isSidebarPinned ? "is-pinned" : "is-unpinned"}`, onMouseEnter: revealSidebar, onMouseLeave: maybeHideSidebar, children: [_jsxs("header", { className: "brand", children: [_jsx("div", { className: "brand-logo-card", children: _jsx("img", { src: logoTextTransparent, alt: "NoSuckShell logo", className: "brand-logo" }) }), _jsxs("div", { className: "brand-utility-stack", children: [_jsxs("div", { className: "brand-utility-row", children: [_jsx("button", { className: `btn sidebar-pin-btn sidebar-header-icon-btn mono-header-btn ${isSidebarPinned ? "is-active" : ""}`, "aria-pressed": isSidebarPinned, "aria-label": isSidebarPinned ? "Unpin sidebar (auto-hide enabled)" : "Pin sidebar (always visible)", title: isSidebarPinned ? "Pinned sidebar - click to enable auto-hide" : "Auto-hide sidebar - click to pin", onClick: toggleSidebarPinned, children: _jsx("svg", { className: `header-icon-svg pin-icon-svg ${isSidebarPinned ? "is-active" : ""}`, viewBox: "0 0 24 24", "aria-hidden": "true", children: isSidebarPinned ? (_jsxs(_Fragment, { children: [_jsx("path", { d: "M5 4.5h14l-2 6.2 3.8 3.8H3.2l3.8-3.8L5 4.5Z" }), _jsx("path", { d: "M12 14.4v7.1" })] })) : (_jsxs(_Fragment, { children: [_jsx("path", { d: "M5 4.5h14l-2 6.2 3.8 3.8H3.2l3.8-3.8L5 4.5Z" }), _jsx("path", { d: "M12 14.4v7.1" }), _jsx("path", { d: "M4.3 4.3l15.4 15.4" })] })) }) }), _jsx("button", { className: "app-gear-btn sidebar-header-icon-btn mono-header-btn", "aria-label": "Open app settings", title: "Open app settings", onClick: () => setIsAppSettingsOpen((prev) => !prev), children: _jsxs("svg", { className: "header-icon-svg settings-icon-svg", viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "3.2" }), _jsx("path", { d: "M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" })] }) })] }), _jsxs("div", { className: "quick-add-wrap brand-quick-add-wrap brand-primary-add-wrap", ref: quickAddMenuRef, children: [_jsx("button", { className: "btn host-plus-btn", "aria-label": "Open add menu", title: "Add host", onClick: () => setIsQuickAddMenuOpen((prev) => !prev), children: _jsx("svg", { className: "add-icon-svg", viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M12 6v12M6 12h12" }) }) }), isQuickAddMenuOpen && (_jsxs("div", { className: "quick-add-menu", role: "menu", children: [_jsx("button", { className: "quick-add-menu-item", onClick: () => void connectLocalShellInNewPane(activePaneIndex), children: "New local terminal" }), _jsx("button", { className: "quick-add-menu-item", onClick: () => openQuickConnectModal(), children: "Quick connect terminal" }), _jsx("button", { className: "quick-add-menu-item", onClick: openAddHostModal, children: "Add host" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add group" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add user" }), _jsx("button", { className: "quick-add-menu-item", disabled: true, children: "Add key" })] }))] })] })] }), _jsxs("section", { className: "host-filter-card", children: [_jsx("div", { className: "sidebar-view-tabs", role: "tablist", "aria-label": "Sidebar views", children: sidebarViews.map((view) => (_jsx("button", { className: `tab-pill sidebar-view-tab ${selectedSidebarViewId === view.id ? "is-active" : ""}`, role: "tab", "aria-selected": selectedSidebarViewId === view.id, onClick: () => setSelectedSidebarViewId(view.id), title: view.label, children: view.label }, view.id))) }), _jsxs("div", { className: "filter-head-row", children: [_jsx("input", { className: "input host-search-input", value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: "Search alias, hostname, user" }), _jsxs("button", { className: `btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`, onClick: () => setShowAdvancedFilters((prev) => !prev), "aria-expanded": showAdvancedFilters, "aria-controls": "advanced-host-filters", children: ["Filters ", showAdvancedFilters ? "−" : "+"] }), _jsx("span", { className: "pill-muted", children: filteredHostRows.length })] }), _jsxs("div", { id: "advanced-host-filters", className: `advanced-filters ${showAdvancedFilters ? "is-open" : ""}`, children: [_jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All status" }), _jsx("option", { value: "connected", children: "Connected" }), _jsx("option", { value: "disconnected", children: "Disconnected" })] }), _jsx("input", { className: "input", type: "number", value: portFilter, onChange: (event) => setPortFilter(event.target.value), placeholder: "Port" })] }), _jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: selectedTagFilter, onChange: (event) => setSelectedTagFilter(event.target.value), children: [_jsx("option", { value: "all", children: "All tags" }), availableTags.map((tag) => (_jsx("option", { value: tag, children: tag }, tag)))] }), _jsx("button", { className: `btn ${favoritesOnly ? "btn-primary" : ""}`, onClick: () => setFavoritesOnly((prev) => !prev), children: "Favorites" })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { className: `btn ${recentOnly ? "btn-primary" : ""}`, onClick: () => setRecentOnly((prev) => !prev), children: "Recent" }), _jsx("button", { className: "btn", onClick: clearFilters, children: "Reset filters" })] })] })] }), _jsx("div", { className: "host-list", children: filteredHostRows.length === 0 ? (_jsxs("div", { className: "empty-pane", children: [_jsx("p", { children: "No hosts match the active filters." }), _jsx("span", { children: "Adjust or reset filters to show hosts." })] })) : (_jsxs(_Fragment, { children: [connectedHostRows.length > 0 && (_jsxs("div", { className: "host-list-top", children: [_jsx("p", { className: "host-list-section-title", children: "Connected" }), connectedHostRows.map((row, index) => renderHostRow(row, `connected-${row.host.host}-${row.host.port}-${index}`))] })), _jsx("div", { className: "host-list-scroll", children: otherHostRows.map((row, index) => renderHostRow(row, `other-${row.host.host}-${row.host.port}-${index}`)) })] })) })] }), _jsx("div", { className: `sidebar-resize-handle ${isSidebarOpen ? "" : "is-hidden"}`, role: "separator", "aria-orientation": "vertical", "aria-label": "Resize host sidebar", onPointerDown: startSidebarResize }), _jsxs("section", { className: "right-dock panel", children: [_jsxs("div", { className: "workspace-tabs", role: "tablist", "aria-label": "Terminal workspaces", children: [workspaceTabs.map((workspace) => (_jsx("button", { type: "button", role: "tab", "aria-selected": workspace.id === activeWorkspaceId, className: `btn workspace-tab ${workspace.id === activeWorkspaceId ? "is-active" : ""}`, onClick: () => switchWorkspace(workspace.id), onDragOver: (event) => {
                                    const payload = parseDragPayload(event);
                                    const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
                                    if (shouldReject) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }, onDrop: (event) => {
                                    const payload = parseDragPayload(event);
                                    const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
                                    if (shouldReject) {
                                        return;
                                    }
                                    event.preventDefault();
                                    sendSessionToWorkspace(payload.sessionId, workspace.id);
                                }, children: workspace.name }, workspace.id))), _jsx("button", { type: "button", className: "btn workspace-tab workspace-tab-add", onClick: createWorkspace, children: "+ Workspace" }), workspaceTabs.length > 1 && (_jsx("button", { type: "button", className: "btn workspace-tab workspace-tab-danger", onClick: () => removeWorkspace(activeWorkspaceId), children: "Remove current" }))] }), _jsx("div", { className: "sessions-workspace", children: _jsxs("div", { className: "sessions-zone", children: [_jsx("div", { className: "session-pane-canvas", children: _jsx("div", { className: `terminal-grid ${splitResizeState ? `is-pane-resizing is-pane-resizing-${splitResizeState.axis}` : ""}${isStackedShell && mobileShellTab === "terminal" ? " is-mobile-terminal-pager" : ""}`, children: isStackedShell && mobileShellTab === "terminal" ? (_jsxs("div", { className: "mobile-terminal-pager", children: [paneOrder.length > 1 ? (_jsxs("div", { className: "mobile-terminal-pager-controls", role: "toolbar", "aria-label": "Terminal pager", children: [_jsx("button", { type: "button", className: "btn mobile-terminal-pager-nav", onClick: () => nudgeMobilePager(-1), "aria-label": "Previous terminal", children: "\u2039" }), _jsx("span", { className: "mobile-terminal-pager-status", "aria-live": "polite", children: (() => {
                                                                const pos = paneOrder.indexOf(activePaneIndex);
                                                                return `${pos >= 0 ? pos + 1 : 1} / ${paneOrder.length}`;
                                                            })() }), _jsx("button", { type: "button", className: "btn mobile-terminal-pager-nav", onClick: () => nudgeMobilePager(1), "aria-label": "Next terminal", children: "\u203A" })] })) : null, _jsx("div", { ref: mobilePagerRef, className: "mobile-terminal-pager-viewport", onScroll: handleMobilePagerScroll, children: paneOrder.map((paneIndex) => (_jsx("div", { className: "mobile-terminal-slide", children: renderSplitNode(createLeafNode(paneIndex)) }, paneIndex))) })] })) : (renderSplitNode(splitTree)) }) }), _jsx("div", { className: "sessions-footer", role: "status", children: _jsx("div", { className: "sessions-footer-meta", children: _jsxs("div", { className: "footer-layout-controls", children: [_jsx("button", { type: "button", className: "btn btn-primary footer-layout-command-btn", onClick: () => setIsLayoutCommandCenterOpen(true), "aria-label": "Open layout command center", title: "Layouts, templates, session cleanup", children: "Layouts" }), _jsx("div", { className: "sessions-footer-status", children: _jsxs("span", { className: `context-pill footer-broadcast-pill ${isBroadcastModeEnabled ? "is-active" : ""}`, children: ["Broadcast: ", isBroadcastModeEnabled ? "enabled" : "disabled", " (", broadcastTargets.size, " targets)"] }) })] }) }) })] }) })] }), isAppSettingsOpen && (_jsx("div", { className: `app-settings-overlay ${settingsOpenMode === "docked" ? "is-docked" : ""}`, onClick: settingsOpenMode === "modal" ? () => setIsAppSettingsOpen(false) : undefined, children: _jsxs("section", { ref: (node) => {
                        settingsModalRef.current = node;
                    }, className: `app-settings-modal panel ${settingsOpenMode === "docked" ? "app-settings-modal-docked" : ""}${isSettingsDragging ? " is-dragging" : ""}`, style: settingsOpenMode === "modal" && settingsModalPosition
                        ? { left: `${settingsModalPosition.x}px`, top: `${settingsModalPosition.y}px` }
                        : undefined, onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: `panel-header app-settings-header ${settingsOpenMode === "modal" ? "is-draggable" : ""}`, onPointerDown: handleSettingsHeaderPointerDown, children: [_jsx("h2", { children: "App settings" }), _jsxs("div", { className: "app-settings-header-actions", children: [_jsxs("div", { className: "app-settings-mode-switch", role: "group", "aria-label": "Settings display mode", children: [_jsx("button", { className: `btn ${settingsOpenMode === "modal" ? "btn-primary" : ""}`, onClick: () => setSettingsOpenMode("modal"), children: "Window" }), _jsx("button", { className: `btn ${settingsOpenMode === "docked" ? "btn-primary" : ""}`, onClick: () => setSettingsOpenMode("docked"), children: "Docked" })] }), _jsx("button", { className: "btn", onClick: () => setIsAppSettingsOpen(false), children: "Close" })] })] }), _jsx("div", { className: "app-settings-tabs", children: appSettingsTabs.map((tab) => (_jsx("button", { className: `tab-pill ${activeAppSettingsTab === tab.id ? "is-active" : ""}`, onClick: () => setActiveAppSettingsTab(tab.id), children: tab.label }, tab.id))) }), _jsxs("div", { className: "app-settings-content", children: [activeAppSettingsTab === "appearance" && (_jsx("div", { className: "settings-stack", children: _jsxs("section", { className: "settings-card", children: [_jsxs("header", { className: "settings-card-head", children: [_jsx("h3", { children: "Visual style" }), _jsx("p", { className: "muted-copy", children: "Tune typography, density and contrast for your workspace." })] }), _jsxs("div", { className: "host-form-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Density profile" }), _jsxs("select", { className: "input density-profile-select", value: densityProfile, onChange: (event) => setDensityProfile(event.target.value), children: [_jsx("option", { value: "aggressive", children: "Aggressive compact" }), _jsx("option", { value: "balanced", children: "Balanced compact" }), _jsx("option", { value: "safe", children: "Safe compact" })] }), _jsx("span", { className: "field-help", children: "Controls spacing and font density across the app." })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "GUI font" }), _jsxs("select", { className: "input density-profile-select", value: uiFontPreset, onChange: (event) => setUiFontPreset(event.target.value), children: [_jsx("option", { value: "inter", children: "Inter (balanced, neutral)" }), _jsx("option", { value: "manrope", children: "Manrope (modern, tighter)" }), _jsx("option", { value: "ibm-plex-sans", children: "IBM Plex Sans (technical, clear)" })] }), _jsx("span", { className: "field-help", children: "Sets typography for labels, forms and controls." })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Terminal font preset" }), _jsxs("select", { className: "input density-profile-select", value: terminalFontPreset, onChange: (event) => setTerminalFontPreset(event.target.value), children: [_jsx("option", { value: "jetbrains-mono", children: "JetBrains Mono" }), _jsx("option", { value: "ibm-plex-mono", children: "IBM Plex Mono" }), _jsx("option", { value: "source-code-pro", children: "Source Code Pro" })] }), _jsx("span", { className: "field-help", children: "Nerd font fallbacks remain active for symbols." })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Terminal font offset" }), _jsx("input", { className: "input", type: "number", value: terminalFontOffset, min: TERMINAL_FONT_OFFSET_MIN, max: TERMINAL_FONT_OFFSET_MAX, onChange: (event) => {
                                                                    const parsed = Number(event.target.value);
                                                                    if (!Number.isFinite(parsed)) {
                                                                        return;
                                                                    }
                                                                    setTerminalFontOffset(Math.min(TERMINAL_FONT_OFFSET_MAX, Math.max(TERMINAL_FONT_OFFSET_MIN, Math.round(parsed))));
                                                                } }), _jsxs("span", { className: "field-help", children: ["Current terminal size: ", terminalFontSize, "px."] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "List tone intensity" }), _jsxs("select", { className: "input density-profile-select", value: listTonePreset, onChange: (event) => setListTonePreset(event.target.value), children: [_jsx("option", { value: "subtle", children: "Subtle" }), _jsx("option", { value: "strong", children: "Strong" })] }), _jsx("span", { className: "field-help", children: "Controls host/session/chip color intensity." })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Frame mode" }), _jsxs("select", { className: "input density-profile-select", value: frameModePreset, onChange: (event) => setFrameModePreset(event.target.value), children: [_jsx("option", { value: "cleaner", children: "Cleaner" }), _jsx("option", { value: "balanced", children: "Balanced" }), _jsx("option", { value: "clearer", children: "Clearer" })] }), _jsx("span", { className: "field-help", children: "Hover/focus frame strength." })] })] })] }) })), activeAppSettingsTab === "layout" && (_jsx("div", { className: "settings-stack", children: _jsxs("section", { className: "settings-card", children: [_jsxs("header", { className: "settings-card-head", children: [_jsx("h3", { children: "Window behavior" }), _jsx("p", { className: "muted-copy", children: "Define how hosts and terminals are arranged across screen sizes." })] }), _jsxs("div", { className: "host-form-grid", children: [_jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Window layout" }), _jsxs("select", { className: "input density-profile-select", value: layoutMode, onChange: (event) => setLayoutMode(event.target.value), children: [_jsx("option", { value: "auto", children: "Auto \u2014 stack below 900px" }), _jsx("option", { value: "wide", children: "Wide \u2014 always side-by-side" }), _jsx("option", { value: "compact", children: "Compact \u2014 always stacked" })] }), _jsx("span", { className: "field-help", children: "Auto uses mobile shell on narrow screens. Wide keeps desktop grid. Compact stays stacked." })] }), _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Default split ratio preset" }), _jsxs("select", { className: "input density-profile-select", value: splitRatioPreset, onChange: (event) => setSplitRatioPreset(event.target.value), children: [_jsx("option", { value: "50-50", children: "50/50" }), _jsx("option", { value: "60-40", children: "60/40" }), _jsx("option", { value: "70-30", children: "70/30" })] }), _jsx("span", { className: "field-help", children: "Applies only to newly created pane splits." })] }), _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Auto arrange mode" }), _jsxs("select", { className: "input density-profile-select", value: autoArrangeMode, onChange: (event) => setAutoArrangeMode(event.target.value), children: [_jsx("option", { value: "a", children: "Mode A (open/close only)" }), _jsx("option", { value: "b", children: "Mode B (layout changes only)" }), _jsx("option", { value: "c", children: "Mode C (open/close + layout changes)" }), _jsx("option", { value: "free", children: "Free move (manual layout, no auto arrange)" }), _jsx("option", { value: "off", children: "Off" })] }), _jsxs("span", { className: "field-help", children: ["Mode A compacts session slots. Mode B rebalances split ratios. Mode C applies both.", " ", _jsx("strong", { children: "Free move" }), " keeps your splits until you pick another mode. The pane context menu item \"Pause auto-arrange (manual layout only)\" switches here to Free move; \"Resume auto-arrange for layout\" restores the last A/B/C preset. ", _jsx("strong", { children: "Off" }), " stops automation without remembering manual layout."] })] }), _jsxs("label", { className: "field field-span-2 checkbox-field", children: [_jsx("input", { id: "settings-broadcast-mode", type: "checkbox", className: "checkbox-input", checked: isBroadcastModeEnabled, onChange: (event) => setBroadcastMode(event.target.checked) }), _jsx("span", { className: "field-label", children: "Broadcast keyboard to multiple terminals" })] }), _jsx("p", { className: "muted-copy field-span-2", children: "When enabled, add target panes from the toolbar or context menu, then your typing is sent to every targeted session. Turn off here or from any pane's broadcast button." })] })] }) })), activeAppSettingsTab === "connections" && (_jsxs("div", { className: "settings-stack", children: [_jsxs("section", { className: "settings-card", children: [_jsxs("header", { className: "settings-card-head", children: [_jsx("h3", { children: "Defaults" }), _jsx("p", { className: "muted-copy", children: "Connection defaults applied before manual overrides." })] }), _jsx("div", { className: "host-form-grid", children: _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Default login user" }), _jsx("input", { className: "input", value: metadataStore.defaultUser, onChange: (event) => {
                                                                    const nextValue = event.target.value;
                                                                    setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                                                                }, onBlur: (event) => {
                                                                    void applyDefaultUser(event.target.value).catch((e) => setError(String(e)));
                                                                }, placeholder: "ubuntu" }), _jsx("span", { className: "field-help", children: "Used when a host has no explicit user." })] }) })] }), _jsxs("section", { className: "settings-card", children: [_jsxs("header", { className: "settings-card-head", children: [_jsx("h3", { children: "Quick connect" }), _jsx("p", { className: "muted-copy", children: "Choose interaction style and trust behavior for ad-hoc connections." })] }), _jsxs("div", { className: "host-form-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Quick connect mode" }), _jsxs("select", { className: "input density-profile-select", value: quickConnectMode, onChange: (event) => setQuickConnectMode(event.target.value), children: [_jsx("option", { value: "wizard", children: "Wizard (step-by-step)" }), _jsx("option", { value: "smart", children: "Smart form (single screen)" }), _jsx("option", { value: "command", children: "Command palette" })] }), _jsx("span", { className: "field-help", children: "Defines how host/user input is collected." })] }), _jsxs("label", { className: "field checkbox-field", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: quickConnectAutoTrust, onChange: (event) => setQuickConnectAutoTrust(event.target.checked) }), _jsx("span", { className: "field-label", children: "Auto trust host keys for quick connect" })] }), _jsx("p", { className: "field-help field-span-2", children: "Default is off. When enabled, quick-connect sessions auto-accept host key prompts." })] })] })] })), activeAppSettingsTab === "views" && (_jsx("div", { className: "settings-stack", children: _jsxs("section", { className: "settings-card backup-panel view-manager-panel", children: [_jsxs("div", { className: "field", children: [_jsx("span", { className: "field-label", children: "Saved custom views" }), _jsx("div", { className: "view-manager-list", children: sortedViewProfiles.length === 0 ? (_jsx("p", { className: "muted-copy", children: "No custom views yet." })) : (sortedViewProfiles.map((profile) => (_jsx("button", { className: `btn ${selectedViewProfileIdInSettings === profile.id ? "btn-primary" : ""}`, onClick: () => selectViewProfileForSettings(profile.id), children: profile.name }, profile.id)))) })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: createNewViewDraft, children: "New view" }), _jsx("button", { className: "btn", onClick: () => void reorderView("up"), disabled: !selectedViewProfileIdInSettings, children: "Move up" }), _jsx("button", { className: "btn", onClick: () => void reorderView("down"), disabled: !selectedViewProfileIdInSettings, children: "Move down" }), _jsx("button", { className: "btn btn-danger", onClick: () => void deleteCurrentViewDraft(), disabled: !selectedViewProfileIdInSettings, children: "Delete" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "View name" }), _jsx("input", { className: "input", value: viewDraft.name, onChange: (event) => setViewDraft((prev) => ({ ...prev, name: event.target.value })), placeholder: "Production hosts" })] }), _jsx("div", { className: "filter-row", children: _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Rule mode" }), _jsxs("select", { className: "input", value: viewDraft.filterGroup.mode, onChange: (event) => setViewDraft((prev) => ({
                                                                ...prev,
                                                                filterGroup: { ...prev.filterGroup, mode: event.target.value },
                                                            })), children: [_jsx("option", { value: "and", children: "All rules (AND)" }), _jsx("option", { value: "or", children: "Any rule (OR)" })] })] }) }), _jsx("div", { className: "view-rule-list", children: viewDraft.filterGroup.rules.map((rule) => (_jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: rule.field, onChange: (event) => setViewDraft((prev) => ({
                                                                ...prev,
                                                                filterGroup: {
                                                                    ...prev.filterGroup,
                                                                    rules: prev.filterGroup.rules.map((entry) => entry.id === rule.id ? { ...entry, field: event.target.value } : entry),
                                                                },
                                                            })), children: [_jsx("option", { value: "host", children: "Alias" }), _jsx("option", { value: "hostName", children: "Hostname" }), _jsx("option", { value: "user", children: "User" }), _jsx("option", { value: "port", children: "Port" }), _jsx("option", { value: "status", children: "Status" }), _jsx("option", { value: "favorite", children: "Favorite" }), _jsx("option", { value: "recent", children: "Recent" }), _jsx("option", { value: "tag", children: "Tag" })] }), _jsxs("select", { className: "input", value: rule.operator, onChange: (event) => setViewDraft((prev) => ({
                                                                ...prev,
                                                                filterGroup: {
                                                                    ...prev.filterGroup,
                                                                    rules: prev.filterGroup.rules.map((entry) => entry.id === rule.id ? { ...entry, operator: event.target.value } : entry),
                                                                },
                                                            })), children: [_jsx("option", { value: "contains", children: "contains" }), _jsx("option", { value: "equals", children: "equals" }), _jsx("option", { value: "not_equals", children: "not equals" }), _jsx("option", { value: "starts_with", children: "starts with" }), _jsx("option", { value: "ends_with", children: "ends with" }), _jsx("option", { value: "greater_than", children: "greater than" }), _jsx("option", { value: "less_than", children: "less than" }), _jsx("option", { value: "in", children: "in (comma separated)" })] }), _jsx("input", { className: "input", value: rule.value, onChange: (event) => setViewDraft((prev) => ({
                                                                ...prev,
                                                                filterGroup: {
                                                                    ...prev.filterGroup,
                                                                    rules: prev.filterGroup.rules.map((entry) => entry.id === rule.id ? { ...entry, value: event.target.value } : entry),
                                                                },
                                                            })), placeholder: "value" }), _jsx("button", { className: "btn btn-danger", onClick: () => setViewDraft((prev) => ({
                                                                ...prev,
                                                                filterGroup: {
                                                                    ...prev.filterGroup,
                                                                    rules: prev.filterGroup.rules.filter((entry) => entry.id !== rule.id),
                                                                },
                                                            })), children: "Remove" })] }, rule.id))) }), _jsx("div", { className: "action-row", children: _jsx("button", { className: "btn", onClick: () => setViewDraft((prev) => ({
                                                        ...prev,
                                                        filterGroup: { ...prev.filterGroup, rules: [...prev.filterGroup.rules, createViewRule()] },
                                                    })), children: "Add rule" }) }), _jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "input", value: viewDraft.sortRules[0]?.field ?? "host", onChange: (event) => setViewDraft((prev) => ({
                                                            ...prev,
                                                            sortRules: [{ field: event.target.value, direction: prev.sortRules[0]?.direction ?? "asc" }],
                                                        })), children: [_jsx("option", { value: "host", children: "Sort by alias" }), _jsx("option", { value: "hostName", children: "Sort by hostname" }), _jsx("option", { value: "user", children: "Sort by user" }), _jsx("option", { value: "port", children: "Sort by port" }), _jsx("option", { value: "lastUsedAt", children: "Sort by last used" }), _jsx("option", { value: "status", children: "Sort by status" }), _jsx("option", { value: "favorite", children: "Sort by favorite" })] }), _jsxs("select", { className: "input", value: viewDraft.sortRules[0]?.direction ?? "asc", onChange: (event) => setViewDraft((prev) => ({
                                                            ...prev,
                                                            sortRules: [{ field: prev.sortRules[0]?.field ?? "host", direction: event.target.value }],
                                                        })), children: [_jsx("option", { value: "asc", children: "Ascending" }), _jsx("option", { value: "desc", children: "Descending" })] }), _jsx("button", { className: "btn btn-primary", onClick: () => void saveCurrentViewDraft(), children: "Save view" })] }), _jsx("p", { className: "muted-copy", children: "Built-in views are fixed (`Alle`, `Favoriten`). Custom views are persisted and shown as sidebar tabs." })] }) })), activeAppSettingsTab === "data" && (_jsx("div", { className: "settings-stack", children: _jsxs("section", { className: "settings-card backup-panel", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export path" }), _jsx("input", { className: "input", value: backupExportPath, onChange: (event) => setBackupExportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Export password" }), _jsx("input", { className: "input", type: "password", value: backupExportPassword, onChange: (event) => setBackupExportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "new-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleExportBackup(), disabled: !backupExportPassword, children: "Export backup" }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import path" }), _jsx("input", { className: "input", value: backupImportPath, onChange: (event) => setBackupImportPath(event.target.value), placeholder: DEFAULT_BACKUP_PATH })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Import password" }), _jsx("input", { className: "input", type: "password", value: backupImportPassword, onChange: (event) => setBackupImportPassword(event.target.value), placeholder: "Enter backup password", autoComplete: "current-password" })] }), _jsx("button", { className: "btn", onClick: () => void handleImportBackup(), disabled: !backupImportPassword, children: "Import backup" }), _jsx("p", { className: "muted-copy", children: "Backups are always encrypted. Passwords are never stored." }), backupMessage && _jsx("p", { className: "muted-copy", children: backupMessage })] }) })), activeAppSettingsTab === "store" && (_jsx("div", { className: "settings-stack", children: _jsxs("div", { className: "settings-card store-panel", children: [_jsx("p", { className: "muted-copy", children: "Hybrid store: Host-Felder bleiben kompatibel, zusaetzlich koennen User/Gruppen/Tags/Keys als Objekte verknuepft werden." }), _jsxs("label", { className: "field field-span-2", children: [_jsx("span", { className: "field-label", children: "Master passphrase (Keychain fallback)" }), _jsx("input", { className: "input", type: "password", value: storePassphrase, onChange: (event) => setStorePassphrase(event.target.value), placeholder: "Optional, fuer encrypted keys" })] }), _jsxs("div", { className: "store-grid", children: [_jsxs("section", { className: "store-card", children: [_jsx("h4", { children: "Users" }), _jsx("div", { className: "store-list", children: storeUsers.map((user) => (_jsx("div", { className: "store-list-row", children: _jsx("span", { children: user.name }) }, user.id))) }), _jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storeUserDraft, onChange: (event) => setStoreUserDraft(event.target.value), placeholder: "neuer user" }), _jsx("button", { className: "btn", onClick: () => void addStoreUser(), children: "Add" })] })] }), _jsxs("section", { className: "store-card", children: [_jsx("h4", { children: "Groups" }), _jsx("div", { className: "store-list", children: storeGroups.map((group) => (_jsx("div", { className: "store-list-row", children: _jsx("span", { children: group.name }) }, group.id))) }), _jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storeGroupDraft, onChange: (event) => setStoreGroupDraft(event.target.value), placeholder: "neue gruppe" }), _jsx("button", { className: "btn", onClick: () => void addStoreGroup(), children: "Add" })] })] }), _jsxs("section", { className: "store-card", children: [_jsx("h4", { children: "Tags" }), _jsx("div", { className: "store-list", children: storeTags.map((tag) => (_jsx("div", { className: "store-list-row", children: _jsx("span", { children: tag.name }) }, tag.id))) }), _jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storeTagDraft, onChange: (event) => setStoreTagDraft(event.target.value), placeholder: "neuer tag" }), _jsx("button", { className: "btn", onClick: () => void addStoreTag(), children: "Add" })] })] })] }), _jsxs("section", { className: "store-card store-card-wide", children: [_jsx("h4", { children: "SSH Keys" }), _jsxs("div", { className: "store-key-grid", children: [_jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storePathKeyNameDraft, onChange: (event) => setStorePathKeyNameDraft(event.target.value), placeholder: "Pfad-Key Name" }), _jsx("input", { className: "input", value: storePathKeyPathDraft, onChange: (event) => setStorePathKeyPathDraft(event.target.value), placeholder: "~/.ssh/id_ed25519" }), _jsx("button", { className: "btn", onClick: () => void addStorePathKey(), children: "Add path key" })] }), _jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storeEncryptedKeyNameDraft, onChange: (event) => setStoreEncryptedKeyNameDraft(event.target.value), placeholder: "Encrypted key name" }), _jsx("input", { className: "input", value: storeEncryptedPublicKeyDraft, onChange: (event) => setStoreEncryptedPublicKeyDraft(event.target.value), placeholder: "optional public key" })] }), _jsx("textarea", { className: "input store-textarea", value: storeEncryptedPrivateKeyDraft, onChange: (event) => setStoreEncryptedPrivateKeyDraft(event.target.value), placeholder: "-----BEGIN PRIVATE KEY-----" }), _jsx("div", { className: "store-inline", children: _jsx("button", { className: "btn", onClick: () => void addStoreEncryptedKey(), children: "Add encrypted key" }) })] }), _jsx("div", { className: "store-list", children: storeKeys.map((key) => (_jsxs("div", { className: "store-list-row", children: [_jsxs("span", { children: [key.name, " (", key.type, ")"] }), _jsxs("div", { className: "store-inline", children: [_jsx("button", { className: "btn", onClick: () => void unlockStoreKey(key.id), children: "Unlock" }), _jsx("button", { className: "btn btn-danger", onClick: () => void removeStoreKey(key.id), children: "Delete" })] })] }, key.id))) })] }), _jsxs("section", { className: "store-card store-card-wide", children: [_jsx("h4", { children: "Host binding" }), _jsxs("div", { className: "store-inline", children: [_jsxs("select", { className: "input", value: storeSelectedHostForBinding, onChange: (event) => setStoreSelectedHostForBinding(event.target.value), children: [_jsx("option", { value: "", children: "Host waehlen" }), hosts.map((host) => (_jsx("option", { value: host.host, children: host.host }, host.host)))] }), _jsxs("select", { className: "input", value: storeBindingDraft.userId ?? "", onChange: (event) => setStoreBindingDraft((prev) => ({
                                                                    ...prev,
                                                                    userId: event.target.value || undefined,
                                                                })), children: [_jsx("option", { value: "", children: "User (optional)" }), storeUsers.map((user) => (_jsx("option", { value: user.id, children: user.name }, user.id)))] }), _jsxs("select", { className: "input", value: storeBindingDraft.keyRefs[0]?.keyId ?? "", onChange: (event) => setStoreBindingDraft((prev) => ({
                                                                    ...prev,
                                                                    keyRefs: event.target.value
                                                                        ? [{ keyId: event.target.value, usage: "primary" }]
                                                                        : [],
                                                                })), children: [_jsx("option", { value: "", children: "Primary key (optional)" }), storeKeys.map((key) => (_jsx("option", { value: key.id, children: key.name }, key.id)))] })] }), _jsxs("div", { className: "store-inline", children: [_jsx("input", { className: "input", value: storeBindingDraft.proxyJump, onChange: (event) => setStoreBindingDraft((prev) => ({
                                                                    ...prev,
                                                                    proxyJump: event.target.value,
                                                                })), placeholder: "ProxyJump override" }), _jsx("button", { className: "btn btn-primary", onClick: () => void saveHostBindingDraft(), children: "Save host binding" })] }), _jsx("p", { className: "muted-copy", children: "Gruppen/Tags bleiben im Hybrid-Modell zusaetzlich in Legacy-Hostdaten nutzbar und koennen spaeter voll migriert werden." })] })] }) })), activeAppSettingsTab === "help" && _jsx(HelpPanel, {}), activeAppSettingsTab === "about" && (_jsxs("section", { className: "about-hero", children: [_jsx("img", { src: logoTerminal, alt: "NoSuckShell hero", className: "about-hero-image" }), _jsx("p", { className: "muted-copy", children: "NoSuckShell helps you manage SSH hosts and sessions in one clean desktop workspace." })] }))] })] }) })), isLayoutCommandCenterOpen && (_jsx(LayoutCommandCenter, { open: isLayoutCommandCenterOpen, onClose: () => setIsLayoutCommandCenterOpen(false), layoutPresets: LAYOUT_PRESET_DEFINITIONS, profiles: layoutProfiles, selectedProfileId: selectedLayoutProfileId, onSelectProfileId: (id) => {
                    setSelectedLayoutProfileId(id);
                    setPendingLayoutProfileDeleteId("");
                    const nextProfile = layoutProfiles.find((profile) => profile.id === id) ?? null;
                    if (nextProfile) {
                        setLayoutProfileName(nextProfile.name);
                    }
                }, profileName: layoutProfileName, onProfileNameChange: setLayoutProfileName, restoreSessions: saveLayoutWithHosts, onRestoreSessionsChange: setSaveLayoutWithHosts, onApplyProfile: () => {
                    void loadSelectedLayoutProfile().then(() => setIsLayoutCommandCenterOpen(false));
                }, onSaveProfile: () => void saveCurrentLayoutProfile(), pendingDeleteProfileId: pendingLayoutProfileDeleteId, onDeleteProfileIntent: () => void handleDeleteSelectedLayoutProfileIntent(), onApplyPreset: (tree) => {
                    applyLayoutPresetTree(tree);
                    setIsLayoutCommandCenterOpen(false);
                }, onCloseAllIntent: (withLayoutReset) => void handleCloseAllIntent(withLayoutReset), pendingCloseAllIntent: pendingCloseAllIntent, previewTree: layoutCommandCenterPreviewTree, applyProfileDisabled: !selectedLayoutProfileId, saveDisabled: false, closeActionsDisabled: sessions.length === 0 })), isAddHostModalOpen && (_jsx("div", { className: "app-settings-overlay", onClick: closeAddHostModal, children: _jsxs("section", { className: "app-settings-modal panel add-host-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Add host" }), _jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsx(HostForm, { host: newHostDraft, onChange: setNewHostDraft }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: closeAddHostModal, children: "Cancel" }), _jsx("button", { className: "btn btn-primary", onClick: createHost, disabled: !canCreateHost, children: "Add host" })] }), error && _jsx("p", { className: "error-text", children: error })] })] }) })), isQuickConnectModalOpen && (_jsx("div", { className: "app-settings-overlay", onClick: closeQuickConnectModal, children: _jsxs("section", { className: "app-settings-modal panel add-host-modal", onClick: (event) => event.stopPropagation(), onKeyDown: handleQuickConnectModalKeyDown, children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Quick connect" }), _jsx("button", { className: "btn", onClick: closeQuickConnectModal, children: "Cancel" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsx("p", { className: "muted-copy quick-connect-shortcuts", children: "Enter connects, Esc closes, ArrowUp/ArrowDown cycles known users." }), quickConnectMode === "wizard" && (_jsxs("div", { className: "quick-connect-mode-wrap", children: [_jsxs("p", { className: "field-help", children: ["Step ", quickConnectWizardStep, "/2 -", " ", quickConnectWizardStep === 1 ? "Provide host target" : "Choose or type user"] }), quickConnectWizardStep === 1 && (_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Host" }), _jsx("input", { className: "input", value: quickConnectDraft.hostName, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, hostName: event.target.value })), onKeyDown: (event) => {
                                                        if (event.key === "Enter") {
                                                            event.preventDefault();
                                                            proceedQuickConnectWizard();
                                                        }
                                                    }, placeholder: "server.local:2222 or [2001:db8::1]:2200", autoFocus: true })] })), quickConnectWizardStep === 2 && (_jsxs(_Fragment, { children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "User" }), _jsx("input", { className: "input", value: quickConnectDraft.user, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, user: event.target.value })), onKeyDown: handleQuickConnectUserInputKeyDown, placeholder: "Default or custom user", autoFocus: true })] }), quickConnectUserOptions.length > 0 && (_jsx("div", { className: "quick-connect-user-list", role: "listbox", "aria-label": "Known users", children: quickConnectUserOptions.map((user) => (_jsx("button", { type: "button", className: `btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`, onClick: () => {
                                                            applyQuickConnectUser(user);
                                                        }, children: user }, user))) }))] }))] })), quickConnectMode === "smart" && (_jsxs("div", { className: "quick-connect-mode-wrap", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Host" }), _jsx("input", { className: "input", value: quickConnectDraft.hostName, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, hostName: event.target.value })), onKeyDown: (event) => {
                                                        if (event.key === "Enter") {
                                                            event.preventDefault();
                                                            void connectQuickSshInNewPane();
                                                        }
                                                    }, placeholder: "example.com or 10.0.0.8:2222", autoFocus: true })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "User" }), _jsx("input", { className: "input", value: quickConnectDraft.user, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, user: event.target.value })), onKeyDown: handleQuickConnectUserInputKeyDown, placeholder: "Default or custom user" })] }), quickConnectUserOptions.length > 0 && (_jsx("div", { className: "quick-connect-user-list", role: "listbox", "aria-label": "Known users", children: quickConnectUserOptions.map((user) => (_jsx("button", { type: "button", className: `btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`, onClick: () => {
                                                    applyQuickConnectUser(user);
                                                }, children: user }, user))) }))] })), quickConnectMode === "command" && (_jsxs("div", { className: "quick-connect-mode-wrap", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Target command" }), _jsx("input", { className: "input", value: quickConnectCommandInput, onChange: (event) => setQuickConnectCommandInput(event.target.value), onKeyDown: handleQuickConnectCommandInputKeyDown, placeholder: "user@host:22", autoFocus: true })] }), quickConnectUserOptions.length > 0 && (_jsx("div", { className: "quick-connect-user-list", role: "listbox", "aria-label": "Known users", children: quickConnectUserOptions.map((user) => (_jsx("button", { type: "button", className: `btn ${quickConnectCommandInput.trim().startsWith(`${user}@`) ? "btn-primary" : ""}`, onClick: () => {
                                                    const targetPart = quickConnectCommandInput.includes("@")
                                                        ? quickConnectCommandInput.slice(quickConnectCommandInput.indexOf("@"))
                                                        : "@";
                                                    setQuickConnectCommandInput(`${user}${targetPart}`);
                                                }, children: user }, user))) })), _jsx("p", { className: "field-help", children: "Supports `user@host`, `user@host:port`, and `user@[2001:db8::1]:2200`." })] })), (quickConnectMode !== "wizard" || quickConnectWizardStep === 2) && (_jsxs(_Fragment, { children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Identity file" }), _jsx("input", { className: "input", value: quickConnectDraft.identityFile, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, identityFile: event.target.value })), placeholder: "Optional" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Proxy jump" }), _jsx("input", { className: "input", value: quickConnectDraft.proxyJump, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, proxyJump: event.target.value })), placeholder: "Optional" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "Proxy command" }), _jsx("input", { className: "input", value: quickConnectDraft.proxyCommand, onChange: (event) => setQuickConnectDraft((prev) => ({ ...prev, proxyCommand: event.target.value })), placeholder: "Optional" })] })] })), _jsxs("div", { className: "action-row", children: [quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (_jsx("button", { className: "btn", onClick: () => setQuickConnectWizardStep(1), children: "Back" })), _jsx("button", { className: "btn", onClick: closeQuickConnectModal, children: "Cancel" }), quickConnectMode === "wizard" && quickConnectWizardStep === 1 ? (_jsx("button", { className: "btn btn-primary", onClick: proceedQuickConnectWizard, children: "Next" })) : (_jsx("button", { className: "btn btn-primary", onClick: () => void connectQuickSshInNewPane(), children: "Connect" })), quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (_jsx("button", { className: "btn", onClick: () => setQuickConnectWizardStep(1), children: "Back" }))] }), error && _jsx("p", { className: "error-text", children: error })] })] }) })), activeTrustPrompt && (_jsx("div", { className: "app-settings-overlay", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: _jsxs("section", { className: "app-settings-modal panel trust-host-modal", onClick: (event) => event.stopPropagation(), onKeyDown: handleTrustPromptKeyDown, children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: "Trust host key" }), _jsx("button", { className: "btn", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: "Close" })] }), _jsxs("div", { className: "app-settings-content", children: [_jsxs("p", { className: "muted-copy", children: ["Session ", _jsx("strong", { children: activeTrustPrompt.sessionId }), " requests trust confirmation for host", " ", _jsx("strong", { children: activeTrustPrompt.hostAlias }), "."] }), _jsxs("label", { className: "field checkbox-field trust-default-checkbox", children: [_jsx("input", { className: "checkbox-input", type: "checkbox", checked: saveTrustHostAsDefault, onChange: (event) => setSaveTrustHostAsDefault(event.target.checked) }), _jsx("span", { className: "field-label", children: "Save as default for this host" })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { className: "btn", onClick: () => dismissTrustPrompt(activeTrustPrompt.sessionId), children: "Dismiss" }), _jsx("button", { className: "btn btn-primary", onClick: () => void acceptTrustPrompt(), autoFocus: true, children: "Trust host" })] })] })] }) })), contextMenu.visible && contextMenu.paneIndex !== null && (_jsxs("div", { className: "context-menu", style: { left: contextMenu.x, top: contextMenu.y }, role: "menu", children: [buildPaneContextActions({
                        paneSessionId: splitSlots[contextMenu.paneIndex] ?? null,
                        canClosePane: paneOrder.length > 1,
                        broadcastModeEnabled: isBroadcastModeEnabled,
                        broadcastCount: broadcastTargets.size,
                        splitMode: contextMenu.splitMode,
                        freeMoveEnabled: autoArrangeMode === "free",
                    }).map((action) => (_jsx("button", { className: `context-menu-item ${action.separatorAbove ? "separator-above" : ""}`, disabled: action.disabled, onClick: (event) => void handleContextAction(action.id, contextMenu.paneIndex ?? 0, {
                            preferredSplitMode: contextMenu.splitMode,
                            eventLike: event,
                        }), children: action.label }, action.id))), workspaceSendTargets.map((workspace, index) => (_jsxs("button", { className: `context-menu-item ${index === 0 ? "separator-above" : ""}`, onClick: () => {
                            if (!contextMenuPaneSessionId) {
                                return;
                            }
                            sendSessionToWorkspace(contextMenuPaneSessionId, workspace.id);
                            setContextMenu((prev) => ({ ...prev, visible: false }));
                        }, children: ["Send to ", workspace.name] }, `send-${workspace.id}`)))] })), isStackedShell && (_jsxs("nav", { className: "mobile-shell-tabbar", "aria-label": "Mobile workspace", children: [_jsx("button", { type: "button", className: `mobile-shell-tabbar-btn ${mobileShellTab === "hosts" ? "is-active" : ""}`, "aria-current": mobileShellTab === "hosts" ? "page" : undefined, onClick: () => setMobileShellTab("hosts"), children: "Hosts" }), _jsx("button", { type: "button", className: `mobile-shell-tabbar-btn ${mobileShellTab === "terminal" ? "is-active" : ""}`, "aria-current": mobileShellTab === "terminal" ? "page" : undefined, onClick: () => setMobileShellTab("terminal"), children: "Terminal" })] }))] }));
}
