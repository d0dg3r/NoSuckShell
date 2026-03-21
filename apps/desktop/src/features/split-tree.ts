import type { LayoutSplitTreeNode } from "../types";
import { createId } from "./app-id";

/** Limits for Layout Command Center custom grid UI. */
export const LAYOUT_GRID_MAX_ROWS = 12;
export const LAYOUT_GRID_MAX_COLS = 12;
export const LAYOUT_GRID_MAX_PANES = 48;

export type SplitAxis = "horizontal" | "vertical";
export type SplitLeafNode = { id: string; type: "leaf"; paneIndex: number };
export type SplitContainerNode = {
  id: string;
  type: "split";
  axis: SplitAxis;
  ratio: number;
  first: SplitTreeNode;
  second: SplitTreeNode;
};
export type SplitTreeNode = SplitLeafNode | SplitContainerNode;
export type SplitResizeState = { splitId: string; axis: SplitAxis };

export const DEFAULT_SPLIT_RATIO = 0.6;
export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

export const createLeafNode = (paneIndex: number): SplitLeafNode => ({
  id: `leaf-${paneIndex}`,
  type: "leaf",
  paneIndex,
});

export const cloneSplitTree = (node: SplitTreeNode): SplitTreeNode =>
  node.type === "leaf"
    ? { ...node }
    : {
        ...node,
        first: cloneSplitTree(node.first),
        second: cloneSplitTree(node.second),
      };

export const rebalanceSplitTree = (node: SplitTreeNode): SplitTreeNode => {
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

export const replacePaneInTree = (
  node: SplitTreeNode,
  targetPaneIndex: number,
  createReplacement: (leaf: SplitLeafNode) => SplitTreeNode,
): SplitTreeNode => {
  if (node.type === "leaf") {
    return node.paneIndex === targetPaneIndex ? createReplacement(node) : node;
  }
  return {
    ...node,
    first: replacePaneInTree(node.first, targetPaneIndex, createReplacement),
    second: replacePaneInTree(node.second, targetPaneIndex, createReplacement),
  };
};

export const updateSplitRatioInTree = (node: SplitTreeNode, splitId: string, ratio: number): SplitTreeNode => {
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

export const removePaneFromTree = (node: SplitTreeNode, targetPane: number): SplitTreeNode | null => {
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

export const createTreeFromPaneCount = (paneCount: number): SplitTreeNode => {
  const count = Math.max(1, paneCount);
  let tree: SplitTreeNode = createLeafNode(0);
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

const buildEqualGridRow = (cols: number, startPane: number, idPrefix: string): SplitTreeNode => {
  if (cols <= 1) {
    return createLeafNode(startPane);
  }
  return {
    id: `${idPrefix}-h-${startPane}`,
    type: "split",
    axis: "horizontal",
    ratio: 1 / cols,
    first: createLeafNode(startPane),
    second: buildEqualGridRow(cols - 1, startPane + 1, idPrefix),
  };
};

const buildEqualGrid = (rows: number, cols: number, startPane: number, idPrefix: string): SplitTreeNode => {
  if (rows <= 1) {
    return buildEqualGridRow(cols, startPane, idPrefix);
  }
  return {
    id: `${idPrefix}-v-${startPane}`,
    type: "split",
    axis: "vertical",
    ratio: 1 / rows,
    first: buildEqualGridRow(cols, startPane, idPrefix),
    second: buildEqualGrid(rows - 1, cols, startPane + cols, idPrefix),
  };
};

/** Equal M×N pane grid as a binary split tree (row-major pane indices). Ratios may be below MIN_SPLIT_RATIO for many columns/rows. */
export const createEqualGridSplitTree = (rows: number, cols: number): SplitTreeNode => {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const idPrefix = `grid-${createId()}`;
  return buildEqualGrid(r, c, 0, idPrefix);
};

export const isLayoutGridDimensionsValid = (rows: number, cols: number): boolean => {
  const r = Math.floor(rows);
  const c = Math.floor(cols);
  if (!Number.isFinite(r) || !Number.isFinite(c)) {
    return false;
  }
  if (r < 1 || c < 1 || r > LAYOUT_GRID_MAX_ROWS || c > LAYOUT_GRID_MAX_COLS) {
    return false;
  }
  return r * c <= LAYOUT_GRID_MAX_PANES;
};

export const serializeSplitTree = (node: SplitTreeNode): LayoutSplitTreeNode => {
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

export const parseSplitTree = (raw: LayoutSplitTreeNode | null | undefined): SplitTreeNode | null => {
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
      ratio:
        typeof raw.ratio === "number" && Number.isFinite(raw.ratio)
          ? Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, raw.ratio))
          : DEFAULT_SPLIT_RATIO,
      first,
      second,
    };
  }
  return null;
};

export const collectPaneOrder = (node: SplitTreeNode): number[] =>
  node.type === "leaf" ? [node.paneIndex] : [...collectPaneOrder(node.first), ...collectPaneOrder(node.second)];
