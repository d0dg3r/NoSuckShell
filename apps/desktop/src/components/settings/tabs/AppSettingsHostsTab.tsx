import type { Dispatch, SetStateAction } from "react";
import type {
  GroupObject,
  HostBinding,
  HostConfig,
  HostKeyRef,
  HostMetadata,
  SshKeyObject,
  StrictHostKeyPolicy,
  TagObject,
  UserObject,
} from "../../../types";
import { HostForm } from "../../HostForm";
import { HostMetadataFields } from "../../HostMetadataFields";

const normalizeKeyRefs = (refs: HostKeyRef[]): HostKeyRef[] =>
  refs.map((r, i) => ({ ...r, usage: i === 0 ? "primary" : "additional" }));

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
  storeGroups: GroupObject[];
  storeTags: TagObject[];
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
  storeGroups,
  storeTags,
  toggleFavoriteForHost,
  toggleJumpHostForHost,
  onSaveHost,
  saveDisabled,
  onRemoveHost,
  removeConfirmActive,
  error,
}: AppSettingsHostsTabProps) {
  const toggleBindingKey = (keyId: string, checked: boolean) => {
    setDraftBinding((prev) => {
      let next = prev.keyRefs.filter((r) => r.keyId !== keyId);
      if (checked) {
        next = [...next, { keyId, usage: "additional" }];
      }
      return { ...prev, keyRefs: normalizeKeyRefs(next) };
    });
  };

  const toggleBindingGroup = (groupId: string, checked: boolean) => {
    setDraftBinding((prev) => ({
      ...prev,
      groupIds: checked ? [...prev.groupIds, groupId] : prev.groupIds.filter((id) => id !== groupId),
    }));
  };

  const toggleBindingTag = (tagId: string, checked: boolean) => {
    setDraftBinding((prev) => ({
      ...prev,
      tagIds: checked ? [...prev.tagIds, tagId] : prev.tagIds.filter((id) => id !== tagId),
    }));
  };

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
        Connection, access, proxy, identity store bindings, tags, host-key policy, jump host, and favorite.
        Changes apply after you save.
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

          <div className="settings-stack host-form-settings-stack" style={{ marginTop: "var(--space-3)" }}>
            <section className="settings-card host-form-settings-card">
              <div className="settings-card-head">
                <h3>Identity Store bindings</h3>
                <p className="muted-copy">
                  Per-host overrides: SSH keys (first selected = primary), groups, and tags from the Identity Store.
                  If no keys are set here, the linked user&apos;s keys apply when a user is selected.
                </p>
              </div>
              <div className="host-form-card-fields">
                <div className="field">
                  <span className="field-label">SSH keys for this host</span>
                  <div className="store-checkbox-grid">
                    {storeKeys.length === 0 ? (
                      <span className="muted-copy">No keys in store.</span>
                    ) : (
                      storeKeys.map((key) => (
                        <label key={key.id} className="store-checkbox-label">
                          <input
                            type="checkbox"
                            checked={draftBinding.keyRefs.some((r) => r.keyId === key.id)}
                            onChange={(event) => toggleBindingKey(key.id, event.target.checked)}
                          />
                          {key.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Groups</span>
                  <div className="store-checkbox-grid">
                    {storeGroups.length === 0 ? (
                      <span className="muted-copy">No groups.</span>
                    ) : (
                      storeGroups.map((group) => (
                        <label key={group.id} className="store-checkbox-label">
                          <input
                            type="checkbox"
                            checked={draftBinding.groupIds.includes(group.id)}
                            onChange={(event) => toggleBindingGroup(group.id, event.target.checked)}
                          />
                          {group.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Store tags</span>
                  <div className="store-checkbox-grid">
                    {storeTags.length === 0 ? (
                      <span className="muted-copy">No tags in store.</span>
                    ) : (
                      storeTags.map((tag) => (
                        <label key={tag.id} className="store-checkbox-label">
                          <input
                            type="checkbox"
                            checked={draftBinding.tagIds.includes(tag.id)}
                            onChange={(event) => toggleBindingTag(tag.id, event.target.checked)}
                          />
                          {tag.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

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
