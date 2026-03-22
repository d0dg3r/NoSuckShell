import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from "react";
import type { QuickConnectMode } from "./AppSettingsPanel";
import type { QuickConnectDraft, QuickConnectWizardStep } from "../features/session-model";

export type QuickConnectModalProps = {
  quickConnectMode: QuickConnectMode;
  quickConnectWizardStep: QuickConnectWizardStep;
  onWizardStepChange: (step: QuickConnectWizardStep) => void;
  quickConnectDraft: QuickConnectDraft;
  onQuickConnectDraftChange: Dispatch<SetStateAction<QuickConnectDraft>>;
  quickConnectCommandInput: string;
  onQuickConnectCommandInputChange: (value: string) => void;
  quickConnectUserOptions: string[];
  onClose: () => void;
  onModalKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onProceedWizard: () => void;
  onUserInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onCommandInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onApplyUser: (user: string) => void;
  onConnect: () => void;
  error: string;
};

export function QuickConnectModal({
  quickConnectMode,
  quickConnectWizardStep,
  onWizardStepChange,
  quickConnectDraft,
  onQuickConnectDraftChange,
  quickConnectCommandInput,
  onQuickConnectCommandInputChange,
  quickConnectUserOptions,
  onClose,
  onModalKeyDown,
  onProceedWizard,
  onUserInputKeyDown,
  onCommandInputKeyDown,
  onApplyUser,
  onConnect,
  error,
}: QuickConnectModalProps) {
  return (
    <div className="app-settings-overlay" onClick={onClose}>
      <section
        className="app-settings-modal panel add-host-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onModalKeyDown}
      >
        <header className="panel-header">
          <h2>Quick connect</h2>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </header>
        <div className="app-settings-content">
          <p className="muted-copy quick-connect-shortcuts">
            Enter connects, Esc closes, ArrowUp/ArrowDown cycles known users. Customize shortcuts in Settings →
            Keyboard.
          </p>
          {quickConnectMode === "wizard" && (
            <div className="quick-connect-mode-wrap">
              <p className="field-help">
                Step {quickConnectWizardStep}/2 -{" "}
                {quickConnectWizardStep === 1 ? "Provide host target" : "Choose or type user"}
              </p>
              {quickConnectWizardStep === 1 && (
                <label className="field">
                  <span className="field-label">Host</span>
                  <input
                    className="input"
                    value={quickConnectDraft.hostName}
                    onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, hostName: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onProceedWizard();
                      }
                    }}
                    placeholder="server.local:2222 or [2001:db8::1]:2200"
                    autoFocus
                  />
                </label>
              )}
              {quickConnectWizardStep === 2 && (
                <>
                  <label className="field">
                    <span className="field-label">User</span>
                    <input
                      className="input"
                      value={quickConnectDraft.user}
                      onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, user: event.target.value }))}
                      onKeyDown={onUserInputKeyDown}
                      placeholder="Default or custom user"
                      autoFocus
                    />
                  </label>
                  {quickConnectUserOptions.length > 0 && (
                    <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                      {quickConnectUserOptions.map((user) => (
                        <button
                          key={user}
                          type="button"
                          className={`btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`}
                          onClick={() => {
                            onApplyUser(user);
                          }}
                        >
                          {user}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {quickConnectMode === "smart" && (
            <div className="quick-connect-mode-wrap">
              <label className="field">
                <span className="field-label">Host</span>
                <input
                  className="input"
                  value={quickConnectDraft.hostName}
                  onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, hostName: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onConnect();
                    }
                  }}
                  placeholder="example.com or 10.0.0.8:2222"
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">User</span>
                <input
                  className="input"
                  value={quickConnectDraft.user}
                  onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, user: event.target.value }))}
                  onKeyDown={onUserInputKeyDown}
                  placeholder="Default or custom user"
                />
              </label>
              {quickConnectUserOptions.length > 0 && (
                <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                  {quickConnectUserOptions.map((user) => (
                    <button
                      key={user}
                      type="button"
                      className={`btn ${quickConnectDraft.user.trim() === user ? "btn-primary" : ""}`}
                      onClick={() => {
                        onApplyUser(user);
                      }}
                    >
                      {user}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {quickConnectMode === "command" && (
            <div className="quick-connect-mode-wrap">
              <label className="field">
                <span className="field-label">Target command</span>
                <input
                  className="input"
                  value={quickConnectCommandInput}
                  onChange={(event) => onQuickConnectCommandInputChange(event.target.value)}
                  onKeyDown={onCommandInputKeyDown}
                  placeholder="user@host:22"
                  autoFocus
                />
              </label>
              {quickConnectUserOptions.length > 0 && (
                <div className="quick-connect-user-list" role="listbox" aria-label="Known users">
                  {quickConnectUserOptions.map((user) => (
                    <button
                      key={user}
                      type="button"
                      className={`btn ${quickConnectCommandInput.trim().startsWith(`${user}@`) ? "btn-primary" : ""}`}
                      onClick={() => {
                        const targetPart = quickConnectCommandInput.includes("@")
                          ? quickConnectCommandInput.slice(quickConnectCommandInput.indexOf("@"))
                          : "@";
                        onQuickConnectCommandInputChange(`${user}${targetPart}`);
                      }}
                    >
                      {user}
                    </button>
                  ))}
                </div>
              )}
              <p className="field-help">
                Supports `user@host`, `user@host:port`, and `user@[2001:db8::1]:2200`.
              </p>
            </div>
          )}
          {(quickConnectMode !== "wizard" || quickConnectWizardStep === 2) && (
            <>
              <label className="field">
                <span className="field-label">Identity file</span>
                <input
                  className="input"
                  value={quickConnectDraft.identityFile}
                  onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, identityFile: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                <span className="field-label">Proxy jump</span>
                <input
                  className="input"
                  value={quickConnectDraft.proxyJump}
                  onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, proxyJump: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                <span className="field-label">Proxy command</span>
                <input
                  className="input"
                  value={quickConnectDraft.proxyCommand}
                  onChange={(event) => onQuickConnectDraftChange((prev) => ({ ...prev, proxyCommand: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </>
          )}
          <div className="action-row">
            {quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (
              <button className="btn" onClick={() => onWizardStepChange(1)}>
                Back
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            {quickConnectMode === "wizard" && quickConnectWizardStep === 1 ? (
              <button className="btn btn-primary" onClick={onProceedWizard}>
                Next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void onConnect()}>
                Connect
              </button>
            )}
            {quickConnectMode === "wizard" && quickConnectWizardStep === 2 && (
              <button className="btn" onClick={() => onWizardStepChange(1)}>
                Back
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>
    </div>
  );
}
