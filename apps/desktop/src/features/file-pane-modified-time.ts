const MODIFIED_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Modified time for the file pane: `M/d/yy h:mm AM/PM` (en-US), space between date and time, no seconds.
 */
export function formatFilePaneModifiedTime(mtimeSeconds: number | null | undefined): string {
  if (mtimeSeconds == null || mtimeSeconds <= 0) {
    return "—";
  }
  const d = new Date(mtimeSeconds * 1000);
  return MODIFIED_TIME_FORMAT.format(d).replace(", ", " ");
}
