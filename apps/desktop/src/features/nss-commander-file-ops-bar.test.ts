import { describe, expect, it } from "vitest";
import {
  archiveEnabled,
  canCopyOrMoveInDirection,
  deleteEnabled,
  editTextFileEnabled,
  mkdirEnabled,
  newTextFileEnabled,
  renameEnabled,
  viewInSystemEnabled,
  resolveAutoDirection,
  resolveNssCommanderCopyMoveBaseDirection,
  reverseNssCommanderCopyMoveDirection,
} from "./nss-commander-file-ops-bar";

describe("nss-commander-file-ops-bar", () => {
  it("canCopyOrMoveInDirection requires selection and disallows terminal or remote-remote", () => {
    expect(
      canCopyOrMoveInDirection({
        leftKind: "local",
        rightKind: "remote",
        direction: "right",
        sourceSelectionSize: 1,
      }),
    ).toBe(true);
    expect(
      canCopyOrMoveInDirection({
        leftKind: "local",
        rightKind: "remote",
        direction: "right",
        sourceSelectionSize: 0,
      }),
    ).toBe(false);
    expect(
      canCopyOrMoveInDirection({
        leftKind: "remote",
        rightKind: "remote",
        direction: "left",
        sourceSelectionSize: 2,
      }),
    ).toBe(false);
    expect(
      canCopyOrMoveInDirection({
        leftKind: "terminal",
        rightKind: "local",
        direction: "left",
        sourceSelectionSize: 1,
      }),
    ).toBe(false);
  });

  it("deleteEnabled", () => {
    expect(deleteEnabled(1, "local")).toBe(true);
    expect(deleteEnabled(0, "local")).toBe(false);
    expect(deleteEnabled(1, "terminal")).toBe(false);
  });

  it("renameEnabled requires exactly one selected", () => {
    expect(renameEnabled(1, "remote")).toBe(true);
    expect(renameEnabled(2, "remote")).toBe(false);
    expect(renameEnabled(1, "terminal")).toBe(false);
  });

  it("mkdirEnabled", () => {
    expect(mkdirEnabled("local")).toBe(true);
    expect(mkdirEnabled("terminal")).toBe(false);
  });

  it("newTextFileEnabled matches mkdirEnabled", () => {
    expect(newTextFileEnabled("local")).toBe(true);
    expect(newTextFileEnabled("remote")).toBe(true);
    expect(newTextFileEnabled("terminal")).toBe(false);
  });

  it("editTextFileEnabled matches rename for count", () => {
    expect(editTextFileEnabled(1, "local")).toBe(true);
    expect(editTextFileEnabled(0, "local")).toBe(false);
    expect(editTextFileEnabled(1, "terminal")).toBe(false);
  });

  it("viewInSystemEnabled requires one selection in a file pane", () => {
    expect(viewInSystemEnabled(1, "local")).toBe(true);
    expect(viewInSystemEnabled(1, "remote")).toBe(true);
    expect(viewInSystemEnabled(0, "local")).toBe(false);
    expect(viewInSystemEnabled(2, "local")).toBe(false);
    expect(viewInSystemEnabled(1, "terminal")).toBe(false);
  });

  it("archiveEnabled", () => {
    expect(archiveEnabled(1, "local", false)).toBe(true);
    expect(archiveEnabled(0, "local", false)).toBe(false);
    expect(archiveEnabled(1, "local", true)).toBe(false);
  });

  it("resolveAutoDirection returns direction from active pane to other", () => {
    expect(resolveAutoDirection(0, 0, 1)).toBe("right");
    expect(resolveAutoDirection(1, 0, 1)).toBe("left");
    expect(resolveAutoDirection(99, 0, 1)).toBe("right");
  });

  it("resolveNssCommanderCopyMoveBaseDirection uses sole selection pane as source", () => {
    const L = 0;
    const R = 1;
    expect(
      resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: R,
        leftPaneIndex: L,
        rightPaneIndex: R,
        leftSelectionCount: 2,
        rightSelectionCount: 0,
      }),
    ).toBe("right");
    expect(
      resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: L,
        leftPaneIndex: L,
        rightPaneIndex: R,
        leftSelectionCount: 0,
        rightSelectionCount: 1,
      }),
    ).toBe("left");
  });

  it("resolveNssCommanderCopyMoveBaseDirection returns null when no selection", () => {
    expect(
      resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: 0,
        leftPaneIndex: 0,
        rightPaneIndex: 1,
        leftSelectionCount: 0,
        rightSelectionCount: 0,
      }),
    ).toBeNull();
  });

  it("resolveNssCommanderCopyMoveBaseDirection uses active pane when both sides have selection", () => {
    expect(
      resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: 1,
        leftPaneIndex: 0,
        rightPaneIndex: 1,
        leftSelectionCount: 1,
        rightSelectionCount: 1,
      }),
    ).toBe("left");
    expect(
      resolveNssCommanderCopyMoveBaseDirection({
        activePaneIndex: 0,
        leftPaneIndex: 0,
        rightPaneIndex: 1,
        leftSelectionCount: 1,
        rightSelectionCount: 1,
      }),
    ).toBe("right");
  });

  it("reverseNssCommanderCopyMoveDirection", () => {
    expect(reverseNssCommanderCopyMoveDirection("left")).toBe("right");
    expect(reverseNssCommanderCopyMoveDirection("right")).toBe("left");
  });
});
