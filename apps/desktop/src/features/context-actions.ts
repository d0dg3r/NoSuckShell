export type ContextActionId =
  | "pane.newLocal"
  | "pane.quickConnect"
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
  splitMode?: "duplicate" | "empty";
};

export const buildPaneContextActions = ({
  paneSessionId,
  canClosePane = true,
  broadcastModeEnabled,
  splitMode = "duplicate",
}: BuildArgs): ContextAction[] => {
  const hasPaneSession = Boolean(paneSessionId);
  const splitLabelSuffix = splitMode === "empty" ? "(new)" : "(copy)";
  const broadcastModeAction: ContextAction = broadcastModeEnabled
    ? { id: "broadcast.mode.disable", label: "Broadcast off", separatorAbove: true }
    : { id: "broadcast.mode.enable", label: "Broadcast on", separatorAbove: true };

  return [
    { id: "pane.newLocal", label: "New local terminal" },
    { id: "pane.quickConnect", label: "Quick connect" },
    {
      id: "layout.split.top",
      label: `Split top ${splitLabelSuffix}`,
      separatorAbove: true,
    },
    {
      id: "layout.split.left",
      label: `Split left ${splitLabelSuffix}`,
    },
    {
      id: "layout.split.right",
      label: `Split right ${splitLabelSuffix}`,
    },
    {
      id: "layout.split.bottom",
      label: `Split bottom ${splitLabelSuffix}`,
    },
    broadcastModeAction,
    {
      id: "broadcast.togglePaneTarget",
      label: "Target this pane",
      disabled: !broadcastModeEnabled || !hasPaneSession,
    },
    {
      id: "pane.clear",
      label: "Close session",
      disabled: !hasPaneSession,
      separatorAbove: true,
    },
    {
      id: "pane.close",
      label: "Close pane",
      disabled: !canClosePane,
    },
  ];
};
