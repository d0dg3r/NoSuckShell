import type { ChangeEvent } from "react";
import { useMemo } from "react";
import {
  applyIdentitySelection,
  getIdentitySelectValue,
  IDENTITY_KEY_PREFIX,
  IDENTITY_SELECT_NONE,
  identitySelectKeyValue,
} from "../features/host-form-identity";
import {
  applyProxyJumpSelectChange,
  applyUserSelectChange,
  getProxyJumpSelectValue,
  getUserSelectValue,
  jumpHostCandidates,
  JUMP_SELECT_CUSTOM,
  JUMP_SELECT_NONE,
  jumpSelectHopValue,
  USER_SELECT_LEGACY,
  userSelectIdValue,
} from "../features/host-form-store-links";
import {
  PROXY_COMMAND_PRESET_CUSTOM,
  PROXY_COMMAND_PRESETS,
  proxyCommandFromPresetSelect,
  proxyCommandPresetSelectValue,
} from "../features/ssh-proxy-presets";
import type { HostBinding, HostConfig, PathSshKeyObject, SshKeyObject, UserObject } from "../types";

type Props = {
  host: HostConfig;
  onChange: (next: HostConfig) => void;
  storeKeys: SshKeyObject[];
  hostBinding: HostBinding;
  onHostBindingChange: (next: HostBinding) => void;
  storeUsers: UserObject[];
  sshHosts: HostConfig[];
  hostAliasForJumpExclude: string;
};

export function HostForm({
  host,
  onChange,
  storeKeys,
  hostBinding,
  onHostBindingChange,
  storeUsers,
  sshHosts,
  hostAliasForJumpExclude,
}: Props) {
  const update =
    (key: keyof HostConfig) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.value;
      onChange({
        ...host,
        [key]: key === "port" ? Number(value || "22") : value,
      });
    };

  const jumpCandidates = useMemo(
    () => jumpHostCandidates(sshHosts, hostAliasForJumpExclude),
    [sshHosts, hostAliasForJumpExclude],
  );

  const sortedUsers = useMemo(
    () => [...storeUsers].sort((a, b) => a.name.localeCompare(b.name)),
    [storeUsers],
  );

  const identitySelectValue = getIdentitySelectValue(host, hostBinding, storeKeys);
  const pathKeys = storeKeys
    .filter((k): k is PathSshKeyObject => k.type === "path")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const encryptedKeys = storeKeys
    .filter((k): k is Extract<SshKeyObject, { type: "encrypted" }> => k.type === "encrypted")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const isRawIdentityValue =
    identitySelectValue !== IDENTITY_SELECT_NONE && !identitySelectValue.startsWith(IDENTITY_KEY_PREFIX);

  const userSelectValue = getUserSelectValue(host, hostBinding, storeUsers);
  const jumpSelectValue = getProxyJumpSelectValue(host, hostBinding, jumpCandidates);

  const onIdentitySelectChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    const patch = applyIdentitySelection(value, host, hostBinding, storeKeys);
    onChange({ ...host, identityFile: patch.identityFile });
    onHostBindingChange({
      ...hostBinding,
      keyRefs: patch.keyRefs,
      legacyIdentityFile: patch.legacyIdentityFile,
    });
  };

  const onUserSelectChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    const patch = applyUserSelectChange(value, host, hostBinding, storeUsers);
    onChange({ ...host, user: patch.user });
    onHostBindingChange({
      ...hostBinding,
      userId: patch.userId,
      legacyUser: patch.legacyUser,
    });
  };

  const onLegacyUserInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    onChange({ ...host, user: value });
    onHostBindingChange({
      ...hostBinding,
      userId: undefined,
      legacyUser: value.trim(),
    });
  };

  const onJumpSelectChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    const patch = applyProxyJumpSelectChange(value, host, hostBinding);
    onChange({ ...host, proxyJump: patch.proxyJump });
    onHostBindingChange({
      ...hostBinding,
      proxyJump: patch.proxyJump,
      legacyProxyJump: patch.legacyProxyJump,
    });
  };

  const onCustomProxyJumpChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    onChange({ ...host, proxyJump: value });
    onHostBindingChange({
      ...hostBinding,
      proxyJump: value.trim(),
      legacyProxyJump: "",
    });
  };

  const proxyPresetValue = proxyCommandPresetSelectValue(host.proxyCommand);
  const onProxyPresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = proxyCommandFromPresetSelect(event.target.value, host.proxyCommand);
    onChange({ ...host, proxyCommand: next });
    onHostBindingChange({
      ...hostBinding,
      legacyProxyCommand: next.trim(),
    });
  };

  const onProxyCommandInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    onChange({ ...host, proxyCommand: value });
    onHostBindingChange({
      ...hostBinding,
      legacyProxyCommand: value.trim(),
    });
  };

  return (
    <div className="host-form-settings-root">
      <div className="settings-stack host-form-settings-stack">
        <section className="settings-card host-form-settings-card">
          <div className="settings-card-head">
            <h3>Connection</h3>
            <p className="muted-copy">SSH host alias, target address, and port.</p>
          </div>
          <div className="host-form-card-fields">
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
              <span className="field-label">Port</span>
              <input className="input" type="number" value={host.port} onChange={update("port")} />
            </label>
          </div>
        </section>

        <section className="settings-card host-form-settings-card">
          <div className="settings-card-head">
            <h3>Access</h3>
            <p className="muted-copy">Link a store user and identity, or enter a custom SSH user and key path.</p>
          </div>
          <div className="host-form-card-fields">
            <label className="field">
              <span className="field-label">Store user</span>
              <select
                className="input density-profile-select"
                aria-label="Store user"
                value={userSelectValue}
                onChange={onUserSelectChange}
              >
                <option value={USER_SELECT_LEGACY}>Custom SSH user</option>
                {sortedUsers.map((u) => (
                  <option key={u.id} value={userSelectIdValue(u.id)}>
                    {u.name}
                    {u.username.trim() ? ` (${u.username})` : ""}
                  </option>
                ))}
              </select>
              <span className="field-help">When set, the store user&apos;s login name is used for SSH (and can supply defaults elsewhere).</span>
            </label>
            {userSelectValue === USER_SELECT_LEGACY ? (
              <label className="field">
                <span className="field-label">SSH user</span>
                <input className="input" value={host.user} onChange={onLegacyUserInputChange} placeholder="ubuntu" />
              </label>
            ) : null}
            <label className="field">
              <span className="field-label">Identity</span>
              <select
                className="input density-profile-select"
                aria-label="Identity"
                value={identitySelectValue}
                onChange={onIdentitySelectChange}
              >
                <option value={IDENTITY_SELECT_NONE}>Default (agent / none)</option>
                {pathKeys.map((key) => (
                  <option key={key.id} value={identitySelectKeyValue(key.id)}>
                    {key.name} — {key.identityFilePath}
                  </option>
                ))}
                {encryptedKeys.map((key) => (
                  <option key={key.id} value={identitySelectKeyValue(key.id)}>
                    {key.name} (encrypted)
                  </option>
                ))}
                {isRawIdentityValue ? (
                  <option value={identitySelectValue}>Other path: {identitySelectValue}</option>
                ) : null}
              </select>
              <span className="field-help">
                Keys from the identity store. Unlock encrypted keys under App Settings → Identities. Unmatched config paths show as &quot;Other path&quot;.
              </span>
            </label>
          </div>
        </section>

        <section className="settings-card host-form-settings-card">
          <div className="settings-card-head">
            <h3>Proxy</h3>
            <p className="muted-copy">Jump through another saved host, or enter a custom ProxyJump value.</p>
          </div>
          <div className="host-form-card-fields">
            <label className="field">
              <span className="field-label">Jump shortcut</span>
              <select
                className="input density-profile-select"
                aria-label="Jump shortcut"
                value={jumpSelectValue}
                onChange={onJumpSelectChange}
              >
                <option value={JUMP_SELECT_NONE}>None</option>
                {jumpCandidates.map((alias) => (
                  <option key={alias} value={jumpSelectHopValue(alias)}>
                    {alias}
                  </option>
                ))}
                <option value={JUMP_SELECT_CUSTOM}>Custom value (edit below)</option>
              </select>
              <span className="field-help">Pick a saved host alias, or type any ProxyJump string.</span>
            </label>
            <label className="field">
              <span className="field-label">ProxyJump</span>
              <input
                className="input"
                value={host.proxyJump}
                onChange={onCustomProxyJumpChange}
                placeholder="bastion or user@jump"
              />
            </label>
            <label className="field">
              <span className="field-label">ProxyCommand preset</span>
              <select
                className="input density-profile-select"
                aria-label="ProxyCommand preset"
                value={proxyPresetValue}
                onChange={onProxyPresetChange}
              >
                <option value={PROXY_COMMAND_PRESET_CUSTOM}>Custom (edit below)</option>
                {PROXY_COMMAND_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="field-help">Common patterns; replace placeholders like bastion or proxy address.</span>
            </label>
            <label className="field">
              <span className="field-label">ProxyCommand</span>
              <input
                className="input"
                value={host.proxyCommand}
                onChange={onProxyCommandInputChange}
                placeholder="ssh -W %h:%p jump"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
