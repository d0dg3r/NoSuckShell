import { describe, expect, it } from "vitest";
import {
  archiveEnabled,
  canCopyOrMoveInDirection,
  deleteEnabled,
  editTextFileEnabled,
  mkdirEnabled,
  newTextFileEnabled,
  renameEnabled,
  resolveAutoDirection,
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
});
