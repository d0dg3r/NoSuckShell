type Props = {
  onUp: () => void;
  upDisabled: boolean;
  onRefresh: () => void;
  onTerminal: () => void;
  onRoot: () => void;
  /** Show filesystem-root jump (local: `/`, remote: `/`). */
  showRoot?: boolean;
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

export function FilePaneToolbar({ onUp, upDisabled, onRefresh, onTerminal, onRoot, showRoot = true }: Props) {
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
        onClick={onTerminal}
        title="Zum Terminal"
        aria-label="Zum Terminal"
      >
        <IconTerminal />
      </button>
    </>
  );
}
