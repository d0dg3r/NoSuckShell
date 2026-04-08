/** Pure helpers for NSS-Commander vertical file ops toolbar (testable, no React). */

export type NssOpsPaneKind = "local" | "remote" | "terminal";

export function canCopyOrMoveInDirection(args: {
  leftKind: NssOpsPaneKind;
  rightKind: NssOpsPaneKind;
  direction: "left" | "right";
  sourceSelectionSize: number;
}): boolean {
  if (args.sourceSelectionSize === 0) {
    return false;
  }
  const sourceKind = args.direction === "left" ? args.rightKind : args.leftKind;
  const destKind = args.direction === "left" ? args.leftKind : args.rightKind;
  if (sourceKind === "terminal" || destKind === "terminal") {
    return false;
  }
  if (sourceKind === "remote" && destKind === "remote") {
    return false;
  }
  return true;
}

export function deleteEnabled(selectionSize: number, paneKind: NssOpsPaneKind): boolean {
  return paneKind !== "terminal" && selectionSize > 0;
}

export function renameEnabled(selectionSize: number, paneKind: NssOpsPaneKind): boolean {
  return paneKind !== "terminal" && selectionSize === 1;
}

export function mkdirEnabled(paneKind: NssOpsPaneKind): boolean {
  return paneKind === "local" || paneKind === "remote";
}

export function newTextFileEnabled(paneKind: NssOpsPaneKind): boolean {
  return mkdirEnabled(paneKind);
}

export function editTextFileEnabled(selectionSize: number, paneKind: NssOpsPaneKind): boolean {
  return renameEnabled(selectionSize, paneKind);
}

/** Open in system viewer (F3): one selected item in a file pane; remote folders are rejected in the pane. */
export function viewInSystemEnabled(selectionSize: number, paneKind: NssOpsPaneKind): boolean {
  return paneKind !== "terminal" && selectionSize === 1;
}

export function archiveEnabled(selectionSize: number, paneKind: NssOpsPaneKind, exportBusy: boolean): boolean {
  return !exportBusy && paneKind !== "terminal" && selectionSize > 0;
}

/**
 * Auto-direction for F-key Copy/Move: operates FROM the focused pane TO the other pane.
 * Returns "left" when the focused pane is on the right (copy/move towards left),
 * "right" when the focused pane is on the left (copy/move towards right).
 */
export function resolveAutoDirection(
  activePaneIndex: number,
  leftPaneIndex: number,
  rightPaneIndex: number,
): "left" | "right" {
  if (activePaneIndex === rightPaneIndex) return "left";
  if (activePaneIndex === leftPaneIndex) return "right";
  return "right";
}

/**
 * Copy/move direction: `"right"` = from left pane toward right, `"left"` = from right toward left.
 * If only one pane has a selection, that pane is always the source (fixes F5 when focus is on the other pane).
 * If both have selections, falls back to {@link resolveAutoDirection}.
 * Returns `null` when neither side has a selection.
 */
export function resolveNssCommanderCopyMoveBaseDirection(args: {
  activePaneIndex: number;
  leftPaneIndex: number;
  rightPaneIndex: number;
  leftSelectionCount: number;
  rightSelectionCount: number;
}): "left" | "right" | null {
  const leftHas = args.leftSelectionCount > 0;
  const rightHas = args.rightSelectionCount > 0;
  if (leftHas && !rightHas) {
    return "right";
  }
  if (!leftHas && rightHas) {
    return "left";
  }
  if (!leftHas && !rightHas) {
    return null;
  }
  return resolveAutoDirection(args.activePaneIndex, args.leftPaneIndex, args.rightPaneIndex);
}

/** Reverse copy/move direction (Shift+F5 / Shift+F6). */
export function reverseNssCommanderCopyMoveDirection(dir: "left" | "right"): "left" | "right" {
  return dir === "left" ? "right" : "left";
}
