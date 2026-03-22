import type { LocalDirEntry } from "../types";

export type FilePaneNameKind =
  | "folder"
  | "archive"
  | "script"
  | "executable"
  | "media"
  | "code"
  | "document"
  | "data"
  | "default";

export type FilePaneNameKindRow = Pick<LocalDirEntry, "name" | "isDir" | "modeOctal" | "modeDisplay">;

/** Kinds that map to a `--file-pane-kind-*` CSS variable (includes `default` / “other files”). */
export const FILE_PANE_NAME_KINDS_WITH_COLOR: readonly FilePaneNameKind[] = [
  "folder",
  "archive",
  "script",
  "executable",
  "media",
  "code",
  "document",
  "data",
  "default",
] as const;

/** Default hex colors (keep in sync with `:root` in `styles.css`). */
export const FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS: Record<FilePaneNameKind, string> = {
  folder: "#9fd4ff",
  archive: "#c9a08c",
  script: "#8fbf9e",
  executable: "#d4b87a",
  media: "#a89fc4",
  code: "#7eb8c4",
  document: "#b4bdb7",
  data: "#9eb0c4",
  default: "#e8eeea",
};

const ARCHIVE_EXT = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "tbz2",
  "xz",
  "txz",
  "7z",
  "rar",
  "zst",
  "tzst",
  "lz",
  "lzma",
  "cab",
]);

const SCRIPT_EXT = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "ksh",
  "csh",
  "tcsh",
  "ps1",
  "psm1",
  "bat",
  "cmd",
  "awk",
]);

const EXECUTABLE_EXT = new Set(["exe", "bin", "app", "msi", "deb", "rpm"]);

const MEDIA_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "tif",
  "tiff",
  "heic",
  "avif",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "opus",
  "mp4",
  "mkv",
  "avi",
  "mov",
  "webm",
  "wmv",
  "m4v",
]);

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "rs",
  "py",
  "pyw",
  "pyi",
  "go",
  "java",
  "kt",
  "kts",
  "scala",
  "rb",
  "php",
  "swift",
  "c",
  "h",
  "cpp",
  "cxx",
  "cc",
  "hpp",
  "cs",
  "fs",
  "fsx",
  "lua",
  "dart",
  "r",
  "jl",
  "ex",
  "exs",
  "erl",
  "hs",
  "clj",
  "css",
  "scss",
  "sass",
  "less",
  "sql",
]);

const DOCUMENT_EXT = new Set([
  "txt",
  "md",
  "rst",
  "log",
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "epub",
  "pages",
]);

const DATA_EXT = new Set([
  "json",
  "yaml",
  "yml",
  "xml",
  "toml",
  "csv",
  "tsv",
  "sqlite",
  "db",
  "ini",
  "env",
  "conf",
  "config",
  "properties",
]);

function fileExtensionLower(name: string): string {
  const base = name.trim();
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) {
    return "";
  }
  return base.slice(i + 1).toLowerCase();
}

/** True if any user/group/other execute bit is set (uses low 9 bits of parsed octal). */
export function filePaneRowHasUnixExecutableBit(modeOctal: string): boolean {
  const t = modeOctal.trim();
  if (!t || !/^[0-7]+$/.test(t)) {
    return false;
  }
  const n = parseInt(t, 8);
  if (!Number.isFinite(n)) {
    return false;
  }
  return (n & 0o111) !== 0;
}

/** Fallback when octal is missing: first char - or l, then rwx triples at 1..9. */
export function filePaneRowHasUnixExecutableInDisplay(modeDisplay: string): boolean {
  const s = modeDisplay.trim();
  if (s.length < 10) {
    return false;
  }
  const t = s[0];
  if (t !== "-" && t !== "l") {
    return false;
  }
  const perms = s.slice(1, 10);
  if (perms.length !== 9) {
    return false;
  }
  return perms[2] === "x" || perms[5] === "x" || perms[8] === "x";
}

export function filePaneNameKind(row: FilePaneNameKindRow): FilePaneNameKind {
  if (row.isDir) {
    return "folder";
  }

  const ext = fileExtensionLower(row.name);

  if (ext && ARCHIVE_EXT.has(ext)) {
    return "archive";
  }
  if (ext && SCRIPT_EXT.has(ext)) {
    return "script";
  }

  const unixX =
    filePaneRowHasUnixExecutableBit(row.modeOctal) ||
    (!row.modeOctal.trim() && filePaneRowHasUnixExecutableInDisplay(row.modeDisplay));
  if (unixX || (ext && EXECUTABLE_EXT.has(ext))) {
    return "executable";
  }

  if (ext && MEDIA_EXT.has(ext)) {
    return "media";
  }
  if (ext && CODE_EXT.has(ext)) {
    return "code";
  }
  if (ext && DOCUMENT_EXT.has(ext)) {
    return "document";
  }
  if (ext && DATA_EXT.has(ext)) {
    return "data";
  }

  return "default";
}

export function filePaneNameKindClassName(kind: FilePaneNameKind): string {
  return kind === "default" ? "file-pane-name--default" : `file-pane-name--${kind}`;
}

/** Short labels for Settings / Help. */
export const FILE_PANE_NAME_KIND_LABEL: Record<FilePaneNameKind, string> = {
  folder: "Folders",
  archive: "Archives",
  script: "Scripts / shells",
  executable: "Executables",
  media: "Media",
  code: "Source code",
  document: "Documents / text",
  data: "Data / config",
  default: "Other files",
};
