import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const STORAGE_PREFIX = "NoSuckShell.filePane.cols.";

const MIN_COL = 48;
const DRAG_THRESHOLD_PX = 4;
/** Reserved width for the actions column (export icon); must match layout intent */
const ACTION_COL_PX = 48;
/** Let the Modified column shrink this small before tightening the five fixed columns. */
const MIN_MOD_COL_PX = 48;

export const FILE_PANE_TABLE_DEFAULT_WIDTHS = {
  name: 160,
  size: 72,
  perm: 96,
  user: 88,
  group: 88,
} as const;

/** Column order: Name, Size, Permissions, User, Group */
const HEADER_LABELS = ["Name", "Size", "Permissions", "User", "Group"] as const;

const COL_KEYS = ["name", "size", "perm", "user", "group"] as const;

type Widths = { name: number; size: number; perm: number; user: number; group: number };
type ColKey = (typeof COL_KEYS)[number];

/** When shrinking fixed columns, reduce in this order (name last). */
const SHRINK_ORDER: ColKey[] = ["size", "group", "user", "perm", "name"];

function clampCol(n: number): number {
  return Math.min(2000, Math.max(MIN_COL, Math.round(n)));
}

function sum5(w: Widths): number {
  return w.name + w.size + w.perm + w.user + w.group;
}

function widthsDiffer(a: Widths, b: Widths): boolean {
  return COL_KEYS.some((k) => a[k] !== b[k]);
}

function readStored(key: string): Widths {
  const defaults: Widths = { ...FILE_PANE_TABLE_DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return defaults;
    }
    const p = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof p.name === "number" && Number.isFinite(p.name) ? p.name : defaults.name;
    const size = typeof p.size === "number" && Number.isFinite(p.size) ? p.size : defaults.size;
    const perm = typeof p.perm === "number" && Number.isFinite(p.perm) ? p.perm : defaults.perm;
    const user = typeof p.user === "number" && Number.isFinite(p.user) ? p.user : defaults.user;
    const group = typeof p.group === "number" && Number.isFinite(p.group) ? p.group : defaults.group;
    return {
      name: clampCol(name),
      size: clampCol(size),
      perm: clampCol(perm),
      user: clampCol(user),
      group: clampCol(group),
    };
  } catch {
    return defaults;
  }
}

type SessionState = {
  grip: 0 | 1 | 2 | 3 | 4;
  startX: number;
  startY: number;
  start: Widths;
  tableW: number;
  minTail: number;
  moved: boolean;
};

export type FilePaneTableAutoFitSamples = {
  name: string[];
  size: string[];
  perm: string[];
  user: string[];
  group: string[];
};

function measureTextColumnWidth(header: string, cells: string[], fontCss: string): number {
  if (typeof document === "undefined") {
    return MIN_COL;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return MIN_COL;
  }
  ctx.font = fontCss;
  let max = ctx.measureText(header).width;
  for (const t of cells) {
    max = Math.max(max, ctx.measureText(t || "").width);
  }
  return Math.ceil(max + 28);
}

/** Extra px beyond body-cell measure: resizable `th` has grip (10px) + asymmetric padding vs canvas estimate. */
const TH_RESIZABLE_HEADER_EXTRA_PX = 22;

/** Minimum width so the column header label is not clipped in `.file-pane-th-resizable` + `.file-pane-th-text`. */
function headerMinColumnWidth(header: string, fontCss: string): number {
  return clampCol(measureTextColumnWidth(header, [], fontCss) + TH_RESIZABLE_HEADER_EXTRA_PX);
}

/** Spread leftover table width across all five fixed columns (avoids one huge Name column). */
function distributeExtraEvenly(w: Widths, extra: number): Widths {
  if (extra <= 0) {
    return w;
  }
  const n = COL_KEYS.length;
  const base = Math.floor(extra / n);
  let rem = extra % n;
  const out = { ...w };
  for (let i = 0; i < n; i++) {
    const k = COL_KEYS[i]!;
    const add = base + (i < rem ? 1 : 0);
    out[k] = clampCol(out[k] + add);
  }
  return out;
}

function headerMinWidths(fontCss: string): Widths {
  return {
    name: headerMinColumnWidth(HEADER_LABELS[0], fontCss),
    size: headerMinColumnWidth(HEADER_LABELS[1], fontCss),
    perm: headerMinColumnWidth(HEADER_LABELS[2], fontCss),
    user: headerMinColumnWidth(HEADER_LABELS[3], fontCss),
    group: headerMinColumnWidth(HEADER_LABELS[4], fontCss),
  };
}

function widthsAtLeastMins(w: Widths, mins: Widths): Widths {
  return {
    name: clampCol(Math.max(w.name, mins.name)),
    size: clampCol(Math.max(w.size, mins.size)),
    perm: clampCol(Math.max(w.perm, mins.perm)),
    user: clampCol(Math.max(w.user, mins.user)),
    group: clampCol(Math.max(w.group, mins.group)),
  };
}

/** Reduce widths until sum ≤ maxSum, never below mins per column (when possible). */
function shrinkWidthsToMaxSum(w: Widths, maxSum: number, mins: Widths): Widths {
  let draft = widthsAtLeastMins(w, mins);
  let sum = sum5(draft);
  let guard = 0;
  while (sum > maxSum && guard < 100_000) {
    guard += 1;
    let best: ColKey | null = null;
    for (const k of SHRINK_ORDER) {
      const room = draft[k] - mins[k];
      if (room > 0) {
        best = k;
        break;
      }
    }
    if (!best) {
      break;
    }
    draft = { ...draft, [best]: draft[best] - 1 };
    sum -= 1;
  }
  return draft;
}

function resolveFontFromTableWrap(wrap: HTMLDivElement | null): string {
  const el = wrap?.querySelector("th, td") as HTMLElement | null;
  if (!el) {
    return "600 12px system-ui, sans-serif";
  }
  const cs = getComputedStyle(el);
  return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

function readWrapContentWidth(wrap: HTMLDivElement | null): number {
  if (!wrap) {
    return 640;
  }
  const cs = getComputedStyle(wrap);
  const pl = Number.parseFloat(cs.paddingLeft) || 0;
  const pr = Number.parseFloat(cs.paddingRight) || 0;
  return Math.max(0, wrap.clientWidth - pl - pr);
}

export type FilePaneTailColWidths = { modified: number; actions: number };

/**
 * Resizable columns: Name, Size, Permissions, User, Group; persisted in localStorage.
 * Double-click a grip to auto-fit the column to the left of that grip.
 */
export function useFilePaneTableResize(
  storageKey: string,
  minTailRestPx: number,
  autoFitSamples: FilePaneTableAutoFitSamples,
) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef<Widths>(readStored(storageKey));
  const [widths, setWidths] = useState<Widths>(() => readStored(storageKey));
  const [tailCols, setTailCols] = useState<FilePaneTailColWidths>(() => ({
    modified: 220,
    actions: ACTION_COL_PX,
  }));
  const sessionRef = useRef<SessionState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const samplesRef = useRef(autoFitSamples);
  samplesRef.current = autoFitSamples;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widthsRef.current));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  const applyResize = useCallback((d: SessionState, dx: number) => {
    const tw = d.tableW;
    const maxFive = tw - d.minTail;
    const s = d.start;

    const finishPair = (a: ColKey, b: ColKey, aVal: number, bVal: number): Widths => {
      let x = aVal;
      let y = bVal;
      if (x < MIN_COL) {
        y -= MIN_COL - x;
        x = MIN_COL;
      }
      if (y < MIN_COL) {
        x -= MIN_COL - y;
        y = MIN_COL;
      }
      const others = COL_KEYS.filter((k) => k !== a && k !== b).reduce((acc, k) => acc + s[k], 0);
      const maxPair = maxFive - others;
      if (x + y > maxPair) {
        const excess = x + y - maxPair;
        x -= excess / 2;
        y -= excess / 2;
      }
      return {
        ...s,
        [a]: clampCol(x),
        [b]: clampCol(y),
      };
    };

    if (d.grip === 0) {
      widthsRef.current = finishPair("name", "size", s.name + dx, s.size - dx);
    } else if (d.grip === 1) {
      widthsRef.current = finishPair("size", "perm", s.size + dx, s.perm - dx);
    } else if (d.grip === 2) {
      widthsRef.current = finishPair("perm", "user", s.perm + dx, s.user - dx);
    } else if (d.grip === 3) {
      widthsRef.current = finishPair("user", "group", s.user + dx, s.group - dx);
    } else {
      const rest = s.name + s.size + s.perm + s.user;
      const maxGroup = Math.max(MIN_COL, maxFive - rest);
      const group = Math.min(Math.max(MIN_COL, s.group + dx), maxGroup);
      widthsRef.current = { ...s, group: clampCol(group) };
    }
    setWidths({ ...widthsRef.current });
  }, []);

  const fitAllColumns = useCallback(() => {
    const tw = readWrapContentWidth(tableWrapRef.current);
    const font = resolveFontFromTableWrap(tableWrapRef.current);
    const maxFive = tw - minTailRestPx;
    const mins = headerMinWidths(font);
    if (maxFive < sum5(mins)) {
      const floorMins: Widths = { name: MIN_COL, size: MIN_COL, perm: MIN_COL, user: MIN_COL, group: MIN_COL };
      widthsRef.current = shrinkWidthsToMaxSum(mins, maxFive, floorMins);
      setWidths({ ...widthsRef.current });
      persist();
      return;
    }
    if (maxFive < MIN_COL * 5) {
      return;
    }
    const cols = COL_KEYS.map((key, i) =>
      clampCol(measureTextColumnWidth(HEADER_LABELS[i], samplesRef.current[key], font)),
    );
    let draft: Widths = widthsAtLeastMins(
      {
        name: cols[0]!,
        size: cols[1]!,
        perm: cols[2]!,
        user: cols[3]!,
        group: cols[4]!,
      },
      mins,
    );
    let sum = sum5(draft);
    if (sum > maxFive) {
      const scale = maxFive / sum;
      draft = widthsAtLeastMins(
        {
          name: clampCol(Math.max(mins.name, Math.floor(draft.name * scale))),
          size: clampCol(Math.max(mins.size, Math.floor(draft.size * scale))),
          perm: clampCol(Math.max(mins.perm, Math.floor(draft.perm * scale))),
          user: clampCol(Math.max(mins.user, Math.floor(draft.user * scale))),
          group: clampCol(Math.max(mins.group, Math.floor(draft.group * scale))),
        },
        mins,
      );
      sum = sum5(draft);
      if (sum > maxFive) {
        draft = shrinkWidthsToMaxSum(draft, maxFive, mins);
      }
    } else if (sum < maxFive) {
      draft = distributeExtraEvenly(draft, maxFive - sum);
    }
    widthsRef.current = draft;
    setWidths(draft);
    persist();
  }, [minTailRestPx, persist]);

  const onGripDoubleClick = useCallback(
    (grip: 0 | 1 | 2 | 3 | 4) => (event: ReactMouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const key = COL_KEYS[grip];
      const header = HEADER_LABELS[grip];
      const tw = readWrapContentWidth(tableWrapRef.current);
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const measured = measureTextColumnWidth(header, samplesRef.current[key], font);
      const hMin = headerMinColumnWidth(header, font);
      const maxFive = tw - minTailRestPx;
      const cur = widthsRef.current;
      const otherSum = sum5(cur) - cur[key];
      const cap = Math.max(MIN_COL, maxFive - otherSum);
      const nextVal = clampCol(Math.max(hMin, Math.min(measured, cap)));
      const next: Widths = { ...cur, [key]: nextVal };
      widthsRef.current = next;
      setWidths(next);
      persist();
    },
    [minTailRestPx, persist],
  );

  const onGripPointerDown = useCallback(
    (grip: 0 | 1 | 2 | 3 | 4) => (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const tw = readWrapContentWidth(tableWrapRef.current);
      sessionRef.current = {
        grip,
        startX: event.clientX,
        startY: event.clientY,
        start: { ...widthsRef.current },
        tableW: tw,
        minTail: minTailRestPx,
        moved: false,
      };

      const onMove = (e: PointerEvent) => {
        const d = sessionRef.current;
        if (!d) {
          return;
        }
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
            return;
          }
          d.moved = true;
          setIsDragging(true);
        }
        applyResize(d, dx);
      };

      const onUp = () => {
        const d = sessionRef.current;
        sessionRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setIsDragging(false);
        if (d?.moved) {
          persist();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyResize, minTailRestPx, persist],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging]);

  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) {
      return;
    }
    const run = () => {
      const st0 = getComputedStyle(el);
      const pl0 = Number.parseFloat(st0.paddingLeft) || 0;
      const pr0 = Number.parseFloat(st0.paddingRight) || 0;
      const inner = Math.max(0, el.clientWidth - pl0 - pr0);
      const font = resolveFontFromTableWrap(el);
      const hMins = headerMinWidths(font);

      if (inner >= sum5(hMins) + minTailRestPx) {
        const maxSum = inner - minTailRestPx;
        if (sum5(widthsRef.current) > maxSum) {
          const next = shrinkWidthsToMaxSum(widthsRef.current, maxSum, hMins);
          if (widthsDiffer(next, widthsRef.current)) {
            widthsRef.current = next;
            setWidths(next);
            persist();
          }
        }
      }
      const table = el.querySelector("table");
      if (table instanceof HTMLTableElement) {
        table.style.width = `${inner}px`;
        table.style.maxWidth = `${inner}px`;

        let wv = widthsRef.current;
        let modCol = inner - wv.name - wv.size - wv.perm - wv.user - wv.group - ACTION_COL_PX;
        if (modCol < MIN_MOD_COL_PX) {
          const tail = ACTION_COL_PX + MIN_MOD_COL_PX;
          const maxSumMod = inner - tail;
          if (maxSumMod >= sum5(hMins) && sum5(wv) > maxSumMod) {
            const next = shrinkWidthsToMaxSum(wv, maxSumMod, hMins);
            if (widthsDiffer(next, wv)) {
              widthsRef.current = next;
              setWidths(next);
              persist();
              wv = widthsRef.current;
            }
          }
          modCol = inner - wv.name - wv.size - wv.perm - wv.user - wv.group - ACTION_COL_PX;
        }
        modCol = Math.max(0, modCol);

        const modFloored = Math.floor(modCol);
        setTailCols((prev) =>
          prev.modified === modFloored && prev.actions === ACTION_COL_PX
            ? prev
            : { modified: modFloored, actions: ACTION_COL_PX },
        );
      }
    };
    const ro = new ResizeObserver(run);
    ro.observe(el);
    run();
    return () => ro.disconnect();
  }, [widths, storageKey, minTailRestPx, persist, autoFitSamples]);

  return { tableWrapRef, widths, tailCols, onGripPointerDown, onGripDoubleClick, fitAllColumns };
}
