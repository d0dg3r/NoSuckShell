import { createPortal } from "react-dom";
import { useClampedContextMenuPosition } from "../hooks/useClampedContextMenuPosition";

export type FilePaneContextMenuAction =
  | "newFolder"
  | "newFile"
  | "refresh"
  | "paste"
  | "copy"
  | "rename"
  | "delete"
  | "editFile"
  | "openInOs";

type Props = {
  x: number;
  y: number;
  /** Row under cursor, if any */
  selectedName: string | null;
  selectedIsDir: boolean;
  canPaste: boolean;
  /** Local only: show “Open with system” for files */
  showOpenInOs: boolean;
  onAction: (action: FilePaneContextMenuAction) => void;
  onDismiss: () => void;
};

export function FilePaneContextMenu({
  x,
  y,
  selectedName,
  selectedIsDir,
  canPaste,
  showOpenInOs,
  onAction,
  onDismiss,
}: Props) {
  const { menuRef, style } = useClampedContextMenuPosition(true, x, y, [
    selectedName,
    selectedIsDir,
    canPaste,
    showOpenInOs,
  ]);

  const hasSelection = Boolean(selectedName);
  const showOpen = showOpenInOs && hasSelection && !selectedIsDir;
  const showEdit = hasSelection && !selectedIsDir;
  const showCopy = hasSelection && !selectedIsDir;

  /** Portals to body so position:fixed matches viewport clientX/Y (avoids backdrop-filter containing block on .panel). */
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <>
      <div
        className="file-pane-context-scrim"
        role="presentation"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={() => onDismiss()}
      />
      <div
        ref={menuRef}
        className="context-menu file-pane-context-menu"
        style={style}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenuCapture={(e) => e.preventDefault()}
      >
        <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("newFolder")}>
          New folder…
        </button>
        <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("newFile")}>
          New text file…
        </button>
        <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("refresh")}>
          Refresh
        </button>
        {canPaste ? (
          <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("paste")}>
            Paste
          </button>
        ) : null}
        {hasSelection ? (
          <>
            {showCopy ? (
              <button type="button" role="menuitem" className="context-menu-item separator-above" onClick={() => onAction("copy")}>
                Copy
              </button>
            ) : null}
            {showEdit ? (
              <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("editFile")}>
                Edit file…
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={`context-menu-item ${showCopy || showEdit ? "" : "separator-above"}`}
              onClick={() => onAction("rename")}
            >
              Rename…
            </button>
            <button type="button" role="menuitem" className="context-menu-item" onClick={() => onAction("delete")}>
              Delete…
            </button>
            {showOpen ? (
              <button type="button" role="menuitem" className="context-menu-item separator-above" onClick={() => onAction("openInOs")}>
                Open with system
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </>,
    portalTarget,
  );
}
