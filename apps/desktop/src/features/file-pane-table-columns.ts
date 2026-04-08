/**
 * File pane table: column ids, visibility defaults, and row sorting (local + remote listings).
 */

import { filePaneEntryKindLabel } from "./file-pane-entry-kind";

export type FilePaneDataColumnId =
  | "name"
  | "permissions"
  | "octal"
  | "user"
  | "group"
  | "size"
  | "modified"
  | "kind";

/** Columns the user may show or hide (name, modified, actions are always on). */
export const FILE_PANE_TOGGLEABLE_COLUMN_IDS: FilePaneDataColumnId[] = [
  "permissions",
  "octal",
  "user",
  "group",
  "size",
  "kind",
];

/** Display order for data columns (actions appended separately). Default and migration baseline for column order. */
export const FILE_PANE_COLUMN_ORDER: FilePaneDataColumnId[] = [
  "name",
  "size",
  "kind",
  "octal",
  "modified",
  "permissions",
  "user",
  "group",
];

const ALL_DATA_COLUMN_IDS_SET = new Set<FilePaneDataColumnId>(FILE_PANE_COLUMN_ORDER);

/** Valid data column ids in default order (for normalization). */
export const FILE_PANE_ALL_DATA_COLUMN_IDS: FilePaneDataColumnId[] = [...FILE_PANE_COLUMN_ORDER];

/**
 * Dedupe and append missing columns so `order` is a permutation of all data column ids.
 */
export function normalizeFilePaneColumnOrder(order: readonly FilePaneDataColumnId[]): FilePaneDataColumnId[] {
  const seen = new Set<FilePaneDataColumnId>();
  const out: FilePaneDataColumnId[] = [];
  for (const id of order) {
    if (ALL_DATA_COLUMN_IDS_SET.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of FILE_PANE_COLUMN_ORDER) {
    if (!seen.has(id)) {
      out.push(id);
    }
  }
  return out;
}

export type FilePaneResizableWidthKey = "name" | "perm" | "user" | "group" | "size";

export type FilePaneDirRow = {
  name: string;
  isDir: boolean;
  /** Directories-first group in the pane; includes symlink → directory from the backend. */
  sortWithDirectories?: boolean;
  size: number;
  mtime: number | null;
  modeDisplay: string;
  modeOctal: string;
  userDisplay: string;
  groupDisplay: string;
};

/** Directory-like for sort, navigation, transfer, and pane UI (includes symlink → directory). */
export function filePaneRowOpensAsDirectory(
  row: Pick<FilePaneDirRow, "isDir" | "sortWithDirectories">,
): boolean {
  return row.sortWithDirectories ?? row.isDir;
}

export type FilePaneColumnVisibility = Record<FilePaneDataColumnId, boolean>;

export type FilePaneSortState = {
  column: FilePaneDataColumnId | null;
  direction: "asc" | "desc";
};

export const FILE_PANE_DEFAULT_VISIBILITY: FilePaneColumnVisibility = {
  name: true,
  permissions: false,
  octal: true,
  user: false,
  group: false,
  size: true,
  modified: true,
  kind: true,
};

/** Fixed layout width for optional non-resizable columns (px). */
export const FILE_PANE_OCTAL_COL_PX = 52;
export const FILE_PANE_KIND_COL_PX = 120;

const COLUMN_LABELS: Record<FilePaneDataColumnId, string> = {
  name: "Name",
  permissions: "Permissions",
  octal: "Octal",
  user: "User",
  group: "Group",
  size: "Size",
  modified: "Modified",
  kind: "Kind",
};

export function filePaneColumnLabel(id: FilePaneDataColumnId): string {
  return COLUMN_LABELS[id];
}

/** Maps a data column to persisted resize key when resizable. */
export function filePaneColumnResizableKey(id: FilePaneDataColumnId): FilePaneResizableWidthKey | null {
  switch (id) {
    case "name":
      return "name";
    case "permissions":
      return "perm";
    case "user":
      return "user";
    case "group":
      return "group";
    case "size":
      return "size";
    default:
      return null;
  }
}

export function filePaneVisibleDataColumns(
  visibility: FilePaneColumnVisibility,
  columnOrder: readonly FilePaneDataColumnId[] = FILE_PANE_COLUMN_ORDER,
): FilePaneDataColumnId[] {
  const order = normalizeFilePaneColumnOrder([...columnOrder]);
  return order.filter((id) => visibility[id] !== false);
}

/** Resizable width keys in left-to-right order (must match visible data column order). */
export function filePaneVisibleResizableKeysFromDisplayOrder(
  visibleDataColumns: readonly FilePaneDataColumnId[],
): FilePaneResizableWidthKey[] {
  const keys: FilePaneResizableWidthKey[] = [];
  for (const id of visibleDataColumns) {
    const k = filePaneColumnResizableKey(id);
    if (k) {
      keys.push(k);
    }
  }
  return keys;
}

export function filePaneFixedOptionalWidthPx(visibility: FilePaneColumnVisibility): number {
  let w = 0;
  if (visibility.octal) {
    w += FILE_PANE_OCTAL_COL_PX;
  }
  if (visibility.kind) {
    w += FILE_PANE_KIND_COL_PX;
  }
  return w;
}

function parseNumericMaybe(s: string): number | null {
  const t = s.trim();
  if (t === "" || !/^\d+$/.test(t)) {
    return null;
  }
  return Number(t);
}

function compareMaybeNumericStrings(a: string, b: string, dir: number): number {
  const na = parseNumericMaybe(a);
  const nb = parseNumericMaybe(b);
  if (na != null && nb != null && na !== nb) {
    return na < nb ? -dir : dir;
  }
  return a.trim().toLowerCase().localeCompare(b.trim().toLowerCase(), undefined, { sensitivity: "base" }) * dir;
}

function compareByColumn(a: FilePaneDirRow, b: FilePaneDirRow, column: FilePaneDataColumnId, dir: number): number {
  const asc = dir > 0 ? 1 : -1;
  switch (column) {
    case "name":
      return (
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) * asc
      );
    case "permissions":
      return a.modeDisplay.localeCompare(b.modeDisplay) * asc;
    case "octal":
      return a.modeOctal.localeCompare(b.modeOctal, undefined, { numeric: true }) * asc;
    case "user":
      return compareMaybeNumericStrings(a.userDisplay, b.userDisplay, asc);
    case "group":
      return compareMaybeNumericStrings(a.groupDisplay, b.groupDisplay, asc);
    case "size": {
      const sa = a.isDir ? 0 : a.size;
      const sb = b.isDir ? 0 : b.size;
      if (sa !== sb) {
        return sa < sb ? -asc : asc;
      }
      return 0;
    }
    case "modified": {
      const ma = a.mtime ?? 0;
      const mb = b.mtime ?? 0;
      if (ma !== mb) {
        return ma < mb ? -asc : asc;
      }
      return 0;
    }
    case "kind": {
      const ka = filePaneEntryKindLabel(a);
      const kb = filePaneEntryKindLabel(b);
      return ka.localeCompare(kb, "en", { sensitivity: "base" }) * asc;
    }
    default:
      return 0;
  }
}

/**
 * Sort rows: directories first, then by `sort` (or name asc if sort.column is null).
 * Tie-breaker: case-insensitive name.
 */
export function filePaneSortRows<T extends FilePaneDirRow>(rows: readonly T[], sort: FilePaneSortState): T[] {
  const col = sort.column ?? "name";
  const dir = sort.direction === "desc" ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    if (filePaneRowOpensAsDirectory(a) !== filePaneRowOpensAsDirectory(b)) {
      return filePaneRowOpensAsDirectory(a) ? -1 : 1;
    }
    let c = compareByColumn(a, b, col, dir);
    if (c !== 0) {
      return c;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
  return out;
}

/** All data columns except none — name included. */
export const FILE_PANE_SORTABLE_COLUMN_IDS: FilePaneDataColumnId[] = [
  "name",
  "permissions",
  "octal",
  "user",
  "group",
  "size",
  "modified",
  "kind",
];

export function filePaneNextSortState(
  current: FilePaneSortState,
  clicked: FilePaneDataColumnId,
): FilePaneSortState {
  if (!FILE_PANE_SORTABLE_COLUMN_IDS.includes(clicked)) {
    return current;
  }
  if (current.column !== clicked) {
    return { column: clicked, direction: "asc" };
  }
  return {
    column: clicked,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function readFilePaneColumnVisibility(
  storageKey: string,
  prefix = "NoSuckShell.filePane.columnVisibility.",
): FilePaneColumnVisibility {
  const base = { ...FILE_PANE_DEFAULT_VISIBILITY };
  try {
    const raw = localStorage.getItem(prefix + storageKey);
    if (!raw) {
      return base;
    }
    const p = JSON.parse(raw) as Partial<Record<string, boolean>>;
    for (const id of FILE_PANE_TOGGLEABLE_COLUMN_IDS) {
      if (typeof p[id] === "boolean") {
        base[id] = p[id]!;
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function writeFilePaneColumnVisibility(
  storageKey: string,
  visibility: FilePaneColumnVisibility,
  prefix = "NoSuckShell.filePane.columnVisibility.",
): void {
  try {
    const slice: Partial<FilePaneColumnVisibility> = {};
    for (const id of FILE_PANE_TOGGLEABLE_COLUMN_IDS) {
      slice[id] = visibility[id];
    }
    localStorage.setItem(prefix + storageKey, JSON.stringify(slice));
  } catch {
    /* quota */
  }
}

export function readFilePaneSortState(storageKey: string, prefix = "NoSuckShell.filePane.sort."): FilePaneSortState {
  const fallback: FilePaneSortState = { column: null, direction: "asc" };
  try {
    const raw = localStorage.getItem(prefix + storageKey);
    if (!raw) {
      return fallback;
    }
    const p = JSON.parse(raw) as { column?: unknown; direction?: unknown };
    const col =
      typeof p.column === "string" && FILE_PANE_SORTABLE_COLUMN_IDS.includes(p.column as FilePaneDataColumnId)
        ? (p.column as FilePaneDataColumnId)
        : null;
    const dir = p.direction === "desc" ? "desc" : "asc";
    return { column: col, direction: dir };
  } catch {
    return fallback;
  }
}

export function writeFilePaneSortState(
  storageKey: string,
  sort: FilePaneSortState,
  prefix = "NoSuckShell.filePane.sort.",
): void {
  try {
    localStorage.setItem(prefix + storageKey, JSON.stringify(sort));
  } catch {
    /* quota */
  }
}

export function readFilePaneColumnOrder(
  storageKey: string,
  prefix = "NoSuckShell.filePane.columnOrder.",
): FilePaneDataColumnId[] {
  try {
    const raw = localStorage.getItem(prefix + storageKey);
    if (!raw) {
      return normalizeFilePaneColumnOrder(FILE_PANE_COLUMN_ORDER);
    }
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) {
      return normalizeFilePaneColumnOrder(FILE_PANE_COLUMN_ORDER);
    }
    const ids = p.filter(
      (x): x is FilePaneDataColumnId =>
        typeof x === "string" && ALL_DATA_COLUMN_IDS_SET.has(x as FilePaneDataColumnId),
    );
    return normalizeFilePaneColumnOrder(ids);
  } catch {
    return normalizeFilePaneColumnOrder(FILE_PANE_COLUMN_ORDER);
  }
}

export function writeFilePaneColumnOrder(
  storageKey: string,
  order: readonly FilePaneDataColumnId[],
  prefix = "NoSuckShell.filePane.columnOrder.",
): void {
  try {
    const normalized = normalizeFilePaneColumnOrder(order);
    localStorage.setItem(prefix + storageKey, JSON.stringify(normalized));
  } catch {
    /* quota */
  }
}
