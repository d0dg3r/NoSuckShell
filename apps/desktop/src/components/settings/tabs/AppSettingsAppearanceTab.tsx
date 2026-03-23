import type {
  DensityProfile,
  FrameModePreset,
  ListTonePreset,
  TerminalFontPreset,
  UiFontPreset,
} from "../app-settings-types";
import { TERMINAL_FONT_OFFSET_MAX, TERMINAL_FONT_OFFSET_MIN } from "../app-settings-constants";
import { SettingsHelpHint } from "../SettingsHelpHint";

const UI_DENSITY_OFFSET_MIN = -2;
const UI_DENSITY_OFFSET_MAX = 2;

export type AppSettingsAppearanceTabProps = {
  densityProfile: DensityProfile;
  setDensityProfile: (value: DensityProfile) => void;
  uiDensityOffset: number;
  setUiDensityOffset: (value: number) => void;
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
  onResetVisualStyle: () => void;
};

export function AppSettingsAppearanceTab({
  densityProfile,
  setDensityProfile,
  uiDensityOffset,
  setUiDensityOffset,
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
  onResetVisualStyle,
}: AppSettingsAppearanceTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>Visual style</h3>
            <SettingsHelpHint
              topic="Visual style"
              description="Typography, density, list contrast, and frame emphasis for the whole app (not connection-specific)."
            />
            <button type="button" className="btn btn-settings-tool" onClick={onResetVisualStyle}>
              Reset view
            </button>
            <SettingsHelpHint
              topic="Reset view"
              description="Restores density profile, density fine-tune, GUI and terminal fonts, terminal density fine-tune, list tone, frame mode, and the file pane full-path title option to their defaults. Layout and window settings are not changed."
            />
          </div>
          <p className="settings-card-lead">Typography, density, and contrast.</p>
        </header>
        <div className="host-form-grid">
          <label className="field">
            <span className="field-label field-label-inline-hint">
              Density profile
              <SettingsHelpHint
                topic="Density profile"
                description={`Preset baseline for spacing and typography. Fine tune with the slider: ${uiDensityOffset > 0 ? "+" : ""}${uiDensityOffset}.`}
              />
            </span>
            <select
              className="input density-profile-select"
              value={densityProfile}
              onChange={(event) => setDensityProfile(event.target.value as DensityProfile)}
            >
              <option value="aggressive">Aggressive compact</option>
              <option value="balanced">Balanced compact</option>
              <option value="safe">Safe compact</option>
            </select>
            <input
              className="input"
              type="range"
              value={uiDensityOffset}
              min={UI_DENSITY_OFFSET_MIN}
              max={UI_DENSITY_OFFSET_MAX}
              step={1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                setUiDensityOffset(Math.min(UI_DENSITY_OFFSET_MAX, Math.max(UI_DENSITY_OFFSET_MIN, Math.round(parsed))));
              }}
            />
          </label>
          <label className="field">
            <span className="field-label field-label-inline-hint">
              GUI font
              <SettingsHelpHint topic="GUI font" description="Sets typography for labels, forms, and controls." />
            </span>
            <select
              className="input density-profile-select"
              value={uiFontPreset}
              onChange={(event) => setUiFontPreset(event.target.value as UiFontPreset)}
            >
              <option value="inter">Inter (balanced, neutral)</option>
              <option value="manrope">Manrope (modern, tighter)</option>
              <option value="ibm-plex-sans">IBM Plex Sans (technical, clear)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label field-label-inline-hint">
              Terminal font preset
              <SettingsHelpHint topic="Terminal font preset" description="Nerd font fallbacks remain active for symbols." />
            </span>
            <select
              className="input density-profile-select"
              value={terminalFontPreset}
              onChange={(event) => setTerminalFontPreset(event.target.value as TerminalFontPreset)}
            >
              <option value="jetbrains-mono">JetBrains Mono</option>
              <option value="ibm-plex-mono">IBM Plex Mono</option>
              <option value="source-code-pro">Source Code Pro</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label field-label-inline-hint">
              Terminal density fine tune
              <SettingsHelpHint
                topic="Terminal density fine tune"
                description={`Keep your selected density preset and fine-tune terminal readability. Current terminal size: ${terminalFontSize}px.`}
              />
            </span>
            <input
              className="input"
              type="range"
              value={terminalFontOffset}
              min={TERMINAL_FONT_OFFSET_MIN}
              max={TERMINAL_FONT_OFFSET_MAX}
              step={1}
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
          </label>
          <div className="settings-form-row field-span-2">
            <label className="field">
              <span className="field-label field-label-inline-hint">
                List tone intensity
                <SettingsHelpHint topic="List tone intensity" description="Controls host, session, and chip color intensity." />
              </span>
            <select
              className="input density-profile-select"
              value={listTonePreset}
              onChange={(event) => setListTonePreset(event.target.value as ListTonePreset)}
            >
              <option value="subtle">Subtle</option>
              <option value="strong">Strong</option>
            </select>
            </label>
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Frame mode
                <SettingsHelpHint topic="Frame mode" description="Hover and focus frame strength for interactive panels." />
              </span>
            <select
              className="input density-profile-select"
              value={frameModePreset}
              onChange={(event) => setFrameModePreset(event.target.value as FrameModePreset)}
            >
              <option value="cleaner">Cleaner</option>
              <option value="balanced">Balanced</option>
              <option value="clearer">Clearer</option>
            </select>
            </label>
          </div>
          <label className="field field-span-2 checkbox-field">
            <input
              id="settings-file-pane-full-path-title"
              type="checkbox"
              className="checkbox-input"
              checked={showFullPathInFilePaneTitle}
              onChange={(event) => setShowFullPathInFilePaneTitle(event.target.checked)}
            />
            <span className="field-label field-label-inline-hint">
              Show full path in file pane titles
              <SettingsHelpHint
                topic="Full path in file pane titles"
                description="When off, the split-pane title shows only the current folder name while browsing local or remote files; the tooltip always shows the full path. When on, the title shows the full path with ellipsis if space is tight."
              />
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
