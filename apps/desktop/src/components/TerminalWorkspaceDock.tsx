import { useState, type ReactNode, type RefObject, type UIEvent } from "react";
import type { LayoutProfile, LayoutSplitTreeNode } from "../types";
import type { LayoutPresetDefinition } from "../layoutPresets";
import { createLeafNode, type SplitResizeState, type SplitTreeNode } from "../features/split-tree";
import { WorkspaceCommandBar } from "./WorkspaceCommandBar";

import type { WorkspaceKind } from "../features/workspace-snapshot";

export type WorkspaceTabInfo = { id: string; name: string; kind?: WorkspaceKind; preferVerticalNewPanes: boolean };

export type TerminalWorkspaceDockProps = {
  workspaceTabs: WorkspaceTabInfo[];
  activeWorkspaceId: string;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: () => void;
  createNssCommanderWorkspace: () => void;
  removeWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, nextName: string) => void;
  setWorkspaceVerticalStacking: (workspaceId: string, enabled: boolean) => void;
  splitResizeState: SplitResizeState | null;
  verticalStackScrollEnabled: boolean;
  resolvePaneQuickNavLabel: (paneIndex: number) => { display: string; title: string };
  onQuickNavPane: (paneIndex: number) => void;
  isStackedShell: boolean;
  mobileShellTab: "hosts" | "terminal";
  paneOrder: number[];
  activePaneIndex: number;
  nudgeMobilePager: (delta: number) => void;
  mobilePagerRef: RefObject<HTMLDivElement | null>;
  handleMobilePagerScroll: (event: UIEvent<HTMLDivElement>) => void;
  splitTree: SplitTreeNode;
  renderSplitNode: (node: SplitTreeNode) => ReactNode;
  commandBarFKeySlot?: ReactNode;

  layoutPresets: LayoutPresetDefinition[];
  layoutProfiles: LayoutProfile[];
  selectedLayoutProfileId: string;
  onSelectLayoutProfileId: (id: string) => void;
  layoutProfileName: string;
  onLayoutProfileNameChange: (name: string) => void;
  saveLayoutWithHosts: boolean;
  onSaveLayoutWithHostsChange: (value: boolean) => void;
  onApplyLayoutProfile: () => void;
  onSaveLayoutProfile: () => void;
  pendingLayoutDeleteProfileId: string;
  onDeleteLayoutProfileIntent: () => void;
  onApplyLayoutPreset: (tree: LayoutSplitTreeNode) => void;
  onApplyCustomGrid: (rows: number, cols: number) => void;
  onCloseAllIntent: (withLayoutReset: boolean) => void;
  pendingCloseAllIntent: "close" | "reset" | null;
  layoutPreviewTree: LayoutSplitTreeNode | null;
  applyLayoutProfileDisabled: boolean;
  saveLayoutDisabled: boolean;
  closeActionsDisabled: boolean;
  layoutWorkspaceOptions: Array<{ id: string; name: string }>;
  layoutTargetWorkspaceId: string;
  onLayoutTargetWorkspaceChange: (id: string) => void;
  layoutSwitchToTargetAfterApply: boolean;
  onLayoutSwitchToTargetAfterApplyChange: (value: boolean) => void;
  layoutMirrorWorkspaceIdOnSave: string;
  onLayoutMirrorWorkspaceIdOnSaveChange: (id: string) => void;
};

export function TerminalWorkspaceDock({
  workspaceTabs,
  activeWorkspaceId,
  switchWorkspace,
  createWorkspace,
  createNssCommanderWorkspace,
  removeWorkspace,
  renameWorkspace,
  setWorkspaceVerticalStacking,
  splitResizeState,
  verticalStackScrollEnabled,
  resolvePaneQuickNavLabel,
  onQuickNavPane,
  isStackedShell,
  mobileShellTab,
  paneOrder,
  activePaneIndex,
  nudgeMobilePager,
  mobilePagerRef,
  handleMobilePagerScroll,
  splitTree,
  renderSplitNode,
  commandBarFKeySlot,
  layoutPresets,
  layoutProfiles,
  selectedLayoutProfileId,
  onSelectLayoutProfileId,
  layoutProfileName,
  onLayoutProfileNameChange,
  saveLayoutWithHosts,
  onSaveLayoutWithHostsChange,
  onApplyLayoutProfile,
  onSaveLayoutProfile,
  pendingLayoutDeleteProfileId,
  onDeleteLayoutProfileIntent,
  onApplyLayoutPreset,
  onApplyCustomGrid,
  onCloseAllIntent,
  pendingCloseAllIntent,
  layoutPreviewTree,
  applyLayoutProfileDisabled,
  saveLayoutDisabled,
  closeActionsDisabled,
  layoutWorkspaceOptions,
  layoutTargetWorkspaceId,
  onLayoutTargetWorkspaceChange,
  layoutSwitchToTargetAfterApply,
  onLayoutSwitchToTargetAfterApplyChange,
  layoutMirrorWorkspaceIdOnSave,
  onLayoutMirrorWorkspaceIdOnSaveChange,
}: TerminalWorkspaceDockProps) {
  const [workspacePopoverOpen, setWorkspacePopoverOpen] = useState(false);

  return (
    <section className="right-dock panel">
      <div className="sessions-workspace">
        <div className="sessions-zone">
          <div
            className={`session-pane-canvas${
              verticalStackScrollEnabled && paneOrder.length > 1 ? " session-pane-canvas--vertical-stack-quick-nav" : ""
            }`}
          >
            <div
              className={`terminal-grid ${splitResizeState ? `is-pane-resizing is-pane-resizing-${splitResizeState.axis}` : ""}${
                isStackedShell && mobileShellTab === "terminal" ? " is-mobile-terminal-pager" : ""
              }${verticalStackScrollEnabled ? " terminal-grid--vertical-stack-scroll" : ""}`}
            >
              {isStackedShell && mobileShellTab === "terminal" ? (
                <div className="mobile-terminal-pager">
                  {paneOrder.length > 1 ? (
                    <div className="mobile-terminal-pager-controls" role="toolbar" aria-label="Terminal pager">
                      <button
                        type="button"
                        className="btn mobile-terminal-pager-nav"
                        onClick={() => nudgeMobilePager(-1)}
                        aria-label="Previous terminal"
                      >
                        ‹
                      </button>
                      <span className="mobile-terminal-pager-status" aria-live="polite">
                        {(() => {
                          const pos = paneOrder.indexOf(activePaneIndex);
                          return `${pos >= 0 ? pos + 1 : 1} / ${paneOrder.length}`;
                        })()}
                      </span>
                      <button
                        type="button"
                        className="btn mobile-terminal-pager-nav"
                        onClick={() => nudgeMobilePager(1)}
                        aria-label="Next terminal"
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                  <div ref={mobilePagerRef} className="mobile-terminal-pager-viewport" onScroll={handleMobilePagerScroll}>
                    {paneOrder.map((paneIndex) => (
                      <div key={paneIndex} className="mobile-terminal-slide">
                        {renderSplitNode(createLeafNode(paneIndex))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                renderSplitNode(splitTree)
              )}
            </div>
            {verticalStackScrollEnabled && paneOrder.length > 1 ? (
              <nav className="vertical-stack-quick-nav" aria-label="Pane quick navigation">
                {paneOrder.map((paneIndex, orderPos) => {
                  const label = resolvePaneQuickNavLabel(paneIndex);
                  const n = orderPos + 1;
                  return (
                    <button
                      key={paneIndex}
                      type="button"
                      className={`btn vertical-stack-quick-nav-btn ${activePaneIndex === paneIndex ? "is-active" : ""}`}
                      aria-label={`Pane ${n}: ${label.title}`}
                      title={label.title}
                      aria-current={activePaneIndex === paneIndex ? "true" : undefined}
                      onClick={() => onQuickNavPane(paneIndex)}
                    >
                      {n}
                    </button>
                  );
                })}
              </nav>
            ) : null}
          </div>
        </div>
        <WorkspaceCommandBar
          workspaceTabs={workspaceTabs}
          activeWorkspaceId={activeWorkspaceId}
          onIndicatorClick={() => setWorkspacePopoverOpen((v) => !v)}
          popoverOpen={workspacePopoverOpen}
          onPopoverClose={() => setWorkspacePopoverOpen(false)}
          fKeyBarSlot={commandBarFKeySlot}
          switchWorkspace={switchWorkspace}
          createWorkspace={createWorkspace}
          createNssCommanderWorkspace={createNssCommanderWorkspace}
          removeWorkspace={removeWorkspace}
          renameWorkspace={renameWorkspace}
          setWorkspaceVerticalStacking={setWorkspaceVerticalStacking}
          layoutPresets={layoutPresets}
          profiles={layoutProfiles}
          selectedProfileId={selectedLayoutProfileId}
          onSelectProfileId={onSelectLayoutProfileId}
          profileName={layoutProfileName}
          onProfileNameChange={onLayoutProfileNameChange}
          restoreSessions={saveLayoutWithHosts}
          onRestoreSessionsChange={onSaveLayoutWithHostsChange}
          onApplyProfile={onApplyLayoutProfile}
          onSaveProfile={onSaveLayoutProfile}
          pendingDeleteProfileId={pendingLayoutDeleteProfileId}
          onDeleteProfileIntent={onDeleteLayoutProfileIntent}
          onApplyPreset={onApplyLayoutPreset}
          onApplyCustomGrid={onApplyCustomGrid}
          onCloseAllIntent={onCloseAllIntent}
          pendingCloseAllIntent={pendingCloseAllIntent}
          previewTree={layoutPreviewTree}
          applyProfileDisabled={applyLayoutProfileDisabled}
          saveDisabled={saveLayoutDisabled}
          closeActionsDisabled={closeActionsDisabled}
          workspaceOptions={layoutWorkspaceOptions}
          layoutTargetWorkspaceId={layoutTargetWorkspaceId}
          onLayoutTargetWorkspaceChange={onLayoutTargetWorkspaceChange}
          layoutSwitchToTargetAfterApply={layoutSwitchToTargetAfterApply}
          onLayoutSwitchToTargetAfterApplyChange={onLayoutSwitchToTargetAfterApplyChange}
          layoutMirrorWorkspaceIdOnSave={layoutMirrorWorkspaceIdOnSave}
          onLayoutMirrorWorkspaceIdOnSaveChange={onLayoutMirrorWorkspaceIdOnSaveChange}
        />
      </div>
    </section>
  );
}
