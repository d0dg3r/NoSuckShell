import type { FileExportArchiveFormat, FileExportDestMode } from "../app-settings-types";

export type AppSettingsFilesTabProps = {
  fileExportDestMode: FileExportDestMode;
  setFileExportDestMode: (value: FileExportDestMode) => void;
  fileExportPathKey: string;
  setFileExportPathKey: (value: string) => void;
  fileExportArchiveFormat: FileExportArchiveFormat;
  setFileExportArchiveFormat: (value: FileExportArchiveFormat) => void;
};

export function AppSettingsFilesTab({
  fileExportDestMode,
  setFileExportDestMode,
  fileExportPathKey,
  setFileExportPathKey,
  fileExportArchiveFormat,
  setFileExportArchiveFormat,
}: AppSettingsFilesTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>File browser export</h3>
          <p className="muted-copy">
            Save icon and bulk export use this destination.             Path keys match the local file browser (empty = home, “Downloads” for ~/Downloads, or an absolute path).
          </p>
        </header>
        <div className="host-form-grid">
          <label className="field field-span-2">
            <span className="field-label">Destination</span>
            <select
              className="input density-profile-select"
              value={fileExportDestMode}
              onChange={(e) => setFileExportDestMode(e.target.value === "ask" ? "ask" : "fixed")}
            >
              <option value="fixed">Use folder below</option>
              <option value="ask">Ask each time (folder picker)</option>
            </select>
          </label>
          {fileExportDestMode === "fixed" ? (
            <label className="field field-span-2">
              <span className="field-label">Folder path key</span>
              <input
                type="text"
                className="input"
                value={fileExportPathKey}
                onChange={(e) => setFileExportPathKey(e.target.value)}
                placeholder="Downloads"
                spellCheck={false}
                autoComplete="off"
              />
              <p className="muted-copy field-help">
                Same rules as the local file pane path field: relative paths stay under your home directory.
              </p>
            </label>
          ) : null}
          <label className="field field-span-2">
            <span className="field-label">Archive format (folders &amp; multi-select)</span>
            <select
              className="input density-profile-select"
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
    </div>
  );
}
