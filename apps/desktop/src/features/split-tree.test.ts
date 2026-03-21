import { describe, expect, it } from "vitest";
import {
  collectPaneOrder,
  createEqualGridSplitTree,
  createLeafNode,
  createTreeFromPaneCount,
  isLayoutGridDimensionsValid,
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

  it("createEqualGridSplitTree uses row-major pane indices", () => {
    const tree = createEqualGridSplitTree(3, 8);
    expect(collectPaneOrder(tree)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it("isLayoutGridDimensionsValid enforces row, column, and pane caps", () => {
    expect(isLayoutGridDimensionsValid(3, 8)).toBe(true);
    expect(isLayoutGridDimensionsValid(1, 1)).toBe(true);
    expect(isLayoutGridDimensionsValid(0, 3)).toBe(false);
    expect(isLayoutGridDimensionsValid(12, 12)).toBe(false);
    expect(isLayoutGridDimensionsValid(3, 20)).toBe(false);
    expect(isLayoutGridDimensionsValid(7, 7)).toBe(false);
  });
});
