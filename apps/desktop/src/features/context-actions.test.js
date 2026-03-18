import { describe, expect, it } from "vitest";
import { buildPaneContextActions } from "./context-actions";
describe("buildPaneContextActions", () => {
    it("disables pane-specific actions when pane is empty", () => {
        const actions = buildPaneContextActions({
            paneSessionId: null,
            broadcastModeEnabled: true,
            broadcastCount: 0,
        });
        const clear = actions.find((item) => item.id === "pane.clear");
        const toggleTarget = actions.find((item) => item.id === "broadcast.togglePaneTarget");
        expect(clear?.disabled).toBe(true);
        expect(toggleTarget?.disabled).toBe(true);
    });
    it("does not expose deprecated mode-switch actions", () => {
        const actions = buildPaneContextActions({
            paneSessionId: "pane-1",
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
    it("exposes all four split directions in context menu", () => {
        const actions = buildPaneContextActions({
            paneSessionId: "pane-1",
            broadcastModeEnabled: false,
            broadcastCount: 0,
        });
        expect(actions.find((item) => item.id === "layout.split.left")?.label).toBe("Split left");
        expect(actions.find((item) => item.id === "layout.split.right")?.label).toBe("Split right");
        expect(actions.find((item) => item.id === "layout.split.top")?.label).toBe("Split top");
        expect(actions.find((item) => item.id === "layout.split.bottom")?.label).toBe("Split bottom");
    });
});
