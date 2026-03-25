import { describe, expect, it } from "vitest";
import { createLeafNode, serializeSplitTree } from "./split-tree";
import {
  DEFAULT_WORKSPACE_ID,
  appendSessionToWorkspaceSnapshot,
  cloneWorkspaceSnapshot,
  createEmptyWorkspaceSnapshot,
  createNssCommanderWorkspaceSnapshot,
  findFirstFreePaneInOrder,
  normalizePersistedWorkspacesPayload,
} from "./workspace-snapshot";

describe("workspace-snapshot", () => {
  it("normalizePersistedWorkspacesPayload returns null for empty order", () => {
    expect(normalizePersistedWorkspacesPayload({ order: [], snapshots: {} })).toBeNull();
    expect(normalizePersistedWorkspacesPayload(null)).toBeNull();
  });

  it("normalizePersistedWorkspacesPayload restores workspace", () => {
    const snap = createEmptyWorkspaceSnapshot("ws-1", "Main");
    const payload = {
      order: ["ws-1"],
      activeWorkspaceId: "ws-1",
      snapshots: {
        "ws-1": {
          ...snap,
          splitTree: serializeSplitTree(snap.splitTree),
        },
      },
    };
    const norm = normalizePersistedWorkspacesPayload(payload);
    expect(norm).not.toBeNull();
    expect(norm!.nextActiveWorkspaceId).toBe("ws-1");
    expect(norm!.normalizedOrder).toEqual(["ws-1"]);
    expect(norm!.nextActiveSnapshot.name).toBe("Main");
    expect(norm!.nextActiveSnapshot.preferVerticalNewPanes).toBe(false);
  });

  it("normalizePersistedWorkspacesPayload defaults preferVerticalNewPanes when missing", () => {
    const snap = createEmptyWorkspaceSnapshot("ws-legacy", "Legacy");
    const payload = {
      order: ["ws-legacy"],
      activeWorkspaceId: "ws-legacy",
      snapshots: {
        "ws-legacy": {
          id: snap.id,
          name: snap.name,
          splitSlots: snap.splitSlots,
          paneLayouts: snap.paneLayouts,
          splitTree: serializeSplitTree(snap.splitTree),
          activePaneIndex: snap.activePaneIndex,
          activeSessionId: snap.activeSessionId,
        },
      },
    };
    const norm = normalizePersistedWorkspacesPayload(payload);
    expect(norm).not.toBeNull();
    expect(norm!.nextActiveSnapshot.preferVerticalNewPanes).toBe(false);
  });

  it("normalizePersistedWorkspacesPayload picks fallback active id", () => {
    const snap = createEmptyWorkspaceSnapshot("a", "A");
    const norm = normalizePersistedWorkspacesPayload({
      order: ["a"],
      activeWorkspaceId: "missing",
      snapshots: {
        a: { ...snap, splitTree: serializeSplitTree(snap.splitTree) },
      },
    });
    expect(norm!.nextActiveWorkspaceId).toBe("a");
  });

  it("appendSessionToWorkspaceSnapshot uses free pane", () => {
    const base = createEmptyWorkspaceSnapshot(DEFAULT_WORKSPACE_ID, "Main");
    const next = appendSessionToWorkspaceSnapshot(base, "sess-1", 0.6);
    expect(next.splitSlots[0]).toBe("sess-1");
    expect(next.activeSessionId).toBe("sess-1");
  });

  it("appendSessionToWorkspaceSnapshot extends tree when no free pane", () => {
    const base = createEmptyWorkspaceSnapshot(DEFAULT_WORKSPACE_ID, "Main");
    const withSession = appendSessionToWorkspaceSnapshot(base, "s1", 0.6);
    const next = appendSessionToWorkspaceSnapshot(withSession, "s2", 0.6);
    expect(next.splitSlots.filter(Boolean).length).toBe(2);
    expect(next.activeSessionId).toBe("s2");
  });

  it("findFirstFreePaneInOrder prefers first free pane in visible order", () => {
    expect(findFirstFreePaneInOrder([2, 0, 1], ["s0", null, null])).toBe(2);
    expect(findFirstFreePaneInOrder([1, 0], ["s0", "s1"])).toBeNull();
  });

  it("createEmptyWorkspaceSnapshot starts with one leaf", () => {
    const s = createEmptyWorkspaceSnapshot("x", "X");
    expect(s.splitTree).toEqual(createLeafNode(0));
    expect(s.preferVerticalNewPanes).toBe(false);
  });

  it("cloneWorkspaceSnapshot retains preferVerticalNewPanes", () => {
    const source = createEmptyWorkspaceSnapshot("x", "X");
    source.preferVerticalNewPanes = true;
    const cloned = cloneWorkspaceSnapshot(source);
    expect(cloned.preferVerticalNewPanes).toBe(true);
  });

  it("createNssCommanderWorkspaceSnapshot produces dual-pane split with kind", () => {
    const snap = createNssCommanderWorkspaceSnapshot("nss-1", "NSS-Commander", "left-sess", "right-sess");
    expect(snap.kind).toBe("nss-commander");
    expect(snap.preferVerticalNewPanes).toBe(false);
    expect(snap.splitSlots).toEqual(["left-sess", "right-sess"]);
    expect(snap.paneLayouts).toHaveLength(2);
    expect(snap.splitTree.type).toBe("split");
    if (snap.splitTree.type === "split") {
      expect(snap.splitTree.ratio).toBe(0.5);
      expect(snap.splitTree.axis).toBe("horizontal");
    }
    expect(snap.activePaneIndex).toBe(0);
    expect(snap.activeSessionId).toBe("left-sess");
  });

  it("normalizePersistedWorkspacesPayload preserves nss-commander kind", () => {
    const snap = createNssCommanderWorkspaceSnapshot("nss-ws", "NSS-Commander", "s1", "s2");
    const payload = {
      order: ["nss-ws"],
      activeWorkspaceId: "nss-ws",
      snapshots: {
        "nss-ws": {
          ...snap,
          splitTree: serializeSplitTree(snap.splitTree),
        },
      },
    };
    const norm = normalizePersistedWorkspacesPayload(payload);
    expect(norm).not.toBeNull();
    expect(norm!.nextActiveSnapshot.kind).toBe("nss-commander");
    expect(norm!.nextActiveSnapshot.preferVerticalNewPanes).toBe(false);
  });

  it("normalizePersistedWorkspacesPayload migrates legacy nss vertical split to horizontal", () => {
    const snap = createNssCommanderWorkspaceSnapshot("nss-legacy", "NSS-Commander", "s1", "s2");
    if (snap.splitTree.type === "split") {
      snap.splitTree.axis = "vertical";
    }
    const payload = {
      order: ["nss-legacy"],
      activeWorkspaceId: "nss-legacy",
      snapshots: {
        "nss-legacy": {
          ...snap,
          splitTree: serializeSplitTree(snap.splitTree),
        },
      },
    };
    const norm = normalizePersistedWorkspacesPayload(payload);
    expect(norm).not.toBeNull();
    expect(norm!.nextActiveSnapshot.kind).toBe("nss-commander");
    expect(norm!.nextActiveSnapshot.splitTree.type).toBe("split");
    if (norm!.nextActiveSnapshot.splitTree.type === "split") {
      expect(norm!.nextActiveSnapshot.splitTree.axis).toBe("horizontal");
    }
  });

  it("normalizePersistedWorkspacesPayload drops unknown kind values", () => {
    const snap = createEmptyWorkspaceSnapshot("ws-bad", "Bad");
    const payload = {
      order: ["ws-bad"],
      activeWorkspaceId: "ws-bad",
      snapshots: {
        "ws-bad": {
          ...snap,
          kind: "unknown-kind",
          splitTree: serializeSplitTree(snap.splitTree),
        },
      },
    };
    const norm = normalizePersistedWorkspacesPayload(payload);
    expect(norm).not.toBeNull();
    expect(norm!.nextActiveSnapshot.kind).toBeUndefined();
  });

  it("createEmptyWorkspaceSnapshot has no kind by default", () => {
    const s = createEmptyWorkspaceSnapshot("x", "X");
    expect(s.kind).toBeUndefined();
  });
});
