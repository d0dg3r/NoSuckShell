import { useEffect, useState } from "react";
import type { NssOpsPaneKind } from "../features/nss-commander-file-ops-bar";
import {
  archiveEnabled,
  canCopyOrMoveInDirection,
  deleteEnabled,
  editTextFileEnabled,
  mkdirEnabled,
  renameEnabled,
  resolveAutoDirection,
} from "../features/nss-commander-file-ops-bar";

export type NssCommanderFKeyBarProps = {
  leftPaneIndex: number;
  rightPaneIndex: number;
  activePaneIndex: number;
  leftKind: NssOpsPaneKind;
  rightKind: NssOpsPaneKind;
  leftSelection: readonly string[];
  rightSelection: readonly string[];
  onCopyToLeft: () => void;
  onCopyToRight: () => void;
  onMoveToLeft: () => void;
  onMoveToRight: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMkdir: () => void;
  onEditTextFile: () => void;
  onArchive: () => void;
  onRefresh: () => void;
};

export function NssCommanderFKeyBar({
  leftPaneIndex,
  rightPaneIndex,
  activePaneIndex,
  leftKind,
  rightKind,
  leftSelection,
  rightSelection,
  onCopyToLeft,
  onCopyToRight,
  onMoveToLeft,
  onMoveToRight,
  onDelete,
  onRename,
  onMkdir,
  onEditTextFile,
  onArchive,
  onRefresh,
}: NssCommanderFKeyBarProps) {
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const autoDir = resolveAutoDirection(activePaneIndex, leftPaneIndex, rightPaneIndex);
  const reverseDir = autoDir === "left" ? "right" : "left";
  const dir = shiftHeld ? reverseDir : autoDir;

  const activeKind: NssOpsPaneKind =
    activePaneIndex === leftPaneIndex ? leftKind : activePaneIndex === rightPaneIndex ? rightKind : "terminal";
  const activeSelectionSize =
    activePaneIndex === leftPaneIndex ? leftSelection.length : activePaneIndex === rightPaneIndex ? rightSelection.length : 0;

  const sourceSelectionForDir = dir === "right" ? leftSelection.length : rightSelection.length;

  const copyDisabled = !canCopyOrMoveInDirection({
    leftKind,
    rightKind,
    direction: dir,
    sourceSelectionSize: sourceSelectionForDir,
  });
  const moveDisabled = copyDisabled;
  const delDisabled = !deleteEnabled(activeSelectionSize, activeKind);
  const renDisabled = !renameEnabled(activeSelectionSize, activeKind);
  const mkDisabled = !mkdirEnabled(activeKind);
  const editDisabled = !editTextFileEnabled(activeSelectionSize, activeKind);
  const archDisabled = !archiveEnabled(activeSelectionSize, activeKind, false);

  const copyHandler = dir === "left" ? onCopyToLeft : onCopyToRight;
  const moveHandler = dir === "left" ? onMoveToLeft : onMoveToRight;
  const dirArrow = dir === "left" ? "←" : "→";

  return (
    <div className="nss-commander-fkey-bar" role="toolbar" aria-label="File operations (F-keys)">
      <button type="button" className="nss-commander-fkey-btn" disabled={editDisabled} onClick={onEditTextFile} title="Edit selected file (F4)">
        <kbd>F4</kbd> Edit
      </button>
      <button type="button" className="nss-commander-fkey-btn" disabled={copyDisabled} onClick={copyHandler} title={`Copy ${dirArrow} (F5, Shift+F5 reverse)`}>
        <kbd>F5</kbd> Copy {dirArrow}
      </button>
      <button type="button" className="nss-commander-fkey-btn" disabled={moveDisabled} onClick={moveHandler} title={`Move ${dirArrow} (F6, Shift+F6 reverse)`}>
        <kbd>F6</kbd> Move {dirArrow}
      </button>
      <button type="button" className="nss-commander-fkey-btn" disabled={mkDisabled} onClick={onMkdir} title="New folder (F7)">
        <kbd>F7</kbd> Mkdir
      </button>
      <button type="button" className="nss-commander-fkey-btn nss-commander-fkey-btn--danger" disabled={delDisabled} onClick={onDelete} title="Delete selected (F8)">
        <kbd>F8</kbd> Del
      </button>
      <button type="button" className="nss-commander-fkey-btn" disabled={archDisabled} onClick={onArchive} title="Pack archive (F9)">
        <kbd>F9</kbd> Arch
      </button>
      <button type="button" className="nss-commander-fkey-btn" disabled={renDisabled} onClick={onRename} title="Rename selected (F10)">
        <kbd>F10</kbd> Ren
      </button>
      <button type="button" className="nss-commander-fkey-btn nss-commander-fkey-btn--refresh" onClick={onRefresh} title="Refresh both panes (Ctrl+R)">
        ↻
      </button>
    </div>
  );
}
