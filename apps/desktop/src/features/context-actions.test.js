import { describe, expect, it } from "vitest";
import { buildPaneContextActions } from "./context-actions";
describe("buildPaneContextActions", () => {
    it("disables pane-specific actions when pane is empty", () => {
        const actions = buildPaneContextActions({
            paneSessionId: null,
            activeSession: "",
            viewMode: "split2x2",
            broadcastModeEnabled: true,
            broadcastCount: 0,
            pendingTrustForActive: false,
        });
        const assign = actions.find((item) => item.id === "pane.assignActiveSession");
        const clear = actions.find((item) => item.id === "pane.clear");
        const toggleTarget = actions.find((item) => item.id === "broadcast.togglePaneTarget");
        expect(assign?.disabled).toBe(true);
        expect(clear?.disabled).toBe(true);
        expect(toggleTarget?.disabled).toBe(true);
    });
    it("disables single-layout action while already single", () => {
        const actions = buildPaneContextActions({
            paneSessionId: "pane-1",
            activeSession: "pane-1",
            viewMode: "single",
            broadcastModeEnabled: true,
            broadcastCount: 2,
            pendingTrustForActive: true,
        });
        expect(actions.find((item) => item.id === "layout.single.enable")?.disabled).toBe(true);
        expect(actions.find((item) => item.id === "layout.split2x2.enable")?.disabled).toBe(false);
    });
});
