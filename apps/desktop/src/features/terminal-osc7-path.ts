/**
 * Parse OSC 7 payload (working directory URI) from xterm.js registerOscHandler(7, …).
 * Common form: `file://hostname/path` or `file:///path` (empty host).
 */
export function parseOsc7WorkingDirectoryPayload(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed.startsWith("file:")) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "file:") {
      return null;
    }
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* keep raw pathname */
    }
    if (pathname === "") {
      return "/";
    }
    return pathname;
  } catch {
    return null;
  }
}

const MIDDLE_ELLIPSIS = "…";

/** Shorten path for pane title (middle ellipsis). */
export function shortenPathForPaneTitle(path: string, maxChars: number): string {
  if (path.length <= maxChars) {
    return path;
  }
  if (maxChars < 8) {
    return path.slice(0, maxChars);
  }
  const keepEach = Math.floor((maxChars - MIDDLE_ELLIPSIS.length) / 2);
  return `${path.slice(0, keepEach)}${MIDDLE_ELLIPSIS}${path.slice(-keepEach)}`;
}
