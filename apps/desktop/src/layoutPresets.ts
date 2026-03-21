import type { LayoutSplitTreeNode } from "./types";

const leaf = (paneIndex: number): LayoutSplitTreeNode => ({
  id: `leaf-${paneIndex}`,
  type: "leaf",
  paneIndex,
});

const split = (
  id: string,
  axis: "horizontal" | "vertical",
  ratio: number,
  first: LayoutSplitTreeNode,
  second: LayoutSplitTreeNode,
): LayoutSplitTreeNode => ({
  id,
  type: "split",
  axis,
  ratio,
  first,
  second,
});

export type LayoutPresetDefinition = {
  id: string;
  title: string;
  description: string;
  splitTree: LayoutSplitTreeNode;
};

/** Preset split trees use paneIndex 0..n-1; IDs are normalized on parse in the app. */
export const LAYOUT_PRESET_DEFINITIONS: LayoutPresetDefinition[] = [
  {
    id: "single",
    title: "1 Pane",
    description: "Single full-width terminal",
    splitTree: leaf(0),
  },
  {
    id: "split-v-50",
    title: "50/50 vertical",
    description: "Top and bottom",
    splitTree: split("preset-split-v", "vertical", 0.5, leaf(0), leaf(1)),
  },
  {
    id: "split-h-50",
    title: "50/50 horizontal",
    description: "Side by side",
    splitTree: split("preset-split-h", "horizontal", 0.5, leaf(0), leaf(1)),
  },
  {
    id: "main-sidebar",
    title: "Main + sidebar",
    description: "Wide pane with a narrow strip",
    splitTree: split("preset-main-sidebar", "horizontal", 0.72, leaf(0), leaf(1)),
  },
  {
    id: "grid-2x2",
    title: "2×2 grid",
    description: "Four equal panes",
    splitTree: split(
      "preset-2x2-v",
      "vertical",
      0.5,
      split("preset-2x2-t", "horizontal", 0.5, leaf(0), leaf(1)),
      split("preset-2x2-b", "horizontal", 0.5, leaf(2), leaf(3)),
    ),
  },
];
