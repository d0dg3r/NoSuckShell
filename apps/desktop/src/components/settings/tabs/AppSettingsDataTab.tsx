export type AppSettingsDataTabProps = {
  defaultBackupPath: string;
  backupExportPath: string;
  setBackupExportPath: (value: string) => void;
  backupExportPassword: string;
  setBackupExportPassword: (value: string) => void;
  handleExportBackup: () => Promise<void>;
  backupImportPath: string;
  setBackupImportPath: (value: string) => void;
  backupImportPassword: string;
  setBackupImportPassword: (value: string) => void;
  handleImportBackup: () => Promise<void>;
  backupMessage: string;
};

export function AppSettingsDataTab({
  defaultBackupPath,
  backupExportPath,
  setBackupExportPath,
  backupExportPassword,
  setBackupExportPassword,
  handleExportBackup,
  backupImportPath,
  setBackupImportPath,
  backupImportPassword,
  setBackupImportPassword,
  handleImportBackup,
  backupMessage,
}: AppSettingsDataTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card backup-panel">
        <header className="settings-card-head">
          <h3>Backup &amp; restore</h3>
          <p className="muted-copy">
            Export encrypts your workspace data; keep the password safe. Import replaces matching data — use a recent
            export when recovering.
          </p>
        </header>
        <label className="field">
          <span className="field-label">Export path</span>
          <input
            className="input"
            value={backupExportPath}
            onChange={(event) => setBackupExportPath(event.target.value)}
            placeholder={defaultBackupPath}
          />
        </label>
        <label className="field">
          <span className="field-label">Export password</span>
          <input
            className="input"
            type="password"
            value={backupExportPassword}
            onChange={(event) => setBackupExportPassword(event.target.value)}
            placeholder="Enter backup password"
            autoComplete="new-password"
          />
        </label>
        <button
          type="button"
          className="btn btn-settings-commit"
          onClick={() => void handleExportBackup()}
          disabled={!backupExportPassword}
        >
          Export backup
        </button>
        <label className="field">
          <span className="field-label">Import path</span>
          <input
            className="input"
            value={backupImportPath}
            onChange={(event) => setBackupImportPath(event.target.value)}
            placeholder={defaultBackupPath}
          />
        </label>
        <label className="field">
          <span className="field-label">Import password</span>
          <input
            className="input"
            type="password"
            value={backupImportPassword}
            onChange={(event) => setBackupImportPassword(event.target.value)}
            placeholder="Enter backup password"
            autoComplete="current-password"
          />
        </label>
        <button
          type="button"
          className="btn btn-settings-commit"
          onClick={() => void handleImportBackup()}
          disabled={!backupImportPassword}
        >
          Import backup
        </button>
        <p className="muted-copy">Backups are always encrypted. Passwords are never stored.</p>
        {backupMessage && <p className="muted-copy">{backupMessage}</p>}
      </section>
    </div>
  );
}
