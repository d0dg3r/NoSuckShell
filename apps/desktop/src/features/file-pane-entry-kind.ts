import type { FilePaneDirRow } from "./file-pane-table-columns";

/**
 * Human-readable entry kind from Unix `modeDisplay` first character (e.g. `drwx…`, `-rw…`, `l…`).
 * Falls back to directory vs file when `modeDisplay` is empty (e.g. local listing on Windows).
 */
export function filePaneEntryKindLabel(entry: Pick<FilePaneDirRow, "isDir" | "modeDisplay">): string {
  const m = entry.modeDisplay?.trim() ?? "";
  const t = m.charAt(0);
  switch (t) {
    case "l":
      return "Symlink";
    case "d":
      return "Folder";
    case "-":
      return "File";
    case "c":
      return "Character device";
    case "b":
      return "Block device";
    case "p":
      return "Pipe";
    case "s":
      return "Socket";
    default:
      return entry.isDir ? "Folder" : "File";
  }
}
