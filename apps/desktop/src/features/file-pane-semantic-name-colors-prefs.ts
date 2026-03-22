import { FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS, type FilePaneNameKind } from "./file-pane-name-kind";
import { FILE_PANE_SEMANTIC_NAME_COLORS_STORAGE_KEY } from "./app-preferences";

export type FilePaneSemanticNameColorsStored = {
  enabled: boolean;
  /** Only overrides; omitted keys use defaults. */
  colors: Partial<Record<FilePaneNameKind, string>>;
};

const defaultStored = (): FilePaneSemanticNameColorsStored => ({
  enabled: true,
  colors: {},
});

export function parseFilePaneSemanticNameColors(raw: string | null): FilePaneSemanticNameColorsStored {
  if (raw == null || raw === "") {
    return defaultStored();
  }
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") {
      return defaultStored();
    }
    const rec = o as Record<string, unknown>;
    const enabled = rec.enabled === false ? false : true;
    const colors: Partial<Record<FilePaneNameKind, string>> = {};
    if (rec.colors && typeof rec.colors === "object" && rec.colors !== null) {
      for (const k of Object.keys(FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS) as FilePaneNameKind[]) {
        const v = (rec.colors as Record<string, unknown>)[k];
        if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
          colors[k] = v.toLowerCase();
        }
      }
    }
    return { enabled, colors };
  } catch {
    return defaultStored();
  }
}

export function serializeFilePaneSemanticNameColors(value: FilePaneSemanticNameColorsStored): string {
  return JSON.stringify(value);
}

export function readFilePaneSemanticNameColorsFromStorage(): FilePaneSemanticNameColorsStored {
  if (typeof window === "undefined") {
    return defaultStored();
  }
  return parseFilePaneSemanticNameColors(window.localStorage.getItem(FILE_PANE_SEMANTIC_NAME_COLORS_STORAGE_KEY));
}

export function writeFilePaneSemanticNameColorsToStorage(value: FilePaneSemanticNameColorsStored): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FILE_PANE_SEMANTIC_NAME_COLORS_STORAGE_KEY, serializeFilePaneSemanticNameColors(value));
}

/** Resolved hex per kind for CSS / color inputs. */
export function resolveFilePaneSemanticNameColorHex(
  kind: FilePaneNameKind,
  overrides: Partial<Record<FilePaneNameKind, string>>,
): string {
  const o = overrides[kind];
  if (typeof o === "string" && /^#[0-9a-fA-F]{6}$/.test(o)) {
    return o.toLowerCase();
  }
  return FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS[kind];
}

export function applyFilePaneSemanticNameColorVarsToDocument(
  overrides: Partial<Record<FilePaneNameKind, string>>,
): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  for (const k of Object.keys(FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS) as FilePaneNameKind[]) {
    root.style.setProperty(`--file-pane-kind-${k}`, resolveFilePaneSemanticNameColorHex(k, overrides));
  }
}
