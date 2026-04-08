import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FILE_PANE_COLUMN_ORDER,
  FILE_PANE_DEFAULT_VISIBILITY,
  filePaneVisibleDataColumns,
  filePaneVisibleResizableKeysFromDisplayOrder,
} from "../features/file-pane-table-columns";
import { FilePaneTableHead } from "./FilePaneTableHead";

describe("FilePaneTableHead", () => {
  it("renders compact icon-only optimal width and columns controls", () => {
    const vis = FILE_PANE_DEFAULT_VISIBILITY;
    const order = FILE_PANE_COLUMN_ORDER;
    const visible = filePaneVisibleDataColumns(vis, order);
    render(
      <table>
        <FilePaneTableHead
          variant="local"
          visibleDataColumns={visible}
          visibleResizableKeys={filePaneVisibleResizableKeysFromDisplayOrder(visible)}
          widths={{ name: 200, perm: 120, user: 80, group: 80, size: 88 }}
          modifiedColWidth={220}
          actionsColWidth={48}
          onGripPointerDown={() => vi.fn()}
          onGripDoubleClick={() => vi.fn()}
          onOptimalColumnWidths={vi.fn()}
          sort={{ column: null, direction: "asc" }}
          onSortColumnClick={vi.fn()}
          columnVisibility={vis}
          onToggleColumnVisibility={vi.fn()}
          columnOrder={order}
          onColumnOrderChange={vi.fn()}
        />
      </table>,
    );

    const optimal = screen.getByRole("button", { name: "Optimal column widths for visible columns" });
    expect(optimal).toBeInTheDocument();
    expect(optimal.textContent?.trim()).toBe("");
    expect(optimal.querySelector("svg")).not.toBeNull();

    const columns = screen.getByRole("button", { name: "Columns" });
    expect(columns).toBeInTheDocument();
  });
});
