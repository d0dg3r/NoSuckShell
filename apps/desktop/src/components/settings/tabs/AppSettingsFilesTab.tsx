import type { Dispatch, SetStateAction } from "react";
import type { FileExportArchiveFormat, FileExportDestMode } from "../app-settings-types";
import type { FilePaneSemanticNameColorsStored } from "../../../features/file-pane-semantic-name-colors-prefs";
import {
  FILE_PANE_NAME_KINDS_WITH_COLOR,
  FILE_PANE_NAME_KIND_LABEL,
  FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS,
  type FilePaneNameKind,
} from "../../../features/file-pane-name-kind";
import { resolveFilePaneSemanticNameColorHex } from "../../../features/file-pane-semantic-name-colors-prefs";
import { SettingsHelpHint } from "../SettingsHelpHint";

export type AppSettingsFilesTabProps = {
  fileExportDestMode: FileExportDestMode;
  setFileExportDestMode: (value: FileExportDestMode) => void;
  fileExportPathKey: string;
  setFileExportPathKey: (value: string) => void;
  fileExportArchiveFormat: FileExportArchiveFormat;
  setFileExportArchiveFormat: (value: FileExportArchiveFormat) => void;
  filePaneSemanticNameColors: FilePaneSemanticNameColorsStored;
  setFilePaneSemanticNameColors: Dispatch<SetStateAction<FilePaneSemanticNameColorsStored>>;
};

export function AppSettingsFilesTab({
  fileExportDestMode,
  setFileExportDestMode,
  fileExportPathKey,
  setFileExportPathKey,
  fileExportArchiveFormat,
  setFileExportArchiveFormat,
  filePaneSemanticNameColors,
  setFilePaneSemanticNameColors,
}: AppSettingsFilesTabProps) {
  const setKindColor = (kind: FilePaneNameKind, hex: string) => {
    const normalized = hex.toLowerCase();
    const def = FILE_PANE_SEMANTIC_NAME_COLOR_DEFAULTS[kind];
    setFilePaneSemanticNameColors((prev) => {
      const nextColors = { ...prev.colors };
      if (normalized === def.toLowerCase()) {
        delete nextColors[kind];
      } else {
        nextColors[kind] = normalized;
      }
      return { ...prev, colors: nextColors };
    });
  };

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>File browser export</h3>
            <SettingsHelpHint
              topic="File browser export"
              description="Save icon and bulk export use this destination. Path keys match the local file browser: empty means home, “Downloads” maps to ~/Downloads, or use an absolute path."
            />
          </div>
          <p className="settings-card-lead">Default folder for saves and bulk export.</p>
        </header>
        <div className="settings-form-row settings-files-export-row">
          <label className="field">
            <span className="field-label">Destination</span>
            <select
              className="input density-profile-select settings-control-intrinsic"
              value={fileExportDestMode}
              onChange={(e) => setFileExportDestMode(e.target.value === "ask" ? "ask" : "fixed")}
            >
              <option value="fixed">Use folder below</option>
              <option value="ask">Ask each time (folder picker)</option>
            </select>
          </label>
          {fileExportDestMode === "fixed" ? (
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Folder path key
                <SettingsHelpHint
                  topic="Folder path key"
                  description="Same rules as the local file pane path field: relative paths stay under your home directory."
                />
              </span>
              <input
                type="text"
                className="input settings-path-input"
                value={fileExportPathKey}
                onChange={(e) => setFileExportPathKey(e.target.value)}
                placeholder="Downloads"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          ) : null}
          <label className="field">
            <span className="field-label">Archive format (folders &amp; multi-select)</span>
            <select
              className="input density-profile-select settings-control-intrinsic"
              value={fileExportArchiveFormat}
              onChange={(e) =>
                setFileExportArchiveFormat(e.target.value === "zip" ? "zip" : "tarGz")
              }
            >
              <option value="tarGz">tar.gz (remote needs tar + gzip)</option>
              <option value="zip">zip (remote needs zip)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>File browser name colors</h3>
            <SettingsHelpHint
              topic="File browser name colors"
              description="Muted tints on folder and file names help you scan the list (similar to terminal directory colors). This is for orientation only, not a trust or security indicator."
            />
          </div>
          <p className="settings-card-lead">Optional tints for scanning the list.</p>
        </header>
        <div className="host-form-grid">
          <label className="field field-span-2 checkbox-field">
            <input
              id="settings-file-pane-semantic-name-colors"
              type="checkbox"
              className="checkbox-input"
              checked={filePaneSemanticNameColors.enabled}
              onChange={(e) =>
                setFilePaneSemanticNameColors((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
            <span className="field-label">Use semantic name colors</span>
          </label>
          {filePaneSemanticNameColors.enabled ? (
            <>
              <div className="field field-span-2 file-pane-semantic-colors-grid">
                {FILE_PANE_NAME_KINDS_WITH_COLOR.map((kind) => {
                  const value = resolveFilePaneSemanticNameColorHex(kind, filePaneSemanticNameColors.colors);
                  return (
                    <div key={kind} className="file-pane-semantic-color-row">
                      <span className="file-pane-semantic-color-label">{FILE_PANE_NAME_KIND_LABEL[kind]}</span>
                      <input
                        type="color"
                        className="file-pane-semantic-color-input"
                        aria-label={`Color for ${FILE_PANE_NAME_KIND_LABEL[kind]}`}
                        value={value}
                        onChange={(e) => setKindColor(kind, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="field field-span-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setFilePaneSemanticNameColors({ enabled: true, colors: {} })}
                >
                  Reset colors to defaults
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
