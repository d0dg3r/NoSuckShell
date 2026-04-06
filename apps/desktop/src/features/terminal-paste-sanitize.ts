/**
 * Strip NUL and control characters (except \\n \\r \\t) before feeding the shell.
 * Prevents binary clipboard data from corrupting the xterm buffer and confusing GTK selection export.
 */
export function sanitizeTerminalPaste(input: string): string {
  if (input.includes("\uFFFD")) return "";
  let out = "";
  for (const ch of input) {
    if (ch === "\0") continue;
    if (ch === "\n" || ch === "\r" || ch === "\t") {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) continue;
    out += ch;
  }
  return out;
}
