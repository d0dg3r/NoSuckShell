import { KEYBOARD_SHORTCUT_DEFINITIONS } from "./keyboard-shortcuts-registry";
import type { KeyboardShortcutCommandId, KeyChord } from "./keyboard-shortcuts-types";

export const isDarwinPlatform = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent);
};

/** Default chord for a command; uses Cmd on macOS where appropriate for settings-style shortcuts. */
export function defaultChordForCommand(id: KeyboardShortcutCommandId): KeyChord {
  const row = KEYBOARD_SHORTCUT_DEFINITIONS.find((d) => d.id === id);
  const base = row?.defaultChord ?? { code: "Unidentified" };
  if (id === "openSettings" && isDarwinPlatform()) {
    return { ...base, ctrl: false, meta: true };
  }
  return { ...base };
}

export function buildDefaultChordMap(): Record<KeyboardShortcutCommandId, KeyChord> {
  const out = {} as Record<KeyboardShortcutCommandId, KeyChord>;
  for (const d of KEYBOARD_SHORTCUT_DEFINITIONS) {
    out[d.id] = defaultChordForCommand(d.id);
  }
  return out;
}
