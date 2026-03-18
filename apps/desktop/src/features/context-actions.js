export const buildPaneContextActions = ({ paneSessionId, activeSession, canClosePane = true, broadcastModeEnabled, broadcastCount, }) => {
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
