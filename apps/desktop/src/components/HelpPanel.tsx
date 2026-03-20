type HelpRow = {
  action: string;
  mouse: string;
  keys: string;
};

type HelpSection = {
  title: string;
  rows: HelpRow[];
};

const helpSections: HelpSection[] = [
  {
    title: "Hostliste",
    rows: [
      { action: "Host verbinden", mouse: "Doppelklick auf Host-Zeile", keys: "Host-Zeile fokussieren + Enter/Space" },
      { action: "Host in Pane ziehen", mouse: "Host-Zeile per Drag and Drop auf Pane", keys: "-" },
      { action: "Favorit toggeln", mouse: "Stern-Button in der Host-Zeile", keys: "-" },
      { action: "Host-Einstellungen", mouse: "Menue-Button (⋯) in der Host-Zeile", keys: "-" },
    ],
  },
  {
    title: "Pane & Terminal",
    rows: [
      { action: "Pane fokussieren", mouse: "Klick auf Pane", keys: "-" },
      { action: "Pane-Kontextaktionen", mouse: "Rechtsklick auf Pane", keys: "-" },
      { action: "Pane teilen", mouse: "Split-Buttons in der Pane-Toolbar", keys: "-" },
      { action: "Pane groesse aendern", mouse: "Split-Trenner ziehen", keys: "-" },
      { action: "Terminal-Eingabe", mouse: "Terminal fokussieren und tippen", keys: "Alle Tasten gehen direkt an die Shell" },
    ],
  },
  {
    title: "Drag & Drop Cheatsheet",
    rows: [
      { action: "Top/Left/Right/Bottom", mouse: "Host auf entsprechende Drop-Zone ziehen", keys: "-" },
      { action: "Replace", mouse: "Host auf Center-Zone (Replace) ziehen", keys: "-" },
      { action: "Host Drop Mode", mouse: "Footer: Spawn oder Move waehlen", keys: "-" },
      { action: "Move-Modus", mouse: "Existierende Session des Hosts in Ziel-Pane verschieben", keys: "-" },
    ],
  },
  {
    title: "Layout & Navigation",
    rows: [
      { action: "Close all", mouse: "Footer: Close all (mit Confirm-Schritt)", keys: "-" },
      { action: "Close + reset", mouse: "Footer: Close + reset (mit Confirm-Schritt)", keys: "-" },
      { action: "Layoutprofile laden", mouse: "Profil auswaehlen + Load-Button", keys: "-" },
      { action: "Mobile Ansicht", mouse: "Tabbar Hosts/Terminal + Pager ‹ ›", keys: "-" },
    ],
  },
];

// Keep this cheatsheet in sync with interaction logic in App.tsx and context-actions.ts.
export function HelpPanel() {
  return (
    <section className="help-panel">
      <header className="help-panel-header">
        <h3>Hilfe & Cheatsheet</h3>
        <p className="muted-copy">
          NoSuckShell kombiniert Host-Verwaltung, Split-Panes und schnelle Drag-and-Drop Workflows in einer Ansicht.
          Diese Uebersicht zeigt die wichtigsten Maus- und Tastaturfunktionen kompakt.
        </p>
      </header>

      {helpSections.map((section) => (
        <section key={section.title} className="help-section">
          <h4>{section.title}</h4>
          <div className="help-table-wrap">
            <table className="help-table">
              <thead>
                <tr>
                  <th>Aktion</th>
                  <th>Maus / Geste</th>
                  <th>Tastatur</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={`${section.title}:${row.action}`}>
                    <td>{row.action}</td>
                    <td>{row.mouse}</td>
                    <td>
                      {row.keys.includes("Enter") || row.keys.includes("Space") ? (
                        <span className="help-kbd-group">
                          <kbd className="help-kbd">Enter</kbd>
                          <span>/</span>
                          <kbd className="help-kbd">Space</kbd>
                        </span>
                      ) : (
                        row.keys
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="muted-copy help-note">
        Hinweis: Es gibt derzeit keine globalen App-Hotkeys im Settings-Dialog. Tastatureingaben im Terminal werden an
        die aktive Shell weitergegeben.
      </p>
    </section>
  );
}
