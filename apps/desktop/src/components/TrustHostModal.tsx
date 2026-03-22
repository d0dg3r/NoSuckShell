import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TrustPromptRequest } from "../features/session-model";

export type TrustHostModalProps = {
  prompt: TrustPromptRequest;
  saveTrustHostAsDefault: boolean;
  onSaveTrustDefaultChange: (value: boolean) => void;
  onClose: (sessionId: string) => void;
  onAccept: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

export function TrustHostModal({
  prompt,
  saveTrustHostAsDefault,
  onSaveTrustDefaultChange,
  onClose,
  onAccept,
  onKeyDown,
}: TrustHostModalProps) {
  return (
    <div className="app-settings-overlay" onClick={() => onClose(prompt.sessionId)}>
      <section
        className="app-settings-modal panel trust-host-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="panel-header">
          <h2>Trust host key</h2>
          <button className="btn" onClick={() => onClose(prompt.sessionId)}>
            Close
          </button>
        </header>
        <div className="app-settings-content">
          <p className="muted-copy">
            Session <strong>{prompt.sessionId}</strong> requests trust confirmation for host <strong>{prompt.hostLabel}</strong>.
          </p>
          <label className="field checkbox-field trust-default-checkbox">
            <input
              className="checkbox-input"
              type="checkbox"
              checked={saveTrustHostAsDefault}
              onChange={(event) => onSaveTrustDefaultChange(event.target.checked)}
            />
            <span className="field-label">Save as default for this host</span>
          </label>
          <div className="action-row">
            <button className="btn" onClick={() => onClose(prompt.sessionId)}>
              Dismiss
            </button>
            <button className="btn btn-primary" onClick={() => void onAccept()} autoFocus>
              Trust host
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
