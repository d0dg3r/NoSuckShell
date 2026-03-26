import type { AppPreferences } from "../../../types";

export type AppSettingsNssCommanderTabProps = {
  appPreferences: AppPreferences;
  onSaveAppPreferences: (prefs: AppPreferences) => void;
};

export function AppSettingsNssCommanderTab({
  appPreferences,
  onSaveAppPreferences,
}: AppSettingsNssCommanderTabProps) {
  const useClassicGutter = appPreferences.nssCommanderUseClassicGutter;

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>File operations bar</h3>
          <p className="muted-copy">
            Choose how file operations (copy, move, delete, etc.) are presented in NSS-Commander workspaces.
          </p>
        </header>
        <div className="settings-radio-group">
          <label className="settings-radio-option">
            <input
              type="radio"
              name="nss-commander-ops-style"
              checked={!useClassicGutter}
              onChange={() =>
                onSaveAppPreferences({ ...appPreferences, nssCommanderUseClassicGutter: false })
              }
            />
            <div className="settings-radio-content">
              <span className="settings-radio-label">Horizontal F-key bar (bottom)</span>
              <span className="settings-radio-desc muted-copy">
                Compact bar at the bottom of the workspace. Keyboard-driven with F4–F10 keys.
                Copy/Move auto-direction from focused pane; Shift reverses.
              </span>
            </div>
          </label>
          <label className="settings-radio-option">
            <input
              type="radio"
              name="nss-commander-ops-style"
              checked={useClassicGutter}
              onChange={() =>
                onSaveAppPreferences({ ...appPreferences, nssCommanderUseClassicGutter: true })
              }
            />
            <div className="settings-radio-content">
              <span className="settings-radio-label">Classic vertical sidebar (center gutter)</span>
              <span className="settings-radio-desc muted-copy">
                Norton Commander-style icon strip between the two file panes.
                Wider (52 px) but shows all operations at a glance with directional arrows.
              </span>
            </div>
          </label>
        </div>
      </section>
    </div>
  );
}
