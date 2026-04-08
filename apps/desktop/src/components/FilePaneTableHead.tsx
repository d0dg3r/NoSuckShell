import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  FilePaneColumnVisibility,
  FilePaneDataColumnId,
  FilePaneResizableWidthKey,
  FilePaneSortState,
} from "../features/file-pane-table-columns";
import {
  FILE_PANE_KIND_COL_PX,
  FILE_PANE_OCTAL_COL_PX,
  FILE_PANE_SORTABLE_COLUMN_IDS,
  FILE_PANE_TOGGLEABLE_COLUMN_IDS,
  filePaneColumnLabel,
  filePaneColumnResizableKey,
} from "../features/file-pane-table-columns";

const TOGGLEABLE_ID_SET = new Set<FilePaneDataColumnId>(FILE_PANE_TOGGLEABLE_COLUMN_IDS);

function swapColumnOrder(order: FilePaneDataColumnId[], index: number, delta: -1 | 1): FilePaneDataColumnId[] {
  const j = index + delta;
  if (j < 0 || j >= order.length) {
    return order;
  }
  const next = [...order];
  [next[index], next[j]] = [next[j]!, next[index]!];
  return next;
}

type Widths = { name: number; perm: number; user: number; group: number; size: number };

const RESIZABLE_KEY_TO_LABEL_ID: Record<FilePaneResizableWidthKey, FilePaneDataColumnId> = {
  name: "name",
  perm: "permissions",
  user: "user",
  group: "group",
  size: "size",
};

function gripAriaLabel(
  visibleResizableKeys: FilePaneResizableWidthKey[],
  gripIndex: number,
): string {
  const vk = visibleResizableKeys;
  if (vk.length === 0) {
    return "Resize column";
  }
  if (gripIndex < vk.length - 1) {
    const a = filePaneColumnLabel(RESIZABLE_KEY_TO_LABEL_ID[vk[gripIndex]!]!);
    const b = filePaneColumnLabel(RESIZABLE_KEY_TO_LABEL_ID[vk[gripIndex + 1]!]!);
    return `Resize between ${a} and ${b} columns`;
  }
  const last = filePaneColumnLabel(RESIZABLE_KEY_TO_LABEL_ID[vk[vk.length - 1]!]!);
  return `Resize between ${last} and Modified columns`;
}

/** Which grip index (if any) is rendered on the right edge of each visible data column. */
function gripIndexAfterColumn(
  visibleDataColumns: FilePaneDataColumnId[],
  visibleResizableKeys: FilePaneResizableWidthKey[],
): (number | null)[] {
  const n = visibleDataColumns.length;
  const grips: (number | null)[] = Array.from({ length: n }, () => null);
  const vk = visibleResizableKeys;
  for (let g = 0; g < vk.length; g++) {
    if (g < vk.length - 1) {
      const rightKey = vk[g + 1]!;
      const idx = visibleDataColumns.findIndex((id) => filePaneColumnResizableKey(id) === rightKey);
      if (idx > 0) {
        grips[idx - 1] = g;
      }
    } else {
      const leftKey = vk[g]!;
      const idx = visibleDataColumns.findIndex((id) => filePaneColumnResizableKey(id) === leftKey);
      if (idx >= 0) {
        grips[idx] = g;
      }
    }
  }
  return grips;
}

function colWidthForId(id: FilePaneDataColumnId, widths: Widths, modifiedW: number): number {
  switch (id) {
    case "name":
      return widths.name;
    case "permissions":
      return widths.perm;
    case "octal":
      return FILE_PANE_OCTAL_COL_PX;
    case "user":
      return widths.user;
    case "group":
      return widths.group;
    case "size":
      return widths.size;
    case "modified":
      return modifiedW;
    case "kind":
      return FILE_PANE_KIND_COL_PX;
    default:
      return widths.name;
  }
}

function OptimalWidthsIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 7h18" strokeLinecap="round" />
      <path d="M3 17h18" strokeLinecap="round" />
      <path d="M7 4L4 7l3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 14l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 14l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h4M4 12h4M4 18h4" strokeLinecap="round" />
      <path d="M12 6h8M12 12h8M12 18h8" strokeLinecap="round" />
    </svg>
  );
}

function SortChevron({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg
      className="file-pane-sort-chevron"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {direction === "asc" ? (
        <path d="M12 8l-6 6h12L12 8z" />
      ) : (
        <path d="M12 16l6-6H6l6 6z" />
      )}
    </svg>
  );
}

type Props = {
  variant: "local" | "remote";
  visibleDataColumns: FilePaneDataColumnId[];
  visibleResizableKeys: FilePaneResizableWidthKey[];
  widths: Widths;
  modifiedColWidth: number;
  actionsColWidth: number;
  onGripPointerDown: (gripIndex: number) => (e: ReactPointerEvent<HTMLSpanElement>) => void;
  onGripDoubleClick: (gripIndex: number) => (e: ReactMouseEvent<HTMLSpanElement>) => void;
  onOptimalColumnWidths: () => void;
  optimalWidthsDisabled?: boolean;
  sort: FilePaneSortState;
  onSortColumnClick: (column: FilePaneDataColumnId) => void;
  columnVisibility: FilePaneColumnVisibility;
  onToggleColumnVisibility: (column: FilePaneDataColumnId) => void;
  columnOrder: FilePaneDataColumnId[];
  onColumnOrderChange: (order: FilePaneDataColumnId[]) => void;
};

export function FilePaneTableHead({
  variant: _variant,
  visibleDataColumns,
  visibleResizableKeys,
  widths,
  modifiedColWidth,
  actionsColWidth,
  onGripPointerDown,
  onGripDoubleClick,
  onOptimalColumnWidths,
  optimalWidthsDisabled = false,
  sort,
  onSortColumnClick,
  columnVisibility,
  onToggleColumnVisibility,
  columnOrder,
  onColumnOrderChange,
}: Props) {
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const gripAfter = gripIndexAfterColumn(visibleDataColumns, visibleResizableKeys);

  const updateMenuPos = useCallback(() => {
    const el = columnsBtnRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 220) });
  }, []);

  useLayoutEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }
    updateMenuPos();
  }, [columnsMenuOpen, updateMenuPos]);

  useEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }
    const onReposition = () => updateMenuPos();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [columnsMenuOpen, updateMenuPos]);

  useEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        popoverRef.current?.contains(t) ||
        columnsBtnRef.current?.contains(t)
      ) {
        return;
      }
      setColumnsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [columnsMenuOpen]);

  return (
    <>
      <colgroup>
        {visibleDataColumns.map((id) => (
          <col
            key={id}
            className={id === "modified" ? "file-pane-col-modified" : undefined}
            style={{ width: colWidthForId(id, widths, modifiedColWidth) }}
          />
        ))}
        <col className="file-pane-col-actions" style={{ width: actionsColWidth }} />
      </colgroup>
      <thead>
        <tr>
          {visibleDataColumns.map((id, colIndex) => {
            const label = filePaneColumnLabel(id);
            const rk = filePaneColumnResizableKey(id);
            const sortable = FILE_PANE_SORTABLE_COLUMN_IDS.includes(id);
            const activeSort = sort.column === id;
            const ariaSort =
              sortable && activeSort
                ? sort.direction === "asc"
                  ? "ascending"
                  : "descending"
                : sortable
                  ? "none"
                  : undefined;
            const thClass = [
              rk ? "file-pane-th-resizable" : "",
              id === "user" || id === "group" ? "file-pane-th-owner" : "",
              id === "modified" ? "file-pane-col-modified" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const gripIdx = gripAfter[colIndex] ?? null;

            return (
              <th
                key={id}
                className={thClass || undefined}
                scope="col"
                aria-sort={ariaSort}
                title={label}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="file-pane-th-sort-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSortColumnClick(id);
                    }}
                  >
                    <span className="file-pane-th-text">{label}</span>
                    {activeSort ? <SortChevron direction={sort.direction} /> : null}
                  </button>
                ) : (
                  <span className="file-pane-th-text">{label}</span>
                )}
                {gripIdx !== null ? (
                  <span
                    className="file-pane-col-resize-grip"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={gripAriaLabel(visibleResizableKeys, gripIdx)}
                    onPointerDown={onGripPointerDown(gripIdx)}
                    onDoubleClick={onGripDoubleClick(gripIdx)}
                  />
                ) : null}
              </th>
            );
          })}
          <th className="file-pane-th-actions" scope="col" aria-label="Actions">
            <div className="file-pane-th-actions-inner">
              <button
                ref={columnsBtnRef}
                type="button"
                className="btn btn-ghost file-pane-columns-btn"
                title="Show or hide columns"
                aria-label="Columns"
                aria-expanded={columnsMenuOpen}
                aria-haspopup="dialog"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setColumnsMenuOpen((o) => !o);
                }}
              >
                <ColumnsIcon />
              </button>
              <button
                type="button"
                className="btn btn-ghost file-pane-optimal-widths-btn"
                title="Optimal widths for visible resizable columns"
                aria-label="Optimal column widths for visible columns"
                disabled={optimalWidthsDisabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOptimalColumnWidths();
                }}
              >
                <OptimalWidthsIcon />
              </button>
            </div>
          </th>
        </tr>
      </thead>
      {columnsMenuOpen && menuPos
        ? createPortal(
            <div
              ref={popoverRef}
              className="file-pane-columns-popover"
              role="dialog"
              aria-label="Columns"
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 12000 }}
            >
              <div className="file-pane-columns-popover-title">Columns</div>
              <p className="file-pane-columns-popover-hint">
                Use the arrows to change order. Name, Modified, and Actions always stay visible; optional columns can be
                hidden below.
              </p>
              <ul className="file-pane-columns-popover-list">
                {columnOrder.map((id, index) => {
                  const label = filePaneColumnLabel(id);
                  const toggleable = TOGGLEABLE_ID_SET.has(id);
                  return (
                    <li key={id} className="file-pane-columns-popover-item">
                      <div className="file-pane-columns-popover-order">
                        <button
                          type="button"
                          className="btn btn-ghost file-pane-columns-order-btn"
                          aria-label={`Move ${label} column up`}
                          disabled={index === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onColumnOrderChange(swapColumnOrder(columnOrder, index, -1));
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost file-pane-columns-order-btn"
                          aria-label={`Move ${label} column down`}
                          disabled={index === columnOrder.length - 1}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onColumnOrderChange(swapColumnOrder(columnOrder, index, 1));
                          }}
                        >
                          ↓
                        </button>
                      </div>
                      <span className="file-pane-columns-popover-label">{label}</span>
                      {toggleable ? (
                        <label className="file-pane-columns-popover-check">
                          <input
                            type="checkbox"
                            checked={columnVisibility[id]}
                            onChange={() => onToggleColumnVisibility(id)}
                          />
                          <span className="sr-only">Show {label}</span>
                        </label>
                      ) : (
                        <span className="file-pane-columns-popover-fixed" aria-hidden>
                          —
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
