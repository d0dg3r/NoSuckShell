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
const ACTION_COL_PX = 48;
const MIN_MOD_COL_PX = 80;

export const FILE_PANE_TABLE_DEFAULT_WIDTHS = {
  name: 200,
  perm: 200,
  size: 88,
} as const;

const HEADER_LABELS = ["Name", "Rechte", "Size"] as const;
const COL_KEYS = ["name", "perm", "size"] as const;

type Widths = { name: number; perm: number; size: number };
type ColKey = (typeof COL_KEYS)[number];

function clampCol(n: number): number {
  return Math.min(2000, Math.max(MIN_COL, Math.round(n)));
}

function sum3(w: Widths): number {
  return w.name + w.perm + w.size;
}

type LegacyStoredWidths = {
  name?: unknown;
  perm?: unknown;
  size?: unknown;
  user?: unknown;
};

function readStored(key: string): Widths {
  const defaults: Widths = { ...FILE_PANE_TABLE_DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return defaults;
    }
    const p = JSON.parse(raw) as LegacyStoredWidths & Record<string, unknown>;
    if (typeof p.user === "number") {
      const migrated: Widths = {
        name: clampCol(typeof p.name === "number" && Number.isFinite(p.name) ? p.name : defaults.name),
        perm: clampCol(typeof p.perm === "number" && Number.isFinite(p.perm) ? p.perm : defaults.perm),
        size: clampCol(typeof p.size === "number" && Number.isFinite(p.size) ? p.size : defaults.size),
      };
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }
    const name = typeof p.name === "number" && Number.isFinite(p.name) ? p.name : defaults.name;
    const perm = typeof p.perm === "number" && Number.isFinite(p.perm) ? p.perm : defaults.perm;
    const size = typeof p.size === "number" && Number.isFinite(p.size) ? p.size : defaults.size;
    return {
      name: clampCol(name),
      perm: clampCol(perm),
      size: clampCol(size),
    };
  } catch {
    return defaults;
  }
}

type SessionState = {
  grip: 0 | 1 | 2;
  startX: number;
  startY: number;
  start: Widths;
  tableW: number;
  minTail: number;
  fixedExtra: number;
  moved: boolean;
};

export type FilePaneTableAutoFitSamples = {
  name: string[];
  perm: string[];
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

function clampThreeColumnsToTable(
  tableWidth: number,
  minTail: number,
  fixedExtra: number,
  w: Widths,
): Widths | null {
  const reserved = fixedExtra + ACTION_COL_PX + minTail;
  if (tableWidth < MIN_COL * 3 + reserved) {
    return null;
  }
  const maxTriple = tableWidth - reserved;
  const sum = w.name + w.perm + w.size;
  if (sum <= maxTriple) {
    return null;
  }
  const scale = maxTriple / sum;
  let name = clampCol(Math.floor(w.name * scale));
  let perm = clampCol(Math.floor(w.perm * scale));
  let size = clampCol(Math.floor(w.size * scale));
  let s2 = name + perm + size;
  while (s2 > maxTriple) {
    if (size > MIN_COL) {
      size -= 1;
    } else if (perm > MIN_COL) {
      perm -= 1;
    } else if (name > MIN_COL) {
      name -= 1;
    } else {
      break;
    }
    s2 = name + perm + size;
  }
  return { name, perm, size };
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
 * Name, Rechte, Size: resizable + persisted. User/Gruppe: measured from listing. Order: Name | Rechte | User | Gruppe | Size | Modified | Actions.
 */
export function useFilePaneTableResize(
  storageKey: string,
  minTailRestPx: number,
  autoFitSamples: FilePaneTableAutoFitSamples,
  userColumnSamples: string[],
  groupColumnSamples: string[],
) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef<Widths>(readStored(storageKey));
  const [widths, setWidths] = useState<Widths>(() => readStored(storageKey));
  const [ownerColWidths, setOwnerColWidths] = useState({ user: 88, group: 88 });
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
  const fixedLeadingExtraPx = ownerColWidths.user + ownerColWidths.group;
  const fixedExtraRef = useRef(fixedLeadingExtraPx);
  fixedExtraRef.current = fixedLeadingExtraPx;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widthsRef.current));
    } catch {
      /* ignore quota */
    }
  }, [storageKey]);

  const applyResize = useCallback((d: SessionState, dx: number) => {
    const tw = d.tableW;
    const maxTriple = tw - d.fixedExtra - ACTION_COL_PX - d.minTail;
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
      const maxPair = maxTriple - others;
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
      widthsRef.current = finishPair("perm", "size", s.perm + dx, s.size - dx);
    } else {
      const rest = s.name + s.perm;
      const maxSize = Math.max(MIN_COL, maxTriple - rest);
      const size = Math.min(Math.max(MIN_COL, s.size + dx), maxSize);
      widthsRef.current = { ...s, size: clampCol(size) };
    }
    setWidths({ ...widthsRef.current });
  }, []);

  const fitOneColumn = useCallback(
    (grip: 0 | 1 | 2) => {
      const key = COL_KEYS[grip];
      const header = HEADER_LABELS[grip];
      const tw = readWrapContentWidth(tableWrapRef.current);
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const measured = measureTextColumnWidth(header, samplesRef.current[key], font);
      const hMin = headerMinColumnWidth(header, font);
      const maxTriple = tw - fixedExtraRef.current - ACTION_COL_PX - minTailRestPx;
      const cur = widthsRef.current;
      const otherSum = sum3(cur) - cur[key];
      const cap = Math.max(MIN_COL, maxTriple - otherSum);
      const nextVal = clampCol(Math.max(hMin, Math.min(measured, cap)));
      return { ...cur, [key]: nextVal } as Widths;
    },
    [minTailRestPx],
  );

  const onGripDoubleClick = useCallback(
    (grip: 0 | 1 | 2) => (event: ReactMouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const next = fitOneColumn(grip);
      widthsRef.current = next;
      setWidths(next);
      persist();
    },
    [fitOneColumn, persist],
  );

  const applyOptimalColumnWidths = useCallback(() => {
    let cur = { ...widthsRef.current };
    for (const grip of [0, 1, 2] as const) {
      const key = COL_KEYS[grip];
      const header = HEADER_LABELS[grip];
      const tw = readWrapContentWidth(tableWrapRef.current);
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      const measured = measureTextColumnWidth(header, samplesRef.current[key], font);
      const hMin = headerMinColumnWidth(header, font);
      const maxTriple = tw - fixedExtraRef.current - ACTION_COL_PX - minTailRestPx;
      const otherSum = cur.name + cur.perm + cur.size - cur[key];
      const cap = Math.max(MIN_COL, maxTriple - otherSum);
      const nextVal = clampCol(Math.max(hMin, Math.min(measured, cap)));
      cur = { ...cur, [key]: nextVal };
    }
    widthsRef.current = cur;
    setWidths(cur);
    persist();
  }, [minTailRestPx, persist]);

  const onGripPointerDown = useCallback(
    (grip: 0 | 1 | 2) => (event: ReactPointerEvent<HTMLSpanElement>) => {
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
        fixedExtra: fixedExtraRef.current,
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
    const fe = fixedLeadingExtraPx;
    const run = () => {
      const st0 = getComputedStyle(el);
      const pl0 = Number.parseFloat(st0.paddingLeft) || 0;
      const pr0 = Number.parseFloat(st0.paddingRight) || 0;
      const inner = Math.max(0, el.clientWidth - pl0 - pr0);

      const table = el.querySelector("table");
      if (table instanceof HTMLTableElement) {
        table.style.width = `${inner}px`;
        table.style.maxWidth = `${inner}px`;

        if (!isDragging && inner >= MIN_COL * 3 + fe + ACTION_COL_PX + minTailRestPx) {
          const clamped = clampThreeColumnsToTable(inner, minTailRestPx, fe, widthsRef.current);
          if (clamped) {
            widthsRef.current = clamped;
            setWidths(clamped);
            persist();
          }
        }

        let wv = widthsRef.current;
        let modCol = inner - wv.name - wv.perm - wv.size - fe - ACTION_COL_PX;
        if (modCol < MIN_MOD_COL_PX) {
          const clamped = clampThreeColumnsToTable(inner, MIN_MOD_COL_PX, fe, wv);
          if (clamped) {
            widthsRef.current = clamped;
            setWidths(clamped);
            persist();
            wv = widthsRef.current;
          }
          modCol = inner - wv.name - wv.perm - wv.size - fe - ACTION_COL_PX;
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
  }, [widths, storageKey, minTailRestPx, fixedLeadingExtraPx, persist, autoFitSamples, isDragging]);

  useEffect(() => {
    const measure = () => {
      const font = resolveFontFromTableWrap(tableWrapRef.current);
      setOwnerColWidths({
        user: measureFilePaneOwnerColumnWidth("User", userColSamplesRef.current, font),
        group: measureFilePaneOwnerColumnWidth("Gruppe", groupColSamplesRef.current, font),
      });
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
    userColWidth: ownerColWidths.user,
    groupColWidth: ownerColWidths.group,
    tailCols,
    onGripPointerDown,
    onGripDoubleClick,
    applyOptimalColumnWidths,
  };
}
