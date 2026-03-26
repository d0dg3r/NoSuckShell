export const FILE_PANE_RESIZABLE_HEADERS = ["Name", "Permissions", "User", "Group", "Size"] as const;

const MIN_COL_PX = 48;
const ACTION_COL_PX = 48;

export type FilePaneResizableWidths = { name: number; perm: number; user: number; group: number; size: number };

type ResolveOptimalResizableWidthsArgs = {
  tableWidth: number;
  fixedExtra: number;
  minTailRestPx: number;
  measured: FilePaneResizableWidths;
  /** Per-column minimum widths derived from header text measurement. When provided, each column is at least this wide. */
  headerMins?: FilePaneResizableWidths;
};

function clampColumnWidth(value: number): number {
  return Math.min(2000, Math.max(MIN_COL_PX, Math.round(value)));
}

/**
 * Universal optimal column width distribution.
 *
 * 1. Each column gets at least `max(MIN_COL_PX, headerMins[col])` so header text is always fully readable.
 * 2. Remaining budget is distributed proportionally to how much each column's measured content exceeds its floor.
 * 3. Deterministic: same inputs → same outputs.
 */
export function resolveOptimalResizableWidths({
  tableWidth,
  fixedExtra,
  minTailRestPx,
  measured,
  headerMins,
}: ResolveOptimalResizableWidthsArgs): FilePaneResizableWidths {
  const keys: Array<keyof FilePaneResizableWidths> = ["name", "perm", "user", "group", "size"];

  const floor: FilePaneResizableWidths = {
    name: MIN_COL_PX,
    perm: MIN_COL_PX,
    user: MIN_COL_PX,
    group: MIN_COL_PX,
    size: MIN_COL_PX,
  };
  if (headerMins) {
    for (const k of keys) {
      floor[k] = Math.max(floor[k], headerMins[k]);
    }
  }

  const maxTotal = Math.max(
    keys.reduce((s, k) => s + floor[k], 0),
    tableWidth - fixedExtra - ACTION_COL_PX - minTailRestPx,
  );

  const desired = Object.fromEntries(keys.map((k) => [k, clampColumnWidth(measured[k])])) as FilePaneResizableWidths;

  const floorSum = keys.reduce((s, k) => s + floor[k], 0);
  const next = { ...floor };

  let extraBudget = Math.max(0, maxTotal - floorSum);
  if (extraBudget === 0) {
    return next;
  }

  const extras = keys.map((k) => Math.max(0, desired[k] - floor[k]));
  const extrasSum = extras.reduce((a, b) => a + b, 0);

  if (extrasSum === 0) {
    const perCol = Math.floor(extraBudget / keys.length);
    for (const k of keys) {
      next[k] += perCol;
      extraBudget -= perCol;
    }
  } else {
    for (const [i, key] of keys.entries()) {
      const share = Math.floor((extraBudget * extras[i]!) / extrasSum);
      next[key] += share;
      extraBudget -= share;
    }
  }

  if (extraBudget > 0) {
    const priority = [...keys].sort((a, b) => desired[b] - desired[a]);
    let idx = 0;
    while (extraBudget > 0) {
      const key = priority[idx % priority.length]!;
      next[key] += 1;
      extraBudget -= 1;
      idx += 1;
    }
  }

  return next;
}
