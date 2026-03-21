/** Below this permissions column width (px), show octal (e.g. 755) instead of drwxr-xr-x. */
export const FILE_PANE_PERM_OCTAL_BELOW_PX = 96;

type ModeRow = { modeDisplay: string; modeOctal: string };

export function filePanePermCell(permColumnWidth: number, row: ModeRow): { text: string; title: string | undefined } {
  const rwx = row.modeDisplay?.trim();
  const oct = row.modeOctal?.trim();
  const useOctal = permColumnWidth < FILE_PANE_PERM_OCTAL_BELOW_PX && Boolean(oct);
  const text = useOctal ? oct! : rwx ? rwx : "—";
  const title = useOctal && rwx ? rwx : rwx || undefined;
  return { text, title };
}
