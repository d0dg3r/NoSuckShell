import { useEffect, useRef } from "react";
import type { LayoutProfile, LayoutSplitTreeNode } from "../types";
import type { LayoutPresetDefinition } from "../layoutPresets";

function LayoutTreePreview({ node }: { node: LayoutSplitTreeNode }) {
  if (node.type === "leaf") {
    return <div className="layout-preview-leaf" />;
  }
  const isRow = node.axis === "horizontal";
  return (
    <div className={`layout-preview-split ${isRow ? "is-row" : "is-col"}`}>
      <div className="layout-preview-pane" style={{ flex: node.ratio }}>
        <LayoutTreePreview node={node.first} />
      </div>
      <div className="layout-preview-pane" style={{ flex: 1 - node.ratio }}>
        <LayoutTreePreview node={node.second} />
      </div>
    </div>
  );
}

export type LayoutCommandCenterProps = {
  open: boolean;
  onClose: () => void;
  layoutPresets: LayoutPresetDefinition[];
  profiles: LayoutProfile[];
  selectedProfileId: string;
  onSelectProfileId: (id: string) => void;
  profileName: string;
  onProfileNameChange: (name: string) => void;
  restoreSessions: boolean;
  onRestoreSessionsChange: (value: boolean) => void;
  onApplyProfile: () => void;
  onSaveProfile: () => void;
  pendingDeleteProfileId: string;
  onDeleteProfileIntent: () => void;
  onApplyPreset: (tree: LayoutSplitTreeNode) => void;
  onCloseAllIntent: (withLayoutReset: boolean) => void;
  pendingCloseAllIntent: "close" | "reset" | null;
  previewTree: LayoutSplitTreeNode | null;
  applyProfileDisabled: boolean;
  saveDisabled: boolean;
  closeActionsDisabled: boolean;
};

export function LayoutCommandCenter({
  open,
  onClose,
  layoutPresets,
  profiles,
  selectedProfileId,
  onSelectProfileId,
  profileName,
  onProfileNameChange,
  restoreSessions,
  onRestoreSessionsChange,
  onApplyProfile,
  onSaveProfile,
  pendingDeleteProfileId,
  onDeleteProfileIntent,
  onApplyPreset,
  onCloseAllIntent,
  pendingCloseAllIntent,
  previewTree,
  applyProfileDisabled,
  saveDisabled,
  closeActionsDisabled,
}: LayoutCommandCenterProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const t = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) {
        return;
      }
      const focusable = root.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="app-settings-overlay layout-command-center-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="app-settings-modal panel layout-command-center-modal"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="layout-command-center-title"
        role="dialog"
        aria-modal="true"
      >
        <header className="panel-header layout-command-center-header">
          <h2 id="layout-command-center-title">Layout command center</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close layout command center">
            Close
          </button>
        </header>

        <div className="layout-command-center-body">
          <div className="layout-command-center-column layout-command-center-column-library">
            <h3 className="layout-command-center-section-title">Saved layouts</h3>
            <div className="layout-command-center-list-wrap">
              {profiles.length === 0 ? (
                <p className="muted-copy layout-command-center-empty">No saved layouts yet.</p>
              ) : (
                <ul className="layout-command-center-profile-list" role="listbox" aria-label="Saved layout profiles">
                  {profiles.map((profile) => (
                    <li key={profile.id}>
                      <button
                        type="button"
                        className={`layout-command-center-profile-item ${selectedProfileId === profile.id ? "is-selected" : ""}`}
                        role="option"
                        aria-selected={selectedProfileId === profile.id}
                        onClick={() => onSelectProfileId(profile.id)}
                      >
                        <span className="layout-command-center-profile-name">{profile.name}</span>
                        <span className="layout-command-center-profile-meta">
                          {profile.withHosts ? "Sessions" : "Structure only"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="field layout-command-center-field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={profileName}
                onChange={(event) => onProfileNameChange(event.target.value)}
                placeholder="Layout name"
              />
            </label>

            <label className="field checkbox-field layout-command-center-checkbox">
              <input
                type="checkbox"
                className="checkbox-input"
                checked={restoreSessions}
                onChange={(event) => onRestoreSessionsChange(event.target.checked)}
              />
              <span className="field-label">Include sessions when saving (SSH, Quick SSH, local terminal)</span>
            </label>

            <div className="layout-command-center-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onApplyProfile()}
                disabled={applyProfileDisabled}
              >
                Apply layout
              </button>
              <button type="button" className="btn" onClick={() => void onSaveProfile()} disabled={saveDisabled}>
                Save current
              </button>
              <button
                type="button"
                className={`btn btn-danger ${pendingDeleteProfileId === selectedProfileId && selectedProfileId ? "btn-danger-confirm" : ""}`}
                onClick={() => void onDeleteProfileIntent()}
                disabled={!selectedProfileId}
              >
                {pendingDeleteProfileId === selectedProfileId && selectedProfileId ? "Confirm delete" : "Delete"}
              </button>
            </div>
          </div>

          <div className="layout-command-center-column layout-command-center-column-templates">
            <h3 className="layout-command-center-section-title">Templates</h3>
            <div className="layout-command-center-preset-grid">
              {layoutPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="layout-command-center-preset-card"
                  onClick={() => onApplyPreset(preset.splitTree)}
                >
                  <div className="layout-command-center-preset-thumb" aria-hidden>
                    <LayoutTreePreview node={preset.splitTree} />
                  </div>
                  <span className="layout-command-center-preset-title">{preset.title}</span>
                  <span className="layout-command-center-preset-desc">{preset.description}</span>
                </button>
              ))}
            </div>

            <h3 className="layout-command-center-section-title">Preview (selected layout)</h3>
            <div className="layout-command-center-preview-box">
              {previewTree ? (
                <LayoutTreePreview node={previewTree} />
              ) : (
                <p className="muted-copy layout-command-center-empty">Select a saved layout to preview its grid.</p>
              )}
            </div>
          </div>

          <div className="layout-command-center-column layout-command-center-column-sessions">
            <h3 className="layout-command-center-section-title">Sessions aufräumen</h3>
            <p className="muted-copy layout-command-center-hint">
              Destructive actions need a second click to confirm (same as before).
            </p>
            <div className="layout-command-center-actions layout-command-center-actions-stack">
              <button
                type="button"
                className={`btn footer-action-btn ${pendingCloseAllIntent === "close" ? "btn-danger-confirm" : "btn-danger"}`}
                onClick={() => onCloseAllIntent(false)}
                disabled={closeActionsDisabled}
              >
                {pendingCloseAllIntent === "close" ? "Confirm close all" : "Close all sessions"}
              </button>
              <button
                type="button"
                className={`btn footer-action-btn ${pendingCloseAllIntent === "reset" ? "btn-danger-confirm" : "btn-danger"}`}
                onClick={() => onCloseAllIntent(true)}
                disabled={closeActionsDisabled}
              >
                {pendingCloseAllIntent === "reset" ? "Confirm close+reset" : "Close all + reset layout"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
