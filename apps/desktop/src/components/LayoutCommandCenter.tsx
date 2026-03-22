import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutProfile, LayoutSplitTreeNode } from "../types";
import type { LayoutPresetDefinition } from "../layoutPresets";
import {
  createEqualGridSplitTree,
  isLayoutGridDimensionsValid,
  LAYOUT_GRID_MAX_COLS,
  LAYOUT_GRID_MAX_PANES,
  LAYOUT_GRID_MAX_ROWS,
  serializeSplitTree,
} from "../features/split-tree";

export function LayoutTreePreview({ node }: { node: LayoutSplitTreeNode }) {
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

export type LayoutWorkspaceOption = { id: string; name: string };

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
  onApplyCustomGrid: (rows: number, cols: number) => void;
  onCloseAllIntent: (withLayoutReset: boolean) => void;
  pendingCloseAllIntent: "close" | "reset" | null;
  previewTree: LayoutSplitTreeNode | null;
  applyProfileDisabled: boolean;
  saveDisabled: boolean;
  closeActionsDisabled: boolean;
  workspaceOptions: LayoutWorkspaceOption[];
  activeWorkspaceId: string;
  layoutTargetWorkspaceId: string;
  onLayoutTargetWorkspaceChange: (id: string) => void;
  layoutSwitchToTargetAfterApply: boolean;
  onLayoutSwitchToTargetAfterApplyChange: (value: boolean) => void;
  layoutMirrorWorkspaceIdOnSave: string;
  onLayoutMirrorWorkspaceIdOnSaveChange: (id: string) => void;
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
  onApplyCustomGrid,
  onCloseAllIntent,
  pendingCloseAllIntent,
  previewTree,
  applyProfileDisabled,
  saveDisabled,
  closeActionsDisabled,
  workspaceOptions,
  activeWorkspaceId,
  layoutTargetWorkspaceId,
  onLayoutTargetWorkspaceChange,
  layoutSwitchToTargetAfterApply,
  onLayoutSwitchToTargetAfterApplyChange,
  layoutMirrorWorkspaceIdOnSave,
  onLayoutMirrorWorkspaceIdOnSaveChange,
}: LayoutCommandCenterProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);

  const gridValid = useMemo(() => isLayoutGridDimensionsValid(gridRows, gridCols), [gridRows, gridCols]);
  const customGridPreview = useMemo((): LayoutSplitTreeNode | null => {
    if (!gridValid) {
      return null;
    }
    return serializeSplitTree(createEqualGridSplitTree(gridRows, gridCols));
  }, [gridRows, gridCols, gridValid]);

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

  const targetIsActive = layoutTargetWorkspaceId === activeWorkspaceId;
  const mirrorTargetsOthers = workspaceOptions.some((w) => w.id !== activeWorkspaceId);

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
        <header className="panel-header app-settings-header layout-command-center-header">
          <h2 id="layout-command-center-title">Layout command center</h2>
          <div className="app-settings-header-actions">
            <button type="button" className="btn btn-settings-tool" onClick={onClose} aria-label="Close layout command center">
              Close
            </button>
          </div>
        </header>

        <div className="app-settings-content layout-command-center-body">
          <div className="layout-command-center-column">
            <div className="settings-stack">
              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Saved layouts</h3>
                  <p className="muted-copy">Named profiles stored on disk; apply replaces the target workspace structure.</p>
                </header>
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

                {mirrorTargetsOthers && (
                  <label className="field">
                    <span className="field-label">Also mirror structure to workspace</span>
                    <select
                      className="input density-profile-select"
                      value={layoutMirrorWorkspaceIdOnSave}
                      onChange={(event) => onLayoutMirrorWorkspaceIdOnSaveChange(event.target.value)}
                      aria-label="Mirror saved layout structure to another workspace"
                    >
                      <option value="">Profile only (no mirror)</option>
                      {workspaceOptions
                        .filter((w) => w.id !== activeWorkspaceId)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                    <span className="field-help">
                      After save, copies the current grid structure to that workspace with empty panes (sessions stay here).
                    </span>
                  </label>
                )}

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
              </section>
            </div>
          </div>

          <div className="layout-command-center-column">
            <div className="settings-stack">
              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Apply target</h3>
                  <p className="muted-copy">Templates and custom grid are applied to the workspace you choose.</p>
                </header>
                <label className="field">
                  <span className="field-label">Workspace</span>
                  <select
                    className="input density-profile-select"
                    value={layoutTargetWorkspaceId}
                    onChange={(event) => onLayoutTargetWorkspaceChange(event.target.value)}
                    aria-label="Workspace for layout template or grid"
                  >
                    {workspaceOptions.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.id === activeWorkspaceId ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={layoutSwitchToTargetAfterApply}
                    onChange={(event) => onLayoutSwitchToTargetAfterApplyChange(event.target.checked)}
                    disabled={targetIsActive}
                  />
                  <span className="field-label">Switch to that workspace after apply</span>
                </label>
              </section>

              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Templates</h3>
                  <p className="muted-copy">Quick presets; empty panes, same as before.</p>
                </header>
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
              </section>

              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Custom grid</h3>
                  <p className="muted-copy">
                    Equal rows × columns (max {LAYOUT_GRID_MAX_ROWS}×{LAYOUT_GRID_MAX_COLS}, {LAYOUT_GRID_MAX_PANES} panes
                    total).
                  </p>
                </header>
                <div className="host-form-grid layout-command-center-grid-fields">
                  <label className="field">
                    <span className="field-label">Rows</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={LAYOUT_GRID_MAX_ROWS}
                      value={Number.isFinite(gridRows) ? gridRows : ""}
                      onChange={(event) => setGridRows(Number(event.target.value))}
                      aria-label="Custom grid rows"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Columns</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={LAYOUT_GRID_MAX_COLS}
                      value={Number.isFinite(gridCols) ? gridCols : ""}
                      onChange={(event) => setGridCols(Number(event.target.value))}
                      aria-label="Custom grid columns"
                    />
                  </label>
                </div>
                {!gridValid && (
                  <p className="field-help layout-command-center-grid-error">
                    Use 1–{LAYOUT_GRID_MAX_ROWS} rows and 1–{LAYOUT_GRID_MAX_COLS} columns with at most {LAYOUT_GRID_MAX_PANES}{" "}
                    panes.
                  </p>
                )}
                <div className="layout-command-center-custom-grid-row">
                  {customGridPreview ? (
                    <div className="layout-command-center-preset-thumb layout-command-center-custom-thumb" aria-hidden>
                      <LayoutTreePreview node={customGridPreview} />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!gridValid}
                    onClick={() => onApplyCustomGrid(gridRows, gridCols)}
                  >
                    Apply grid
                  </button>
                </div>
              </section>

              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Preview</h3>
                  <p className="muted-copy">Selected saved layout profile (not the custom grid draft).</p>
                </header>
                <div className="layout-command-center-preview-box">
                  {previewTree ? (
                    <LayoutTreePreview node={previewTree} />
                  ) : (
                    <p className="muted-copy layout-command-center-empty">Select a saved layout to preview its grid.</p>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="layout-command-center-column layout-command-center-column-sessions">
            <div className="settings-stack">
              <section className="settings-card">
                <header className="settings-card-head">
                  <h3>Clean up sessions</h3>
                  <p className="muted-copy">Destructive actions need a second click to confirm.</p>
                </header>
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
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
