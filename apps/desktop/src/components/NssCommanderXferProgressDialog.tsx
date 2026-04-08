import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) {
    return "—";
  }
  if (sec < 60) {
    return `about ${Math.max(1, Math.round(sec))} s`;
  }
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `about ${h} h ${mm} min`;
  }
  return `about ${m} min ${s} s`;
}

export type NssCommanderXferProgressDialogProps = {
  phase: "copy" | "move";
  fileIndex: number;
  fileTotal: number;
  currentName: string;
  /** When set, progress is for a recursive directory copy (per-file bar, not whole batch as one file). */
  folderTree?: boolean;
  /** Current file basename inside a directory tree (from transfer progress events). */
  activeFileName?: string | null;
  /** Top summary line, e.g. total file count / size when known. */
  batchSummary?: string | null;
  bytesDone?: number;
  bytesTotal?: number;
  fileBytesDone?: number;
  fileBytesTotal?: number;
  speedBps?: number;
  etaSeconds?: number | null;
  messages: readonly string[];
  processingLabel?: string;
  paused: boolean;
  canPause: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
};

export function NssCommanderXferProgressDialog({
  phase,
  fileIndex,
  fileTotal,
  currentName,
  folderTree = false,
  activeFileName = null,
  batchSummary,
  bytesDone = 0,
  bytesTotal = 0,
  fileBytesDone = 0,
  fileBytesTotal = 0,
  speedBps = 0,
  etaSeconds,
  messages,
  processingLabel = "Processing",
  paused,
  canPause,
  onTogglePause,
  onCancel,
}: NssCommanderXferProgressDialogProps) {
  const [showDetails, setShowDetails] = useState(true);
  const logScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, showDetails]);

  const panelRef = useRef<HTMLDivElement>(null);

  const bytePct = (() => {
    if (bytesTotal > 0) {
      return Math.min(100, Math.round((bytesDone / bytesTotal) * 100));
    }
    if (folderTree && fileBytesTotal > 0) {
      return Math.min(100, Math.round((fileBytesDone / fileBytesTotal) * 100));
    }
    if (fileTotal > 0) {
      return Math.min(
        100,
        Math.round(
          ((fileIndex - 1 + (fileBytesTotal > 0 ? fileBytesDone / fileBytesTotal : 0)) / fileTotal) * 100,
        ),
      );
    }
    return 0;
  })();

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        e.stopPropagation();
        setShowDetails((v) => !v);
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "F5" && canPause) {
        e.preventDefault();
        e.stopPropagation();
        onTogglePause();
        return;
      }
    },
    [onCancel, onTogglePause, canPause],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onKeyDown]);

  useEffect(() => {
    const panel = panelRef.current;
    const focusFirst = () => {
      const first = panel?.querySelector<HTMLButtonElement>(".nss-commander-xfer-popup-actions-main button:not([disabled])");
      first?.focus();
    };
    queueMicrotask(focusFirst);
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  const title = "Transfer in progress…";
  const verb = phase === "move" ? "Moving" : "Copying";

  const centerLabel =
    bytesTotal > 0
      ? `${bytePct}% (${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)})`
      : folderTree && fileBytesTotal > 0
        ? `${bytePct}% — ${activeFileName ?? "…"} (${formatBytes(fileBytesDone)} / ${formatBytes(fileBytesTotal)})`
        : `${bytePct}% · file ${fileIndex} of ${fileTotal}`;

  const speedLabel = speedBps > 0 ? `${formatBytes(speedBps)}/s` : "—";

  return createPortal(
    <div className="file-pane-dialog-overlay nss-commander-xfer-popup-overlay" role="presentation">
      <div
        ref={panelRef}
        className="file-pane-dialog panel nss-commander-xfer-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nss-commander-xfer-progress-title"
        aria-busy={!paused}
      >
        <div className="file-pane-dialog__head">
          <h2 id="nss-commander-xfer-progress-title" className="file-pane-dialog-title">
            {title}
          </h2>
        </div>
        {batchSummary ? <p className="nss-commander-xfer-popup-summary">{batchSummary}</p> : null}
        <div
          className="nss-commander-xfer-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={bytePct}
          aria-valuetext={centerLabel}
        >
          <div className="nss-commander-xfer-progress-fill" style={{ width: `${bytePct}%` }} />
          <span className="nss-commander-xfer-progress-track-label">{centerLabel}</span>
        </div>
        <p className="nss-commander-xfer-popup-status" aria-live="polite">
          {folderTree ? (
            <>
              {verb} folder: <strong>{currentName}</strong>
              {activeFileName ? (
                <>
                  {" "}
                  → <strong>{activeFileName}</strong>
                </>
              ) : null}
            </>
          ) : (
            <>
              {verb}: <strong>{currentName}</strong>
            </>
          )}
          {fileBytesTotal > 0 ? ` (${formatBytes(fileBytesDone)} / ${formatBytes(fileBytesTotal)})` : null}
        </p>
        <p className="nss-commander-xfer-popup-substatus">{paused ? "Paused" : processingLabel}</p>
        {showDetails ? (
          <>
            <div className="nss-commander-xfer-popup-stats">
              <div className="nss-commander-xfer-popup-stats-row">
                <strong>Remaining time:</strong> {formatEta(etaSeconds)}
              </div>
              <div className="nss-commander-xfer-popup-stats-row">
                <strong>Speed:</strong> {speedLabel}
              </div>
            </div>
            <div className="nss-commander-xfer-popup-log">
              <div className="nss-commander-xfer-popup-log-label">Messages (scrollable)</div>
              <div ref={logScrollRef} className="nss-commander-xfer-popup-log-scroll" role="log" aria-live="polite">
                {messages.length === 0 ? (
                  <p className="nss-commander-xfer-popup-log-line">—</p>
                ) : (
                  messages.map((line, i) => (
                    <p key={`${i}-${line.slice(0, 24)}`} className="nss-commander-xfer-popup-log-line">
                      {line}
                    </p>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
        <div className="nss-commander-xfer-popup-actions-row">
          <button type="button" className="btn btn-sm" onClick={() => setShowDetails((v) => !v)}>
            <kbd className="nss-commander-dialog-kbd">F10</kbd>
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>
        <div className="nss-commander-xfer-popup-actions-main file-pane-dialog-actions">
          {canPause ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={onTogglePause}>
              <kbd className="nss-commander-dialog-kbd">F5</kbd>
              {paused ? "Resume" : "Pause"}
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-primary" onClick={onCancel}>
            <kbd className="nss-commander-dialog-kbd">F4</kbd>
            Cancel transfer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
