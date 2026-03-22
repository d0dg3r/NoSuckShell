import { isDarwinPlatform } from "./keyboard-shortcuts-defaults";
import type { KeyChord } from "./keyboard-shortcuts-types";

const CODE_LABEL: Record<string, string> = {
  Escape: "Esc",
  Enter: "Enter",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function codeToLabel(code: string): string {
  if (CODE_LABEL[code]) {
    return CODE_LABEL[code];
  }
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  return code;
}

/** English UI labels for shortcut display. */
export function formatChordDisplay(chord: KeyChord): string {
  const darwin = isDarwinPlatform();
  const parts: string[] = [];
  if (chord.ctrl) {
    parts.push(darwin ? "Ctrl" : "Ctrl");
  }
  if (chord.meta) {
    parts.push(darwin ? "Cmd" : "Win");
  }
  if (chord.alt) {
    parts.push(darwin ? "Opt" : "Alt");
  }
  if (chord.shift) {
    parts.push("Shift");
  }
  parts.push(codeToLabel(chord.code));
  return parts.join("+");
}
