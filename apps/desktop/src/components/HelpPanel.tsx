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
    title: "Host list",
    rows: [
      {
        action: "Select host (for editing)",
        mouse: "Single-click host row",
        keys: "-",
      },
      {
        action: "Open SSH in a new pane",
        mouse: "Double-click host row",
        keys: "When the host row is focused: Enter or Space",
      },
      {
        action: "Drag host into the grid",
        mouse: "Drag host row onto pane drop zones (see Drag & drop)",
        keys: "-",
      },
      {
        action: "Toggle favorite",
        mouse: "Star button on the row",
        keys: "-",
      },
      {
        action: "Edit host, tags, favorite",
        mouse: "⋮ button on the row",
        keys: "-",
      },
      {
        action: "Connect in a specific workspace",
        mouse: "Right-click host row → workspace (when multiple workspaces exist)",
        keys: "-",
      },
    ],
  },
  {
    title: "Pane, terminal & context menu",
    rows: [
      { action: "Focus pane", mouse: "Click pane", keys: "-" },
      { action: "Pane context menu", mouse: "Right-click pane", keys: "-" },
      { action: "Split pane", mouse: "Split buttons on pane toolbar or context menu", keys: "-" },
      { action: "Resize splits", mouse: "Drag split divider", keys: "-" },
      { action: "New local terminal / Quick connect", mouse: "Context menu on pane", keys: "-" },
      { action: "Pause or resume auto-arrange", mouse: "Context menu (manual layout / restore)", keys: "-" },
      { action: "Close session / close pane", mouse: "Toolbar icons or context menu", keys: "-" },
      { action: "Open Settings", mouse: "Context menu on pane", keys: "-" },
      {
        action: "Type in terminal",
        mouse: "Focus terminal",
        keys: "Keystrokes go to the shell (no global key capture)",
      },
    ],
  },
  {
    title: "Broadcast input",
    rows: [
      {
        action: "Enable / disable broadcast",
        mouse: "Broadcast icon on pane toolbar, or Settings → Layout & Navigation",
        keys: "-",
      },
      {
        action: "Target this pane / all visible",
        mouse: "Target and “all panes” icons on pane toolbar, or context menu",
        keys: "-",
      },
      {
        action: "Clear targets / stop broadcast",
        mouse: "Context menu entries when broadcast is on",
        keys: "-",
      },
      {
        action: "See status",
        mouse: "Session footer shows enabled/disabled and target count",
        keys: "-",
      },
    ],
  },
  {
    title: "Drag & drop",
    rows: [
      {
        action: "Open host on empty pane",
        mouse: "Drag host onto empty pane (drop to open)",
        keys: "-",
      },
      {
        action: "Split with host",
        mouse: "Drag host onto Top / Left / Right / Bottom zone",
        keys: "-",
      },
      {
        action: "Replace session",
        mouse: "Drag host onto center (replace) on a pane that already has a session",
        keys: "-",
      },
      {
        action: "Move or duplicate session",
        mouse: "Drag session from toolbar; drop zone chooses pane / split; same-pane center duplicates",
        keys: "-",
      },
      {
        action: "Send session to another workspace",
        mouse: "Right-click pane → Send to … (when multiple workspaces)",
        keys: "-",
      },
    ],
  },
  {
    title: "Layouts & navigation",
    rows: [
      {
        action: "Layout command center",
        mouse: "Footer “Layouts” — saved layouts, templates, session cleanup",
        keys: "-",
      },
      {
        action: "Close all / close all + reset layout",
        mouse: "Layout command center (second click confirms)",
        keys: "-",
      },
      {
        action: "Sidebar views",
        mouse: "Tabs: All, Favorites, custom views (filter/sort from Settings → Views)",
        keys: "-",
      },
      {
        action: "Narrow / stacked UI",
        mouse: "Hosts | Terminal tab bar; terminal pager ‹ › for multiple panes",
        keys: "-",
      },
    ],
  },
];

// Keep this cheatsheet in sync with interaction logic in App.tsx and context-actions.ts.
export function HelpPanel() {
  return (
    <section className="help-panel">
      <header className="help-panel-header">
        <h3>Help &amp; cheatsheet</h3>
        <p className="muted-copy">
          NoSuckShell combines host management, split panes, drag-and-drop, and optional keyboard broadcast in one
          workspace. This page summarizes the main mouse and keyboard interactions.
        </p>
      </header>

      {helpSections.map((section) => (
        <section key={section.title} className="help-section">
          <h4>{section.title}</h4>
          <div className="help-table-wrap">
            <table className="help-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Mouse / gesture</th>
                  <th>Keyboard</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={`${section.title}:${row.action}`}>
                    <td>{row.action}</td>
                    <td>{row.mouse}</td>
                    <td>{row.keys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="muted-copy help-note">
        While a terminal is focused, keys are sent to the shell—there are no global app hotkeys that steal typing.
        Layout, broadcast, and other actions use the toolbar, context menus, footer, or Settings.
      </p>
    </section>
  );
}
