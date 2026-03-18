export type ContextActionId =
  | "pane.clear"
  | "pane.close"
  | "layout.split.left"
  | "layout.split.right"
  | "layout.split.top"
  | "layout.split.bottom"
  | "broadcast.mode.enable"
  | "broadcast.mode.disable"
  | "broadcast.selectAllVisible"
  | "broadcast.clearTargets"
  | "broadcast.togglePaneTarget";

export type ContextAction = {
  id: ContextActionId;
  label: string;
  disabled?: boolean;
  separatorAbove?: boolean;
};

type BuildArgs = {
  paneSessionId: string | null;
  canClosePane?: boolean;
  broadcastModeEnabled: boolean;
  broadcastCount: number;
};

export const buildPaneContextActions = ({
  paneSessionId,
  canClosePane = true,
  broadcastModeEnabled,
  broadcastCount,
}: BuildArgs): ContextAction[] => {
  const hasPaneSession = Boolean(paneSessionId);

  return [
    { id: "pane.clear", label: "Clear pane", disabled: !hasPaneSession },
    {
      id: "pane.close",
      label: "Close pane (and session)",
      disabled: !canClosePane,
      separatorAbove: true,
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
  ];
};
