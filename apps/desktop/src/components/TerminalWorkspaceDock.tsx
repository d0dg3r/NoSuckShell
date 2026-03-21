import type { DragEvent as ReactDragEvent, ReactNode, RefObject, UIEvent } from "react";
import type { DragPayload } from "../features/pane-dnd";
import { createLeafNode, type SplitResizeState, type SplitTreeNode } from "../features/split-tree";

export type WorkspaceTabInfo = { id: string; name: string };

export type TerminalWorkspaceDockProps = {
  workspaceTabs: WorkspaceTabInfo[];
  activeWorkspaceId: string;
  switchWorkspace: (workspaceId: string) => void;
  parseDragPayload: (event: ReactDragEvent) => DragPayload | null;
  sendSessionToWorkspace: (sessionId: string, workspaceId: string) => void;
  createWorkspace: () => void;
  removeWorkspace: (workspaceId: string) => void;
  splitResizeState: SplitResizeState | null;
  isStackedShell: boolean;
  mobileShellTab: "hosts" | "terminal";
  paneOrder: number[];
  activePaneIndex: number;
  nudgeMobilePager: (delta: number) => void;
  mobilePagerRef: RefObject<HTMLDivElement | null>;
  handleMobilePagerScroll: (event: UIEvent<HTMLDivElement>) => void;
  splitTree: SplitTreeNode;
  renderSplitNode: (node: SplitTreeNode) => ReactNode;
  onOpenLayoutCommandCenter: () => void;
  isBroadcastModeEnabled: boolean;
  broadcastTargetCount: number;
};

export function TerminalWorkspaceDock({
  workspaceTabs,
  activeWorkspaceId,
  switchWorkspace,
  parseDragPayload,
  sendSessionToWorkspace,
  createWorkspace,
  removeWorkspace,
  splitResizeState,
  isStackedShell,
  mobileShellTab,
  paneOrder,
  activePaneIndex,
  nudgeMobilePager,
  mobilePagerRef,
  handleMobilePagerScroll,
  splitTree,
  renderSplitNode,
  onOpenLayoutCommandCenter,
  isBroadcastModeEnabled,
  broadcastTargetCount,
}: TerminalWorkspaceDockProps) {
  return (
    <section className="right-dock panel">
      <div className="workspace-tabs" role="tablist" aria-label="Terminal workspaces">
        {workspaceTabs.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            role="tab"
            aria-selected={workspace.id === activeWorkspaceId}
            className={`btn workspace-tab ${workspace.id === activeWorkspaceId ? "is-active" : ""}`}
            onClick={() => switchWorkspace(workspace.id)}
            onDragOver={(event) => {
              const payload = parseDragPayload(event);
              const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
              if (shouldReject) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              const payload = parseDragPayload(event);
              const shouldReject = !payload || payload.type !== "session" || workspace.id === activeWorkspaceId;
              if (shouldReject) {
                return;
              }
              event.preventDefault();
              sendSessionToWorkspace(payload.sessionId, workspace.id);
            }}
          >
            {workspace.name}
          </button>
        ))}
        <button type="button" className="btn workspace-tab workspace-tab-add" onClick={createWorkspace}>
          + Workspace
        </button>
        {workspaceTabs.length > 1 && (
          <button type="button" className="btn workspace-tab workspace-tab-danger" onClick={() => removeWorkspace(activeWorkspaceId)}>
            Remove current
          </button>
        )}
      </div>
      <div className="sessions-workspace">
        <div className="sessions-zone">
          <div className="session-pane-canvas">
            <div
              className={`terminal-grid ${splitResizeState ? `is-pane-resizing is-pane-resizing-${splitResizeState.axis}` : ""}${
                isStackedShell && mobileShellTab === "terminal" ? " is-mobile-terminal-pager" : ""
              }`}
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
          </div>
          <div className="sessions-footer" role="status">
            <div className="sessions-footer-meta">
              <div className="footer-layout-controls">
                <button
                  type="button"
                  className="btn btn-primary footer-layout-command-btn"
                  onClick={onOpenLayoutCommandCenter}
                  aria-label="Open layout command center"
                  title="Layouts, templates, session cleanup"
                >
                  Layouts
                </button>
                <div className="sessions-footer-status">
                  <span className={`context-pill footer-broadcast-pill ${isBroadcastModeEnabled ? "is-active" : ""}`}>
                    Broadcast: {isBroadcastModeEnabled ? "enabled" : "disabled"} ({broadcastTargetCount} targets)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
