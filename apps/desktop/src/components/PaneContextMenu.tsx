import type { MouseEvent as ReactMouseEvent } from "react";
import { buildPaneContextActions, type ContextActionId } from "../features/context-actions";
import type { SplitMode } from "../features/session-model";

export type WorkspaceTabLite = { id: string; name: string };

export type PaneContextMenuProps = {
  x: number;
  y: number;
  paneIndex: number;
  splitMode: SplitMode;
  paneSessionId: string | null;
  canClosePane: boolean;
  broadcastModeEnabled: boolean;
  broadcastCount: number;
  freeMoveEnabled: boolean;
  workspaceSendTargets: WorkspaceTabLite[];
  workspaceSendPlaceholder: boolean;
  onSendToWorkspace: (sessionId: string, workspaceId: string) => void;
  onDismiss: () => void;
  onPaneAction: (
    actionId: ContextActionId,
    paneIndex: number,
    detail: { preferredSplitMode: SplitMode; eventLike: ReactMouseEvent<HTMLButtonElement> },
  ) => void;
};

export function PaneContextMenu({
  x,
  y,
  paneIndex,
  splitMode,
  paneSessionId,
  canClosePane,
  broadcastModeEnabled,
  broadcastCount,
  freeMoveEnabled,
  workspaceSendTargets,
  workspaceSendPlaceholder,
  onSendToWorkspace,
  onDismiss,
  onPaneAction,
}: PaneContextMenuProps) {
  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenuCapture={(event) => {
        event.preventDefault();
      }}
    >
      {buildPaneContextActions({
        paneSessionId,
        canClosePane,
        broadcastModeEnabled,
        broadcastCount,
        splitMode,
        freeMoveEnabled,
      }).map((action) => (
        <button
          key={action.id}
          className={`context-menu-item ${action.separatorAbove ? "separator-above" : ""}`}
          disabled={action.disabled}
          onClick={(event) =>
            void onPaneAction(action.id, paneIndex, {
              preferredSplitMode: splitMode,
              eventLike: event,
            })
          }
        >
          {action.label}
        </button>
      ))}
      {workspaceSendTargets.map((workspace, index) => (
        <button
          key={`send-${workspace.id}`}
          className={`context-menu-item ${index === 0 ? "separator-above" : ""}`}
          onClick={() => {
            if (!paneSessionId) {
              return;
            }
            onSendToWorkspace(paneSessionId, workspace.id);
            onDismiss();
          }}
        >
          Send to {workspace.name}
        </button>
      ))}
      {workspaceSendPlaceholder && (
        <button type="button" className="context-menu-item separator-above" disabled>
          Send to other workspace (add another workspace tab)
        </button>
      )}
    </div>
  );
}
