import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function filePaneDialogPortalTarget(): HTMLElement | null {
  return typeof document !== "undefined" ? document.body : null;
}

type TextPromptProps = {
  open: boolean;
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function FilePaneTextPrompt({
  open,
  title,
  initialValue = "",
  confirmLabel = "OK",
  onConfirm,
  onCancel,
}: TextPromptProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) {
    return null;
  }

  const target = filePaneDialogPortalTarget();
  if (!target) {
    return null;
  }

  return createPortal(
    <div
      className="file-pane-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="file-pane-dialog panel" role="dialog" aria-modal="true" aria-labelledby="file-pane-prompt-title">
        <h3 id="file-pane-prompt-title" className="file-pane-dialog-title">
          {title}
        </h3>
        <input
          ref={inputRef}
          type="text"
          className="input file-pane-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onCancel();
            }
            if (e.key === "Enter") {
              const t = value.trim();
              if (t) {
                onConfirm(t);
              }
            }
          }}
        />
        <div className="file-pane-dialog-actions">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    target,
  );
}

type DoubleDeleteProps = {
  open: boolean;
  targetLabel: string;
  isDir: boolean;
  step: 1 | 2;
  onAdvance: () => void;
  onCancel: () => void;
  onFinalConfirm: () => void;
};

export function FilePaneDoubleDeleteDialog({
  open,
  targetLabel,
  isDir,
  step,
  onAdvance,
  onCancel,
  onFinalConfirm,
}: DoubleDeleteProps) {
  if (!open) {
    return null;
  }

  const target = filePaneDialogPortalTarget();
  if (!target) {
    return null;
  }

  const kind = isDir ? "folder" : "file";

  return createPortal(
    <div
      className="file-pane-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="file-pane-dialog panel" role="alertdialog" aria-modal="true">
        {step === 1 ? (
          <>
            <h3 className="file-pane-dialog-title">Delete {kind}?</h3>
            <p className="muted-copy">
              Remove <strong>{targetLabel}</strong>
              {isDir
                ? "? This deletes the folder and everything inside it."
                : "?"}
            </p>
            <div className="file-pane-dialog-actions">
              <button type="button" className="btn btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={onAdvance}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="file-pane-dialog-title">Confirm deletion</h3>
            <p className="muted-copy">
              Last step: permanently delete <strong>{targetLabel}</strong>? This cannot be undone.
            </p>
            <div className="file-pane-dialog-actions">
              <button type="button" className="btn btn-sm" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-sm action-icon-btn-danger" onClick={onFinalConfirm}>
                Delete permanently
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    target,
  );
}

export type FilePaneConfirmDialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  alternateLabel?: string;
  cancelLabel?: string;
  /** When true, confirm button uses danger styling. */
  confirmDanger?: boolean;
  onConfirm: () => void;
  onAlternate?: () => void;
  onCancel: () => void;
};

export function FilePaneConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "OK",
  alternateLabel,
  cancelLabel = "Cancel",
  confirmDanger = false,
  onConfirm,
  onAlternate,
  onCancel,
}: FilePaneConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const target = filePaneDialogPortalTarget();
  if (!target) {
    return null;
  }

  return createPortal(
    <div
      className="file-pane-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="file-pane-dialog panel" role="alertdialog" aria-modal="true" aria-labelledby="file-pane-confirm-title">
        <h3 id="file-pane-confirm-title" className="file-pane-dialog-title">
          {title}
        </h3>
        {children ? <div className="file-pane-dialog-body muted-copy">{children}</div> : null}
        <div className="file-pane-dialog-actions">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          {alternateLabel && onAlternate ? (
            <button type="button" className="btn btn-sm" onClick={onAlternate}>
              {alternateLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={confirmDanger ? "btn btn-sm action-icon-btn-danger" : "btn btn-sm btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    target,
  );
}
