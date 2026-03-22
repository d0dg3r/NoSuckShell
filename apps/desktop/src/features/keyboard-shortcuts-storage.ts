import { DEFAULT_LEADER_CHORD, KEYBOARD_SHORTCUT_DEFINITIONS } from "./keyboard-shortcuts-registry";
import { buildDefaultChordMap, defaultChordForCommand } from "./keyboard-shortcuts-defaults";
import type { KeyboardShortcutCommandId, KeyChord, StoredShortcutMap } from "./keyboard-shortcuts-types";
import { eventMatchesChord } from "./keyboard-shortcuts-match";

export const KEYBOARD_SHORTCUTS_STORAGE_KEY = "nosuckshell.keyboardShortcuts.v1";

export function parseStoredShortcutMap(raw: string | null): StoredShortcutMap | null {
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as StoredShortcutMap;
    if (v?.version !== 1 || typeof v.chords !== "object" || v.chords === null) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function mergeChordMap(stored: StoredShortcutMap | null): Record<KeyboardShortcutCommandId, KeyChord> {
  const defaults = buildDefaultChordMap();
  if (!stored?.chords) {
    return defaults;
  }
  const out = { ...defaults };
  for (const id of Object.keys(stored.chords) as KeyboardShortcutCommandId[]) {
    const c = stored.chords[id];
    if (c && typeof c.code === "string") {
      out[id] = c;
    }
  }
  return out;
}

export function effectiveLeaderChord(stored: StoredShortcutMap | null): KeyChord {
  if (stored?.leaderChord === null) {
    return DEFAULT_LEADER_CHORD;
  }
  const lc = stored?.leaderChord;
  if (lc && typeof lc.code === "string") {
    return lc;
  }
  return DEFAULT_LEADER_CHORD;
}

export type ChordConflict = {
  commandA: KeyboardShortcutCommandId | "leader";
  commandB: KeyboardShortcutCommandId | "leader";
  chord: KeyChord;
};

export function chordsEqual(a: KeyChord, b: KeyChord): boolean {
  return (
    a.code === b.code &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.meta) === Boolean(b.meta) &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.shift) === Boolean(b.shift)
  );
}

export function findChordConflicts(
  chords: Record<KeyboardShortcutCommandId, KeyChord>,
  leaderChord?: KeyChord,
): ChordConflict[] {
  const entries = Object.entries(chords) as Array<[KeyboardShortcutCommandId, KeyChord]>;
  const conflicts: ChordConflict[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ida, ca] = entries[i];
      const [idb, cb] = entries[j];
      if (chordsEqual(ca, cb)) {
        conflicts.push({ commandA: ida, commandB: idb, chord: ca });
      }
    }
  }
  if (leaderChord) {
    for (const [id, c] of entries) {
      if (chordsEqual(c, leaderChord)) {
        conflicts.push({ commandA: "leader", commandB: id, chord: leaderChord });
      }
    }
  }
  return conflicts;
}

/** Serialize for localStorage (drop undefined). */
export function serializeShortcutMap(map: StoredShortcutMap): string {
  return JSON.stringify(map);
}

export function createDefaultStoredMap(): StoredShortcutMap {
  const chords: Partial<Record<KeyboardShortcutCommandId, KeyChord>> = {};
  for (const d of KEYBOARD_SHORTCUT_DEFINITIONS) {
    chords[d.id] = defaultChordForCommand(d.id);
  }
  return { version: 1, chords, leaderChord: DEFAULT_LEADER_CHORD };
}

export function leaderChordMatches(event: KeyboardEvent, leader: KeyChord): boolean {
  return eventMatchesChord(event, leader);
}
