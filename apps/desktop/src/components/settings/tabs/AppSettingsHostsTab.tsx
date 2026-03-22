import type { Dispatch, SetStateAction } from "react";
import type { HostBinding, HostConfig, HostMetadata, SshKeyObject, StrictHostKeyPolicy, UserObject } from "../../../types";
import { HostForm } from "../../HostForm";
import { HostMetadataFields } from "../../HostMetadataFields";

export type AppSettingsHostsTabProps = {
  hosts: HostConfig[];
  selectedHostAlias: string;
  onSelectHostAlias: (alias: string) => void;
  draftHost: HostConfig;
  setDraftHost: Dispatch<SetStateAction<HostConfig>>;
  draftBinding: HostBinding;
  setDraftBinding: Dispatch<SetStateAction<HostBinding>>;
  tagDraft: string;
  setTagDraft: (value: string) => void;
  hostKeyPolicyDraft: StrictHostKeyPolicy;
  setHostKeyPolicyDraft: (value: StrictHostKeyPolicy) => void;
  metadataForSelected: HostMetadata;
  hostMetadataByHost: Record<string, HostMetadata | undefined>;
  storeKeys: SshKeyObject[];
  storeUsers: UserObject[];
  toggleFavoriteForHost: (alias: string) => void | Promise<void>;
  toggleJumpHostForHost: (alias: string) => void | Promise<void>;
  onSaveHost: () => void | Promise<void>;
  saveDisabled: boolean;
  onRemoveHost: () => void;
  removeConfirmActive: boolean;
  error: string;
};

export function AppSettingsHostsTab({
  hosts,
  selectedHostAlias,
  onSelectHostAlias,
  draftHost,
  setDraftHost,
  draftBinding,
  setDraftBinding,
  tagDraft,
  setTagDraft,
  hostKeyPolicyDraft,
  setHostKeyPolicyDraft,
  metadataForSelected,
  hostMetadataByHost,
  storeKeys,
  storeUsers,
  toggleFavoriteForHost,
  toggleJumpHostForHost,
  onSaveHost,
  saveDisabled,
  onRemoveHost,
  removeConfirmActive,
  error,
}: AppSettingsHostsTabProps) {
  if (hosts.length === 0) {
    return (
      <div className="identity-store-section">
        <p className="muted-copy">No SSH hosts yet. Add one from the sidebar or Quick add.</p>
      </div>
    );
  }

  return (
    <div className="identity-store-section app-settings-hosts-tab">
      <h3 className="settings-card-title">SSH host</h3>
      <p className="muted-copy">
        Same options as the host menu in the sidebar: connection, access, proxy, tags, host-key policy, jump host, and
        favorite. Changes apply after you save.
      </p>
      <div className="field" style={{ marginBottom: "var(--space-3)" }}>
        <span className="field-label">Host</span>
        <select
          className="input density-profile-select"
          aria-label="Select host to edit"
          value={selectedHostAlias}
          onChange={(event) => onSelectHostAlias(event.target.value)}
        >
          {hosts.map((h) => (
            <option key={h.host} value={h.host}>
              {h.host}
            </option>
          ))}
        </select>
      </div>
      {selectedHostAlias.trim() ? (
        <>
          <HostForm
            host={draftHost}
            onChange={setDraftHost}
            storeKeys={storeKeys}
            hostBinding={draftBinding}
            onHostBindingChange={setDraftBinding}
            storeUsers={storeUsers}
            sshHosts={hosts}
            hostAliasForJumpExclude={draftHost.host.trim()}
            hostMetadataByHost={hostMetadataByHost}
            copyDensity="verbose"
          />
          <HostMetadataFields
            hostAlias={selectedHostAlias}
            metadata={metadataForSelected}
            tagDraft={tagDraft}
            setTagDraft={setTagDraft}
            hostKeyPolicyDraft={hostKeyPolicyDraft}
            setHostKeyPolicyDraft={setHostKeyPolicyDraft}
            toggleFavoriteForHost={toggleFavoriteForHost}
            toggleJumpHostForHost={toggleJumpHostForHost}
            copyDensity="verbose"
            className="host-meta-edit app-settings-hosts-meta"
          />
          <div className="action-row" style={{ marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-primary" onClick={() => void onSaveHost()} disabled={saveDisabled}>
              Save host
            </button>
            <button
              type="button"
              className={`btn btn-danger${removeConfirmActive ? " btn-danger-confirm" : ""}`}
              onClick={onRemoveHost}
            >
              {removeConfirmActive ? "Confirm remove" : "Remove host"}
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}
