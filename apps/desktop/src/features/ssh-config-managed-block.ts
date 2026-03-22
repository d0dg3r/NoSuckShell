export const NOSUCKSHELL_HOST_STAR_BEGIN = "# BEGIN_NOSUCKSHELL_HOST_STAR";
export const NOSUCKSHELL_HOST_STAR_END = "# END_NOSUCKSHELL_HOST_STAR";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Indented lines under `Host *` (directives only, no `Host` line). */
export function mergeManagedHostStarBlock(raw: string, directiveLines: string[]): string {
  const trimmed = directiveLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const indented = trimmed.map((l) => (l.startsWith("\t") ? l : `  ${l}`));
  const block = [NOSUCKSHELL_HOST_STAR_BEGIN, "Host *", ...indented, NOSUCKSHELL_HOST_STAR_END, ""].join("\n");

  const re = new RegExp(
    `${escapeRegex(NOSUCKSHELL_HOST_STAR_BEGIN)}[\\s\\S]*?${escapeRegex(NOSUCKSHELL_HOST_STAR_END)}\\n?`,
    "m",
  );
  if (re.test(raw)) {
    return raw.replace(re, block);
  }
  return `${block}${raw.length > 0 && !raw.startsWith("\n") ? "\n" : ""}${raw}`;
}
