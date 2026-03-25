import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent, type ReactNode, type RefObject, type UIEvent } from "react";
import type { DragPayload } from "../features/pane-dnd";
import { createLeafNode, type SplitResizeState, type SplitTreeNode } from "../features/split-tree";
import { useClampedContextMenuPosition } from "../hooks/useClampedContextMenuPosition";

import type { WorkspaceKind } from "../features/workspace-snapshot";

export type WorkspaceTabInfo = { id: string; name: string; kind?: WorkspaceKind; preferVerticalNewPanes: boolean };

export type TerminalWorkspaceDockProps = {
  workspaceTabs: WorkspaceTabInfo[];
  activeWorkspaceId: string;
  switchWorkspace: (workspaceId: string) => void;
  parseDragPayload: (event: ReactDragEvent) => DragPayload | null;
  sendSessionToWorkspace: (sessionId: string, workspaceId: string) => void;
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
  onOpenLayoutCommandCenter: () => void;
  isBroadcastModeEnabled: boolean;
  broadcastTargetCount: number;
  commanderActionRail?: ReactNode;
};

export function TerminalWorkspaceDock({
  workspaceTabs,
  activeWorkspaceId,
  switchWorkspace,
  parseDragPayload,
  sendSessionToWorkspace,
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
  onOpenLayoutCommandCenter,
  isBroadcastModeEnabled,
  broadcastTargetCount,
  commanderActionRail,
}: TerminalWorkspaceDockProps) {
  const [workspaceMenu, setWorkspaceMenu] = useState<{ workspaceId: string; x: number; y: number } | null>(null);
  const targetWorkspace = useMemo(
    () => workspaceTabs.find((workspace) => workspace.id === workspaceMenu?.workspaceId) ?? null,
    [workspaceMenu?.workspaceId, workspaceTabs],
  );
  const { menuRef, style: menuStyle } = useClampedContextMenuPosition(
    workspaceMenu != null,
    workspaceMenu?.x ?? 0,
    workspaceMenu?.y ?? 0,
    [workspaceMenu?.workspaceId, targetWorkspace?.preferVerticalNewPanes === true],
  );

  useEffect(() => {
    if (!workspaceMenu) {
      return;
    }
    const dismiss = () => setWorkspaceMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (menuRef.current && target instanceof Node && menuRef.current.contains(target)) {
        return;
      }
      dismiss();
    };
    const onWindowBlur = () => dismiss();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuRef, workspaceMenu]);

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
            onContextMenu={(event) => {
              event.preventDefault();
              setWorkspaceMenu({ workspaceId: workspace.id, x: event.clientX, y: event.clientY });
            }}
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
        <button type="button" className="btn workspace-tab workspace-tab-add" onClick={createNssCommanderWorkspace} title="NSS-Commander: dual file-pane workspace">
          + NSS-Commander
        </button>
        {workspaceTabs.length > 1 && (
          <button type="button" className="btn workspace-tab workspace-tab-danger" onClick={() => removeWorkspace(activeWorkspaceId)}>
            Remove current
          </button>
        )}
        {workspaceMenu && targetWorkspace && (
          <div
            ref={menuRef}
            className="context-menu"
            style={menuStyle}
            role="menu"
            onContextMenuCapture={(event) => {
              event.preventDefault();
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="context-menu-item"
              onClick={() => {
                const nextName = window.prompt("Workspace name", targetWorkspace.name);
                if (nextName == null) {
                  setWorkspaceMenu(null);
                  return;
                }
                const trimmed = nextName.trim();
                if (!trimmed) {
                  setWorkspaceMenu(null);
                  return;
                }
                renameWorkspace(targetWorkspace.id, trimmed);
                setWorkspaceMenu(null);
              }}
            >
              Rename workspace
            </button>
            {targetWorkspace.kind === "nss-commander" ? null : (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={targetWorkspace.preferVerticalNewPanes}
                className="context-menu-item separator-above"
                onClick={() => {
                  setWorkspaceVerticalStacking(targetWorkspace.id, !targetWorkspace.preferVerticalNewPanes);
                  setWorkspaceMenu(null);
                }}
              >
                {targetWorkspace.preferVerticalNewPanes ? "✓ " : ""}Stack new panes vertically
              </button>
            )}
          </div>
        )}
      </div>
      {commanderActionRail}
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
