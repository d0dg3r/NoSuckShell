type Props = {
  onUp: () => void;
  upDisabled: boolean;
  onRefresh: () => void;
  onTerminal: () => void;
  onRoot: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
  /** Show filesystem-root jump (local: `/`, remote: `/`). */
  showRoot?: boolean;
  onUploadFiles?: () => void;
  uploadFilesDisabled?: boolean;
  onUploadFolder?: () => void;
  uploadFolderDisabled?: boolean;
  onExportSelection?: () => void;
  exportSelectionDisabled?: boolean;
  /** Dateiliste: alle Spalten an Inhalt anpassen (wie Doppelklick auf Spaltenteiler). */
  onFitColumns?: () => void;
  fitColumnsDisabled?: boolean;
};

const iconSize = 16;

function IconUp() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 19V5M12 5l-7 7M12 5l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 3v7h-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRoot() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M4 20V10l8-6 8 6v10M9 20v-6h6v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16v12H4z" strokeLinejoin="round" />
      <path d="M8 10l3 2-3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 14h2" strokeLinecap="round" />
    </svg>
  );
}

function IconNewFolder() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 20h16V8l-4-4H4v16z" strokeLinejoin="round" />
      <path d="M12 11v6M9 14h6" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V5h6v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSaveExport() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14" strokeLinecap="round" />
    </svg>
  );
}

function IconUploadFiles() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 15V3m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
    </svg>
  );
}

function IconUploadFolder() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 20h16v-8l-4-4H8L6 6H4v14z" strokeLinejoin="round" />
      <path d="M12 10V4M9 7l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFitColumns() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 4v16M12 4v16M18 4v16" strokeLinecap="round" />
      <path d="M3 12h3M18 12h3" strokeLinecap="round" />
      <path d="M4 10l-2 2 2 2M20 10l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilePaneToolbar({
  onUp,
  upDisabled,
  onRefresh,
  onTerminal,
  onRoot,
  onNewFolder,
  onDelete,
  deleteDisabled,
  showRoot = true,
  onUploadFiles,
  uploadFilesDisabled = true,
  onUploadFolder,
  uploadFolderDisabled = true,
  onExportSelection,
  exportSelectionDisabled = true,
  onFitColumns,
  fitColumnsDisabled = false,
}: Props) {
  return (
    <>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onUp}
        disabled={upDisabled}
        title="Übergeordnetes Verzeichnis"
        aria-label="Übergeordnetes Verzeichnis"
      >
        <IconUp />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onRefresh}
        title="Aktualisieren"
        aria-label="Aktualisieren"
      >
        <IconRefresh />
      </button>
      {onFitColumns ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onFitColumns}
          disabled={fitColumnsDisabled}
          title="Spalten optimal (Breite an Inhalt)"
          aria-label="Spalten optimal an Inhalt anpassen"
        >
          <IconFitColumns />
        </button>
      ) : null}
      {showRoot ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onRoot}
          title="Dateisystemroot (/)"
          aria-label="Dateisystemroot"
        >
          <IconRoot />
        </button>
      ) : null}
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onNewFolder}
        title="Neuer Ordner"
        aria-label="Neuer Ordner"
      >
        <IconNewFolder />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onDelete}
        disabled={deleteDisabled}
        title="Auswahl löschen"
        aria-label="Auswahl löschen"
      >
        <IconTrash />
      </button>
      {onUploadFiles ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onUploadFiles}
          disabled={uploadFilesDisabled}
          title="Dateien vom Rechner hochladen"
          aria-label="Dateien vom Rechner hochladen"
        >
          <IconUploadFiles />
        </button>
      ) : null}
      {onUploadFolder ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onUploadFolder}
          disabled={uploadFolderDisabled}
          title="Ordner vom Rechner hochladen"
          aria-label="Ordner vom Rechner hochladen"
        >
          <IconUploadFolder />
        </button>
      ) : null}
      {onExportSelection ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onExportSelection}
          disabled={exportSelectionDisabled}
          title="Auswahl exportieren"
          aria-label="Auswahl exportieren"
        >
          <IconSaveExport />
        </button>
      ) : null}
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onTerminal}
        title="Zum Terminal"
        aria-label="Zum Terminal"
      >
        <IconTerminal />
      </button>
    </>
  );
}
