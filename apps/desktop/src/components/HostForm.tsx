import type { ChangeEvent } from "react";
import type { HostConfig } from "../types";

type Props = {
  host: HostConfig;
  onChange: (next: HostConfig) => void;
};

export function HostForm({ host, onChange }: Props) {
  const update =
    (key: keyof HostConfig) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.value;
      onChange({
        ...host,
        [key]: key === "port" ? Number(value || "22") : value,
      });
    };

  return (
    <div className="host-form-grid">
      <label className="field">
        <span className="field-label">Host alias</span>
        <input className="input" value={host.host} onChange={update("host")} placeholder="prod-eu-1" />
        <span className="field-help">Friendly name used in your SSH host list.</span>
      </label>
      <label className="field">
        <span className="field-label">HostName</span>
        <input className="input" value={host.hostName} onChange={update("hostName")} placeholder="10.0.1.25" />
        <span className="field-help">IP or DNS hostname of the target machine.</span>
      </label>
      <label className="field">
        <span className="field-label">User</span>
        <input className="input" value={host.user} onChange={update("user")} placeholder="ubuntu" />
      </label>
      <label className="field">
        <span className="field-label">Port</span>
        <input className="input" type="number" value={host.port} onChange={update("port")} />
      </label>
      <label className="field field-span-2">
        <span className="field-label">IdentityFile</span>
        <input
          className="input"
          value={host.identityFile}
          onChange={update("identityFile")}
          placeholder="~/.ssh/id_ed25519"
        />
        <span className="field-help">Optional key path. Falls back to agent/default key when empty.</span>
      </label>
      <label className="field">
        <span className="field-label">ProxyJump</span>
        <input className="input" value={host.proxyJump} onChange={update("proxyJump")} placeholder="bastion" />
      </label>
      <label className="field">
        <span className="field-label">ProxyCommand</span>
        <input
          className="input"
          value={host.proxyCommand}
          onChange={update("proxyCommand")}
          placeholder="ssh -W %h:%p jump"
        />
      </label>
    </div>
  );
}
