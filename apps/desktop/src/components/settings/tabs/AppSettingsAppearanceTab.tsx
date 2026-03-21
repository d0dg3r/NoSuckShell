import type {
  DensityProfile,
  FrameModePreset,
  ListTonePreset,
  TerminalFontPreset,
  UiFontPreset,
} from "../app-settings-types";
import { TERMINAL_FONT_OFFSET_MAX, TERMINAL_FONT_OFFSET_MIN } from "../app-settings-constants";

export type AppSettingsAppearanceTabProps = {
  densityProfile: DensityProfile;
  setDensityProfile: (value: DensityProfile) => void;
  uiFontPreset: UiFontPreset;
  setUiFontPreset: (value: UiFontPreset) => void;
  terminalFontPreset: TerminalFontPreset;
  setTerminalFontPreset: (value: TerminalFontPreset) => void;
  terminalFontOffset: number;
  setTerminalFontOffset: (value: number) => void;
  terminalFontSize: number;
  listTonePreset: ListTonePreset;
  setListTonePreset: (value: ListTonePreset) => void;
  frameModePreset: FrameModePreset;
  setFrameModePreset: (value: FrameModePreset) => void;
  showFullPathInFilePaneTitle: boolean;
  setShowFullPathInFilePaneTitle: (value: boolean) => void;
};

export function AppSettingsAppearanceTab({
  densityProfile,
  setDensityProfile,
  uiFontPreset,
  setUiFontPreset,
  terminalFontPreset,
  setTerminalFontPreset,
  terminalFontOffset,
  setTerminalFontOffset,
  terminalFontSize,
  listTonePreset,
  setListTonePreset,
  frameModePreset,
  setFrameModePreset,
  showFullPathInFilePaneTitle,
  setShowFullPathInFilePaneTitle,
}: AppSettingsAppearanceTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>Visual style</h3>
          <p className="muted-copy">Tune typography, density and contrast for your workspace.</p>
        </header>
        <div className="host-form-grid">
          <label className="field">
            <span className="field-label">Density profile</span>
            <select
              className="input density-profile-select"
              value={densityProfile}
              onChange={(event) => setDensityProfile(event.target.value as DensityProfile)}
            >
              <option value="aggressive">Aggressive compact</option>
              <option value="balanced">Balanced compact</option>
              <option value="safe">Safe compact</option>
            </select>
            <span className="field-help">Controls spacing and font density across the app.</span>
          </label>
          <label className="field">
            <span className="field-label">GUI font</span>
            <select
              className="input density-profile-select"
              value={uiFontPreset}
              onChange={(event) => setUiFontPreset(event.target.value as UiFontPreset)}
            >
              <option value="inter">Inter (balanced, neutral)</option>
              <option value="manrope">Manrope (modern, tighter)</option>
              <option value="ibm-plex-sans">IBM Plex Sans (technical, clear)</option>
            </select>
            <span className="field-help">Sets typography for labels, forms and controls.</span>
          </label>
          <label className="field">
            <span className="field-label">Terminal font preset</span>
            <select
              className="input density-profile-select"
              value={terminalFontPreset}
              onChange={(event) => setTerminalFontPreset(event.target.value as TerminalFontPreset)}
            >
              <option value="jetbrains-mono">JetBrains Mono</option>
              <option value="ibm-plex-mono">IBM Plex Mono</option>
              <option value="source-code-pro">Source Code Pro</option>
            </select>
            <span className="field-help">Nerd font fallbacks remain active for symbols.</span>
          </label>
          <label className="field">
            <span className="field-label">Terminal font offset</span>
            <input
              className="input"
              type="number"
              value={terminalFontOffset}
              min={TERMINAL_FONT_OFFSET_MIN}
              max={TERMINAL_FONT_OFFSET_MAX}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                setTerminalFontOffset(
                  Math.min(TERMINAL_FONT_OFFSET_MAX, Math.max(TERMINAL_FONT_OFFSET_MIN, Math.round(parsed))),
                );
              }}
            />
            <span className="field-help">Current terminal size: {terminalFontSize}px.</span>
          </label>
          <label className="field">
            <span className="field-label">List tone intensity</span>
            <select
              className="input density-profile-select"
              value={listTonePreset}
              onChange={(event) => setListTonePreset(event.target.value as ListTonePreset)}
            >
              <option value="subtle">Subtle</option>
              <option value="strong">Strong</option>
            </select>
            <span className="field-help">Controls host/session/chip color intensity.</span>
          </label>
          <label className="field">
            <span className="field-label">Frame mode</span>
            <select
              className="input density-profile-select"
              value={frameModePreset}
              onChange={(event) => setFrameModePreset(event.target.value as FrameModePreset)}
            >
              <option value="cleaner">Cleaner</option>
              <option value="balanced">Balanced</option>
              <option value="clearer">Clearer</option>
            </select>
            <span className="field-help">Hover/focus frame strength.</span>
          </label>
          <label className="field field-span-2 checkbox-field">
            <input
              id="settings-file-pane-full-path-title"
              type="checkbox"
              className="checkbox-input"
              checked={showFullPathInFilePaneTitle}
              onChange={(event) => setShowFullPathInFilePaneTitle(event.target.checked)}
            />
            <span className="field-label">Show full path in file pane titles</span>
          </label>
          <p className="muted-copy field-span-2">
            When off, the split-pane title shows only the current folder name while browsing local or remote files. The
            tooltip always shows the full path. When on, the title shows the full path with ellipsis if space is tight.
          </p>
        </div>
      </section>
    </div>
  );
}
