import { describe, expect, it } from "vitest";
import { buildPaneContextActions } from "./context-actions";

describe("buildPaneContextActions", () => {
  it("disables broadcast target toggle for web panes", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "web-1",
      paneSessionKind: "web",
      paneFileView: "terminal",
      broadcastModeEnabled: true,
      broadcastCount: 0,
    });
    expect(actions.find((item) => item.id === "broadcast.togglePaneTarget")?.disabled).toBe(true);
  });

  it("disables pane-specific actions when pane is empty", () => {
    const actions = buildPaneContextActions({
      paneSessionId: null,
      paneSessionKind: "empty",
      paneFileView: "terminal",
      broadcastModeEnabled: true,
      broadcastCount: 0,
    });

    const clear = actions.find((item) => item.id === "pane.clear");
    expect(clear?.disabled).toBe(true);
    expect(actions.find((item) => item.id === "broadcast.togglePaneTarget")?.disabled).toBe(true);
  });

  it("does not expose deprecated mode-switch actions", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: true,
      broadcastCount: 2,
    });
    const labels = actions.map((item) => item.label);
    expect(labels).not.toContain("Single view");
    expect(labels).not.toContain("Panels view");
    expect(labels).not.toContain("Focus pane");
    expect(labels).not.toContain("Reset panes");
    expect(labels).not.toContain("Close active session");
  });

  it("exposes split labels in duplicate mode by default", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });

    expect(actions.find((item) => item.id === "layout.split.top")?.label).toBe("Split top (duplicate session)");
    expect(actions.find((item) => item.id === "layout.split.left")?.label).toBe("Split left (duplicate session)");
    expect(actions.find((item) => item.id === "layout.split.right")?.label).toBe("Split right (duplicate session)");
    expect(actions.find((item) => item.id === "layout.split.bottom")?.label).toBe("Split bottom (duplicate session)");
  });

  it("exposes split labels in empty-pane mode", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
      splitMode: "empty",
    });

    expect(actions.find((item) => item.id === "layout.split.top")?.label).toBe("Split top (empty pane)");
    expect(actions.find((item) => item.id === "layout.split.left")?.label).toBe("Split left (empty pane)");
    expect(actions.find((item) => item.id === "layout.split.right")?.label).toBe("Split right (empty pane)");
    expect(actions.find((item) => item.id === "layout.split.bottom")?.label).toBe("Split bottom (empty pane)");
  });

  it("shows only one broadcast switch action", () => {
    const onActions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });
    expect(onActions.find((item) => item.id === "broadcast.mode.enable")?.label).toBe(
      "Broadcast keyboard input to multiple panes",
    );
    expect(onActions.find((item) => item.id === "broadcast.mode.disable")).toBeUndefined();

    const offActions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: true,
      broadcastCount: 2,
    });
    expect(offActions.find((item) => item.id === "broadcast.mode.disable")?.label).toBe(
      "Stop broadcasting keyboard to multiple panes",
    );
    expect(offActions.find((item) => item.id === "broadcast.mode.enable")).toBeUndefined();
  });

  it("shows only one free move switch action", () => {
    const offActions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
      freeMoveEnabled: false,
    });
    expect(offActions.find((item) => item.id === "layout.freeMove.enable")?.label).toBe(
      "Pause auto-arrange (manual layout only)",
    );
    expect(offActions.find((item) => item.id === "layout.freeMove.disable")).toBeUndefined();

    const onActions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
      freeMoveEnabled: true,
    });
    expect(onActions.find((item) => item.id === "layout.freeMove.disable")?.label).toBe(
      "Resume auto-arrange for layout",
    );
    expect(onActions.find((item) => item.id === "layout.freeMove.enable")).toBeUndefined();
  });

  it("shows local file browser toggle for local sessions", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "sess-1",
      paneSessionKind: "local",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });
    expect(actions.find((item) => item.id === "pane.toggleLocalFiles")?.label).toBe("Browse local files");
    expect(actions.find((item) => item.id === "pane.toggleRemoteFiles")).toBeUndefined();
  });

  it("hides file browser toggles when file workspace plugin is off", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "sess-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      fileWorkspaceEnabled: false,
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });
    expect(actions.find((item) => item.id === "pane.toggleRemoteFiles")).toBeUndefined();
    const localOnly = buildPaneContextActions({
      paneSessionId: "sess-1",
      paneSessionKind: "local",
      paneFileView: "terminal",
      fileWorkspaceEnabled: false,
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });
    expect(localOnly.find((item) => item.id === "pane.toggleLocalFiles")).toBeUndefined();
  });

  it("keeps context menu grouping and split order stable", () => {
    const actions = buildPaneContextActions({
      paneSessionId: "pane-1",
      paneSessionKind: "ssh",
      paneFileView: "terminal",
      broadcastModeEnabled: false,
      broadcastCount: 0,
    });
    expect(actions.map((item) => item.id)).toEqual([
      "pane.newLocal",
      "pane.quickConnect",
      "pane.toggleRemoteFiles",
      "layout.split.top",
      "layout.split.left",
      "layout.split.right",
      "layout.split.bottom",
      "layout.freeMove.enable",
      "broadcast.mode.enable",
      "broadcast.togglePaneTarget",
      "pane.clear",
      "pane.close",
      "app.openSettings",
    ]);
  });
});
