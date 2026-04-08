import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isEditableShortcutTarget } from "../features/keyboard-shortcuts-match";

function filePaneDialogPortalTarget(): HTMLElement | null {
  return typeof document !== "undefined" ? document.body : null;
}

/** Let focused buttons handle Enter natively; skip embedded fields for dialog-level Enter → confirm. */
function dialogEnterConfirmSuppressed(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (isEditableShortcutTarget(target)) {
    return true;
  }
  if (target.closest(".file-pane-dialog-actions button")) {
    return true;
  }
  return false;
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
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Enter" && e.key !== "NumpadEnter") {
        return;
      }
      if (dialogEnterConfirmSuppressed(t)) {
        return;
      }
      const trimmed = valueRef.current.trim();
      if (!trimmed) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onConfirm(trimmed);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onCancel, onConfirm]);

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
        <div className="file-pane-dialog__head">
          <h3 id="file-pane-prompt-title" className="file-pane-dialog-title">
            {title}
          </h3>
        </div>
        <input
          ref={inputRef}
          type="text"
          className="input file-pane-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
            if (e.key === "Enter") {
              e.preventDefault();
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
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Enter" && e.key !== "NumpadEnter") {
        return;
      }
      if (dialogEnterConfirmSuppressed(t)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (step === 1) {
        onAdvance();
      } else {
        onFinalConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, step, onCancel, onAdvance, onFinalConfirm]);

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
            <div className="file-pane-dialog__head">
              <h3 className="file-pane-dialog-title">Delete {kind}?</h3>
            </div>
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
            <div className="file-pane-dialog__head">
              <h3 className="file-pane-dialog-title">Confirm deletion</h3>
            </div>
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
  skipLabel?: string;
  cancelLabel?: string;
  /** When true, confirm button uses danger styling. */
  confirmDanger?: boolean;
  onConfirm: () => void;
  onAlternate?: () => void;
  onSkip?: () => void;
  onCancel: () => void;
};

export function FilePaneConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "OK",
  alternateLabel,
  skipLabel,
  cancelLabel = "Cancel",
  confirmDanger = false,
  onConfirm,
  onAlternate,
  onSkip,
  onCancel,
}: FilePaneConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    const focusFirstAction = () => {
      const actions = panel?.querySelector(".file-pane-dialog-actions");
      const first = actions?.querySelector("button:not([disabled])");
      if (first instanceof HTMLElement) {
        first.focus();
      }
    };
    queueMicrotask(focusFirstAction);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const panel = panelRef.current;
      const actionsEl = panel?.querySelector(".file-pane-dialog-actions");
      const buttons = actionsEl
        ? ([...actionsEl.querySelectorAll("button:not([disabled])")] as HTMLButtonElement[])
        : [];

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && buttons.length > 0) {
        const current = document.activeElement;
        let idx = current instanceof HTMLButtonElement ? buttons.indexOf(current) : -1;
        if (idx < 0) {
          if (e.key === "ArrowRight") {
            buttons[0]?.focus();
          } else {
            buttons[buttons.length - 1]?.focus();
          }
        } else {
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const next = (idx + delta + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key === "Tab" && buttons.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ae = document.activeElement;
        if (!panel?.contains(ae)) {
          e.preventDefault();
          e.stopPropagation();
          (e.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
          return;
        }
        if (e.shiftKey && ae === buttons[0]) {
          e.preventDefault();
          e.stopPropagation();
          buttons[buttons.length - 1]?.focus();
          return;
        }
        if (!e.shiftKey && ae === buttons[buttons.length - 1]) {
          e.preventDefault();
          e.stopPropagation();
          buttons[0]?.focus();
          return;
        }
      }

      if (e.key !== "Enter" && e.key !== "NumpadEnter") {
        return;
      }
      if (dialogEnterConfirmSuppressed(t)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onConfirm();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onCancel, onConfirm]);

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
      <div
        ref={panelRef}
        className="file-pane-dialog panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="file-pane-confirm-title"
      >
        <div className="file-pane-dialog__head">
          <h3 id="file-pane-confirm-title" className="file-pane-dialog-title">
            {title}
          </h3>
        </div>
        {children ? <div className="file-pane-dialog-body muted-copy">{children}</div> : null}
        <div className="file-pane-dialog-actions">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          {skipLabel && onSkip ? (
            <button type="button" className="btn btn-sm" onClick={onSkip}>
              {skipLabel}
            </button>
          ) : null}
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

export type NssCommanderPreXferDialogProps = {
  open: boolean;
  mode: "copy" | "move";
  /** Shown as “From: …” context (read-only). */
  sourceLabel: string;
  /** Initial destination path (local path key or remote path). */
  initialDestPath: string;
  itemCount: number;
  /** Inline validation message from the host. */
  errorMessage?: string | null;
  onConfirm: (destinationPath: string) => void;
  onCancel: () => void;
};

/** NSS-Commander copy/move confirmation with editable destination path (matrix-styled via body.nss-commander-workspace). */
export function NssCommanderPreXferDialog({
  open,
  mode,
  sourceLabel,
  initialDestPath,
  itemCount,
  errorMessage,
  onConfirm,
  onCancel,
}: NssCommanderPreXferDialogProps) {
  const [destPath, setDestPath] = useState(initialDestPath);
  const destPathRef = useRef(destPath);
  destPathRef.current = destPath;
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDestPath(initialDestPath);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open, initialDestPath]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const actionsEl = panel?.querySelector(".file-pane-dialog-actions");
      const buttons = actionsEl
        ? ([...actionsEl.querySelectorAll("button:not([disabled])")] as HTMLButtonElement[])
        : [];

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === "F5") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(destPathRef.current.trim());
        return;
      }

      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && buttons.length > 0) {
        const current = document.activeElement;
        let idx = current instanceof HTMLButtonElement ? buttons.indexOf(current) : -1;
        if (idx < 0) {
          if (e.key === "ArrowRight") {
            buttons[0]?.focus();
          } else {
            buttons[buttons.length - 1]?.focus();
          }
        } else {
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const next = (idx + delta + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key === "Tab" && buttons.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ae = document.activeElement;
        if (!panel?.contains(ae)) {
          e.preventDefault();
          e.stopPropagation();
          (e.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
          return;
        }
        if (e.shiftKey && ae === buttons[0]) {
          e.preventDefault();
          e.stopPropagation();
          buttons[buttons.length - 1]?.focus();
          return;
        }
        if (!e.shiftKey && ae === buttons[buttons.length - 1]) {
          e.preventDefault();
          e.stopPropagation();
          buttons[0]?.focus();
          return;
        }
      }

      if (e.key !== "Enter" && e.key !== "NumpadEnter") {
        return;
      }
      if (dialogEnterConfirmSuppressed(t)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onConfirm(destPathRef.current.trim());
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, onCancel, onConfirm]);

  if (!open) {
    return null;
  }

  const target = filePaneDialogPortalTarget();
  if (!target) {
    return null;
  }

  const title = mode === "move" ? "Move" : "Copy";
  const verb = mode === "move" ? "Move" : "Copy";

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
      <div
        ref={panelRef}
        className="file-pane-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nss-commander-pre-xfer-title"
      >
        <div className="file-pane-dialog__head">
          <h3 id="nss-commander-pre-xfer-title" className="file-pane-dialog-title">
            {title}
          </h3>
        </div>
        <div className="file-pane-dialog-body muted-copy">
          <p>
            {verb} {itemCount} {itemCount === 1 ? "item" : "items"} to:
          </p>
          <p>
            <strong>From:</strong> {sourceLabel}
          </p>
          <label className="sr-only" htmlFor="nss-commander-pre-xfer-dest">
            Destination path
          </label>
          <input
            id="nss-commander-pre-xfer-dest"
            ref={inputRef}
            type="text"
            className="input file-pane-dialog-input"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "NumpadEnter") {
                e.preventDefault();
                onConfirm(destPath.trim());
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {errorMessage ? (
            <p className="nss-commander-pre-xfer-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div className="file-pane-dialog-actions">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            <kbd className="nss-commander-dialog-kbd">Esc</kbd>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onConfirm(destPath.trim())}
          >
            <kbd className="nss-commander-dialog-kbd">F5</kbd>
            {verb}
          </button>
        </div>
      </div>
    </div>,
    target,
  );
}
