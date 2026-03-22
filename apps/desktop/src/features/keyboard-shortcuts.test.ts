import { describe, expect, it } from "vitest";
import { defaultChordForCommand } from "./keyboard-shortcuts-defaults";
import { eventMatchesChord, resolveShortcutCommand } from "./keyboard-shortcuts-match";
import { KEYBOARD_SHORTCUT_DEFINITIONS } from "./keyboard-shortcuts-registry";
import { findChordConflicts, mergeChordMap, parseStoredShortcutMap } from "./keyboard-shortcuts-storage";
import { formatChordDisplay } from "./keyboard-shortcuts-display";
import type { KeyChord } from "./keyboard-shortcuts-types";
import { buildDefaultChordMap } from "./keyboard-shortcuts-defaults";

function ev(partial: Partial<KeyboardEvent> & { code: string }): KeyboardEvent {
  let defaultPrevented = Boolean(partial.defaultPrevented);
  const { defaultPrevented: _ignoreDp, preventDefault: _ignorePv, ...rest } = partial;
  return {
    type: "keydown",
    key: "",
    repeat: false,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...rest,
  } as KeyboardEvent;
}

describe("eventMatchesChord", () => {
  it("matches ctrl+comma", () => {
    const chord: KeyChord = { code: "Comma", ctrl: true };
    expect(eventMatchesChord(ev({ code: "Comma", ctrlKey: true }), chord)).toBe(true);
    expect(eventMatchesChord(ev({ code: "Comma", ctrlKey: false }), chord)).toBe(false);
  });

  it("treats omitted modifiers as false", () => {
    const chord: KeyChord = { code: "KeyK" };
    expect(eventMatchesChord(ev({ code: "KeyK" }), chord)).toBe(true);
    expect(eventMatchesChord(ev({ code: "KeyK", shiftKey: true }), chord)).toBe(false);
  });
});

describe("resolveShortcutCommand", () => {
  const chords = buildDefaultChordMap();
  const ctxBase = {
    focusInTerminal: false,
    overlayOpen: false,
    leaderArmed: false,
    focusInEditable: false,
  };

  it("resolves openQuickConnect when not in terminal", () => {
    const q = chords.openQuickConnect;
    const e = ev({ code: q.code, ctrlKey: !!q.ctrl, metaKey: !!q.meta, altKey: !!q.alt, shiftKey: !!q.shift });
    const id = resolveShortcutCommand({
      event: e,
      definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
      chords,
      ctx: ctxBase,
    });
    expect(id).toBe("openQuickConnect");
  });

  it("blocks appUi when focus in terminal", () => {
    const q = chords.openQuickConnect;
    const e = ev({ code: q.code, ctrlKey: !!q.ctrl, metaKey: !!q.meta, altKey: !!q.alt, shiftKey: !!q.shift });
    const id = resolveShortcutCommand({
      event: e,
      definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
      chords,
      ctx: { ...ctxBase, focusInTerminal: true },
    });
    expect(id).toBeNull();
  });

  it("allows dismiss when overlay open in terminal", () => {
    const d = chords.dismissPrimaryOverlay;
    const e = ev({ code: d.code, ctrlKey: !!d.ctrl, metaKey: !!d.meta, altKey: !!d.alt, shiftKey: !!d.shift });
    const id = resolveShortcutCommand({
      event: e,
      definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
      chords,
      ctx: { ...ctxBase, focusInTerminal: true, overlayOpen: true },
    });
    expect(id).toBe("dismissPrimaryOverlay");
  });

  it("resolves leader follow-up only when armed", () => {
    const k = chords.openSettingsKeyboardTab;
    const e = ev({ code: k.code });
    expect(
      resolveShortcutCommand({
        event: e,
        definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
        chords,
        ctx: { ...ctxBase, leaderArmed: false },
      }),
    ).toBeNull();
    expect(
      resolveShortcutCommand({
        event: e,
        definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
        chords,
        ctx: { ...ctxBase, leaderArmed: true },
      }),
    ).toBe("openSettingsKeyboardTab");
  });
});

describe("mergeChordMap", () => {
  it("merges stored overrides", () => {
    const stored = parseStoredShortcutMap(
      JSON.stringify({
        version: 1,
        chords: { openSettings: { code: "KeyP", ctrl: true } },
      }),
    );
    const merged = mergeChordMap(stored);
    expect(merged.openSettings).toEqual({ code: "KeyP", ctrl: true });
    expect(merged.toggleSidebar).toBeDefined();
  });
});

describe("findChordConflicts", () => {
  it("detects duplicate chords", () => {
    const dup: KeyChord = { code: "KeyX", ctrl: true };
    const base = buildDefaultChordMap();
    const conflicts = findChordConflicts({
      ...base,
      openSettings: dup,
      toggleSidebar: dup,
    });
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("formatChordDisplay", () => {
  it("includes modifiers", () => {
    const s = formatChordDisplay({ code: "KeyB", ctrl: true, shift: true });
    expect(s).toContain("Ctrl");
    expect(s).toContain("Shift");
    expect(s).toContain("B");
  });
});

describe("defaultChordForCommand", () => {
  it("returns a chord for each registered command", () => {
    for (const d of KEYBOARD_SHORTCUT_DEFINITIONS) {
      expect(defaultChordForCommand(d.id).code).toBeTruthy();
    }
  });
});
