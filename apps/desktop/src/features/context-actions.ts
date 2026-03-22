export type ContextActionId =
  | "pane.newLocal"
  | "pane.quickConnect"
  | "pane.toggleRemoteFiles"
  | "pane.toggleLocalFiles"
  | "pane.clear"
  | "pane.close"
  | "layout.split.left"
  | "layout.split.right"
  | "layout.split.top"
  | "layout.split.bottom"
  | "layout.freeMove.enable"
  | "layout.freeMove.disable"
  | "broadcast.mode.enable"
  | "broadcast.mode.disable"
  | "broadcast.selectAllVisible"
  | "broadcast.clearTargets"
  | "broadcast.togglePaneTarget"
  | "app.openSettings";

export type ContextAction = {
  id: ContextActionId;
  label: string;
  disabled?: boolean;
  separatorAbove?: boolean;
};

export type PaneContextSessionKind = "empty" | "ssh" | "local" | "web";

type BuildArgs = {
  paneSessionId: string | null;
  paneSessionKind: PaneContextSessionKind;
  paneFileView: "terminal" | "remote" | "local";
  /** When false, remote/local file browser toggles are hidden (File workspace plugin off). */
  fileWorkspaceEnabled?: boolean;
  canClosePane?: boolean;
  broadcastModeEnabled: boolean;
  broadcastCount: number;
  splitMode?: "duplicate" | "empty";
  freeMoveEnabled?: boolean;
};

const buildSplitLabels = (splitMode: "duplicate" | "empty") => {
  if (splitMode === "empty") {
    return {
      top: "Split top (empty pane)",
      left: "Split left (empty pane)",
      right: "Split right (empty pane)",
      bottom: "Split bottom (empty pane)",
    } as const;
  }

  return {
    top: "Split top (duplicate session)",
    left: "Split left (duplicate session)",
    right: "Split right (duplicate session)",
    bottom: "Split bottom (duplicate session)",
  } as const;
};

export const buildPaneContextActions = ({
  paneSessionId,
  paneSessionKind,
  paneFileView,
  fileWorkspaceEnabled = true,
  canClosePane = true,
  broadcastModeEnabled,
  splitMode = "duplicate",
  freeMoveEnabled = false,
}: BuildArgs): ContextAction[] => {
  const hasPaneSession = Boolean(paneSessionId);
  const splitLabels = buildSplitLabels(splitMode);
  const freeMoveAction: ContextAction = freeMoveEnabled
    ? {
        id: "layout.freeMove.disable",
        label: "Resume auto-arrange for layout",
        separatorAbove: true,
      }
    : {
        id: "layout.freeMove.enable",
        label: "Pause auto-arrange (manual layout only)",
        separatorAbove: true,
      };
  const broadcastModeAction: ContextAction = broadcastModeEnabled
    ? {
        id: "broadcast.mode.disable",
        label: "Stop broadcasting keyboard to multiple panes",
        separatorAbove: true,
      }
    : {
        id: "broadcast.mode.enable",
        label: "Broadcast keyboard input to multiple panes",
        separatorAbove: true,
      };

  const remoteFilesAction: ContextAction | null =
    fileWorkspaceEnabled && paneSessionKind === "ssh"
      ? {
          id: "pane.toggleRemoteFiles",
          label: paneFileView === "remote" ? "Back to terminal" : "Browse remote files (SFTP)",
          disabled: !hasPaneSession,
        }
      : null;

  const localFilesAction: ContextAction | null =
    fileWorkspaceEnabled && paneSessionKind === "local"
      ? {
          id: "pane.toggleLocalFiles",
          label: paneFileView === "local" ? "Back to terminal" : "Browse local files",
          disabled: !hasPaneSession,
        }
      : null;

  return [
    { id: "pane.newLocal", label: "New local terminal" },
    { id: "pane.quickConnect", label: "Quick connect" },
    ...(remoteFilesAction ? [remoteFilesAction] : []),
    ...(localFilesAction ? [localFilesAction] : []),
    {
      id: "layout.split.top",
      label: splitLabels.top,
      separatorAbove: true,
    },
    {
      id: "layout.split.left",
      label: splitLabels.left,
    },
    {
      id: "layout.split.right",
      label: splitLabels.right,
    },
    {
      id: "layout.split.bottom",
      label: splitLabels.bottom,
    },
    freeMoveAction,
    broadcastModeAction,
    {
      id: "broadcast.togglePaneTarget",
      label: "Target this pane",
      disabled: !broadcastModeEnabled || !hasPaneSession || paneSessionKind === "web",
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
    {
      id: "app.openSettings",
      label: "Open app settings",
      separatorAbove: true,
    },
  ];
};
