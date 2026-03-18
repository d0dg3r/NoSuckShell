export type ContextActionId =
  | "pane.focus"
  | "pane.assignActiveSession"
  | "pane.clear"
  | "pane.close"
  | "pane.closeSession"
  | "layout.split.left"
  | "layout.split.right"
  | "layout.split.top"
  | "layout.split.bottom"
  | "layout.reset"
  | "broadcast.mode.enable"
  | "broadcast.mode.disable"
  | "broadcast.off"
  | "broadcast.selectAllVisible"
  | "broadcast.clearTargets"
  | "broadcast.togglePaneTarget"
  | "session.close";

export type ContextAction = {
  id: ContextActionId;
  label: string;
  disabled?: boolean;
  separatorAbove?: boolean;
};

type BuildArgs = {
  paneSessionId: string | null;
  activeSession: string;
  canClosePane?: boolean;
  broadcastModeEnabled: boolean;
  broadcastCount: number;
};

export const buildPaneContextActions = ({
  paneSessionId,
  activeSession,
  canClosePane = true,
  broadcastModeEnabled,
  broadcastCount,
}: BuildArgs): ContextAction[] => {
  const hasPaneSession = Boolean(paneSessionId);
  const hasActiveSession = activeSession.length > 0;

  return [
    { id: "pane.focus", label: "Focus pane" },
    {
      id: "pane.assignActiveSession",
      label: "Send active to pane",
      disabled: !hasActiveSession,
    },
    { id: "pane.clear", label: "Clear pane", disabled: !hasPaneSession },
    {
      id: "pane.closeSession",
      label: "Close pane session",
      disabled: !hasPaneSession,
      separatorAbove: true,
    },
    {
      id: "pane.close",
      label: "Close pane (and session)",
      disabled: !canClosePane,
    },
    {
      id: "layout.split.left",
      label: "Split left",
      separatorAbove: true,
    },
    {
      id: "layout.split.right",
      label: "Split right",
    },
    {
      id: "layout.split.top",
      label: "Split top",
    },
    {
      id: "layout.split.bottom",
      label: "Split bottom",
    },
    {
      id: "layout.reset",
      label: "Reset panes",
    },
    {
      id: "broadcast.mode.enable",
      label: "Broadcast: ON",
      disabled: broadcastModeEnabled,
      separatorAbove: true,
    },
    {
      id: "broadcast.mode.disable",
      label: "Broadcast: OFF",
      disabled: !broadcastModeEnabled,
    },
    {
      id: "broadcast.togglePaneTarget",
      label: "Toggle pane target",
      disabled: !broadcastModeEnabled || !hasPaneSession,
    },
    {
      id: "broadcast.selectAllVisible",
      label: "Target all visible",
      disabled: !broadcastModeEnabled,
    },
    {
      id: "broadcast.clearTargets",
      label: "Clear targets",
      disabled: !broadcastModeEnabled || broadcastCount === 0,
    },
    {
      id: "broadcast.off",
      label: "Broadcast OFF",
      disabled: !broadcastModeEnabled && broadcastCount === 0,
    },
    { id: "session.close", label: "Close active session", disabled: !hasActiveSession, separatorAbove: true },
  ];
};
