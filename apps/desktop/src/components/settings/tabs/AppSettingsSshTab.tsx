import { useState } from "react";
import { mergeManagedHostStarBlock } from "../../../features/ssh-config-managed-block";
import type { SshDirInfo } from "../../../types";
import type React from "react";
import { SettingsHelpHint } from "../SettingsHelpHint";

export type AppSettingsSshTabProps = {
  setError: (message: string) => void;
  setSshConfigRaw: React.Dispatch<React.SetStateAction<string>>;
  sshConfigRaw: string;
  onSaveSshConfig: () => Promise<void>;
  onExportResolvedOpensshConfig: (includeStrictHostKey: boolean) => Promise<void>;
  sshDirInfo: SshDirInfo | null;
  sshDirOverrideDraft: string;
  setSshDirOverrideDraft: (value: string) => void;
  onApplySshDirOverride: () => Promise<void>;
  onResetSshDirOverride: () => Promise<void>;
};

export function AppSettingsSshTab({
  setError,
  setSshConfigRaw,
  sshConfigRaw,
  onSaveSshConfig,
  onExportResolvedOpensshConfig,
  sshDirInfo,
  sshDirOverrideDraft,
  setSshDirOverrideDraft,
  onApplySshDirOverride,
  onResetSshDirOverride,
}: AppSettingsSshTabProps) {
  const [sshHostStarServerAliveInterval, setSshHostStarServerAliveInterval] = useState("");
  const [sshHostStarServerAliveCountMax, setSshHostStarServerAliveCountMax] = useState("");
  const [sshHostStarTcpKeepAlive, setSshHostStarTcpKeepAlive] = useState<"" | "yes" | "no">("");
  const [sshHostStarIdentityFile, setSshHostStarIdentityFile] = useState("");
  const [sshHostStarUser, setSshHostStarUser] = useState("");
  const [exportIncludeStrictHostKey, setExportIncludeStrictHostKey] = useState(true);

  const applyHostStarBlockToBuffer = () => {
    const lines: string[] = [];
    if (sshHostStarServerAliveInterval.trim()) {
      lines.push(`ServerAliveInterval ${sshHostStarServerAliveInterval.trim()}`);
    }
    if (sshHostStarServerAliveCountMax.trim()) {
      lines.push(`ServerAliveCountMax ${sshHostStarServerAliveCountMax.trim()}`);
    }
    if (sshHostStarTcpKeepAlive === "yes" || sshHostStarTcpKeepAlive === "no") {
      lines.push(`TCPKeepAlive ${sshHostStarTcpKeepAlive}`);
    }
    if (sshHostStarIdentityFile.trim()) {
      lines.push(`IdentityFile ${sshHostStarIdentityFile.trim()}`);
    }
    if (sshHostStarUser.trim()) {
      lines.push(`User ${sshHostStarUser.trim()}`);
    }
    if (lines.length === 0) {
      setError("Add at least one directive, or edit the raw config.");
      return;
    }
    setError("");
    setSshConfigRaw((prev) => mergeManagedHostStarBlock(prev, lines));
  };

  return (
    <div className="settings-stack settings-stack--equal-cols settings-stack--ssh">
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>SSH directory</h3>
            <SettingsHelpHint
              topic="SSH directory"
              description="Default is ~/.ssh (on Windows typically %USERPROFILE%\\.ssh). The identity store, config, and related files live under the active folder. Override must be an absolute path. After changing it, hosts and store reload from the new location."
            />
          </div>
          <p className="settings-card-lead">Active folder for config and keys; override must be absolute.</p>
        </header>
        {sshDirInfo && (
          <div className="ssh-dir-info-block settings-ssh-dir-kv">
            <p className="settings-card-lead ssh-dir-kv-line">
              <strong>Detected default:</strong> <code className="inline-code">{sshDirInfo.defaultPath}</code>
            </p>
            <p className="settings-card-lead ssh-dir-kv-line">
              <strong>Active:</strong> <code className="inline-code">{sshDirInfo.effectivePath}</code>
            </p>
            {sshDirInfo.userProfile ? (
              <p className="settings-card-lead ssh-dir-kv-line">
                <strong>USERPROFILE:</strong> <code className="inline-code">{sshDirInfo.userProfile}</code>
              </p>
            ) : null}
          </div>
        )}
        <label className="field">
          <span className="field-label">Custom SSH directory (optional)</span>
          <input
            className="input settings-path-input"
            value={sshDirOverrideDraft}
            onChange={(event) => setSshDirOverrideDraft(event.target.value)}
            placeholder={sshDirInfo?.defaultPath ?? "Absolute path to .ssh folder"}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="action-row">
          <button type="button" className="btn btn-settings-commit" onClick={() => void onApplySshDirOverride()}>
            Apply SSH directory
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => void onResetSshDirOverride()}>
            Use default
          </button>
        </div>
      </section>
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>SSH config</h3>
            <SettingsHelpHint
              topic="SSH config"
              description="Full config inside the active SSH directory. Content reloads when you open this tab. Broken syntax can prevent the host list from loading until you fix the file or restore a backup."
            />
          </div>
          <p className="settings-card-lead">Full config file for the active SSH directory.</p>
        </header>
        <textarea
          className="input ssh-config-textarea settings-ssh-config-editor"
          value={sshConfigRaw}
          onChange={(event) => setSshConfigRaw(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="SSH config file contents"
        />
        <div className="action-row">
          <button type="button" className="btn btn-settings-commit" onClick={() => void onSaveSshConfig()}>
            Save SSH config
          </button>
        </div>
      </section>
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>Export resolved config</h3>
            <SettingsHelpHint
              topic="Export resolved SSH config"
              description="Writes a new file with Host stanzas for each host in your parsed list, using the same Identity Store resolution as connections. Path-based keys appear as IdentityFile; encrypted keys and runtime paths are omitted or commented. Optional StrictHostKeyChecking lines come from host metadata (not from raw config unless you added them manually)."
            />
          </div>
          <p className="settings-card-lead">
            Portable snapshot for tools that read OpenSSH config files. Does not replace your on-disk config.
          </p>
        </header>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={exportIncludeStrictHostKey}
            onChange={(event) => setExportIncludeStrictHostKey(event.target.checked)}
          />
          <span className="field-label field-label-inline-hint">Include StrictHostKeyChecking per host (from app metadata)</span>
        </label>
        <div className="action-row">
          <button
            type="button"
            className="btn btn-settings-tool"
            onClick={() => void onExportResolvedOpensshConfig(exportIncludeStrictHostKey)}
          >
            Export to file…
          </button>
        </div>
      </section>
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>Global defaults (Host *)</h3>
            <SettingsHelpHint
              topic="Global SSH defaults (Host *)"
              description="Inserts or replaces only the block between BEGIN_NOSUCKSHELL_HOST_STAR / END_NOSUCKSHELL_HOST_STAR. The block is placed at the top of the buffer if missing (later stanzas can override). Use Apply, then Save SSH config, to write to disk."
            />
          </div>
          <p className="settings-card-lead">Managed Host * block merged into your config buffer.</p>
        </header>
        <div className="host-form-grid settings-ssh-hoststar-grid">
          <label className="field">
            <span className="field-label">ServerAliveInterval</span>
            <input
              className="input settings-numeric-input"
              value={sshHostStarServerAliveInterval}
              onChange={(event) => setSshHostStarServerAliveInterval(event.target.value)}
              placeholder="60"
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">ServerAliveCountMax</span>
            <input
              className="input settings-numeric-input"
              value={sshHostStarServerAliveCountMax}
              onChange={(event) => setSshHostStarServerAliveCountMax(event.target.value)}
              placeholder="3"
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">TCPKeepAlive</span>
            <select
              className="input density-profile-select settings-control-intrinsic"
              value={sshHostStarTcpKeepAlive}
              onChange={(event) => setSshHostStarTcpKeepAlive(event.target.value as "" | "yes" | "no")}
            >
              <option value="">(omit)</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">IdentityFile</span>
            <input
              className="input settings-path-input"
              value={sshHostStarIdentityFile}
              onChange={(event) => setSshHostStarIdentityFile(event.target.value)}
              placeholder="~/.ssh/id_ed25519"
            />
          </label>
          <label className="field">
            <span className="field-label">User</span>
            <input
              className="input settings-compact-text"
              value={sshHostStarUser}
              onChange={(event) => setSshHostStarUser(event.target.value)}
              placeholder="default user"
            />
          </label>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-settings-tool" onClick={applyHostStarBlockToBuffer}>
            Apply to config buffer
          </button>
        </div>
      </section>
    </div>
  );
}
