import logoTerminal from "../../../../../../img/logo_terminal.png";

export function AppSettingsAboutTab() {
  return (
    <div className="settings-stack">
      <section className="settings-card about-hero">
        <header className="settings-card-head">
          <h3>About</h3>
          <p className="settings-card-lead">NoSuckShell — SSH hosts and sessions in one workspace.</p>
        </header>
        <img src={logoTerminal} alt="NoSuckShell hero" className="about-hero-image" />
        <p className="settings-card-lead">Connections, split panes, and optional keyboard broadcast.</p>
      </section>
    </div>
  );
}
