import type { KeyboardShortcutCommandId, KeyboardShortcutDefinition, KeyChord } from "./keyboard-shortcuts-types";

export const KEYBOARD_SHORTCUT_COMMAND_IDS: KeyboardShortcutCommandId[] = [
  "openSettings",
  "toggleSidebar",
  "openQuickConnect",
  "openLayoutCommandCenter",
  "focusNextPane",
  "focusPreviousPane",
  "dismissPrimaryOverlay",
  "openSettingsKeyboardTab",
];

export const DEFAULT_LEADER_CHORD: KeyChord = {
  code: "Backquote",
  ctrl: true,
  shift: true,
};

export const KEYBOARD_SHORTCUT_DEFINITIONS: KeyboardShortcutDefinition[] = [
  {
    id: "openSettings",
    label: "Open settings",
    defaultChord: { code: "Comma", ctrl: true },
    scope: "globalChord",
    helpAction: "Open Settings",
  },
  {
    id: "toggleSidebar",
    label: "Toggle host sidebar",
    defaultChord: { code: "KeyB", ctrl: true, shift: true },
    scope: "appUi",
  },
  {
    id: "openQuickConnect",
    label: "Quick connect",
    defaultChord: { code: "KeyK", ctrl: true, shift: true },
    scope: "appUi",
    helpAction: "New local terminal / Quick connect",
  },
  {
    id: "openLayoutCommandCenter",
    label: "Layout command center",
    defaultChord: { code: "KeyL", ctrl: true, shift: true },
    scope: "appUi",
  },
  {
    id: "focusNextPane",
    label: "Focus next pane",
    defaultChord: { code: "PageDown", ctrl: true, shift: true },
    scope: "appUi",
  },
  {
    id: "focusPreviousPane",
    label: "Focus previous pane",
    defaultChord: { code: "PageUp", ctrl: true, shift: true },
    scope: "appUi",
  },
  {
    id: "dismissPrimaryOverlay",
    label: "Close modal or overlay",
    defaultChord: { code: "Escape" },
    scope: "appUi",
  },
  {
    id: "openSettingsKeyboardTab",
    label: "Open keyboard shortcuts (after leader key)",
    defaultChord: { code: "KeyK" },
    scope: "leaderFollowUp",
  },
];

export const definitionByCommandId = (): Map<KeyboardShortcutCommandId, KeyboardShortcutDefinition> => {
  const m = new Map<KeyboardShortcutCommandId, KeyboardShortcutDefinition>();
  for (const d of KEYBOARD_SHORTCUT_DEFINITIONS) {
    m.set(d.id, d);
  }
  return m;
};
