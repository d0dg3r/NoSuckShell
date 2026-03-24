type HelpRow = {
  action: string;
  mouse: string;
  keys: string;
};

type HelpSection = {
  title: string;
  rows: HelpRow[];
};

type HelpChapter = {
  id: string;
  title: string;
  intro?: readonly string[];
  sections: HelpSection[];
};

const interactionSections: HelpSection[] = [
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
        action: "Edit host, tags, favorite, SSH options",
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
    title: "File browser",
    rows: [
      {
        action: "What the colors mean",
        mouse:
          "Folder and file names use soft tints (archives, scripts, executables, media, code, text, data). Same idea as many terminal listings—quick visual scan, not a security label.",
        keys: "-",
      },
      {
        action: "Folders",
        mouse: "Directories use a distinct link color so they read separately from files.",
        keys: "-",
      },
      {
        action: "Executables",
        mouse:
          "Unix +x bits (or .exe / .bin / …) use the executable tint. Shell scripts (.sh, .ps1, …) stay in the script tint even when executable.",
        keys: "-",
      },
      {
        action: "Turn off or customize",
        mouse: "Settings → Files & export: toggle semantic colors and pick per-category colors; this page explains the groups.",
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

const sshSections: HelpSection[] = [
  {
    title: "Host key verification (saved hosts)",
    rows: [
      {
        action: "Interactive prompt (default)",
        mouse:
          "OpenSSH may ask to confirm new or changed host keys. A modal can offer “Trust host” and optional “Save as default”.",
        keys: "-",
      },
      {
        action: "Auto-accept new keys",
        mouse:
          "Host settings (⋮) → Host key verification → “Auto-accept new keys”. Uses StrictHostKeyChecking=accept-new so new keys are stored without a yes/no prompt—important for ProxyJump where prompts can be easy to miss.",
        keys: "-",
      },
      {
        action: "Accept any key (insecure)",
        mouse:
          "Same dropdown, last option—disables meaningful host-key checks (MITM risk). Only for broken or lab setups.",
        keys: "-",
      },
      {
        action: "Quick connect",
        mouse:
          "Layout & Navigation → “Auto-trust host keys for quick connect” sends accept-new for one-off sessions (no saved host entry).",
        keys: "-",
      },
    ],
  },
  {
    title: "ProxyJump and ProxyCommand",
    rows: [
      {
        action: "Jump via another saved host",
        mouse:
          "Host form → Proxy section: “Jump shortcut” lists host aliases; you can still type any ProxyJump string (comma-separated hops supported by OpenSSH). The bastion is a normal host entry, not a separate tab.",
        keys: "-",
      },
      {
        action: "Jump hosts (bastions)",
        mouse:
          "Host settings → check “Jump host (bastion)” to add the jumphost tag and include that alias in the shortcut list once at least one host is marked (until then, all aliases stay listed).",
        keys: "-",
      },
      {
        action: "ProxyCommand presets",
        mouse:
          "Preset dropdown fills common patterns (e.g. ssh -W %h:%p bastion, SOCKS via nc). Edit the command line to match your environment.",
        keys: "-",
      },
      {
        action: "Identity Store → Hosts",
        mouse:
          "Per-host binding: same jump shortcut + ProxyJump field, optional ProxyCommand preset and command line. Binding overrides win over store-user defaults where applicable.",
        keys: "-",
      },
      {
        action: "Identity Store → Users",
        mouse:
          "Optional default ProxyJump when a user is linked and the host binding leaves ProxyJump empty.",
        keys: "-",
      },
    ],
  },
];

const identitySections: HelpSection[] = [
  {
    title: "What the Identity Store does",
    rows: [
      {
        action: "Users, keys, groups, tags",
        mouse:
          "Central place for SSH identities (path or encrypted keys), people-shaped records, and taxonomy. Linked on each host binding.",
        keys: "-",
      },
      {
        action: "Host bindings",
        mouse:
          "Settings → Identity Store → Hosts: pick a config host, optional store user, keys, groups/tags, ProxyJump / ProxyCommand overrides, then Save host binding.",
        keys: "-",
      },
      {
        action: "Session resolution",
        mouse:
          "When you connect, the app merges ~/.ssh/config host fields with the binding and store user (user, HostName, keys, ProxyJump, ProxyCommand, etc.).",
        keys: "-",
      },
    ],
  },
];

const proxmuxSections: HelpSection[] = [
  {
    title: "PROXMUX (Proxmox)",
    rows: [
      {
        action: "What it is",
        mouse:
          "Optional built-in integration for Proxmox VE: one or more clusters, guest/resource listing in the sidebar when the plugin is enabled and entitled, and Proxmox web consoles.",
        keys: "-",
      },
      {
        action: "Configure",
        mouse:
          "Settings → Integrations → PROXMUX: cluster URLs, credentials, TLS options. Use Plugins & license if the feature is gated by a license entitlement.",
        keys: "-",
      },
      {
        action: "Sidebar",
        mouse:
          "When PROXMUX is available, a sidebar section lists clusters and guests; open consoles or SSH from the row actions where supported.",
        keys: "-",
      },
      {
        action: "Web console",
        mouse:
          "Choose whether Proxmox noVNC/SPICE/HTML5 consoles open inside an app pane or in your default browser (toggle on the PROXMUX settings tab).",
        keys: "-",
      },
      {
        action: "TLS and embedded consoles",
        mouse:
          "For private CA or self-signed HTTPS, use Allow insecure TLS and/or paste a trusted certificate PEM (confirm fingerprint changes when the leaf rotates). Embedded QEMU noVNC and LXC shells use a local WebSocket bridge to the cluster; the same TLS policy applies to Proxmox API calls.",
        keys: "-",
      },
    ],
  },
];

const settingsSections: HelpSection[] = [
  {
    title: "Settings tabs (reference)",
    rows: [
      {
        action: "Connection",
        mouse: "Hosts (SSH config + host list) and SSH (SSH directory override and raw config editor).",
        keys: "-",
      },
      {
        action: "Identity Store",
        mouse: "Overview, Users, SSH keys, Groups, Tags — including per-host bindings (see Identity Store chapter).",
        keys: "-",
      },
      {
        action: "Workspace",
        mouse: "Views (filters/sort), Layout & navigation (splits, broadcast, quick connect), Files & export.",
        keys: "-",
      },
      {
        action: "Integrations",
        mouse: "PROXMUX (Proxmox) and Plugins & license (built-in plugins, license token).",
        keys: "-",
      },
      {
        action: "Interface",
        mouse: "Appearance (density, fonts, list tone, visual style reset) and Keyboard (shortcuts and leader key).",
        keys: "-",
      },
      { action: "Data & Backup", mouse: "Encrypted backup export/import.", keys: "-" },
      { action: "Help & info", mouse: "This Help page and About (version and links).", keys: "-" },
    ],
  },
];

const dataSections: HelpSection[] = [
  {
    title: "Where data lives",
    rows: [
      {
        action: "SSH config",
        mouse:
          "Managed host blocks live in your effective SSH config file (see Settings → SSH). The app can read/write Host entries it manages.",
        keys: "-",
      },
      {
        action: "App metadata",
        mouse:
          "Favorites, tags, last used, host key policy, default SSH user name—stored alongside your SSH directory (e.g. nosuckshell.metadata.json).",
        keys: "-",
      },
      {
        action: "Entity store",
        mouse: "Encrypted-at-rest JSON for Identity Store objects (location under the app’s data dir; use Backup to export safely).",
        keys: "-",
      },
      {
        action: "Layouts & views",
        mouse: "Saved layout profiles and view profiles as separate persisted files.",
        keys: "-",
      },
    ],
  },
  {
    title: "Backups",
    rows: [
      {
        action: "Encrypted backup",
        mouse:
          "Settings → Data & Backup: export packs SSH config, metadata, store, layouts, and view profiles. Keep the password safe; see project docs for the threat model.",
        keys: "-",
      },
    ],
  },
];

const limitationsSections: HelpSection[] = [
  {
    title: "Known limitations",
    rows: [
      {
        action: "SFTP file browser",
        mouse:
          "Uses a direct TCP connection (libssh2). ProxyJump / ProxyCommand are not applied—use a reachable HostName or open files via a terminal session through a bastion.",
        keys: "-",
      },
      {
        action: "Signing",
        mouse: "Installers are not code-signed by default; your OS may show a security prompt.",
        keys: "-",
      },
    ],
  },
];

const helpChapters: HelpChapter[] = [
  {
    id: "help-overview",
    title: "Overview",
    intro: [
      "NoSuckShell is a workspace for saved SSH hosts, split terminals, drag-and-drop, optional input broadcast, a dual-pane file browser, and optional PROXMUX (Proxmox) integration. Use the links below to jump between chapters.",
      "While a terminal pane is focused, keystrokes go to the shell—use the toolbar, context menus, footer, or Settings for app actions.",
    ],
    sections: [],
  },
  {
    id: "help-interactions",
    title: "Interactions cheatsheet",
    intro: [
      "Quick reference for mouse and keyboard behavior. For trust prompts, see SSH and host keys.",
    ],
    sections: interactionSections,
  },
  {
    id: "help-ssh",
    title: "SSH, proxies, and host keys",
    intro: [
      "Terminal SSH is spawned by the system OpenSSH client with options derived from each host’s saved settings and app metadata.",
    ],
    sections: sshSections,
  },
  {
    id: "help-identity",
    title: "Identity Store",
    intro: [
      "Optional but powerful: link store users and keys to hosts so sessions pick up the right credentials and proxy defaults.",
    ],
    sections: identitySections,
  },
  {
    id: "help-proxmux",
    title: "PROXMUX",
    intro: [
      "Optional Proxmox VE integration: clusters, guest lists, and web consoles. Requires the built-in PROXMUX plugin and, where applicable, license entitlements.",
    ],
    sections: proxmuxSections,
  },
  {
    id: "help-settings",
    title: "Settings",
    intro: ["All panels open from the context menu on a terminal pane (or the sidebar gear where available)."],
    sections: settingsSections,
  },
  {
    id: "help-data",
    title: "Data, files, and backups",
    intro: [],
    sections: dataSections,
  },
  {
    id: "help-limits",
    title: "Limitations",
    intro: [],
    sections: limitationsSections,
  },
];

function renderSectionTable(
  section: HelpSection,
  resolveHelpShortcutLabel: ((action: string) => string | undefined) | undefined,
) {
  return (
    <section key={section.title} className="help-section">
      <h4>{section.title}</h4>
      <div className="help-table-wrap">
        <table className="help-table">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Details</th>
              <th>Keyboard</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => {
              const resolved = resolveHelpShortcutLabel?.(row.action);
              const keysCell = resolved && resolved.length > 0 ? resolved : row.keys;
              return (
                <tr key={`${section.title}:${row.action}`}>
                  <td>{row.action}</td>
                  <td>{row.mouse}</td>
                  <td>{keysCell}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * In-app help: chapters + cheatsheet tables.
 * Keep in sync with App.tsx, context-actions.ts, features/file-pane-name-kind.ts,
 * host metadata / session SSH flags, Identity Store UI, app settings tabs, and PROXMUX.
 */
export type HelpPanelProps = {
  resolveHelpShortcutLabel?: (action: string) => string | undefined;
  shortcutCheatsheetLines?: Array<{ label: string; keys: string }>;
};

export function HelpPanel(props: HelpPanelProps = {}) {
  const { resolveHelpShortcutLabel, shortcutCheatsheetLines } = props;
  return (
    <section className="help-panel">
      <header className="help-panel-header">
        <h3>Help</h3>
        <p className="muted-copy">
          Full in-app reference: interactions, SSH and trust behavior, Identity Store, settings, and data locations.
        </p>
      </header>

      {shortcutCheatsheetLines && shortcutCheatsheetLines.length > 0 ? (
        <section className="help-section" aria-label="Keyboard shortcuts overview">
          <h4>Keyboard shortcuts</h4>
          <p className="muted-copy help-chapter-intro">
            Rebind shortcuts in Settings → Keyboard. Use the leader key, then <strong>K</strong> (default) to jump back
            here. Chords use physical keys (layout-independent). In a focused terminal, only modified shortcuts and
            Escape (when a modal is open) are handled by the app.
          </p>
          <div className="help-table-wrap">
            <table className="help-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Shortcut</th>
                </tr>
              </thead>
              <tbody>
                {shortcutCheatsheetLines.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.keys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <nav className="help-toc" aria-label="Help chapters">
        {helpChapters.map((ch) => (
          <a key={ch.id} className="help-toc-link" href={`#${ch.id}`}>
            {ch.title}
          </a>
        ))}
      </nav>

      {helpChapters.map((chapter) => (
        <section key={chapter.id} id={chapter.id} className="help-chapter">
          <h3 className="help-chapter-title">{chapter.title}</h3>
          {(chapter.intro ?? []).map((paragraph) => (
            <p key={paragraph} className="muted-copy help-chapter-intro">
              {paragraph}
            </p>
          ))}
          {chapter.sections.map((sec) => renderSectionTable(sec, resolveHelpShortcutLabel))}
        </section>
      ))}

      <p className="muted-copy help-note">
        For release notes and security details about backups, see the documentation shipped with the repository
        (CHANGELOG, architecture, backup-security).
      </p>
    </section>
  );
}
