export const buildPaneContextActions = ({ paneSessionId, canClosePane = true, broadcastModeEnabled, broadcastCount, }) => {
    const hasPaneSession = Boolean(paneSessionId);
    return [
        { id: "pane.clear", label: "Close session in pane", disabled: !hasPaneSession },
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
