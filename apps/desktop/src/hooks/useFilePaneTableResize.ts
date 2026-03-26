import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FILE_PANE_RESIZABLE_HEADERS,
  resolveOptimalResizableWidths,
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

export const FILE_PANE_OWNER_COL_MIN_PX = 48;
export const FILE_PANE_OWNER_COL_MAX_PX = 240;

export function measureFilePaneOwnerColumnWidth(header: string, cells: string[], fontCss: string): number {
  const w = measureTextColumnWidth(header, cells, fontCss);
  return Math.min(FILE_PANE_OWNER_COL_MAX_PX, Math.max(FILE_PANE_OWNER_COL_MIN_PX, w));
}

const TH_RESIZABLE_HEADER_EXTRA_PX = 22;

function headerMinColumnWidth(header: string, fontCss: string): number {
  return clampCol(measureTextColumnWidth(header, [], fontCss) + TH_RESIZABLE_HEADER_EXTRA_PX);
}

/** Proportionally shrink all 5 columns so they fit within the available budget. */
function clampAllColumnsToTable(
  tableWidth: number,
  minTail: number,
  w: Widths,
): Widths | null {
  const reserved = ACTION_COL_PX + minTail;
  const maxFive = tableWidth - reserved;
  if (maxFive < MIN_COL * 5) {
    return null;
  }
  const sum = w.name + w.perm + w.user + w.group + w.size;
  if (sum <= maxFive) {
    return null;
  }
  const scale = maxFive / sum;
  const result: Widths = {
    name: clampCol(Math.floor(w.name * scale)),
    perm: clampCol(Math.floor(w.perm * scale)),
    user: clampCol(Math.floor(w.user * scale)),
    group: clampCol(Math.floor(w.group * scale)),
    size: clampCol(Math.floor(w.size * scale)),
  };
  let s2 = result.name + result.perm + result.user + result.group + result.size;
  const keys: Array<keyof Widths> = ["size", "group", "user", "perm", "name"];
  while (s2 > maxFive) {
    let shrank = false;
    for (const k of keys) {
      if (result[k] > MIN_COL) {
        result[k] -= 1;
        s2 -= 1;
        shrank = true;
        break;
      }
    }
    if (!shrank) break;
  }
  return result;
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

/**
 * All 5 columns (Name, Permissions, User, Group, Size) are resizable and persisted.
 * Column order: Name | Permissions | User | Group | Size | Modified | Actions.
 */
export function useFilePaneTableResize(
  storageKey: string,
  minTailRestPx: number,
  autoFitSamples: FilePaneTableAutoFitSamples,
  userColumnSamples: string[],
  groupColumnSamples: string[],
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

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widthsRef.current));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  const measureIdealResizableWidths = useCallback(
    (tableWidth: number): Widths => {
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const headerMins = { name: MIN_COL, perm: MIN_COL, user: MIN_COL, group: MIN_COL, size: MIN_COL } as Widths;
      const measured = COL_KEYS.reduce(
        (acc, key, index) => {
          const header = FILE_PANE_RESIZABLE_HEADERS[index];
          const textWidth = measureTextColumnWidth(header, samplesRef.current[key], font);
          const hMin = headerMinColumnWidth(header, font);
          headerMins[key] = hMin;
          acc[key] = Math.max(hMin, textWidth);
          return acc;
        },
        { name: MIN_COL, perm: MIN_COL, user: MIN_COL, group: MIN_COL, size: MIN_COL } as Widths,
      );
      return resolveOptimalResizableWidths({
        tableWidth,
        fixedExtra: 0,
        minTailRestPx,
        measured,
        headerMins,
      });
    },
    [minTailRestPx],
  );

  const applyResize = useCallback((d: SessionState, dx: number) => {
    const tw = d.tableW;
    const maxFive = tw - ACTION_COL_PX - d.minTail;
    const s = d.start;

    const finishPair = (
      a: keyof Widths,
      b: keyof Widths,
      aVal: number,
      bVal: number,
    ): Widths => {
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
      widthsRef.current = finishPair("name", "perm", s.name + dx, s.perm - dx);
    } else if (d.grip === 1) {
      widthsRef.current = finishPair("perm", "user", s.perm + dx, s.user - dx);
    } else if (d.grip === 2) {
      widthsRef.current = finishPair("user", "group", s.user + dx, s.group - dx);
    } else if (d.grip === 3) {
      widthsRef.current = finishPair("group", "size", s.group + dx, s.size - dx);
    } else {
      const rest = s.name + s.perm + s.user + s.group;
      const maxSize = Math.max(MIN_COL, maxFive - rest);
      const size = Math.min(Math.max(MIN_COL, s.size + dx), maxSize);
      widthsRef.current = { ...s, size: clampCol(size) };
    }
    setWidths({ ...widthsRef.current });
  }, []);

  const fitOneColumn = useCallback(
    (grip: 0 | 1 | 2 | 3 | 4) => {
      const key = COL_KEYS[grip];
      const header = FILE_PANE_RESIZABLE_HEADERS[grip] ?? "Size";
      const tw = readWrapContentWidth(tableWrapRef.current);
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const measured = measureTextColumnWidth(header, samplesRef.current[key] ?? [], font);
      const hMin = headerMinColumnWidth(header, font);
      const maxFive = tw - ACTION_COL_PX - minTailRestPx;
      const cur = widthsRef.current;
      const targetKey = COL_KEYS[Math.min(grip, COL_KEYS.length - 1)]!;
      const otherSum = COL_KEYS.filter((k) => k !== targetKey).reduce((acc, k) => acc + cur[k], 0);
      const cap = Math.max(MIN_COL, maxFive - otherSum);
      const nextVal = clampCol(Math.max(hMin, Math.min(measured, cap)));
      return { ...cur, [targetKey]: nextVal } as Widths;
    },
    [minTailRestPx],
  );

  const onGripDoubleClick = useCallback(
    (grip: 0 | 1 | 2 | 3 | 4) => (event: ReactMouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const next = fitOneColumn(grip);
      userSizedRef.current = true;
      preShrinkWidthsRef.current = null;
      widthsRef.current = next;
      setWidths(next);
      persist();
    },
    [fitOneColumn, persist],
  );

  const applyOptimalColumnWidths = useCallback(() => {
    const tw = readWrapContentWidth(tableWrapRef.current);
    const cur = measureIdealResizableWidths(tw);
    userSizedRef.current = true;
    preShrinkWidthsRef.current = null;
    widthsRef.current = cur;
    setWidths(cur);
    persist();
  }, [measureIdealResizableWidths, persist]);

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

        const wv = widthsRef.current;
        const fiveSum = wv.name + wv.perm + wv.user + wv.group + wv.size;
        let modCol = inner - fiveSum - ACTION_COL_PX;

        if (modCol < MIN_MOD_COL_PX) {
          if (!preShrinkWidthsRef.current) {
            preShrinkWidthsRef.current = { ...wv };
          }
          const clamped = clampAllColumnsToTable(inner, MIN_MOD_COL_PX, wv);
          if (clamped && !widthsEqual(wv, clamped)) {
            widthsRef.current = clamped;
            setWidths(clamped);
          }
          const cv = widthsRef.current;
          modCol = inner - cv.name - cv.perm - cv.user - cv.group - cv.size - ACTION_COL_PX;
        } else if (preShrinkWidthsRef.current) {
          const pre = preShrinkWidthsRef.current;
          const preSum = pre.name + pre.perm + pre.user + pre.group + pre.size;
          const preMod = inner - preSum - ACTION_COL_PX;
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

      }
    };
    const ro = new ResizeObserver(run);
    ro.observe(el);
    run();
    return () => ro.disconnect();
  }, [persist, isDragging, measureIdealResizableWidths]);

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
