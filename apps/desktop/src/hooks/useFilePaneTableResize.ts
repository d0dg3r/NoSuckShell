import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  resolveOptimalResizableWidthsForKeys,
  resizableHeaderLabel,
} from "../features/file-pane-column-sizing";

const STORAGE_PREFIX = "NoSuckShell.filePane.cols.";

const MIN_COL = 48;
const DRAG_THRESHOLD_PX = 4;
const ACTION_COL_PX = 48;
const MIN_MOD_COL_PX = 80;

export const FILE_PANE_TABLE_DEFAULT_WIDTHS = {
  name: 220,
  perm: 140,
  user: 88,
  group: 88,
  size: 88,
} as const;

const COL_KEYS = ["name", "perm", "user", "group", "size"] as const;

type Widths = { name: number; perm: number; user: number; group: number; size: number };

function widthsEqual(a: Widths, b: Widths): boolean {
  return a.name === b.name && a.perm === b.perm && a.user === b.user && a.group === b.group && a.size === b.size;
}

function clampCol(n: number): number {
  return Math.min(2000, Math.max(MIN_COL, Math.round(n)));
}

type LegacyStoredWidths = {
  name?: unknown;
  perm?: unknown;
  size?: unknown;
  user?: unknown;
  group?: unknown;
};

function readStored(key: string): Widths {
  const defaults: Widths = { ...FILE_PANE_TABLE_DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return defaults;
    }
    const p = JSON.parse(raw) as LegacyStoredWidths & Record<string, unknown>;
    const name = typeof p.name === "number" && Number.isFinite(p.name) ? p.name : defaults.name;
    const perm = typeof p.perm === "number" && Number.isFinite(p.perm) ? p.perm : defaults.perm;
    const user = typeof p.user === "number" && Number.isFinite(p.user) ? p.user : defaults.user;
    const group = typeof p.group === "number" && Number.isFinite(p.group) ? p.group : defaults.group;
    const size = typeof p.size === "number" && Number.isFinite(p.size) ? p.size : defaults.size;
    return {
      name: clampCol(name),
      perm: clampCol(perm),
      user: clampCol(user),
      group: clampCol(group),
      size: clampCol(size),
    };
  } catch {
    return defaults;
  }
}

type SessionState = {
  grip: number;
  startX: number;
  startY: number;
  start: Widths;
  tableW: number;
  minTail: number;
  fixedExtra: number;
  visibleKeys: (keyof Widths)[];
  moved: boolean;
};

export type FilePaneTableAutoFitSamples = {
  name: string[];
  perm: string[];
  user: string[];
  group: string[];
  size: string[];
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

export const FILE_PANE_OWNER_COL_MIN_PX = 56;
export const FILE_PANE_OWNER_COL_MAX_PX = 240;

export function measureFilePaneOwnerColumnWidth(header: string, cells: string[], fontCss: string): number {
  const w = measureTextColumnWidth(header, cells, fontCss);
  return Math.min(FILE_PANE_OWNER_COL_MAX_PX, Math.max(FILE_PANE_OWNER_COL_MIN_PX, w));
}

const TH_RESIZABLE_HEADER_EXTRA_PX = 22;

function headerMinColumnWidth(header: string, fontCss: string): number {
  return clampCol(measureTextColumnWidth(header, [], fontCss) + TH_RESIZABLE_HEADER_EXTRA_PX);
}

function sumWidthsForKeys(w: Widths, keys: (keyof Widths)[]): number {
  return keys.reduce((s, k) => s + w[k], 0);
}

/** Proportionally shrink visible resizable columns to fit the modified column minimum. */
function clampVisibleColumnsToTable(
  tableWidth: number,
  minTail: number,
  fixedExtra: number,
  w: Widths,
  visibleKeys: (keyof Widths)[],
): Widths | null {
  if (visibleKeys.length === 0) {
    return null;
  }
  const reserved = ACTION_COL_PX + minTail + fixedExtra;
  const maxVisible = tableWidth - reserved;
  if (maxVisible < MIN_COL * visibleKeys.length) {
    return null;
  }
  const sum = sumWidthsForKeys(w, visibleKeys);
  if (sum <= maxVisible) {
    return null;
  }
  const scale = maxVisible / sum;
  const result: Widths = { ...w };
  for (const k of visibleKeys) {
    result[k] = clampCol(Math.floor(w[k] * scale));
  }
  let s2 = sumWidthsForKeys(result, visibleKeys);
  const order = [...visibleKeys].reverse();
  while (s2 > maxVisible) {
    let shrank = false;
    for (const k of order) {
      if (result[k] > MIN_COL) {
        result[k] -= 1;
        s2 -= 1;
        shrank = true;
        break;
      }
    }
    if (!shrank) {
      break;
    }
  }
  return result;
}

function applyResizeSession(d: SessionState, dx: number): Widths {
  const visibleKeys = d.visibleKeys;
  if (visibleKeys.length === 0) {
    return { ...d.start };
  }
  const tw = d.tableW;
  const reserved = ACTION_COL_PX + d.minTail + d.fixedExtra;
  const maxBudget = tw - reserved;
  const s = d.start;
  const grip = d.grip;

  const finishPair = (a: keyof Widths, b: keyof Widths, aVal: number, bVal: number): Widths => {
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
    const others = visibleKeys.filter((k) => k !== a && k !== b).reduce((acc, k) => acc + s[k], 0);
    const maxPair = maxBudget - others;
    if (x + y > maxPair) {
      const excess = x + y - maxPair;
      x -= excess / 2;
      y -= excess / 2;
    }
    const next = { ...s, [a]: clampCol(x), [b]: clampCol(y) };
    return next;
  };

  if (grip < visibleKeys.length - 1) {
    const a = visibleKeys[grip]!;
    const b = visibleKeys[grip + 1]!;
    return finishPair(a, b, s[a] + dx, s[b] - dx);
  }
  const last = visibleKeys[visibleKeys.length - 1]!;
  const rest = visibleKeys.slice(0, -1).reduce((acc, k) => acc + s[k], 0);
  const maxLast = Math.max(MIN_COL, maxBudget - rest);
  const size = Math.min(Math.max(MIN_COL, s[last] + dx), maxLast);
  return { ...s, [last]: clampCol(size) };
}

export function resolveFontFromTableWrap(wrap: HTMLDivElement | null): string {
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

export type FilePaneTableResizeLayout = {
  /** Left-to-right resizable keys currently shown (subset of name, perm, user, group, size). */
  visibleResizableKeys: (keyof Widths)[];
  /** Width of fixed optional columns (e.g. Octal + Kind). */
  fixedOptionalWidthPx: number;
};

/**
 * Resizable columns are persisted. Layout depends on which of the five logical columns are visible.
 * Data column order: Name | Permissions | … | Modified | Actions (see file-pane-table-columns).
 */
export function useFilePaneTableResize(
  storageKey: string,
  minTailRestPx: number,
  autoFitSamples: FilePaneTableAutoFitSamples,
  userColumnSamples: string[],
  groupColumnSamples: string[],
  layout: FilePaneTableResizeLayout,
) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const userSizedRef = useRef(false);
  const widthsRef = useRef<Widths>(readStored(storageKey));
  const preShrinkWidthsRef = useRef<Widths | null>(null);
  const [widths, setWidths] = useState<Widths>(() => readStored(storageKey));
  const [tailCols, setTailCols] = useState<FilePaneTailColWidths>(() => ({
    modified: 220,
    actions: ACTION_COL_PX,
  }));
  const sessionRef = useRef<SessionState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const samplesRef = useRef(autoFitSamples);
  samplesRef.current = autoFitSamples;
  const userColSamplesRef = useRef(userColumnSamples);
  userColSamplesRef.current = userColumnSamples;
  const groupColSamplesRef = useRef(groupColumnSamples);
  groupColSamplesRef.current = groupColumnSamples;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widthsRef.current));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  /** Recompute Modified column width and clamp resizable columns when the sum would squeeze Modified below minimum. */
  const finalizeTailLayoutForInner = useCallback(
    (inner: number) => {
      const wv = widthsRef.current;
      const visKeys = layoutRef.current.visibleResizableKeys;
      const keysForSum = visKeys.length > 0 ? visKeys : [...COL_KEYS];
      const fixedEx = layoutRef.current.fixedOptionalWidthPx;
      const resizableSum = sumWidthsForKeys(wv, keysForSum);
      let modCol = inner - resizableSum - fixedEx - ACTION_COL_PX;

      if (modCol < MIN_MOD_COL_PX) {
        if (!preShrinkWidthsRef.current) {
          preShrinkWidthsRef.current = { ...wv };
        }
        const clamped = clampVisibleColumnsToTable(inner, MIN_MOD_COL_PX, fixedEx, wv, keysForSum);
        if (clamped && !widthsEqual(wv, clamped)) {
          widthsRef.current = clamped;
          setWidths(clamped);
        }
        const cv = widthsRef.current;
        modCol = inner - sumWidthsForKeys(cv, keysForSum) - fixedEx - ACTION_COL_PX;
      } else if (preShrinkWidthsRef.current) {
        const pre = preShrinkWidthsRef.current;
        const preSum = sumWidthsForKeys(pre, keysForSum);
        const preMod = inner - preSum - fixedEx - ACTION_COL_PX;
        if (preMod >= MIN_MOD_COL_PX) {
          preShrinkWidthsRef.current = null;
          widthsRef.current = pre;
          setWidths(pre);
          persist();
          modCol = preMod;
        }
      }
      modCol = Math.max(0, modCol);

      const modFloored = Math.floor(modCol);
      setTailCols((prev) =>
        prev.modified === modFloored && prev.actions === ACTION_COL_PX
          ? prev
          : { modified: modFloored, actions: ACTION_COL_PX },
      );
    },
    [persist],
  );

  const measureIdealResizableWidths = useCallback(
    (tableWidth: number): Widths => {
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const headerMins = { name: MIN_COL, perm: MIN_COL, user: MIN_COL, group: MIN_COL, size: MIN_COL } as Widths;
      const measured = COL_KEYS.reduce(
        (acc, key) => {
          const header = resizableHeaderLabel(key);
          const textWidth = measureTextColumnWidth(header, samplesRef.current[key], font);
          const hMin = headerMinColumnWidth(header, font);
          headerMins[key] = hMin;
          acc[key] = Math.max(hMin, textWidth);
          return acc;
        },
        { name: MIN_COL, perm: MIN_COL, user: MIN_COL, group: MIN_COL, size: MIN_COL } as Widths,
      );
      const vk = layoutRef.current.visibleResizableKeys;
      const keys = vk.length > 0 ? vk : [...COL_KEYS];
      const fixedEx = layoutRef.current.fixedOptionalWidthPx;
      return resolveOptimalResizableWidthsForKeys({
        keys,
        tableWidth,
        fixedExtra: fixedEx,
        minTailRestPx,
        measured,
        headerMins,
        preserve: widthsRef.current,
      });
    },
    [minTailRestPx],
  );

  const applyResize = useCallback((d: SessionState, dx: number) => {
    widthsRef.current = applyResizeSession(d, dx);
    setWidths({ ...widthsRef.current });
  }, []);

  const fitOneColumn = useCallback(
    (gripIndex: number) => {
      const visibleKeys = layoutRef.current.visibleResizableKeys;
      if (visibleKeys.length === 0) {
        return widthsRef.current;
      }
      const tw = readWrapContentWidth(tableWrapRef.current);
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const fixedEx = layoutRef.current.fixedOptionalWidthPx;
      const maxBudget = tw - ACTION_COL_PX - minTailRestPx - fixedEx;
      const cur = widthsRef.current;
      const targetKey =
        gripIndex < visibleKeys.length - 1 ? visibleKeys[gripIndex]! : visibleKeys[visibleKeys.length - 1]!;
      const header = resizableHeaderLabel(targetKey);
      const measured = measureTextColumnWidth(header, samplesRef.current[targetKey] ?? [], font);
      const hMin = headerMinColumnWidth(header, font);
      const otherSum = visibleKeys.filter((k) => k !== targetKey).reduce((acc, k) => acc + cur[k], 0);
      const cap = Math.max(MIN_COL, maxBudget - otherSum);
      const nextVal = clampCol(Math.max(hMin, Math.min(measured, cap)));
      return { ...cur, [targetKey]: nextVal } as Widths;
    },
    [minTailRestPx],
  );

  const onGripDoubleClick = useCallback(
    (gripIndex: number) => (event: ReactMouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const next = fitOneColumn(gripIndex);
      userSizedRef.current = true;
      preShrinkWidthsRef.current = null;
      widthsRef.current = next;
      setWidths(next);
      persist();
    },
    [fitOneColumn, persist],
  );

  const applyOptimalColumnWidths = useCallback(() => {
    const wrap = tableWrapRef.current;
    const tw = readWrapContentWidth(wrap);
    const cur = measureIdealResizableWidths(tw);
    userSizedRef.current = true;
    preShrinkWidthsRef.current = null;
    widthsRef.current = cur;
    setWidths(cur);
    persist();
    requestAnimationFrame(() => {
      const el = tableWrapRef.current;
      if (!el) {
        return;
      }
      const st0 = getComputedStyle(el);
      const pl0 = Number.parseFloat(st0.paddingLeft) || 0;
      const pr0 = Number.parseFloat(st0.paddingRight) || 0;
      const inner = Math.max(0, el.clientWidth - pl0 - pr0);
      const table = el.querySelector("table");
      if (table instanceof HTMLTableElement) {
        table.style.width = `${inner}px`;
        table.style.maxWidth = `${inner}px`;
      }
      finalizeTailLayoutForInner(inner);
    });
  }, [measureIdealResizableWidths, persist, finalizeTailLayoutForInner]);

  const onGripPointerDown = useCallback(
    (gripIndex: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const tw = readWrapContentWidth(tableWrapRef.current);
      const vis = layoutRef.current.visibleResizableKeys;
      sessionRef.current = {
        grip: Math.min(gripIndex, Math.max(0, vis.length - 1)),
        startX: event.clientX,
        startY: event.clientY,
        start: { ...widthsRef.current },
        tableW: tw,
        minTail: minTailRestPx,
        fixedExtra: layoutRef.current.fixedOptionalWidthPx,
        visibleKeys: vis,
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
        userSizedRef.current = true;
        preShrinkWidthsRef.current = null;
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

      const table = el.querySelector("table");
      if (table instanceof HTMLTableElement) {
        table.style.width = `${inner}px`;
        table.style.maxWidth = `${inner}px`;

        if (!isDragging && !userSizedRef.current) {
          const optimal = measureIdealResizableWidths(inner);
          if (!widthsEqual(widthsRef.current, optimal)) {
            widthsRef.current = optimal;
            setWidths(optimal);
            persist();
          }
        }

        finalizeTailLayoutForInner(inner);
      }
    };
    const ro = new ResizeObserver(run);
    ro.observe(el);
    run();
    return () => ro.disconnect();
  }, [
    persist,
    isDragging,
    measureIdealResizableWidths,
    layout.visibleResizableKeys,
    layout.fixedOptionalWidthPx,
    finalizeTailLayoutForInner,
  ]);

  useEffect(() => {
    if (userSizedRef.current) {
      return;
    }
    const measure = () => {
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const nextUser = measureFilePaneOwnerColumnWidth("User", userColSamplesRef.current, font);
      const nextGroup = measureFilePaneOwnerColumnWidth("Group", groupColSamplesRef.current, font);
      const cur = widthsRef.current;
      if (cur.user !== nextUser || cur.group !== nextGroup) {
        widthsRef.current = { ...cur, user: nextUser, group: nextGroup };
        setWidths({ ...widthsRef.current });
      }
    };
    measure();
    const el = tableWrapRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [userColumnSamples, groupColumnSamples]);

  return {
    tableWrapRef,
    widths,
    tailCols,
    onGripPointerDown,
    onGripDoubleClick,
    applyOptimalColumnWidths,
  };
}
