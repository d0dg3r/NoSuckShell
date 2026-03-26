type Props = {
  onUp: () => void;
  upDisabled: boolean;
  onRefresh: () => void;
  onTerminal: () => void;
  onRoot: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onEditFile: () => void;
  editFileDisabled: boolean;
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
  /** When false, hide the terminal / "Back to terminal" control (NSS-Commander file view). */
  showBackToTerminalButton?: boolean;
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

function IconNewFile() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round" />
      <path d="M14 2v6h6M12 18v-6M9 15h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEditFile() {
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4 11.5-11.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function FilePaneToolbar({
  onUp,
  upDisabled,
  onRefresh,
  onTerminal,
  onRoot,
  onNewFolder,
  onNewFile,
  onEditFile,
  editFileDisabled,
  onDelete,
  deleteDisabled,
  showRoot = true,
  onUploadFiles,
  uploadFilesDisabled = true,
  onUploadFolder,
  uploadFolderDisabled = true,
  onExportSelection,
  exportSelectionDisabled = true,
  showBackToTerminalButton = true,
}: Props) {
  return (
    <>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onUp}
        disabled={upDisabled}
        title="Parent folder"
        aria-label="Parent folder"
      >
        <IconUp />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onRefresh}
        title="Refresh"
        aria-label="Refresh"
      >
        <IconRefresh />
      </button>
      {showRoot ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onRoot}
          title="Filesystem root (/)"
          aria-label="Filesystem root"
        >
          <IconRoot />
        </button>
      ) : null}
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onNewFolder}
        title="New folder"
        aria-label="New folder"
      >
        <IconNewFolder />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onNewFile}
        title="New text file"
        aria-label="New text file"
      >
        <IconNewFile />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onEditFile}
        disabled={editFileDisabled}
        title="Edit selected file"
        aria-label="Edit selected file"
      >
        <IconEditFile />
      </button>
      <button
        type="button"
        className="btn file-pane-toolbar-btn"
        onClick={onDelete}
        disabled={deleteDisabled}
        title="Delete selection"
        aria-label="Delete selection"
      >
        <IconTrash />
      </button>
      {onUploadFiles ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onUploadFiles}
          disabled={uploadFilesDisabled}
          title="Upload files from computer"
          aria-label="Upload files from computer"
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
          title="Upload folder from computer"
          aria-label="Upload folder from computer"
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
          title="Export selection"
          aria-label="Export selection"
        >
          <IconSaveExport />
        </button>
      ) : null}
      {showBackToTerminalButton ? (
        <button
          type="button"
          className="btn file-pane-toolbar-btn"
          onClick={onTerminal}
          title="Back to terminal"
          aria-label="Back to terminal"
        >
          <IconTerminal />
        </button>
      ) : null}
    </>
  );
}
