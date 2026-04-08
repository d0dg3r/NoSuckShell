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

/** Pixel budget for the sum of resizable column widths (Modified + Actions taken from table width separately). */
export function filePaneResizableBudgetCap(
  tableWidth: number,
  fixedExtra: number,
  minTailRestPx: number,
): number {
  return Math.max(0, Math.floor(tableWidth - fixedExtra - ACTION_COL_PX - minTailRestPx));
}

function sumWidthsForKeys(keys: string[], w: Record<string, number>): number {
  return keys.reduce((s, k) => s + (w[k] ?? 0), 0);
}

/**
 * Adjusts integer widths so sum equals maxSum when possible (each >= MIN_COL_PX).
 * If maxSum is too small for all mins, returns best-effort (may still exceed maxSum).
 */
function fitWidthsToExactSum(keys: string[], cur: Record<string, number>, maxSum: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = Math.max(MIN_COL_PX, cur[k] ?? MIN_COL_PX);
  }
  let s = sumWidthsForKeys(keys, out);
  if (s > maxSum) {
    const scale = maxSum / s;
    for (const k of keys) {
      out[k] = Math.max(MIN_COL_PX, Math.floor(out[k]! * scale));
    }
    s = sumWidthsForKeys(keys, out);
    const order = [...keys].reverse();
    const hardMin = 24;
    while (s > maxSum) {
      let progressed = false;
      for (const k of order) {
        if (out[k]! > MIN_COL_PX) {
          out[k]!--;
          s--;
          progressed = true;
          break;
        }
      }
      if (progressed) {
        continue;
      }
      for (const k of order) {
        if (out[k]! > hardMin) {
          out[k]!--;
          s--;
          progressed = true;
          break;
        }
      }
      if (!progressed) {
        break;
      }
    }
  }
  while (s < maxSum) {
    out[keys[0]!]! += 1;
    s += 1;
  }
  return out;
}

/**
 * Distribute extra width across keys proportionally to (desired - current).
 * Result sum never exceeds budgetCap.
 */
function distributeExtraWithinBudget(
  keys: string[],
  current: Record<string, number>,
  desired: Record<string, number>,
  budgetCap: number,
): Record<string, number> {
  const next: Record<string, number> = { ...current };
  let s = sumWidthsForKeys(keys, next);
  if (s > budgetCap) {
    return fitWidthsToExactSum(keys, next, budgetCap);
  }
  let extraBudget = budgetCap - s;
  if (extraBudget === 0) {
    return next;
  }
  if (extraBudget < 0) {
    return fitWidthsToExactSum(keys, next, budgetCap);
  }

  const extras = keys.map((k) => Math.max(0, desired[k]! - next[k]!));
  const extrasSum = extras.reduce((a, b) => a + b, 0);
  if (extrasSum === 0) {
    const perCol = Math.floor(extraBudget / keys.length);
    for (const k of keys) {
      next[k]! += perCol;
      extraBudget -= perCol;
    }
  } else {
    for (const [i, key] of keys.entries()) {
      const share = Math.floor((extraBudget * extras[i]!) / extrasSum);
      next[key]! += share;
      extraBudget -= share;
    }
  }
  if (extraBudget > 0) {
    const priority = [...keys].sort((a, b) => desired[b]! - desired[a]!);
    let idx = 0;
    while (extraBudget > 0) {
      const key = priority[idx % priority.length]!;
      next[key]! += 1;
      extraBudget -= 1;
      idx += 1;
    }
  }

  s = sumWidthsForKeys(keys, next);
  if (s > budgetCap) {
    return fitWidthsToExactSum(keys, next, budgetCap);
  }
  if (s < budgetCap) {
    return fitWidthsToExactSum(keys, next, budgetCap);
  }
  return next;
}

function optimalPartialForKeys(
  keys: Array<keyof FilePaneResizableWidths>,
  budgetCap: number,
  measured: FilePaneResizableWidths,
  headerMins: FilePaneResizableWidths | undefined,
): Record<string, number> {
  const keyStrs = keys.map((k) => k as string);
  const floor: Record<string, number> = {};
  for (const k of keys) {
    const ks = k as string;
    floor[ks] = MIN_COL_PX;
    if (headerMins) {
      floor[ks] = Math.max(floor[ks]!, headerMins[k]);
    }
  }

  const floorSum = sumWidthsForKeys(keyStrs, floor);
  let base: Record<string, number>;
  if (floorSum > budgetCap) {
    base = fitWidthsToExactSum(keyStrs, floor, budgetCap);
  } else {
    base = { ...floor };
  }

  const desired: Record<string, number> = {};
  for (const k of keys) {
    desired[k as string] = clampColumnWidth(measured[k]);
  }

  return distributeExtraWithinBudget(keyStrs, base, desired, budgetCap);
}

function clampWidthsRecordToBudget(
  keys: Array<keyof FilePaneResizableWidths>,
  partial: Record<string, number>,
  budgetCap: number,
): Record<string, number> {
  const keyStrs = keys.map((k) => k as string);
  const w: Record<string, number> = {};
  for (const k of keys) {
    w[k as string] = clampColumnWidth(partial[k as string]!);
  }
  let s = sumWidthsForKeys(keyStrs, w);
  if (s > budgetCap) {
    return fitWidthsToExactSum(keyStrs, w, budgetCap);
  }
  return w;
}

/**
 * Universal optimal column width distribution.
 *
 * 1. Each column gets at least `max(MIN_COL_PX, headerMins[col])` when budget allows.
 * 2. Remaining budget is distributed proportionally to how much each column's measured content exceeds its floor.
 * 3. Sum of all five widths never exceeds the table budget (avoids horizontal scroll).
 */
export function resolveOptimalResizableWidths({
  tableWidth,
  fixedExtra,
  minTailRestPx,
  measured,
  headerMins,
}: ResolveOptimalResizableWidthsArgs): FilePaneResizableWidths {
  const keys: Array<keyof FilePaneResizableWidths> = ["name", "perm", "user", "group", "size"];
  const budgetCap = filePaneResizableBudgetCap(tableWidth, fixedExtra, minTailRestPx);
  const partial = optimalPartialForKeys(keys, budgetCap, measured, headerMins);
  const w = clampWidthsRecordToBudget(keys, partial, budgetCap);
  return {
    name: w.name!,
    perm: w.perm!,
    user: w.user!,
    group: w.group!,
    size: w.size!,
  };
}

const HEADER_FOR_KEY: Record<keyof FilePaneResizableWidths, string> = {
  name: "Name",
  perm: "Permissions",
  user: "User",
  group: "Group",
  size: "Size",
};

/**
 * Like {@link resolveOptimalResizableWidths} but only adjusts `keys` (e.g. visible resizable columns).
 * Other keys are copied from `preserve`.
 * Hidden resizable columns do not consume layout width — budget is not reduced by their stored widths.
 */
export function resolveOptimalResizableWidthsForKeys(args: {
  keys: Array<keyof FilePaneResizableWidths>;
  tableWidth: number;
  fixedExtra: number;
  minTailRestPx: number;
  measured: FilePaneResizableWidths;
  headerMins?: FilePaneResizableWidths;
  preserve: FilePaneResizableWidths;
}): FilePaneResizableWidths {
  const { keys, tableWidth, fixedExtra, minTailRestPx, measured, headerMins, preserve } = args;
  const out: FilePaneResizableWidths = { ...preserve };
  if (keys.length === 0) {
    return out;
  }

  const budgetCap = filePaneResizableBudgetCap(tableWidth, fixedExtra, minTailRestPx);
  const partial = optimalPartialForKeys(keys, budgetCap, measured, headerMins);
  const w = clampWidthsRecordToBudget(keys, partial, budgetCap);
  for (const k of keys) {
    out[k] = w[k as string]!;
  }
  return out;
}

export function resizableHeaderLabel(key: keyof FilePaneResizableWidths): string {
  return HEADER_FOR_KEY[key];
}
