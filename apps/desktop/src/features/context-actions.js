const buildSplitLabels = (splitMode) => {
    if (splitMode === "empty") {
        return {
            top: "Split top (empty pane)",
            left: "Split left (empty pane)",
            right: "Split right (empty pane)",
            bottom: "Split bottom (empty pane)",
        };
    }
    return {
        top: "Split top (duplicate session)",
        left: "Split left (duplicate session)",
        right: "Split right (duplicate session)",
        bottom: "Split bottom (duplicate session)",
    };
};
export const buildPaneContextActions = ({ paneSessionId, canClosePane = true, broadcastModeEnabled, splitMode = "duplicate", freeMoveEnabled = false, }) => {
    const hasPaneSession = Boolean(paneSessionId);
    const splitLabels = buildSplitLabels(splitMode);
    const freeMoveAction = freeMoveEnabled
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
    const broadcastModeAction = broadcastModeEnabled
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
    return [
        { id: "pane.newLocal", label: "New local terminal" },
        { id: "pane.quickConnect", label: "Quick connect" },
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
