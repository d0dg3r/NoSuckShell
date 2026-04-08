import { useEffect, useRef } from "react";
import type { NssOpsPaneKind } from "./nss-commander-file-ops-bar";
import {
  archiveEnabled,
  canCopyOrMoveInDirection,
  deleteEnabled,
  editTextFileEnabled,
  mkdirEnabled,
  renameEnabled,
  resolveNssCommanderCopyMoveBaseDirection,
  reverseNssCommanderCopyMoveDirection,
  viewInSystemEnabled,
} from "./nss-commander-file-ops-bar";

export type NssCommanderFileOpKeyboardProps = {
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
  onViewFile: () => void;
  onMkdir: () => void;
  onEditTextFile: () => void;
  onArchive: () => void;
  onRefresh: () => void;
  /** F5/F6 with no valid source selection (e.g. neither pane has a selection). */
  onCopyMoveNoSelection?: () => void;
};

/** When true, NSS-Commander F2–F9 / Ctrl+R should not steal the key (terminal, editors, form fields, modal dialogs). */
export function nssCommanderKeyboardShortcutTargetBlocksShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.closest("[data-nosuckshell-terminal-host]")) {
    return true;
  }
  if (target.closest(".monaco-editor")) {
    return true;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest('[role="dialog"][aria-modal="true"]')) {
    return true;
  }
  return false;
}

/**
 * Window capture listener so F2–F9 and Ctrl+R match the NSS-Commander ops UI (F-key bar or classic gutter).
 * Skips targets that should keep keyboard focus (terminal, text fields, Monaco).
 */
export function useNssCommanderFileOpKeyboardShortcuts(props: NssCommanderFileOpKeyboardProps): void {
  const ref = useRef(props);
  ref.current = props;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      if (document.querySelector(".file-pane-dialog-overlay") !== null) {
        return;
      }
      if (nssCommanderKeyboardShortcutTargetBlocksShortcuts(e.target)) {
        return;
      }

      const p = ref.current;

      if ((e.key === "r" || e.key === "R") && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        p.onRefresh();
        return;
      }

      if (!e.key.startsWith("F")) {
        return;
      }
      const n = Number.parseInt(e.key.slice(1), 10);
      if (Number.isNaN(n) || n < 2 || n > 9) {
        return;
      }

      const activeKind: NssOpsPaneKind =
        p.activePaneIndex === p.leftPaneIndex
          ? p.leftKind
          : p.activePaneIndex === p.rightPaneIndex
            ? p.rightKind
            : "terminal";
      const activeSelectionSize =
        p.activePaneIndex === p.leftPaneIndex
          ? p.leftSelection.length
          : p.activePaneIndex === p.rightPaneIndex
            ? p.rightSelection.length
            : 0;

      const baseCopyDir = resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: p.activePaneIndex,
        leftPaneIndex: p.leftPaneIndex,
        rightPaneIndex: p.rightPaneIndex,
        leftSelectionCount: p.leftSelection.length,
        rightSelectionCount: p.rightSelection.length,
      });
      const copyMoveDir: "left" | "right" | null =
        baseCopyDir === null
          ? null
          : n === 5 || n === 6
            ? e.shiftKey
              ? reverseNssCommanderCopyMoveDirection(baseCopyDir)
              : baseCopyDir
            : null;
      const sourceSelectionForCopyMove =
        copyMoveDir === null ? 0 : copyMoveDir === "right" ? p.leftSelection.length : p.rightSelection.length;
      const copyMoveOk =
        copyMoveDir !== null &&
        canCopyOrMoveInDirection({
          leftKind: p.leftKind,
          rightKind: p.rightKind,
          direction: copyMoveDir,
          sourceSelectionSize: sourceSelectionForCopyMove,
        });

      const run = (fn: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };

      switch (n) {
        case 2:
          if (!renameEnabled(activeSelectionSize, activeKind)) {
            return;
          }
          run(p.onRename);
          break;
        case 3:
          if (!viewInSystemEnabled(activeSelectionSize, activeKind)) {
            return;
          }
          run(p.onViewFile);
          break;
        case 4:
          if (!editTextFileEnabled(activeSelectionSize, activeKind)) {
            return;
          }
          run(p.onEditTextFile);
          break;
        case 5:
          if (baseCopyDir === null) {
            e.preventDefault();
            e.stopPropagation();
            p.onCopyMoveNoSelection?.();
            return;
          }
          if (!copyMoveOk || copyMoveDir === null) {
            return;
          }
          run(copyMoveDir === "left" ? p.onCopyToLeft : p.onCopyToRight);
          break;
        case 6:
          if (baseCopyDir === null) {
            e.preventDefault();
            e.stopPropagation();
            p.onCopyMoveNoSelection?.();
            return;
          }
          if (!copyMoveOk || copyMoveDir === null) {
            return;
          }
          run(copyMoveDir === "left" ? p.onMoveToLeft : p.onMoveToRight);
          break;
        case 7:
          if (!mkdirEnabled(activeKind)) {
            return;
          }
          run(p.onMkdir);
          break;
        case 8:
          if (!deleteEnabled(activeSelectionSize, activeKind)) {
            return;
          }
          run(p.onDelete);
          break;
        case 9:
          if (!archiveEnabled(activeSelectionSize, activeKind, false)) {
            return;
          }
          run(p.onArchive);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
