import { useEffect, useRef, useState } from "react";

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

  return (
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
    </div>
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

  const kind = isDir ? "folder" : "file";

  return (
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
              Remove <strong>{targetLabel}</strong>? Empty folders only; non-empty folders will show an error.
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
    </div>
  );
}
