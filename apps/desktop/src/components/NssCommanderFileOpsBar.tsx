import type { ReactNode } from "react";
import type { NssOpsPaneKind } from "../features/nss-commander-file-ops-bar";
import {
  archiveEnabled,
  canCopyOrMoveInDirection,
  deleteEnabled,
  editTextFileEnabled,
  mkdirEnabled,
  newTextFileEnabled,
  renameEnabled,
} from "../features/nss-commander-file-ops-bar";

export type NssCommanderFileOpsBarProps = {
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
  onNewTextFile: () => void;
  onEditTextFile: () => void;
  onArchive: () => void;
  onRefresh: () => void;
};

function IconBtn({
  title,
  ariaLabel,
  disabled,
  onClick,
  stack,
  children,
}: {
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
  stack?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`nss-commander-ops-icon-btn${stack ? " nss-commander-ops-icon-btn--stack" : ""}`}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCopyPair() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 16H4a1 1 0 01-1-1V4a1 1 0 011-1h11a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconMovePair() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h10M12 8l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="5" width="8" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFilePlus() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconFileCode() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconFolderPlus() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v4H4V6z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 10h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 11-2.64-6.36M21 3v6h-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLockFuture() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconUserFuture() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 20v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconUnpackFuture() {
  return (
    <svg className="nss-commander-ops-svg" width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 10V6a4 4 0 018 0v4M12 14v6M9 17h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function NssCommanderFileOpsBar({
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
  onNewTextFile,
  onEditTextFile,
  onArchive,
  onRefresh,
}: NssCommanderFileOpsBarProps) {
  const activeKind: NssOpsPaneKind =
    activePaneIndex === leftPaneIndex ? leftKind : activePaneIndex === rightPaneIndex ? rightKind : "terminal";
  const activeSelectionSize =
    activePaneIndex === leftPaneIndex ? leftSelection.length : activePaneIndex === rightPaneIndex ? rightSelection.length : 0;

  const copyLeftDisabled = !canCopyOrMoveInDirection({
    leftKind,
    rightKind,
    direction: "left",
    sourceSelectionSize: rightSelection.length,
  });
  const copyRightDisabled = !canCopyOrMoveInDirection({
    leftKind,
    rightKind,
    direction: "right",
    sourceSelectionSize: leftSelection.length,
  });
  const moveLeftDisabled = copyLeftDisabled;
  const moveRightDisabled = copyRightDisabled;

  const delDisabled = !deleteEnabled(activeSelectionSize, activeKind);
  const renDisabled = !renameEnabled(activeSelectionSize, activeKind);
  const mkDisabled = !mkdirEnabled(activeKind);
  const newTextDisabled = !newTextFileEnabled(activeKind);
  const editTextDisabled = !editTextFileEnabled(activeSelectionSize, activeKind);
  const archDisabled = !archiveEnabled(activeSelectionSize, activeKind, false);

  const notYet = "Not available yet";

  return (
    <div className="nss-commander-ops-bar" role="toolbar" aria-label="File operations">
      <div className="nss-commander-ops-row nss-commander-ops-row--pair">
        <IconBtn
          title="Copy from right pane to left (selected items)"
          ariaLabel="Copy from right to left"
          disabled={copyLeftDisabled}
          onClick={onCopyToLeft}
          stack
        >
          <ChevronLeft />
          <IconCopyPair />
        </IconBtn>
        <IconBtn
          title="Copy from left pane to right (selected items)"
          ariaLabel="Copy from left to right"
          disabled={copyRightDisabled}
          onClick={onCopyToRight}
          stack
        >
          <IconCopyPair />
          <ChevronRight />
        </IconBtn>
      </div>
      <div className="nss-commander-ops-row nss-commander-ops-row--pair">
        <IconBtn
          title="Move from right pane to left (selected items)"
          ariaLabel="Move from right to left"
          disabled={moveLeftDisabled}
          onClick={onMoveToLeft}
          stack
        >
          <ChevronLeft />
          <IconMovePair />
        </IconBtn>
        <IconBtn
          title="Move from left pane to right (selected items)"
          ariaLabel="Move from left to right"
          disabled={moveRightDisabled}
          onClick={onMoveToRight}
          stack
        >
          <IconMovePair />
          <ChevronRight />
        </IconBtn>
      </div>
      <div className="nss-commander-ops-sep" aria-hidden="true" />
      <IconBtn title="Delete selected in focused pane" ariaLabel="Delete selected" disabled={delDisabled} onClick={onDelete}>
        <IconTrash />
      </IconBtn>
      <IconBtn title="Rename selected item in focused pane" ariaLabel="Rename" disabled={renDisabled} onClick={onRename}>
        <IconPencil />
      </IconBtn>
      <IconBtn title="New folder in focused pane" ariaLabel="New folder" disabled={mkDisabled} onClick={onMkdir}>
        <IconFolderPlus />
      </IconBtn>
      <IconBtn
        title="New text file in focused pane"
        ariaLabel="New text file"
        disabled={newTextDisabled}
        onClick={onNewTextFile}
      >
        <IconFilePlus />
      </IconBtn>
      <IconBtn
        title="Edit selected file in focused pane"
        ariaLabel="Edit text file"
        disabled={editTextDisabled}
        onClick={onEditTextFile}
      >
        <IconFileCode />
      </IconBtn>
      <IconBtn
        title="Pack selected items to archive (focused pane)"
        ariaLabel="Pack archive"
        disabled={archDisabled}
        onClick={onArchive}
      >
        <IconArchive />
      </IconBtn>
      <IconBtn title={notYet} ariaLabel="Extract archive — not available yet" disabled onClick={() => undefined}>
        <IconUnpackFuture />
      </IconBtn>
      <IconBtn title={notYet} ariaLabel="Change permissions — not available yet" disabled onClick={() => undefined}>
        <IconLockFuture />
      </IconBtn>
      <IconBtn title={notYet} ariaLabel="Change owner — not available yet" disabled onClick={() => undefined}>
        <IconUserFuture />
      </IconBtn>
      <div className="nss-commander-ops-sep" aria-hidden="true" />
      <IconBtn title="Refresh both file panes" ariaLabel="Refresh both panes" onClick={onRefresh}>
        <IconRefresh />
      </IconBtn>
    </div>
  );
}
