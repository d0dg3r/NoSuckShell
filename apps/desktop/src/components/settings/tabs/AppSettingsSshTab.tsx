import { useState } from "react";
import { mergeManagedHostStarBlock } from "../../../features/ssh-config-managed-block";
import type { SshDirInfo } from "../../../types";
import type React from "react";

export type AppSettingsSshTabProps = {
  setError: (message: string) => void;
  setSshConfigRaw: React.Dispatch<React.SetStateAction<string>>;
  sshConfigRaw: string;
  onSaveSshConfig: () => Promise<void>;
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
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>SSH directory</h3>
          <p className="muted-copy">
            Default is <code className="inline-code">~/.ssh</code> (on Windows typically{" "}
            <code className="inline-code">%USERPROFILE%\.ssh</code>). The identity store,{" "}
            <code className="inline-code">config</code>, and related files live under the active folder. Override must be
            an <strong>absolute</strong> path. After changing it, hosts and store reload from the new location.
          </p>
        </header>
        {sshDirInfo && (
          <div className="ssh-dir-info-block">
            <p className="muted-copy">
              <strong>Detected default:</strong> <code className="inline-code">{sshDirInfo.defaultPath}</code>
            </p>
            <p className="muted-copy">
              <strong>Active:</strong> <code className="inline-code">{sshDirInfo.effectivePath}</code>
            </p>
            {sshDirInfo.userProfile ? (
              <p className="muted-copy">
                <strong>USERPROFILE:</strong> <code className="inline-code">{sshDirInfo.userProfile}</code>
              </p>
            ) : null}
          </div>
        )}
        <label className="field field-span-2">
          <span className="field-label">Custom SSH directory (optional)</span>
          <input
            className="input"
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
          <h3>SSH config</h3>
          <p className="muted-copy">
            Full <code className="inline-code">config</code> inside the active SSH directory (see above). Content reloads
            when you open this tab. Broken syntax can prevent the host list from loading until you fix the file or
            restore a backup.
          </p>
        </header>
        <textarea
          className="input ssh-config-textarea"
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
          <h3>Global defaults (Host *)</h3>
          <p className="muted-copy">
            Inserts or replaces only the block between{" "}
            <code className="inline-code">BEGIN_NOSUCKSHELL_HOST_STAR</code> /{" "}
            <code className="inline-code">END_NOSUCKSHELL_HOST_STAR</code>. The block is placed at the top of the buffer
            if missing (later stanzas can override). Use Apply, then Save SSH config, to write to disk.
          </p>
        </header>
        <div className="host-form-grid">
          <label className="field">
            <span className="field-label">ServerAliveInterval</span>
            <input
              className="input"
              value={sshHostStarServerAliveInterval}
              onChange={(event) => setSshHostStarServerAliveInterval(event.target.value)}
              placeholder="60"
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">ServerAliveCountMax</span>
            <input
              className="input"
              value={sshHostStarServerAliveCountMax}
              onChange={(event) => setSshHostStarServerAliveCountMax(event.target.value)}
              placeholder="3"
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field-label">TCPKeepAlive</span>
            <select
              className="input density-profile-select"
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
              className="input"
              value={sshHostStarIdentityFile}
              onChange={(event) => setSshHostStarIdentityFile(event.target.value)}
              placeholder="~/.ssh/id_ed25519"
            />
          </label>
          <label className="field">
            <span className="field-label">User</span>
            <input
              className="input"
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
