import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

type Props = {
  variant: "local" | "remote";
  nameWidth: number;
  sizeWidth: number;
  permWidth: number;
  userWidth: number;
  groupWidth: number;
  modifiedColWidth: number;
  actionsColWidth: number;
  onGripPointerDown: (grip: 0 | 1 | 2 | 3 | 4) => (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onGripDoubleClick: (grip: 0 | 1 | 2 | 3 | 4) => (e: ReactMouseEvent<HTMLSpanElement>) => void;
};

export function FilePaneTableHead({
  variant: _variant,
  nameWidth,
  sizeWidth,
  permWidth,
  userWidth,
  groupWidth,
  modifiedColWidth,
  actionsColWidth,
  onGripPointerDown,
  onGripDoubleClick,
}: Props) {
  return (
    <>
      <colgroup>
        <col style={{ width: nameWidth }} />
        <col style={{ width: sizeWidth }} />
        <col style={{ width: permWidth }} />
        <col style={{ width: userWidth }} />
        <col style={{ width: groupWidth }} />
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
              aria-label="Resize between name and size columns"
              onPointerDown={onGripPointerDown(0)}
              onDoubleClick={onGripDoubleClick(0)}
            />
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Size</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between size and permissions columns"
              onPointerDown={onGripPointerDown(1)}
              onDoubleClick={onGripDoubleClick(1)}
            />
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Permissions</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between permissions and user columns"
              onPointerDown={onGripPointerDown(2)}
              onDoubleClick={onGripDoubleClick(2)}
            />
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">User</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between user and group columns"
              onPointerDown={onGripPointerDown(3)}
              onDoubleClick={onGripDoubleClick(3)}
            />
          </th>
          <th className="file-pane-th file-pane-th-resizable" scope="col">
            <span className="file-pane-th-text">Group</span>
            <span
              className="file-pane-col-resize-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize between group and modified columns"
              onPointerDown={onGripPointerDown(4)}
              onDoubleClick={onGripDoubleClick(4)}
            />
          </th>
          <th scope="col">Modified</th>
          <th className="file-pane-th-actions" scope="col" aria-label="Actions" />
        </tr>
      </thead>
    </>
  );
}
