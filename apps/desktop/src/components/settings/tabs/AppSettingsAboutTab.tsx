import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openExternalUrl } from "../../../tauri-api";
import {
  REPO_URL,
  REPO_ISSUES_URL,
  REPO_SECURITY_URL,
  REPO_CHANGELOG_URL,
  REPO_RELEASES_URL,
} from "../../../features/repo-links";
import { APP_ONE_LINE, ABOUT_SUPPORT_SUMMARY } from "../../../features/help-app-copy";
import logoTerminal from "../../../../../../img/logo_terminal.png";

function openUrl(url: string) {
  void openExternalUrl(url).catch(() => undefined);
}

export function AppSettingsAboutTab() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then((v) => setVersion(v))
      .catch(() => setVersion(null));
  }, []);

  return (
    <div className="settings-stack">
      <section className="settings-card about-hero">
        <header className="settings-card-head">
          <h3>NoSuckShell</h3>
          {version ? (
            <p className="settings-card-lead about-version">Version {version}</p>
          ) : null}
          <p className="settings-card-lead">{APP_ONE_LINE}</p>
        </header>
        <img src={logoTerminal} alt="NoSuckShell" className="about-hero-image" />
        <p className="settings-card-lead">
          Built with Tauri 2, React, and Rust. Full reference lives under Settings → Help & info → Help.
        </p>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h3>Links</h3>
        </header>
        <div className="about-links-grid">
          <button type="button" className="btn btn-settings-tool" onClick={() => openUrl(REPO_URL)}>
            GitHub repository
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => openUrl(REPO_RELEASES_URL)}>
            Releases
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => openUrl(REPO_CHANGELOG_URL)}>
            Changelog
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => openUrl(REPO_ISSUES_URL)}>
            Report a problem
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => openUrl(REPO_SECURITY_URL)}>
            Security policy
          </button>
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h3>License</h3>
          <p className="settings-card-lead">
            NoSuckShell source code is released under the <strong>MIT License</strong>. Some built-in plugins
            require a paid license token for entitlement-gated features in official release binaries — see{" "}
            <strong>Settings → Plugins</strong> to activate a token. All source code remains MIT and is freely
            inspectable.
          </p>
        </header>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h3>Get support</h3>
          <p className="settings-card-lead">{ABOUT_SUPPORT_SUMMARY}</p>
        </header>
        <div className="settings-actions-row">
          <button type="button" className="btn" onClick={() => openUrl(REPO_ISSUES_URL)}>
            Open GitHub Issues
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => openUrl(REPO_SECURITY_URL)}>
            Report a security issue
          </button>
        </div>
      </section>
    </div>
  );
}
