export const DEFAULT_PANE_WIDTH = 420;
export const DEFAULT_PANE_HEIGHT = 260;
export const MIN_PANE_WIDTH = 280;
export const MIN_PANE_HEIGHT = 180;
let paneIdCounter = 0;
const createPaneId = () => {
    paneIdCounter += 1;
    return `pane-${paneIdCounter}`;
};
export const createInitialPaneState = () => [null];
const trimTrailingNulls = (slots) => {
    const next = [...slots];
    while (next.length > 1 && next[next.length - 1] === null && next[next.length - 2] === null) {
        next.pop();
    }
    return next;
};
const ensureAtLeastOnePane = (slots) => {
    if (slots.length === 0) {
        return [null];
    }
    return slots;
};
const ensureOneFreePane = (slots) => {
    if (slots.some((slot) => slot === null)) {
        return slots;
    }
    return [...slots, null];
};
export const normalizeSplitSlots = (slots) => {
    const withAtLeastOne = ensureAtLeastOnePane(slots);
    const trimmed = trimTrailingNulls(withAtLeastOne);
    return ensureOneFreePane(trimmed);
};
export const ensurePaneIndex = (slots, paneIndex) => {
    if (paneIndex < slots.length) {
        return [...slots];
    }
    const next = [...slots];
    while (next.length <= paneIndex) {
        next.push(null);
    }
    return next;
};
export const assignSessionToPane = (slots, paneIndex, sessionId) => {
    const expanded = ensurePaneIndex(slots, paneIndex);
    expanded[paneIndex] = sessionId;
    return expanded;
};
export const assignSessionToFirstFreePane = (slots, sessionId) => {
    const firstFreePane = slots.findIndex((slot) => slot === null);
    if (firstFreePane === -1) {
        return [...slots, sessionId];
    }
    const next = [...slots];
    next[firstFreePane] = sessionId;
    return next;
};
export const clearPaneAtIndex = (slots, paneIndex) => {
    if (paneIndex < 0 || paneIndex >= slots.length) {
        return [...slots];
    }
    const next = [...slots];
    next[paneIndex] = null;
    return next;
};
export const removeSessionFromSlots = (slots, sessionId) => {
    return slots.map((slot) => (slot === sessionId ? null : slot));
};
export const sanitizeBroadcastTargets = (targets, sessionIds) => {
    const sessionSet = new Set(sessionIds);
    return new Set([...targets].filter((target) => sessionSet.has(target)));
};
export const resolveInputTargets = (originSessionId, broadcastTargets, sessionIds) => {
    const sanitized = sanitizeBroadcastTargets(broadcastTargets, sessionIds);
    if (sanitized.size === 0) {
        return [originSessionId];
    }
    return [...sanitized];
};
export const createPaneLayoutItem = (width = DEFAULT_PANE_WIDTH, height = DEFAULT_PANE_HEIGHT) => ({
    id: createPaneId(),
    width,
    height,
});
export const createPaneLayoutsFromSlots = (slots) => slots.map(() => createPaneLayoutItem());
export const reconcilePaneLayouts = (previous, slots) => {
    const next = [];
    for (let index = 0; index < slots.length; index += 1) {
        const existing = previous[index];
        if (existing) {
            next.push(existing);
            continue;
        }
        next.push(createPaneLayoutItem());
    }
    return next;
};
export const swapItems = (items, fromIndex, toIndex) => {
    if (fromIndex === toIndex) {
        return [...items];
    }
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return [...items];
    }
    const next = [...items];
    const temp = next[fromIndex];
    next[fromIndex] = next[toIndex];
    next[toIndex] = temp;
    return next;
};
const clampPaneSize = (value, min) => Math.max(min, Math.round(value));
export const resizePaneLayout = (layouts, paneIndex, axis, deltaX, deltaY) => {
    if (paneIndex < 0 || paneIndex >= layouts.length) {
        return layouts;
    }
    return layouts.map((pane, index) => {
        if (index !== paneIndex) {
            return pane;
        }
        const width = axis === "x" || axis === "xy" ? clampPaneSize(pane.width + deltaX, MIN_PANE_WIDTH) : pane.width;
        const height = axis === "y" || axis === "xy" ? clampPaneSize(pane.height + deltaY, MIN_PANE_HEIGHT) : pane.height;
        return { ...pane, width, height };
    });
};
