import {
  REPO_ISSUES_URL,
  REPO_SECURITY_URL,
  REPO_URL,
  REPO_CHANGELOG_URL,
} from "../features/repo-links";
import { APP_ONE_LINE, HELP_SUPPORT_INTRO } from "../features/help-app-copy";

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

/** Where to find major settings (balanced reference). */
const welcomeSections: HelpSection[] = [
  {
    title: "Finding settings",
    rows: [
      {
        action: "Connection",
        mouse: "Hosts, SSH directory and raw config, PROXMUX clusters.",
        keys: "-",
      },
      {
        action: "Identity Store",
        mouse: "Users, keys, groups, tags, and per-host bindings.",
        keys: "-",
      },
      {
        action: "Workspace",
        mouse: "Views, layout and navigation (splits, broadcast, quick connect), files and export.",
        keys: "-",
      },
      {
        action: "Plugins",
        mouse: "Built-in plugins, store catalog, license token.",
        keys: "-",
      },
      {
        action: "Interface",
        mouse: "Appearance and keyboard (shortcuts, leader key).",
        keys: "-",
      },
      {
        action: "Data & Backup",
        mouse: "Encrypted backup export and import.",
        keys: "-",
      },
      {
        action: "Help & info",
        mouse: "This Help page and About (version and links).",
        keys: "-",
      },
    ],
  },
];

const interactionSections: HelpSection[] = [
  {
    title: "Host list",
    rows: [
      { action: "Select a host", mouse: "Single-click a row to select it for editing or actions.", keys: "-" },
      {
        action: "Open SSH in a pane",
        mouse: "Double-click a row, or press Enter / Space when the row is focused.",
        keys: "Enter or Space when focused",
      },
      {
        action: "Drag a host into the grid",
        mouse: "Drag from the list onto pane drop zones (see Drag and drop).",
        keys: "-",
      },
      { action: "Favorite", mouse: "Use the star on the row.", keys: "-" },
      { action: "Edit host details", mouse: "Use the row menu (⋮).", keys: "-" },
      {
        action: "Connect in another workspace",
        mouse: "Right-click the row → choose a workspace when multiple workspaces exist.",
        keys: "-",
      },
    ],
  },
  {
    title: "Panes, terminal, and menus",
    rows: [
      { action: "Focus a pane", mouse: "Click inside the pane.", keys: "-" },
      { action: "Pane menu", mouse: "Right-click the pane.", keys: "-" },
      { action: "Split / resize", mouse: "Toolbar or context menu; drag split dividers.", keys: "-" },
      {
        action: "New local terminal / Quick connect",
        mouse: "Pane context menu (same as the global shortcut when configured).",
        keys: "-",
      },
      { action: "Open Settings", mouse: "Pane context menu (same as the global shortcut when configured).", keys: "-" },
      {
        action: "Type in the terminal",
        mouse: "With focus in the terminal, keys go to the shell unless a chord is handled globally.",
        keys: "—",
      },
    ],
  },
  {
    title: "Broadcast",
    rows: [
      {
        action: "Turn broadcast on or off",
        mouse: "Pane toolbar icon, or Settings → Layout & navigation.",
        keys: "-",
      },
      {
        action: "Choose targets",
        mouse: "Target and “all panes” controls on the toolbar or context menu.",
        keys: "-",
      },
      { action: "Status", mouse: "Session footer shows on/off and target count.", keys: "-" },
    ],
  },
  {
    title: "Drag and drop",
    rows: [
      { action: "Open on empty pane", mouse: "Drop a host onto an empty pane.", keys: "-" },
      { action: "Split", mouse: "Drop onto Top / Left / Right / Bottom zones.", keys: "-" },
      {
        action: "Replace session",
        mouse: "Drop onto the center of a pane that already has a session.",
        keys: "-",
      },
      {
        action: "Move or duplicate session",
        mouse: "Drag from the session toolbar; center drop on same pane can duplicate.",
        keys: "-",
      },
      {
        action: "Send to another workspace",
        mouse: "Right-click pane → Send to … when multiple workspaces exist.",
        keys: "-",
      },
    ],
  },
  {
    title: "File browser (semantic colors)",
    rows: [
      {
        action: "Color groups",
        mouse:
          "File and folder names use soft tints (archives, scripts, executables, media, code, text, data). This is a visual aid, not a security label.",
        keys: "-",
      },
      {
        action: "Customize",
        mouse: "Settings → Files & export: toggle semantic colors and adjust per category.",
        keys: "-",
      },
    ],
  },
  {
    title: "File browser (NSS-Commander)",
    rows: [
      {
        action: "Copy to other pane (file browser)",
        mouse: "When the file workspace plugin is enabled, copy selection to the paired pane where supported.",
        keys: "-",
      },
      {
        action: "Switch file pane (file browser)",
        mouse: "Move focus between local and remote file panes in the workspace.",
        keys: "-",
      },
    ],
  },
  {
    title: "Layouts and navigation",
    rows: [
      { action: "Saved layouts", mouse: "Footer “Layouts” — templates and cleanup options.", keys: "-" },
      { action: "Sidebar views", mouse: "All, Favorites, and custom views from Settings → Views.", keys: "-" },
      {
        action: "Narrow / stacked layout",
        mouse: "Hosts | Terminal tab bar; pager controls when many panes.",
        keys: "-",
      },
    ],
  },
];

/** SSH + Identity merged: host keys, proxies, then store concepts. */
const sshIdentitySections: HelpSection[] = [
  {
    title: "SSH sessions (terminal)",
    rows: [
      {
        action: "How sessions start",
        mouse:
          "The app launches the system OpenSSH client in a PTY. Options come from the resolved host (SSH config + app metadata + Identity Store + plugins).",
        keys: "-",
      },
      {
        action: "Host key trust",
        mouse:
          "OpenSSH may prompt for new or changed keys. The app can show a trust modal. Per-host policy lives in host settings and metadata.",
        keys: "-",
      },
      {
        action: "Auto-accept new keys",
        mouse:
          "Host menu → Host key verification → Auto-accept new keys (StrictHostKeyChecking=accept-new). Useful behind ProxyJump where prompts are easy to miss.",
        keys: "-",
      },
      {
        action: "Quick connect trust",
        mouse:
          "Settings → Layout & navigation: optional auto-trust for one-off Quick connect sessions.",
        keys: "-",
      },
    ],
  },
  {
    title: "ProxyJump and ProxyCommand",
    rows: [
      {
        action: "Jump via saved host",
        mouse:
          "Host form → Proxy: Jump shortcut lists aliases; you can still type full ProxyJump (multi-hop supported by OpenSSH).",
        keys: "-",
      },
      {
        action: "Bastion tag",
        mouse:
          "Mark a host as bastion so it appears in jump shortcuts once configured.",
        keys: "-",
      },
      {
        action: "ProxyCommand presets",
        mouse: "Pick a preset or edit the command for your environment.",
        keys: "-",
      },
      {
        action: "SFTP limitation",
        mouse:
          "The file browser uses direct TCP (libssh2), not ProxyJump/ProxyCommand. Use a reachable address or work through a terminal session over a bastion.",
        keys: "-",
      },
    ],
  },
  {
    title: "Identity Store",
    rows: [
      {
        action: "Purpose",
        mouse:
          "Central users, SSH keys (path or encrypted material), groups, and tags — linked through per-host bindings.",
        keys: "-",
      },
      {
        action: "Host bindings",
        mouse:
          "Settings → Identity Store → Hosts: choose the config host, optional store user, keys, tags, and proxy overrides, then save.",
        keys: "-",
      },
      {
        action: "Resolution order",
        mouse:
          "At connect time, the app merges OpenSSH config for the host with the binding and linked user (user, HostName, keys, ProxyJump, ProxyCommand, etc.).",
        keys: "-",
      },
      {
        action: "Passphrase-protected keys",
        mouse:
          "Decrypted in memory for the session; plaintext key material is not written back to disk by the app.",
        keys: "-",
      },
    ],
  },
];

const proxmuxSections: HelpSection[] = [
  {
    title: "PROXMUX basics",
    rows: [
      {
        action: "What it is",
        mouse:
          "Built-in Proxmox VE integration: clusters, inventory in the sidebar when the plugin is enabled and entitled, and guest consoles.",
        keys: "-",
      },
      {
        action: "Enable",
        mouse: "Settings → Plugins: enable the PROXMUX plugin. Some builds require a license entitlement.",
        keys: "-",
      },
      {
        action: "Clusters",
        mouse:
          "Settings → Connection → PROXMUX: add cluster URL, credentials, TLS options. Plaintext cluster secrets can be encrypted with NOSUCKSHELL_MASTER_KEY or nosuckshell.master.key — see UI on that tab.",
        keys: "-",
      },
    ],
  },
  {
    title: "TLS and consoles",
    rows: [
      {
        action: "Certificate issues",
        mouse:
          "For self-signed or private CA: Allow insecure TLS and/or paste a trusted PEM; confirm when the leaf fingerprint changes.",
        keys: "-",
      },
      {
        action: "Where consoles open",
        mouse:
          "Choose embedded pane vs system browser for HTML5 / noVNC / SPICE-style consoles on the PROXMUX settings tab.",
        keys: "-",
      },
      {
        action: "Embedded path",
        mouse:
          "Embedded QEMU noVNC and LXC views use a local WebSocket bridge; TLS policy matches API calls.",
        keys: "-",
      },
    ],
  },
];

const dataPrivacySections: HelpSection[] = [
  {
    title: "On-disk and config data",
    rows: [
      {
        action: "SSH config",
        mouse:
          "Managed Host blocks live in your effective SSH config (Settings → SSH). The app only edits entries it owns.",
        keys: "-",
      },
      {
        action: "nosuckshell.metadata.json",
        mouse: "Favorites, tags, last used, host-key policy, default user — next to the active SSH directory.",
        keys: "-",
      },
      {
        action: "Identity Store file",
        mouse: "Encrypted JSON under the app data area; use Backup to export safely.",
        keys: "-",
      },
      {
        action: "Layouts and views",
        mouse: "Separate JSON files for layout and sidebar view profiles.",
        keys: "-",
      },
      {
        action: "nosuckshell.plugins.json / nosuckshell.license.json",
        mouse: "Plugin toggles and verified license payload next to the active SSH directory.",
        keys: "-",
      },
      {
        action: "PROXMUX config",
        mouse: "nosuckshell.proxmux.v1.json — see PROXMUX settings for encryption options.",
        keys: "-",
      },
    ],
  },
  {
    title: "Privacy and logs",
    rows: [
      {
        action: "Passwords",
        mouse:
          "Interactive SSH passwords go to the PTY; the app does not log them. Backup passwords exist only in memory for the current import/export.",
        keys: "-",
      },
      {
        action: "Backups",
        mouse:
          "Exports are encrypted (Argon2id + authenticated encryption). Keep the password safe; it cannot be recovered by the app.",
        keys: "-",
      },
    ],
  },
];

const pluginsLicenseSections: HelpSection[] = [
  {
    title: "Plugins",
    rows: [
      {
        action: "Built-in plugins",
        mouse:
          "Ship in the desktop binary (e.g. NSS-Commander file workspace, PROXMUX). Toggle under Settings → Plugins.",
        keys: "-",
      },
      {
        action: "Entitlements",
        mouse:
          "Some features require entitlement strings carried in a signed license token. The signature is verified offline.",
        keys: "-",
      },
    ],
  },
  {
    title: "License token",
    rows: [
      {
        action: "Activate",
        mouse: "Settings → Plugins: paste the token, then activate. Stored as nosuckshell.license.json when valid.",
        keys: "-",
      },
      {
        action: "“Waiting on entitlement”",
        mouse:
          "The plugin is on but your token does not include the required entitlement. Compare with Settings → Plugins and your purchase.",
        keys: "-",
      },
      {
        action: "Clear",
        mouse: "Clear the license from the Plugins tab to remove the local token file.",
        keys: "-",
      },
    ],
  },
];

const faqSections: HelpSection[] = [
  {
    title: "Common questions",
    rows: [
      {
        action: "Quick connect vs saved host",
        mouse:
          "Quick connect is ephemeral unless you save the host. Saved hosts live in the sidebar and SSH config.",
        keys: "-",
      },
      {
        action: "Why SFTP ignores my bastion",
        mouse:
          "File browser uses direct TCP, not OpenSSH ProxyJump. Use a direct route or use the terminal over the bastion.",
        keys: "-",
      },
      {
        action: "Restore backup",
        mouse: "Settings → Data & Backup → Import with the file path and export password.",
        keys: "-",
      },
      {
        action: "PROXMUX TLS errors",
        mouse: "Adjust Allow insecure TLS or trusted PEM on the PROXMUX connection tab.",
        keys: "-",
      },
      {
        action: "Sidebar empty after enabling PROXMUX",
        mouse: "Add at least one cluster under Settings → Connection → PROXMUX with valid URL and credentials.",
        keys: "-",
      },
      {
        action: "Reset appearance",
        mouse: "Settings → Interface → Appearance → Reset visual style.",
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
        action: "SFTP and proxies",
        mouse: "No ProxyJump/ProxyCommand on the SFTP path; see FAQ.",
        keys: "-",
      },
      {
        action: "Installers",
        mouse: "Installers may be unsigned; the OS may show a security prompt.",
        keys: "-",
      },
    ],
  },
];

const helpChapters: HelpChapter[] = [
  {
    id: "help-welcome",
    title: "Welcome",
    intro: [APP_ONE_LINE, "Open Settings from any pane menu or the sidebar. Use the table of contents below to jump to a topic."],
    sections: welcomeSections,
  },
  {
    id: "help-interactions",
    title: "Interactions",
    intro: [
      "Mouse-first actions for hosts, panes, drag-and-drop, broadcast, and the file browser. Keyboard shortcuts are listed under Keyboard shortcuts and in Settings → Keyboard.",
    ],
    sections: interactionSections,
  },
  {
    id: "help-ssh-identity",
    title: "SSH and Identity",
    intro: [
      "Terminal SSH uses OpenSSH with merged configuration. The Identity Store adds structured users, keys, and bindings on top of your config.",
    ],
    sections: sshIdentitySections,
  },
  {
    id: "help-proxmux",
    title: "PROXMUX",
    intro: ["Optional Proxmox VE integration when the plugin is enabled, configured, and entitled."],
    sections: proxmuxSections,
  },
  {
    id: "help-data",
    title: "Data, secrets, and privacy",
    intro: ["Where files live, what is encrypted, and what the app avoids logging."],
    sections: dataPrivacySections,
  },
  {
    id: "help-plugins",
    title: "Plugins and license",
    intro: ["Built-in plugins and how license tokens unlock entitlements in release builds."],
    sections: pluginsLicenseSections,
  },
  {
    id: "help-faq",
    title: "FAQ",
    intro: [],
    sections: faqSections,
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
 * In-app Help: TOC, chapters, shortcuts cheatsheet, support.
 * Content is English-only. Update with product changes; see docs/USER_HELP.md.
 */
export type HelpPanelProps = {
  resolveHelpShortcutLabel?: (action: string) => string | undefined;
  shortcutCheatsheetLines?: Array<{ label: string; keys: string }>;
  onOpenUrl?: (url: string) => void | Promise<void>;
};

export function HelpPanel(props: HelpPanelProps = {}) {
  const { resolveHelpShortcutLabel, shortcutCheatsheetLines, onOpenUrl } = props;

  return (
    <section className="help-panel">
      <header className="help-panel-header">
        <h3>Help</h3>
        <p className="muted-copy">
          Reference for shortcuts, workflows, data locations, PROXMUX, plugins, and support. Topic tables have three
          columns; if the panel is narrow, scroll horizontally inside each table to see Details and Keyboard.
        </p>
      </header>

      {shortcutCheatsheetLines && shortcutCheatsheetLines.length > 0 ? (
        <section id="help-shortcuts" className="help-chapter" aria-label="Keyboard shortcuts">
          <h3 className="help-chapter-title">Keyboard shortcuts</h3>
          <p className="muted-copy help-chapter-intro">
            Chords are physical keys (layout-independent). Rebind under Settings → Keyboard. The leader chord opens a
            second step (default: open this Help’s shortcut list via <strong>K</strong> after leader). With focus in a
            terminal, most keys go to the shell; global chords and Escape (overlays) still apply.
          </p>
          <div className="help-table-wrap">
            <table className="help-table help-table--shortcuts">
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

      <nav className="help-toc" aria-label="Help contents">
        {shortcutCheatsheetLines && shortcutCheatsheetLines.length > 0 ? (
          <a className="help-toc-link" href="#help-shortcuts">
            Keyboard shortcuts
          </a>
        ) : null}
        {helpChapters.map((ch) => (
          <a key={ch.id} className="help-toc-link" href={`#${ch.id}`}>
            {ch.title}
          </a>
        ))}
        <a className="help-toc-link" href="#help-support">
          Get support
        </a>
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

      <section id="help-support" className="help-chapter">
        <h3 className="help-chapter-title">Get support</h3>
        <p className="muted-copy help-chapter-intro">{HELP_SUPPORT_INTRO}</p>
        <p className="muted-copy help-chapter-intro">
          Repository: <code className="inline-code">{REPO_URL}</code> · Changelog:{" "}
          <code className="inline-code">{REPO_CHANGELOG_URL}</code>
        </p>
        <div className="help-support-actions">
          {onOpenUrl ? (
            <>
              <button type="button" className="btn" onClick={() => void onOpenUrl(REPO_ISSUES_URL)}>
                Open GitHub Issues
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => void onOpenUrl(REPO_SECURITY_URL)}>
                Report a security issue
              </button>
            </>
          ) : (
            <p className="muted-copy">
              Issues: <code>{REPO_ISSUES_URL}</code>
            </p>
          )}
        </div>
      </section>

      <p className="muted-copy help-note">
        For cryptographic details and architecture, see the repository docs (architecture, backup-security,
        licensing).
      </p>
    </section>
  );
}
