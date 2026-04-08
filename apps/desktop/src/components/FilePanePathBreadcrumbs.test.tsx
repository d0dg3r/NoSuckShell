import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localPathBreadcrumbSegments } from "../features/file-pane-paths";
import { FilePanePathBreadcrumbs } from "./FilePanePathBreadcrumbs";

describe("FilePanePathBreadcrumbs", () => {
  it("does not duplicate slash after filesystem-root crumb for absolute paths", () => {
    const { container } = render(
      <FilePanePathBreadcrumbs
        segments={localPathBreadcrumbSegments("/app/data")}
        onNavigate={vi.fn()}
      />,
    );
    const separators = container.querySelectorAll(".file-pane-path-separator");
    // Only between "app" and "data", not between "/" and "app".
    expect(separators.length).toBe(1);
  });

  it("still separates home-relative segments", () => {
    const { container } = render(
      <FilePanePathBreadcrumbs
        segments={localPathBreadcrumbSegments("a/b")}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".file-pane-path-separator").length).toBe(2);
  });
});
