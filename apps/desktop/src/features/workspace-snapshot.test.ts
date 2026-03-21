import { describe, expect, it } from "vitest";
import { createLeafNode, serializeSplitTree } from "./split-tree";
import {
  DEFAULT_WORKSPACE_ID,
  appendSessionToWorkspaceSnapshot,
  createEmptyWorkspaceSnapshot,
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

  it("createEmptyWorkspaceSnapshot starts with one leaf", () => {
    const s = createEmptyWorkspaceSnapshot("x", "X");
    expect(s.splitTree).toEqual(createLeafNode(0));
  });
});
