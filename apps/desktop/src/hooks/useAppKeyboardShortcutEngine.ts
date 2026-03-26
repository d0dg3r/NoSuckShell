import { useEffect, useRef, type MutableRefObject } from "react";
import { KEYBOARD_SHORTCUT_DEFINITIONS } from "../features/keyboard-shortcuts-registry";
import type { KeyboardShortcutCommandId, KeyChord } from "../features/keyboard-shortcuts-types";
import {
  isEditableShortcutTarget,
  isTerminalFocusTarget,
  resolveShortcutCommand,
} from "../features/keyboard-shortcuts-match";
import { leaderChordMatches } from "../features/keyboard-shortcuts-storage";

const LEADER_ARM_MS = 1400;

export type KeyboardShortcutEngineSnapshot = {
  overlayOpen: boolean;
};

export type KeyboardShortcutEngineActions = {
  openSettings: () => void;
  toggleSidebar: () => void;
  openQuickConnect: () => void;
  focusNextPane: () => void;
  focusPreviousPane: () => void;
  dismissPrimaryOverlay: () => void;
  openSettingsKeyboardTab: () => void;
};

/**
 * Global capture-phase shortcuts. Uses refs for snapshot/actions so the listener is registered once.
 */
export function useAppKeyboardShortcutEngine(
  chords: Record<KeyboardShortcutCommandId, KeyChord>,
  leaderChord: KeyChord,
  getSnapshot: () => KeyboardShortcutEngineSnapshot,
  actionsRef: React.MutableRefObject<KeyboardShortcutEngineActions>,
  /** When true, Escape is left to the Keyboard settings tab (cancel recording). */
  suspendEscapeRef: MutableRefObject<boolean>,
): void {
  const chordsRef = useRef(chords);
  const leaderRef = useRef(leaderChord);
  const getSnapshotRef = useRef(getSnapshot);
  const leaderArmedRef = useRef(false);
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);

  useEffect(() => {
    leaderRef.current = leaderChord;
  }, [leaderChord]);

  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  const disarmLeader = () => {
    leaderArmedRef.current = false;
    if (leaderTimerRef.current !== null) {
      clearTimeout(leaderTimerRef.current);
      leaderTimerRef.current = null;
    }
  };

  const armLeader = () => {
    disarmLeader();
    leaderArmedRef.current = true;
    leaderTimerRef.current = setTimeout(() => {
      leaderArmedRef.current = false;
      leaderTimerRef.current = null;
    }, LEADER_ARM_MS);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (suspendEscapeRef.current && event.code === "Escape") {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const focusInTerminal = isTerminalFocusTarget(target);
      const focusInEditable = isEditableShortcutTarget(target);
      const { overlayOpen } = getSnapshotRef.current();

      if (!focusInEditable && leaderChordMatches(event, leaderRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        armLeader();
        return;
      }

      const ctx = {
        focusInTerminal,
        overlayOpen,
        leaderArmed: leaderArmedRef.current,
        focusInEditable,
      };

      const resolved = resolveShortcutCommand({
        event,
        definitions: KEYBOARD_SHORTCUT_DEFINITIONS,
        chords: chordsRef.current,
        ctx,
      });

      if (ctx.leaderArmed) {
        disarmLeader();
      }

      if (!resolved) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const a = actionsRef.current;
      switch (resolved) {
        case "openSettings":
          a.openSettings();
          break;
        case "toggleSidebar":
          a.toggleSidebar();
          break;
        case "openQuickConnect":
          a.openQuickConnect();
          break;
        case "openLayoutCommandCenter":
          break;
        case "focusNextPane":
          a.focusNextPane();
          break;
        case "focusPreviousPane":
          a.focusPreviousPane();
          break;
        case "dismissPrimaryOverlay":
          a.dismissPrimaryOverlay();
          break;
        case "openSettingsKeyboardTab":
          a.openSettingsKeyboardTab();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
