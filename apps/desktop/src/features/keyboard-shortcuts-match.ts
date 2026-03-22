import type { KeyboardShortcutCommandId, KeyboardShortcutDefinition, KeyChord } from "./keyboard-shortcuts-types";

export type ShortcutMatchContext = {
  focusInTerminal: boolean;
  /** Any blocking overlay: modals, layout center, context menu, trust prompt, etc. */
  overlayOpen: boolean;
  leaderArmed: boolean;
  /** Inputs / contenteditable — appUi shortcuts suppressed (globalChord still allowed). */
  focusInEditable: boolean;
};

const chordUsesLetterLikeModifier = (chord: KeyChord): boolean => {
  return Boolean(chord.ctrl || chord.meta || chord.alt);
};

/**
 * Escape and function keys are allowed in terminal only when closing an overlay.
 */
const chordIsSafeInTerminal = (chord: KeyChord): boolean => {
  return chordUsesLetterLikeModifier(chord);
};

const boolMatch = (expected: boolean | undefined, actual: boolean): boolean => {
  if (expected === undefined) {
    return !actual;
  }
  return expected === actual;
};

/** Match chord; ctrl/meta are distinct (user binding is explicit). */
export function eventMatchesChord(event: KeyboardEvent, chord: KeyChord): boolean {
  if (event.code !== chord.code) {
    return false;
  }
  if (!boolMatch(chord.ctrl, event.ctrlKey)) {
    return false;
  }
  if (!boolMatch(chord.meta, event.metaKey)) {
    return false;
  }
  if (!boolMatch(chord.alt, event.altKey)) {
    return false;
  }
  if (!boolMatch(chord.shift, event.shiftKey)) {
    return false;
  }
  return true;
}

export function scopeAllowsMatch(
  def: KeyboardShortcutDefinition,
  chord: KeyChord,
  ctx: ShortcutMatchContext,
): boolean {
  if (def.scope === "leaderFollowUp") {
    return ctx.leaderArmed && !ctx.focusInEditable;
  }
  if (def.scope === "globalChord") {
    if (!chordIsSafeInTerminal(chord)) {
      return false;
    }
    return true;
  }
  // appUi
  if (def.id === "dismissPrimaryOverlay") {
    return ctx.overlayOpen;
  }
  if (ctx.focusInTerminal) {
    return false;
  }
  if (ctx.focusInEditable) {
    return false;
  }
  return true;
}

export function resolveShortcutCommand(args: {
  event: KeyboardEvent;
  definitions: KeyboardShortcutDefinition[];
  chords: Record<KeyboardShortcutCommandId, KeyChord>;
  ctx: ShortcutMatchContext;
}): KeyboardShortcutCommandId | null {
  const { event, definitions, chords, ctx } = args;
  if (event.defaultPrevented || event.repeat) {
    return null;
  }
  const defs = ctx.leaderArmed
    ? definitions.filter((d) => d.scope === "leaderFollowUp")
    : definitions.filter((d) => d.scope !== "leaderFollowUp");
  for (const def of defs) {
    const chord = chords[def.id];
    if (!chord) {
      continue;
    }
    if (!scopeAllowsMatch(def, chord, ctx)) {
      continue;
    }
    if (!eventMatchesChord(event, chord)) {
      continue;
    }
    return def.id;
  }
  return null;
}

export function isEditableShortcutTarget(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (element.closest("[contenteditable='true']")) {
    return true;
  }
  return false;
}

export function isTerminalFocusTarget(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  return Boolean(element.closest("[data-nosuckshell-terminal-host]"));
}
