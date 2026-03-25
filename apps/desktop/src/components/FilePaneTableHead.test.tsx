import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePaneTableHead } from "./FilePaneTableHead";

describe("FilePaneTableHead", () => {
  it("renders a compact icon-only optimal width control", () => {
    render(
      <table>
        <FilePaneTableHead
          variant="local"
          nameWidth={200}
          permWidth={120}
          userWidth={80}
          groupWidth={80}
          sizeWidth={88}
          modifiedColWidth={220}
          actionsColWidth={48}
          onGripPointerDown={() => vi.fn()}
          onGripDoubleClick={() => vi.fn()}
          onOptimalColumnWidths={vi.fn()}
        />
      </table>,
    );

    const button = screen.getByRole("button", { name: "Optimal column widths for name, permissions, and size" });
    expect(button).toBeInTheDocument();
    expect(button.textContent?.trim()).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
  });
});
