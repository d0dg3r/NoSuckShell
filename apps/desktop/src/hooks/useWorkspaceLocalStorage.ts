import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { WORKSPACES_STORAGE_KEY } from "../features/app-preferences";
import { cloneSplitTree, type SplitTreeNode } from "../features/split-tree";
import { clonePaneLayouts, normalizePersistedWorkspacesPayload, type WorkspaceSnapshot } from "../features/workspace-snapshot";
import type { PaneLayoutItem } from "../types";

export type WorkspaceBootstrapDeps = {
  isApplyingWorkspaceSnapshotRef: MutableRefObject<boolean>;
  setWorkspaceOrder: Dispatch<SetStateAction<string[]>>;
  setWorkspaceSnapshots: Dispatch<SetStateAction<Record<string, WorkspaceSnapshot>>>;
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  setSplitSlots: Dispatch<SetStateAction<Array<string | null>>>;
  setPaneLayouts: Dispatch<SetStateAction<PaneLayoutItem[]>>;
  setSplitTree: Dispatch<SetStateAction<SplitTreeNode>>;
  setActivePaneIndex: Dispatch<SetStateAction<number>>;
  setActiveSession: Dispatch<SetStateAction<string>>;
};

/** One-shot restore of workspace tabs from localStorage on mount. */
export function useWorkspaceBootstrapFromStorage(deps: WorkspaceBootstrapDeps): void {
  const {
    isApplyingWorkspaceSnapshotRef,
    setWorkspaceOrder,
    setWorkspaceSnapshots,
    setActiveWorkspaceId,
    setSplitSlots,
    setPaneLayouts,
    setSplitTree,
    setActivePaneIndex,
    setActiveSession,
  } = deps;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const normalized = normalizePersistedWorkspacesPayload(parsed);
      if (!normalized) {
        return;
      }
      const { normalizedOrder, normalizedSnapshots, nextActiveWorkspaceId, nextActiveSnapshot } = normalized;
      isApplyingWorkspaceSnapshotRef.current = true;
      setWorkspaceOrder(normalizedOrder);
      setWorkspaceSnapshots(normalizedSnapshots);
      setActiveWorkspaceId(nextActiveWorkspaceId);
      setSplitSlots([...nextActiveSnapshot.splitSlots]);
      setPaneLayouts(clonePaneLayouts(nextActiveSnapshot.paneLayouts));
      setSplitTree(cloneSplitTree(nextActiveSnapshot.splitTree));
      setActivePaneIndex(nextActiveSnapshot.activePaneIndex);
      setActiveSession(nextActiveSnapshot.activeSessionId);
      window.setTimeout(() => {
        isApplyingWorkspaceSnapshotRef.current = false;
      }, 0);
    } catch {
      // ignore broken persisted workspace data
    }
  }, [
    isApplyingWorkspaceSnapshotRef,
    setWorkspaceOrder,
    setWorkspaceSnapshots,
    setActiveWorkspaceId,
    setSplitSlots,
    setPaneLayouts,
    setSplitTree,
    setActivePaneIndex,
    setActiveSession,
  ]);
}

export function useWorkspacePersistToStorage(
  workspaceOrder: string[],
  activeWorkspaceId: string,
  workspaceSnapshots: Record<string, WorkspaceSnapshot>,
): void {
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
}
