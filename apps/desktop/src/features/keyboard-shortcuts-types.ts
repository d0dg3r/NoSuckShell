/** Physical key per KeyboardEvent.code (layout-independent). */
export type KeyChord = {
  code: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
};

/** Stable command ids for shortcuts and help text. */
export type KeyboardShortcutCommandId =
  | "openSettings"
  | "toggleSidebar"
  | "openQuickConnect"
  | "openLayoutCommandCenter"
  | "focusNextPane"
  | "focusPreviousPane"
  | "dismissPrimaryOverlay"
  | "openSettingsKeyboardTab"
  | "leaderArm";

/**
 * - globalChord: works from terminal too if chord uses a non-letter modifier stack (enforced: any globalChord must include ctrl/meta/alt).
 * - appUi: only when focus is not inside terminal host.
 * - leaderFollowUp: second key after leader; only when leader armed.
 */
export type KeyboardShortcutScope = "globalChord" | "appUi" | "leaderFollowUp";

export type KeyboardShortcutDefinition = {
  id: KeyboardShortcutCommandId;
  /** English label for settings UI */
  label: string;
  defaultChord: KeyChord;
  scope: KeyboardShortcutScope;
  /** Exact `action` string from HelpPanel row to show this chord in the keys column. */
  helpAction?: string;
};

export type StoredShortcutMap = {
  version: 1;
  chords: Partial<Record<KeyboardShortcutCommandId, KeyChord>>;
  leaderChord?: KeyChord | null;
};
