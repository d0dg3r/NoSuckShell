import { describe, expect, it } from "vitest";
import {
  collectPaneOrder,
  createLeafNode,
  createTreeFromPaneCount,
  parseSplitTree,
  removePaneFromTree,
  serializeSplitTree,
} from "./split-tree";
import type { LayoutSplitTreeNode } from "../types";

describe("split-tree", () => {
  it("parseSplitTree rejects invalid leaf", () => {
    expect(parseSplitTree({ type: "leaf", paneIndex: -1 } as LayoutSplitTreeNode)).toBeNull();
    expect(parseSplitTree({ type: "leaf" } as LayoutSplitTreeNode)).toBeNull();
  });

  it("round-trips a simple split tree", () => {
    const tree = createTreeFromPaneCount(3);
    const serialized = serializeSplitTree(tree);
    const parsed = parseSplitTree(serialized);
    expect(parsed).not.toBeNull();
    expect(collectPaneOrder(parsed!)).toEqual(collectPaneOrder(tree));
  });

  it("removePaneFromTree drops target leaf", () => {
    const tree = createTreeFromPaneCount(2);
    const removed = removePaneFromTree(tree, 1);
    expect(removed).not.toBeNull();
    expect(collectPaneOrder(removed!)).toEqual([0]);
  });

  it("createLeafNode uses pane index in id", () => {
    const leaf = createLeafNode(4);
    expect(leaf.paneIndex).toBe(4);
    expect(leaf.id).toContain("4");
  });
});
