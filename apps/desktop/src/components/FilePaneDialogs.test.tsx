import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePaneConfirmDialog } from "./FilePaneDialogs";

function keyDownWindow(key: string, shiftKey = false) {
  fireEvent.keyDown(window, { key, shiftKey, bubbles: true });
}

describe("FilePaneConfirmDialog", () => {
  it("focuses the first action on open and moves focus with ArrowRight / ArrowLeft", async () => {
    render(
      <FilePaneConfirmDialog
        open
        title="Replace existing file?"
        cancelLabel="Cancel"
        skipLabel="Skip"
        alternateLabel="Replace all"
        confirmLabel="Replace"
        confirmDanger
        onCancel={vi.fn()}
        onSkip={vi.fn()}
        onAlternate={vi.fn()}
        onConfirm={vi.fn()}
      >
        <p>Conflict message.</p>
      </FilePaneConfirmDialog>,
    );

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const skip = screen.getByRole("button", { name: "Skip" });
    const replaceAll = screen.getByRole("button", { name: "Replace all" });

    await waitFor(() => {
      expect(cancel).toHaveFocus();
    });

    keyDownWindow("ArrowRight");
    expect(skip).toHaveFocus();

    keyDownWindow("ArrowRight");
    expect(replaceAll).toHaveFocus();

    keyDownWindow("ArrowLeft");
    expect(skip).toHaveFocus();
  });

  it("wraps Tab from the last action back to the first (and Shift+Tab from first to last)", async () => {
    render(
      <FilePaneConfirmDialog
        open
        title="t"
        cancelLabel="One"
        skipLabel="Two"
        onCancel={vi.fn()}
        onSkip={vi.fn()}
        onConfirm={vi.fn()}
      >
        <p>Body</p>
      </FilePaneConfirmDialog>,
    );

    const one = screen.getByRole("button", { name: "One" });
    const ok = screen.getByRole("button", { name: "OK" });

    await waitFor(() => {
      expect(one).toHaveFocus();
    });

    ok.focus();
    keyDownWindow("Tab");
    expect(one).toHaveFocus();

    one.focus();
    keyDownWindow("Tab", true);
    expect(ok).toHaveFocus();
  });
});
