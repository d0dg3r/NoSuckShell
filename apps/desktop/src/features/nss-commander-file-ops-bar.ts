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
