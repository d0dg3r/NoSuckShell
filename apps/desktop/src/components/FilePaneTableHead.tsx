import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

type Props = {
  variant: "local" | "remote";
  nameWidth: number;
  permWidth: number;
  userWidth: number;
  groupWidth: number;
  sizeWidth: number;
  modifiedColWidth: number;
  actionsColWidth: number;
  onGripPointerDown: (grip: 0 | 1 | 2) => (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onGripDoubleClick: (grip: 0 | 1 | 2) => (e: ReactMouseEvent<HTMLSpanElement>) => void;
  onOptimalColumnWidths: () => void;
  optimalWidthsDisabled?: boolean;
};

export function FilePaneTableHead({
  variant: _variant,
  nameWidth,
  permWidth,
  userWidth,
  groupWidth,
  sizeWidth,
  modifiedColWidth,
  actionsColWidth,
  onGripPointerDown,
  onGripDoubleClick,
  onOptimalColumnWidths,
  optimalWidthsDisabled = false,
}: Props) {
  return (
    <>
      <colgroup>
        <col style={{ width: nameWidth }} />
        <col style={{ width: permWidth }} />
        <col style={{ width: userWidth }} />
        <col style={{ width: groupWidth }} />
        <col style={{ width: sizeWidth }} />
        <col className="file-pane-col-modified" style={{ width: modifiedColWidth }} />
        <col className="file-pane-col-actions" style={{ width: actionsColWidth }} />
      </colgroup>
      <thead>
        <tr>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Name</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between name and permissions columns"
              onPointerDown={onGripPointerDown(0)}
              onDoubleClick={onGripDoubleClick(0)}
            />
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Permissions</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize permissions column versus size column"
              onPointerDown={onGripPointerDown(1)}
              onDoubleClick={onGripDoubleClick(1)}
            />
          </th>
          <th className="file-pane-th file-pane-th-owner" scope="col">
            <span className="file-pane-th-text">User</span>
          </th>
          <th className="file-pane-th file-pane-th-owner" scope="col">
            <span className="file-pane-th-text">Group</span>
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Size</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between size and modified columns"
              onPointerDown={onGripPointerDown(2)}
              onDoubleClick={onGripDoubleClick(2)}
            />
          </th>
          <th scope="col">Modified</th>
          <th className="file-pane-th-actions" scope="col" aria-label="Actions">
            <div className="file-pane-th-actions-inner">
              <button
                type="button"
                className="btn btn-ghost file-pane-optimal-widths-btn"
                title="Optimal width for name, permissions, and size columns"
                aria-label="Optimal column widths for name, permissions, and size"
                disabled={optimalWidthsDisabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOptimalColumnWidths();
                }}
              >
                Optimal width
              </button>
            </div>
          </th>
        </tr>
      </thead>
    </>
  );
}
