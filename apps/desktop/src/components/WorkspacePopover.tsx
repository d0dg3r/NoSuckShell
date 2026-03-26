import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutProfile, LayoutSplitTreeNode } from "../types";
import type { LayoutPresetDefinition } from "../layoutPresets";
import type { WorkspaceTabInfo } from "./TerminalWorkspaceDock";
import { LayoutTreePreview } from "./LayoutCommandCenter";
import {
  createEqualGridSplitTree,
  isLayoutGridDimensionsValid,
  LAYOUT_GRID_MAX_COLS,
  LAYOUT_GRID_MAX_PANES,
  LAYOUT_GRID_MAX_ROWS,
  serializeSplitTree,
} from "../features/split-tree";

export type WorkspacePopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;

  workspaceTabs: WorkspaceTabInfo[];
  activeWorkspaceId: string;
  switchWorkspace: (id: string) => void;
  createWorkspace: () => void;
  createNssCommanderWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setWorkspaceVerticalStacking: (id: string, enabled: boolean) => void;

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
  workspaceOptions: Array<{ id: string; name: string }>;
  layoutTargetWorkspaceId: string;
  onLayoutTargetWorkspaceChange: (id: string) => void;
  layoutSwitchToTargetAfterApply: boolean;
  onLayoutSwitchToTargetAfterApplyChange: (value: boolean) => void;
  layoutMirrorWorkspaceIdOnSave: string;
  onLayoutMirrorWorkspaceIdOnSaveChange: (id: string) => void;
};

type PopoverTab = "workspaces" | "layouts";

export function WorkspacePopover({
  open,
  onClose,
  anchorRef,
  workspaceTabs,
  activeWorkspaceId,
  switchWorkspace,
  createWorkspace,
  createNssCommanderWorkspace,
  removeWorkspace,
  renameWorkspace,
  setWorkspaceVerticalStacking,
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
  layoutTargetWorkspaceId,
  onLayoutTargetWorkspaceChange,
  layoutSwitchToTargetAfterApply,
  onLayoutSwitchToTargetAfterApplyChange,
  layoutMirrorWorkspaceIdOnSave,
  onLayoutMirrorWorkspaceIdOnSaveChange,
}: WorkspacePopoverProps) {
  const [activeTab, setActiveTab] = useState<PopoverTab>("workspaces");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);

  const gridValid = useMemo(() => isLayoutGridDimensionsValid(gridRows, gridCols), [gridRows, gridCols]);
  const customGridPreview = useMemo((): LayoutSplitTreeNode | null => {
    if (!gridValid) return null;
    return serializeSplitTree(createEqualGridSplitTree(gridRows, gridCols));
  }, [gridRows, gridCols, gridValid]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        popoverRef.current &&
        target instanceof Node &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  if (!open) return null;

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameWorkspace(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const mirrorTargetsOthers = workspaceOptions.some((w) => w.id !== activeWorkspaceId);
  const targetIsActive = layoutTargetWorkspaceId === activeWorkspaceId;

  return (
    <div className="workspace-popover" ref={popoverRef} role="dialog" aria-label="Workspaces and layouts">
      <div className="workspace-popover-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "workspaces"}
          className={`workspace-popover-tab${activeTab === "workspaces" ? " is-active" : ""}`}
          onClick={() => setActiveTab("workspaces")}
        >
          Workspaces
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "layouts"}
          className={`workspace-popover-tab${activeTab === "layouts" ? " is-active" : ""}`}
          onClick={() => setActiveTab("layouts")}
        >
          Layouts
        </button>
      </div>

      <div className="workspace-popover-body">
        {activeTab === "workspaces" ? (
          <div className="workspace-popover-workspaces">
            <ul className="workspace-popover-list" role="listbox" aria-label="Workspaces">
              {workspaceTabs.map((ws) => (
                <li
                  key={ws.id}
                  className={`workspace-popover-item${ws.id === activeWorkspaceId ? " is-active" : ""}`}
                  role="option"
                  aria-selected={ws.id === activeWorkspaceId}
                >
                  {renamingId === ws.id ? (
                    <input
                      ref={renameInputRef}
                      className="input workspace-popover-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="workspace-popover-item-btn"
                      onClick={() => {
                        switchWorkspace(ws.id);
                        onClose();
                      }}
                      onDoubleClick={() => {
                        setRenamingId(ws.id);
                        setRenameValue(ws.name);
                      }}
                      title="Click to switch, double-click to rename"
                    >
                      <span className="workspace-popover-item-name">{ws.name}</span>
                      {ws.kind === "nss-commander" ? (
                        <span className="workspace-popover-item-badge">NSS</span>
                      ) : null}
                    </button>
                  )}
                  <div className="workspace-popover-item-actions">
                    {ws.kind !== "nss-commander" ? (
                      <button
                        type="button"
                        className={`workspace-popover-action-btn workspace-popover-stack-btn${ws.preferVerticalNewPanes ? " is-active" : ""}`}
                        title={ws.preferVerticalNewPanes ? "Vertical stacking on" : "Stack new panes vertically"}
                        aria-pressed={ws.preferVerticalNewPanes}
                        onClick={() => setWorkspaceVerticalStacking(ws.id, !ws.preferVerticalNewPanes)}
                      >
                        ↕
                      </button>
                    ) : null}
                    {workspaceTabs.length > 1 ? (
                      <button
                        type="button"
                        className="workspace-popover-action-btn workspace-popover-close-btn"
                        title="Close workspace"
                        aria-label={`Close workspace ${ws.name}`}
                        onClick={() => removeWorkspace(ws.id)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="workspace-popover-footer">
              <button type="button" className="btn workspace-popover-add-btn" onClick={() => { createWorkspace(); onClose(); }}>
                + Workspace
              </button>
              <button
                type="button"
                className="btn workspace-popover-add-btn"
                onClick={() => { createNssCommanderWorkspace(); onClose(); }}
                title="Dual file-pane workspace"
              >
                + NSS-Commander
              </button>
            </div>
          </div>
        ) : (
          <div className="workspace-popover-layouts">
            {/* Saved profiles */}
            <div className="workspace-popover-section">
              <p className="workspace-popover-section-title">Saved layouts</p>
              {profiles.length === 0 ? (
                <p className="muted-copy workspace-popover-empty">No saved layouts yet.</p>
              ) : (
                <ul className="workspace-popover-list" role="listbox" aria-label="Saved layout profiles">
                  {profiles.map((p) => (
                    <li
                      key={p.id}
                      className={`workspace-popover-item${selectedProfileId === p.id ? " is-active" : ""}`}
                      role="option"
                      aria-selected={selectedProfileId === p.id}
                    >
                      <button
                        type="button"
                        className="workspace-popover-item-btn"
                        onClick={() => onSelectProfileId(p.id)}
                      >
                        <span className="workspace-popover-item-name">{p.name}</span>
                        <span className="workspace-popover-item-meta">
                          {p.withHosts ? "Sessions" : "Structure"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="workspace-popover-profile-controls">
                <input
                  className="input workspace-popover-profile-name"
                  value={profileName}
                  onChange={(e) => onProfileNameChange(e.target.value)}
                  placeholder="Layout name"
                />
                <label className="workspace-popover-checkbox">
                  <input
                    type="checkbox"
                    checked={restoreSessions}
                    onChange={(e) => onRestoreSessionsChange(e.target.checked)}
                  />
                  <span>Include sessions</span>
                </label>
                {mirrorTargetsOthers ? (
                  <label className="workspace-popover-mirror-field">
                    <span className="workspace-popover-mirror-label">Mirror to</span>
                    <select
                      className="input"
                      value={layoutMirrorWorkspaceIdOnSave}
                      onChange={(e) => onLayoutMirrorWorkspaceIdOnSaveChange(e.target.value)}
                    >
                      <option value="">No mirror</option>
                      {workspaceOptions.filter((w) => w.id !== activeWorkspaceId).map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="workspace-popover-actions">
                <button type="button" className="btn btn-primary" onClick={onApplyProfile} disabled={applyProfileDisabled}>
                  Apply
                </button>
                <button type="button" className="btn" onClick={onSaveProfile} disabled={saveDisabled}>
                  Save current
                </button>
                <button
                  type="button"
                  className={`btn btn-danger${pendingDeleteProfileId === selectedProfileId && selectedProfileId ? " btn-danger-confirm" : ""}`}
                  onClick={onDeleteProfileIntent}
                  disabled={!selectedProfileId}
                >
                  {pendingDeleteProfileId === selectedProfileId && selectedProfileId ? "Confirm" : "Delete"}
                </button>
              </div>
              {previewTree ? (
                <div className="workspace-popover-preview">
                  <LayoutTreePreview node={previewTree} />
                </div>
              ) : null}
            </div>

            {/* Apply target */}
            <div className="workspace-popover-section">
              <p className="workspace-popover-section-title">Apply target</p>
              <div className="workspace-popover-target-row">
                <select
                  className="input"
                  value={layoutTargetWorkspaceId}
                  onChange={(e) => onLayoutTargetWorkspaceChange(e.target.value)}
                >
                  {workspaceOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.id === activeWorkspaceId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <label className="workspace-popover-checkbox">
                  <input
                    type="checkbox"
                    checked={layoutSwitchToTargetAfterApply}
                    onChange={(e) => onLayoutSwitchToTargetAfterApplyChange(e.target.checked)}
                    disabled={targetIsActive}
                  />
                  <span>Switch after</span>
                </label>
              </div>
            </div>

            {/* Templates */}
            <div className="workspace-popover-section">
              <p className="workspace-popover-section-title">Templates</p>
              <div className="workspace-popover-preset-grid">
                {layoutPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="workspace-popover-preset-btn"
                    onClick={() => { onApplyPreset(preset.splitTree); onClose(); }}
                    title={preset.description}
                  >
                    <div className="workspace-popover-preset-thumb" aria-hidden>
                      <LayoutTreePreview node={preset.splitTree} />
                    </div>
                    <span className="workspace-popover-preset-label">{preset.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom grid */}
            <div className="workspace-popover-section">
              <p className="workspace-popover-section-title">Custom grid</p>
              <div className="workspace-popover-grid-row">
                <input
                  className="input workspace-popover-grid-input"
                  type="number"
                  min={1}
                  max={LAYOUT_GRID_MAX_ROWS}
                  value={Number.isFinite(gridRows) ? gridRows : ""}
                  onChange={(e) => setGridRows(Number(e.target.value))}
                  aria-label="Grid rows"
                  placeholder="R"
                />
                <span className="workspace-popover-grid-x">×</span>
                <input
                  className="input workspace-popover-grid-input"
                  type="number"
                  min={1}
                  max={LAYOUT_GRID_MAX_COLS}
                  value={Number.isFinite(gridCols) ? gridCols : ""}
                  onChange={(e) => setGridCols(Number(e.target.value))}
                  aria-label="Grid columns"
                  placeholder="C"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!gridValid}
                  onClick={() => { onApplyCustomGrid(gridRows, gridCols); onClose(); }}
                >
                  Apply
                </button>
              </div>
              {!gridValid ? (
                <p className="muted-copy workspace-popover-grid-hint">
                  1–{LAYOUT_GRID_MAX_ROWS} rows, 1–{LAYOUT_GRID_MAX_COLS} cols, max {LAYOUT_GRID_MAX_PANES} panes
                </p>
              ) : customGridPreview ? (
                <div className="workspace-popover-preview workspace-popover-preview--small">
                  <LayoutTreePreview node={customGridPreview} />
                </div>
              ) : null}
            </div>

            {/* Cleanup */}
            <div className="workspace-popover-section workspace-popover-section--cleanup">
              <p className="workspace-popover-section-title">Clean up</p>
              <div className="workspace-popover-actions">
                <button
                  type="button"
                  className={`btn${pendingCloseAllIntent === "close" ? " btn-danger-confirm" : " btn-danger"}`}
                  onClick={() => onCloseAllIntent(false)}
                  disabled={closeActionsDisabled}
                >
                  {pendingCloseAllIntent === "close" ? "Confirm" : "Close all"}
                </button>
                <button
                  type="button"
                  className={`btn${pendingCloseAllIntent === "reset" ? " btn-danger-confirm" : " btn-danger"}`}
                  onClick={() => onCloseAllIntent(true)}
                  disabled={closeActionsDisabled}
                >
                  {pendingCloseAllIntent === "reset" ? "Confirm" : "Close + reset"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
