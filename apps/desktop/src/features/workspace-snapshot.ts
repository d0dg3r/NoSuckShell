import { createId } from "./app-id";
import {
  assignSessionToPane,
  createInitialPaneState,
  createPaneLayoutItem,
  createPaneLayoutsFromSlots,
} from "./split";
import {
  cloneSplitTree,
  collectPaneOrder,
  createLeafNode,
  type SplitTreeNode,
} from "./split-tree";
import type { LayoutSplitTreeNode, PaneLayoutItem } from "../types";

export const DEFAULT_WORKSPACE_ID = "workspace-main";

export type WorkspaceKind = "default" | "nss-commander";

export type WorkspaceSnapshot = {
  id: string;
  name: string;
  kind?: WorkspaceKind;
  preferVerticalNewPanes: boolean;
  splitSlots: Array<string | null>;
  paneLayouts: PaneLayoutItem[];
  splitTree: SplitTreeNode;
  activePaneIndex: number;
  activeSessionId: string;
};

export const clonePaneLayouts = (layouts: PaneLayoutItem[]): PaneLayoutItem[] => layouts.map((entry) => ({ ...entry }));

export const findFirstFreePaneInOrder = (paneOrder: number[], splitSlots: Array<string | null>): number | null => {
  for (const paneIndex of paneOrder) {
    if (splitSlots[paneIndex] === null) {
      return paneIndex;
    }
  }
  return null;
};

export const cloneWorkspaceSnapshot = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot => ({
  ...snapshot,
  splitSlots: [...snapshot.splitSlots],
  paneLayouts: clonePaneLayouts(snapshot.paneLayouts),
  splitTree: cloneSplitTree(snapshot.splitTree),
});

export const createEmptyWorkspaceSnapshot = (id: string, name: string): WorkspaceSnapshot => {
  const splitSlots = createInitialPaneState();
  return {
    id,
    name,
    preferVerticalNewPanes: false,
    splitSlots,
    paneLayouts: createPaneLayoutsFromSlots(splitSlots),
    splitTree: createLeafNode(0),
    activePaneIndex: 0,
    activeSessionId: "",
  };
};

/** Places a new session into a workspace snapshot (free pane or new split). Used for host connect → chosen workspace. */
export const appendSessionToWorkspaceSnapshot = (
  targetSnapshot: WorkspaceSnapshot,
  sessionId: string,
  splitRatioDefaultValue: number,
): WorkspaceSnapshot => {
  const targetPaneOrder = collectPaneOrder(targetSnapshot.splitTree);
  const firstFreePaneIndex = findFirstFreePaneInOrder(targetPaneOrder, targetSnapshot.splitSlots);
  const nextTargetPaneIndex =
    typeof firstFreePaneIndex === "number" ? firstFreePaneIndex : Math.max(-1, ...targetPaneOrder) + 1;
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

/** Creates a dual-pane (side-by-side) NSS-Commander workspace ready for two local file sessions. */
export const createNssCommanderWorkspaceSnapshot = (
  id: string,
  name: string,
  sessionIdLeft: string,
  sessionIdRight: string,
): WorkspaceSnapshot => {
  const splitSlots: Array<string | null> = [sessionIdLeft, sessionIdRight];
  const paneLayouts: PaneLayoutItem[] = [createPaneLayoutItem(), createPaneLayoutItem()];
  const splitTree: SplitTreeNode = {
    id: `split-nss-${createId()}`,
    type: "split",
    axis: "horizontal",
    ratio: 0.5,
    first: createLeafNode(0),
    second: createLeafNode(1),
  };
  return {
    id,
    name,
    kind: "nss-commander",
    preferVerticalNewPanes: false,
    splitSlots,
    paneLayouts,
    splitTree,
    activePaneIndex: 0,
    activeSessionId: sessionIdLeft,
  };
};

export const compactSplitSlotsByPaneOrder = (slots: Array<string | null>, paneOrder: number[]): Array<string | null> => {
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

type LooseSnapshot = {
  id?: string;
  name?: string;
  kind?: unknown;
  preferVerticalNewPanes?: unknown;
  splitSlots?: unknown;
  paneLayouts?: unknown;
  splitTree?: LayoutSplitTreeNode;
  activePaneIndex?: unknown;
  activeSessionId?: unknown;
};

/**
 * Normalizes JSON.parse output from WORKSPACES_STORAGE_KEY.
 * Returns null if payload is unusable (same guards as previous inline effect).
 */
export const normalizePersistedWorkspacesPayload = (
  parsed: unknown,
): {
  normalizedOrder: string[];
  normalizedSnapshots: Record<string, WorkspaceSnapshot>;
  nextActiveWorkspaceId: string;
  nextActiveSnapshot: WorkspaceSnapshot;
} | null => {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const root = parsed as { order?: unknown; activeWorkspaceId?: unknown; snapshots?: unknown };
  const order = Array.isArray(root.order) ? root.order.filter((entry): entry is string => typeof entry === "string") : [];
  const snapshotsRaw = root.snapshots;
  const snapshots =
    snapshotsRaw && typeof snapshotsRaw === "object" ? (snapshotsRaw as Record<string, LooseSnapshot>) : {};
  if (order.length === 0) {
    return null;
  }
  const normalizedOrder = order.filter((workspaceId) => {
    const snapshot = snapshots[workspaceId];
    return Boolean(snapshot && Array.isArray(snapshot.splitSlots) && snapshot.splitTree);
  });
  if (normalizedOrder.length === 0) {
    return null;
  }
  const normalizedSnapshots = normalizedOrder.reduce<Record<string, WorkspaceSnapshot>>((acc, workspaceId) => {
    const snapshot = snapshots[workspaceId];
    if (!snapshot) {
      return acc;
    }
    const kind: WorkspaceKind | undefined = snapshot.kind === "nss-commander" ? "nss-commander" : undefined;
    const normalizedSplitTree = snapshot.splitTree ? cloneSplitTree(snapshot.splitTree as SplitTreeNode) : createLeafNode(0);
    if (kind === "nss-commander" && normalizedSplitTree.type === "split" && normalizedSplitTree.axis !== "horizontal") {
      normalizedSplitTree.axis = "horizontal";
    }

    acc[workspaceId] = {
      ...snapshot,
      id: snapshot.id || workspaceId,
      name: snapshot.name || workspaceId,
      kind,
      preferVerticalNewPanes: kind === "nss-commander" ? false : snapshot.preferVerticalNewPanes === true,
      splitSlots: Array.isArray(snapshot.splitSlots) ? [...snapshot.splitSlots] : createInitialPaneState(),
      paneLayouts: Array.isArray(snapshot.paneLayouts)
        ? (snapshot.paneLayouts as PaneLayoutItem[]).map((entry) => ({ ...entry }))
        : createPaneLayoutsFromSlots(createInitialPaneState()),
      splitTree: normalizedSplitTree,
      activePaneIndex: Number.isInteger(snapshot.activePaneIndex) ? (snapshot.activePaneIndex as number) : 0,
      activeSessionId: typeof snapshot.activeSessionId === "string" ? snapshot.activeSessionId : "",
    };
    return acc;
  }, {});
  const fallbackWorkspaceId = normalizedOrder[0] ?? DEFAULT_WORKSPACE_ID;
  const nextActiveWorkspaceId =
    typeof root.activeWorkspaceId === "string" && normalizedSnapshots[root.activeWorkspaceId]
      ? root.activeWorkspaceId
      : fallbackWorkspaceId;
  const nextActiveSnapshot = normalizedSnapshots[nextActiveWorkspaceId];
  if (!nextActiveSnapshot) {
    return null;
  }
  return {
    normalizedOrder,
    normalizedSnapshots,
    nextActiveWorkspaceId,
    nextActiveSnapshot,
  };
};
