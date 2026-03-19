import { describe, expect, it } from "vitest";
import {
  assignSessionToPane,
  assignSessionToFirstFreePane,
  createPaneLayoutsFromSlots,
  createInitialPaneState,
  normalizeSplitSlots,
  resizePaneLayout,
  removeSessionFromSlots,
  resolveInputTargets,
  sanitizeBroadcastTargets,
  swapItems,
} from "./split";

describe("split workspace helpers", () => {
  it("creates a single initial pane", () => {
    expect(createInitialPaneState()).toEqual([null]);
  });

  it("assigns active session to focused pane in dynamic layout", () => {
    const initial = createInitialPaneState();
    const next = assignSessionToPane(initial, 2, "session-c");
    expect(next).toEqual([null, null, "session-c"]);
  });

  it("assigns to first free pane without auto-expanding layout", () => {
    const next = assignSessionToFirstFreePane([null], "session-a");
    expect(next).toEqual(["session-a"]);
  });

  it("normalizes slots by preserving a free target pane", () => {
    const next = normalizeSplitSlots(["a", "b"]);
    expect(next).toEqual(["a", "b", null]);
  });

  it("removes closed sessions from all panes", () => {
    const initial = ["a", "b", "a", null];
    const next = removeSessionFromSlots(initial, "a");
    expect(next).toEqual([null, "b", null, null]);
  });

  it("sanitizes broadcast selection against known sessions", () => {
    const targets = new Set(["a", "ghost", "b"]);
    const sessionIds = ["a", "b", "c"];
    expect([...sanitizeBroadcastTargets(targets, sessionIds)]).toEqual(["a", "b"]);
  });

  it("routes input only to selected targets when broadcast is enabled", () => {
    const targets = new Set(["s2", "s3"]);
    const resolved = resolveInputTargets("s1", targets, ["s1", "s2", "s3"]);
    expect(resolved).toEqual(["s2", "s3"]);
  });

  it("falls back to origin session when no broadcast target is selected", () => {
    const resolved = resolveInputTargets("s1", new Set(), ["s1", "s2"]);
    expect(resolved).toEqual(["s1"]);
  });

  it("swaps pane order", () => {
    const next = swapItems(["a", "b", "c"], 0, 2);
    expect(next).toEqual(["c", "b", "a"]);
  });

  it("resizes pane layout with min constraints", () => {
    const layouts = createPaneLayoutsFromSlots([null, null]);
    const grown = resizePaneLayout(layouts, 0, "xy", 60, 50);
    expect(grown[0].width).toBe(layouts[0].width + 60);
    expect(grown[0].height).toBe(layouts[0].height + 50);
    const shrunk = resizePaneLayout(grown, 0, "xy", -10_000, -10_000);
    expect(shrunk[0].width).toBeGreaterThanOrEqual(240);
    expect(shrunk[0].height).toBeGreaterThanOrEqual(150);
  });
});
