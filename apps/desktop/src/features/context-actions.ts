export type ContextActionId =
  | "pane.focus"
  | "pane.assignActiveSession"
  | "pane.clear"
  | "pane.closeSession"
  | "layout.single.enable"
  | "layout.split2x2.enable"
  | "layout.reset"
  | "broadcast.mode.enable"
  | "broadcast.mode.disable"
  | "broadcast.off"
  | "broadcast.selectAllVisible"
  | "broadcast.clearTargets"
  | "broadcast.togglePaneTarget"
  | "session.close"
  | "session.trustHost";

export type ContextAction = {
  id: ContextActionId;
  label: string;
  disabled?: boolean;
  separatorAbove?: boolean;
};

type BuildArgs = {
  paneSessionId: string | null;
  activeSession: string;
  viewMode: "single" | "split2x2";
  broadcastModeEnabled: boolean;
  broadcastCount: number;
  pendingTrustForActive: boolean;
};

export const buildPaneContextActions = ({
  paneSessionId,
  activeSession,
  viewMode,
  broadcastModeEnabled,
  broadcastCount,
  pendingTrustForActive,
}: BuildArgs): ContextAction[] => {
  const hasPaneSession = Boolean(paneSessionId);
  const hasActiveSession = activeSession.length > 0;

  return [
    { id: "pane.focus", label: "Focus pane" },
    {
      id: "pane.assignActiveSession",
      label: "Send active here",
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
      id: "layout.single.enable",
      label: "Single view",
      separatorAbove: true,
      disabled: viewMode === "single",
    },
    {
      id: "layout.split2x2.enable",
      label: "Panel view",
      disabled: viewMode === "split2x2",
    },
    {
      id: "layout.reset",
      label: "Reset panes",
      disabled: viewMode !== "split2x2",
    },
    {
      id: "broadcast.mode.enable",
      label: "Broadcast mode ON",
      disabled: broadcastModeEnabled,
      separatorAbove: true,
    },
    {
      id: "broadcast.mode.disable",
      label: "Broadcast mode OFF",
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
      disabled: !broadcastModeEnabled || viewMode !== "split2x2",
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
    {
      id: "session.trustHost",
      label: "Trust host",
      disabled: !pendingTrustForActive,
      separatorAbove: true,
    },
    { id: "session.close", label: "Close active session", disabled: !hasActiveSession },
  ];
};
