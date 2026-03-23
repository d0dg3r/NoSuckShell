import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { formatChordDisplay } from "../../../features/keyboard-shortcuts-display";
import { defaultChordForCommand } from "../../../features/keyboard-shortcuts-defaults";
import { KEYBOARD_SHORTCUT_DEFINITIONS } from "../../../features/keyboard-shortcuts-registry";
import type { KeyboardShortcutCommandId, KeyChord } from "../../../features/keyboard-shortcuts-types";
import { DEFAULT_LEADER_CHORD } from "../../../features/keyboard-shortcuts-registry";
import { findChordConflicts } from "../../../features/keyboard-shortcuts-storage";
import { SettingsHelpHint } from "../SettingsHelpHint";

export type AppSettingsKeyboardTabProps = {
  chordMap: Record<KeyboardShortcutCommandId, KeyChord>;
  setChordMap: React.Dispatch<React.SetStateAction<Record<KeyboardShortcutCommandId, KeyChord>>>;
  leaderChord: KeyChord;
  setLeaderChord: React.Dispatch<React.SetStateAction<KeyChord>>;
  suspendEscapeRef: MutableRefObject<boolean>;
};

function chordFromKeyboardEvent(event: KeyboardEvent): KeyChord {
  return {
    code: event.code,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function AppSettingsKeyboardTab({
  chordMap,
  setChordMap,
  leaderChord,
  setLeaderChord,
  suspendEscapeRef,
}: AppSettingsKeyboardTabProps) {
  const [recording, setRecording] = useState<"leader" | KeyboardShortcutCommandId | null>(null);

  useEffect(() => {
    suspendEscapeRef.current = recording !== null;
    return () => {
      suspendEscapeRef.current = false;
    };
  }, [recording, suspendEscapeRef]);

  const conflicts = useMemo(() => findChordConflicts(chordMap, leaderChord), [chordMap, leaderChord]);

  const conflictSummary = useMemo(() => {
    if (conflicts.length === 0) {
      return "";
    }
    return conflicts.map((c) => `${c.commandA} / ${c.commandB}: ${formatChordDisplay(c.chord)}`).join(" · ");
  }, [conflicts]);

  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent) => {
      if (recording === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      if (event.repeat) {
        return;
      }
      const next = chordFromKeyboardEvent(event);
      if (recording === "leader") {
        setLeaderChord(next);
      } else {
        setChordMap((prev) => ({ ...prev, [recording]: next }));
      }
      setRecording(null);
    },
    [recording, setChordMap, setLeaderChord],
  );

  useEffect(() => {
    if (recording === null) {
      return;
    }
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [recording, onKeyDownCapture]);

  const resetOne = (id: KeyboardShortcutCommandId) => {
    setChordMap((prev) => ({ ...prev, [id]: defaultChordForCommand(id) }));
  };

  const resetAll = () => {
    const next = {} as Record<KeyboardShortcutCommandId, KeyChord>;
    for (const d of KEYBOARD_SHORTCUT_DEFINITIONS) {
      next[d.id] = defaultChordForCommand(d.id);
    }
    setChordMap(next);
    setLeaderChord(DEFAULT_LEADER_CHORD);
  };

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3 className="settings-card-title">Keyboard shortcuts</h3>
            <SettingsHelpHint
              topic="Keyboard shortcuts"
              description='Click Record, then press the new key combination. Press Esc while recording to cancel. The leader key starts a short sequence: after it, press K (default) to open this keyboard tab.'
            />
          </div>
          <p className="settings-card-lead">Record chords; Esc cancels. Leader opens a sequence.</p>
        </header>
        {conflictSummary ? (
          <div className="file-pane-banner file-pane-banner--error" role="status">
            Duplicate bindings: {conflictSummary}
          </div>
        ) : null}
        {recording ? (
          <p className="settings-card-lead" role="status">
            Recording{recording === "leader" ? " leader key" : ` “${recording}”`}… press Esc to cancel.
          </p>
        ) : null}
        <div className="keyboard-shortcuts-table-wrap">
          <table className="keyboard-shortcuts-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Shortcut</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Leader key</td>
                <td>
                  <code className="keyboard-shortcut-chord">{formatChordDisplay(leaderChord)}</code>
                </td>
                <td>
                  <button type="button" className="btn btn-sm" onClick={() => setRecording("leader")} disabled={recording !== null}>
                    Record
                  </button>
                </td>
              </tr>
              {KEYBOARD_SHORTCUT_DEFINITIONS.map((def) => (
                <tr key={def.id}>
                  <td>{def.label}</td>
                  <td>
                    <code className="keyboard-shortcut-chord">{formatChordDisplay(chordMap[def.id])}</code>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setRecording(def.id)}
                      disabled={recording !== null}
                    >
                      Record
                    </button>{" "}
                    <button type="button" className="btn btn-sm" onClick={() => resetOne(def.id)} disabled={recording !== null}>
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="settings-actions-row">
          <button type="button" className="btn" onClick={resetAll} disabled={recording !== null}>
            Reset all to defaults
          </button>
          {recording ? (
            <button type="button" className="btn" onClick={() => setRecording(null)}>
              Cancel recording
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
