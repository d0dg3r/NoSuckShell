export const FILE_PANE_RESIZABLE_HEADERS = ["Name", "Permissions", "Size"] as const;

const MIN_COL_PX = 48;
const ACTION_COL_PX = 48;

export type FilePaneResizableWidths = { name: number; perm: number; size: number };

type ResolveOptimalResizableWidthsArgs = {
  tableWidth: number;
  fixedExtra: number;
  minTailRestPx: number;
  measured: FilePaneResizableWidths;
};

function clampColumnWidth(value: number): number {
  return Math.min(2000, Math.max(MIN_COL_PX, Math.round(value)));
}

export function resolveOptimalResizableWidths({
  tableWidth,
  fixedExtra,
  minTailRestPx,
  measured,
}: ResolveOptimalResizableWidthsArgs): FilePaneResizableWidths {
  const maxTriple = Math.max(MIN_COL_PX * 3, tableWidth - fixedExtra - ACTION_COL_PX - minTailRestPx);
  let remaining = maxTriple;
  const order: Array<keyof FilePaneResizableWidths> = ["name", "perm", "size"];
  const next = { name: MIN_COL_PX, perm: MIN_COL_PX, size: MIN_COL_PX };

  for (const [index, key] of order.entries()) {
    const remainingColumns = order.length - index - 1;
    const reserveForRemaining = remainingColumns * MIN_COL_PX;
    const maxForColumn = Math.max(MIN_COL_PX, remaining - reserveForRemaining);
    const ideal = clampColumnWidth(measured[key]);
    next[key] = Math.min(ideal, maxForColumn);
    remaining -= next[key];
  }

  return next;
}
