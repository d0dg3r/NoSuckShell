import { useMemo, useState } from "react";
import type { GroupObject, HostKeyRef, SshKeyObject, UserObject } from "../../../types";
import {
  getUserObjectProxyJumpSelectValue,
  jumpHostCandidates,
  JUMP_SELECT_CUSTOM,
  JUMP_SELECT_NONE,
  jumpSelectHopValue,
  userProxyJumpFromSelect,
} from "../../../features/host-form-store-links";
import type { IdentityStoreSubTab } from "../app-settings-types";
import type { AppSettingsPanelProps } from "../app-settings-panel-props";
import { SettingsHelpHint } from "../SettingsHelpHint";

export type AppSettingsStoreTabContentProps = Pick<
  AppSettingsPanelProps,
  | "metadataStore"
  | "setMetadataStore"
  | "applyDefaultUser"
  | "setError"
  | "storePassphrase"
  | "setStorePassphrase"
  | "storeUsers"
  | "storeGroups"
  | "storeTags"
  | "storeKeys"
  | "hosts"
  | "storeUserDraft"
  | "setStoreUserDraft"
  | "addStoreUser"
  | "storeGroupDraft"
  | "setStoreGroupDraft"
  | "addStoreGroup"
  | "storeTagDraft"
  | "setStoreTagDraft"
  | "addStoreTag"
  | "importStoreUsersFromHosts"
  | "updateStoreUser"
  | "deleteStoreUser"
  | "setStoreUserGroupMembership"
  | "updateStoreGroup"
  | "deleteStoreGroup"
  | "updateStoreTag"
  | "deleteStoreTag"
  | "patchStoreKey"
  | "reorderUserStoreKeys"
  | "storePathKeyNameDraft"
  | "setStorePathKeyNameDraft"
  | "storePathKeyPathDraft"
  | "setStorePathKeyPathDraft"
  | "addStorePathKey"
  | "storeEncryptedKeyNameDraft"
  | "setStoreEncryptedKeyNameDraft"
  | "storeEncryptedPublicKeyDraft"
  | "setStoreEncryptedPublicKeyDraft"
  | "storeEncryptedPrivateKeyDraft"
  | "setStoreEncryptedPrivateKeyDraft"
  | "addStoreEncryptedKey"
  | "unlockStoreKey"
  | "removeStoreKey"
> & {
  identityStoreSubTab: IdentityStoreSubTab;
};

export function AppSettingsStoreTabContent(props: AppSettingsStoreTabContentProps) {
  const { identityStoreSubTab, ...rest } = props;
  const [expandedStoreUserId, setExpandedStoreUserId] = useState<string | null>(null);

  const {
    metadataStore,
    setMetadataStore,
    applyDefaultUser,
    setError,
    storePassphrase,
    setStorePassphrase,
    storeUsers,
    storeGroups,
    storeTags,
    storeKeys,
    hosts,
    storeUserDraft,
    setStoreUserDraft,
    addStoreUser,
    storeGroupDraft,
    setStoreGroupDraft,
    addStoreGroup,
    storeTagDraft,
    setStoreTagDraft,
    addStoreTag,
    importStoreUsersFromHosts,
    updateStoreUser,
    deleteStoreUser,
    setStoreUserGroupMembership,
    updateStoreGroup,
    deleteStoreGroup,
    updateStoreTag,
    deleteStoreTag,
    patchStoreKey,
    reorderUserStoreKeys,
    storePathKeyNameDraft,
    setStorePathKeyNameDraft,
    storePathKeyPathDraft,
    setStorePathKeyPathDraft,
    addStorePathKey,
    storeEncryptedKeyNameDraft,
    setStoreEncryptedKeyNameDraft,
    storeEncryptedPublicKeyDraft,
    setStoreEncryptedPublicKeyDraft,
    storeEncryptedPrivateKeyDraft,
    setStoreEncryptedPrivateKeyDraft,
    addStoreEncryptedKey,
    unlockStoreKey,
    removeStoreKey,
  } = rest;

  const allHostJumpCandidates = useMemo(
    () => jumpHostCandidates(hosts, "", metadataStore.hosts),
    [hosts, metadataStore.hosts],
  );

  const normalizeKeyRefs = (refs: HostKeyRef[]): HostKeyRef[] =>
    refs.map((r, i) => ({ ...r, usage: i === 0 ? "primary" : "additional" }));

  const toggleUserKey = (userId: string, user: UserObject, keyId: string, checked: boolean) => {
    let next = user.keyRefs.filter((r) => r.keyId !== keyId);
    if (checked) {
      next = [...next, { keyId, usage: "additional" }];
    }
    void updateStoreUser(userId, { keyRefs: normalizeKeyRefs(next) });
  };

  const toggleUserTag = (userId: string, user: UserObject, tagId: string, checked: boolean) => {
    const nextIds = checked ? [...user.tagIds, tagId] : user.tagIds.filter((id) => id !== tagId);
    void updateStoreUser(userId, { tagIds: nextIds });
  };

  const toggleUserInGroup = (userId: string, groupId: string, checked: boolean) => {
    const memberGroupIds = storeGroups.filter((g) => g.memberUserIds.includes(userId)).map((g) => g.id);
    const next = checked ? [...new Set([...memberGroupIds, groupId])] : memberGroupIds.filter((id) => id !== groupId);
    void setStoreUserGroupMembership(userId, next);
  };

  const toggleGroupTag = (groupId: string, group: GroupObject, tagId: string, checked: boolean) => {
    const cur = group.tagIds ?? [];
    const nextIds = checked ? [...cur, tagId] : cur.filter((id) => id !== tagId);
    void updateStoreGroup(groupId, { tagIds: nextIds });
  };

  const toggleKeyTag = (keyId: string, key: SshKeyObject, tagId: string, checked: boolean) => {
    const cur = key.tagIds ?? [];
    const nextIds = checked ? [...cur, tagId] : cur.filter((id) => id !== tagId);
    void patchStoreKey(keyId, { tagIds: nextIds });
  };

  return (
    <div className="settings-stack">
      <div className="store-panel store-panel--identity">
        {identityStoreSubTab === "overview" && (
          <section className="identity-store-section">
            <p className="settings-card-lead">
              Objects link to hosts; host fields stay compatible.{" "}
              <SettingsHelpHint
                topic="Identity Store overview"
                description="Hybrid store: host fields stay compatible; users, groups, tags, and keys can be linked as objects."
              />
            </p>
            <label className="field">
              <span className="field-label">Master passphrase (Keychain fallback)</span>
              <input
                className="input settings-store-master-passphrase-input"
                type="password"
                value={storePassphrase}
                onChange={(event) => setStorePassphrase(event.target.value)}
                placeholder="Optional, for encrypted keys"
              />
            </label>
          </section>
        )}

        {identityStoreSubTab === "users" && (
          <section className="identity-store-section">
            <div className="settings-card-head-row">
              <h4>Users</h4>
              <SettingsHelpHint
                topic="Store users"
                description="Import creates store users from each distinct User value on your saved hosts. Keys on the user apply when a host binding does not set its own keys."
              />
            </div>
            <p className="settings-card-lead">Import from hosts; per-user keys when the host has none.</p>
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Default login user
                <SettingsHelpHint
                  topic="Default login user"
                  description="Used when a host has no explicit user (SSH config / host entry)."
                />
              </span>
              <input
                className="input"
                value={metadataStore.defaultUser}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                }}
                onBlur={(event) => {
                  void applyDefaultUser(event.target.value).catch((e: unknown) => setError(String(e)));
                }}
                placeholder="ubuntu"
              />
            </label>
            <div className="store-inline">
              <button type="button" className="btn btn-settings-tool" onClick={() => void importStoreUsersFromHosts()}>
                Import from SSH hosts
              </button>
            </div>
            <div className="store-list store-list--tall identity-store-list">
              {storeUsers.map((user) => (
                <div key={user.id} className="store-list-block">
                  <div className="store-list-row store-list-row-clickable identity-store-row">
                    <button
                      type="button"
                      className="btn btn-ghost store-expand-toggle"
                      onClick={() => setExpandedStoreUserId((prev) => (prev === user.id ? null : user.id))}
                      aria-expanded={expandedStoreUserId === user.id}
                    >
                      {expandedStoreUserId === user.id ? "▼" : "▶"}
                    </button>
                    <span className="store-list-title">
                      {user.name}
                      {user.username && user.username !== user.name ? ` (${user.username})` : ""}
                    </span>
                    <button
                      type="button"
                      className="btn btn-settings-tool btn-settings-danger"
                      onClick={() => {
                        setExpandedStoreUserId((prev) => (prev === user.id ? null : prev));
                        void deleteStoreUser(user.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {expandedStoreUserId === user.id && (
                    <div className="store-nested-fields">
                      <label className="field">
                        <span className="field-label">Display name</span>
                        <input
                          key={`${user.id}-name`}
                          className="input"
                          defaultValue={user.name}
                          onBlur={(event) => {
                            const v = event.target.value.trim();
                            if (v && v !== user.name) {
                              void updateStoreUser(user.id, { name: v });
                            }
                          }}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">SSH username</span>
                        <input
                          key={`${user.id}-username`}
                          className="input"
                          defaultValue={user.username}
                          onBlur={(event) => {
                            const v = event.target.value.trim();
                            if (v !== user.username) {
                              void updateStoreUser(user.id, { username: v });
                            }
                          }}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label field-label-inline-hint">
                          HostName (optional)
                          <SettingsHelpHint
                            topic="Store user HostName"
                            description="When this user is linked on a host, overrides the SSH HostName for that session. Leave empty to use the host entry from your config."
                          />
                        </span>
                        <input
                          key={`${user.id}-hostName`}
                          className="input"
                          defaultValue={user.hostName}
                          onBlur={(event) => {
                            const v = event.target.value.trim();
                            if (v !== user.hostName) {
                              void updateStoreUser(user.id, { hostName: v });
                            }
                          }}
                          placeholder="10.0.1.25"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Jump shortcut (optional)</span>
                        <select
                          className="input density-profile-select"
                          aria-label="Store user ProxyJump shortcut"
                          value={getUserObjectProxyJumpSelectValue(user, allHostJumpCandidates)}
                          onChange={(event) => {
                            const v = event.target.value;
                            if (v === JUMP_SELECT_CUSTOM) {
                              return;
                            }
                            void updateStoreUser(user.id, {
                              proxyJump: userProxyJumpFromSelect(v, user),
                            });
                          }}
                        >
                          <option value={JUMP_SELECT_NONE}>None</option>
                          {allHostJumpCandidates.map((alias) => (
                            <option key={alias} value={jumpSelectHopValue(alias)}>
                              {alias}
                            </option>
                          ))}
                          <option value={JUMP_SELECT_CUSTOM}>Custom value (edit below)</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label field-label-inline-hint">
                          ProxyJump (optional)
                          <SettingsHelpHint
                            topic="Store user ProxyJump"
                            description="Used when this user is linked on a host and that host's binding has no ProxyJump set. A ProxyJump saved on the host binding for that host still wins. The hop is usually another host alias in your list or a custom ProxyJump string."
                          />
                        </span>
                        <input
                          key={`${user.id}-proxyJump-${user.proxyJump}`}
                          className="input"
                          defaultValue={user.proxyJump}
                          onBlur={(event) => {
                            const v = event.target.value.trim();
                            if (v !== user.proxyJump) {
                              void updateStoreUser(user.id, { proxyJump: v });
                            }
                          }}
                          placeholder="bastion or user@jump"
                        />
                      </label>
                      <div className="field">
                        <span className="field-label">SSH keys (first = primary for sessions)</span>
                        <div className="store-checkbox-grid">
                          {storeKeys.length === 0 ? (
                            <span className="settings-card-lead">No keys in store yet.</span>
                          ) : (
                            storeKeys.map((key) => (
                              <label key={key.id} className="store-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={user.keyRefs.some((r) => r.keyId === key.id)}
                                  onChange={(event) => toggleUserKey(user.id, user, key.id, event.target.checked)}
                                />
                                {key.name}
                              </label>
                            ))
                          )}
                        </div>
                        {user.keyRefs.length > 0 && (
                          <div className="store-key-order-wrap">
                            <span className="field-label">Current order (sessions use the primary first)</span>
                            <ol className="store-key-order-ol">
                              {user.keyRefs.map((ref, idx) => {
                                const keyName = storeKeys.find((k) => k.id === ref.keyId)?.name ?? ref.keyId;
                                const role = idx === 0 ? "Primary" : "Additional";
                                return (
                                  <li key={ref.keyId} className="store-key-order-item">
                                    <span>
                                      {idx + 1}. {role} — {keyName}
                                    </span>
                                    <span className="store-inline">
                                      <button
                                        type="button"
                                        className="btn btn-settings-tool"
                                        disabled={idx === 0}
                                        onClick={() => void reorderUserStoreKeys(user.id, idx, "up")}
                                      >
                                        Up
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-settings-tool"
                                        disabled={idx === user.keyRefs.length - 1}
                                        onClick={() => void reorderUserStoreKeys(user.id, idx, "down")}
                                      >
                                        Down
                                      </button>
                                    </span>
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <span className="field-label">Tags</span>
                        <div className="store-checkbox-grid">
                          {storeTags.length === 0 ? (
                            <span className="settings-card-lead">No tags yet.</span>
                          ) : (
                            storeTags.map((tag) => (
                              <label key={tag.id} className="store-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={user.tagIds.includes(tag.id)}
                                  onChange={(event) => toggleUserTag(user.id, user, tag.id, event.target.checked)}
                                />
                                {tag.name}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="field">
                        <span className="field-label">Groups</span>
                        <div className="store-checkbox-grid">
                          {storeGroups.length === 0 ? (
                            <span className="settings-card-lead">No groups yet.</span>
                          ) : (
                            storeGroups.map((group) => (
                              <label key={group.id} className="store-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={group.memberUserIds.includes(user.id)}
                                  onChange={(event) => toggleUserInGroup(user.id, group.id, event.target.checked)}
                                />
                                {group.name}
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="store-inline">
              <input
                className="input"
                value={storeUserDraft}
                onChange={(event) => setStoreUserDraft(event.target.value)}
                placeholder="New user (display / SSH name)"
              />
              <button type="button" className="btn btn-settings-tool" onClick={() => void addStoreUser()}>
                Add
              </button>
            </div>
          </section>
        )}

        {identityStoreSubTab === "groups" && (
          <section className="identity-store-section">
            <h4>Groups</h4>
            <div className="store-list identity-store-list">
              {storeGroups.map((group) => (
                <div key={group.id} className="store-list-block">
                  <div className="store-list-row identity-store-row">
                    <input
                      className="input"
                      defaultValue={group.name}
                      onBlur={(event) => {
                        const v = event.target.value.trim();
                        if (v && v !== group.name) {
                          void updateStoreGroup(group.id, { name: v });
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-settings-tool btn-settings-danger"
                      onClick={() => void deleteStoreGroup(group.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="store-nested-fields">
                    <span className="field-label">Members</span>
                    <div className="store-checkbox-grid">
                      {storeUsers.length === 0 ? (
                        <span className="settings-card-lead">No users yet.</span>
                      ) : (
                        storeUsers.map((user) => (
                          <label key={user.id} className="store-checkbox-label">
                            <input
                              type="checkbox"
                              checked={group.memberUserIds.includes(user.id)}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...group.memberUserIds, user.id]
                                  : group.memberUserIds.filter((id) => id !== user.id);
                                void updateStoreGroup(group.id, { memberUserIds: next });
                              }}
                            />
                            {user.name}
                          </label>
                        ))
                      )}
                    </div>
                    <span className="field-label">Tags</span>
                    <div className="store-checkbox-grid">
                      {storeTags.length === 0 ? (
                        <span className="settings-card-lead">No tags yet.</span>
                      ) : (
                        storeTags.map((tag) => (
                          <label key={tag.id} className="store-checkbox-label">
                            <input
                              type="checkbox"
                              checked={(group.tagIds ?? []).includes(tag.id)}
                              onChange={(event) => toggleGroupTag(group.id, group, tag.id, event.target.checked)}
                            />
                            {tag.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="store-inline">
              <input
                className="input"
                value={storeGroupDraft}
                onChange={(event) => setStoreGroupDraft(event.target.value)}
                placeholder="New group name"
              />
              <button type="button" className="btn btn-settings-tool" onClick={() => void addStoreGroup()}>
                Add
              </button>
            </div>
          </section>
        )}

        {identityStoreSubTab === "tags" && (
          <section className="identity-store-section">
            <h4>Tags</h4>
            <div className="store-list identity-store-list">
              {storeTags.map((tag) => (
                <div key={tag.id} className="store-list-row identity-store-row">
                  <input
                    className="input"
                    defaultValue={tag.name}
                    onBlur={(event) => {
                      const v = event.target.value.trim();
                      if (v && v !== tag.name) {
                        void updateStoreTag(tag.id, v);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-settings-tool btn-settings-danger"
                    onClick={() => void deleteStoreTag(tag.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <div className="store-inline">
              <input
                className="input"
                value={storeTagDraft}
                onChange={(event) => setStoreTagDraft(event.target.value)}
                placeholder="New tag name"
              />
              <button type="button" className="btn btn-settings-tool" onClick={() => void addStoreTag()}>
                Add
              </button>
            </div>
          </section>
        )}

        {identityStoreSubTab === "keys" && (
          <section className="identity-store-section">
            <h4>SSH Keys</h4>
            <div className="identity-store-form">
              <div className="store-key-grid">
                <div className="store-inline">
                  <input
                    className="input"
                    value={storePathKeyNameDraft}
                    onChange={(event) => setStorePathKeyNameDraft(event.target.value)}
                    placeholder="Path key name"
                  />
                  <input
                    className="input"
                    value={storePathKeyPathDraft}
                    onChange={(event) => setStorePathKeyPathDraft(event.target.value)}
                    placeholder="~/.ssh/id_ed25519"
                  />
                  <button type="button" className="btn btn-settings-tool" onClick={() => void addStorePathKey()}>
                    Add path key
                  </button>
                </div>
                <div className="store-inline">
                  <input
                    className="input"
                    value={storeEncryptedKeyNameDraft}
                    onChange={(event) => setStoreEncryptedKeyNameDraft(event.target.value)}
                    placeholder="Encrypted key name"
                  />
                  <input
                    className="input"
                    value={storeEncryptedPublicKeyDraft}
                    onChange={(event) => setStoreEncryptedPublicKeyDraft(event.target.value)}
                    placeholder="optional public key"
                  />
                </div>
                <textarea
                  className="input store-textarea"
                  value={storeEncryptedPrivateKeyDraft}
                  onChange={(event) => setStoreEncryptedPrivateKeyDraft(event.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                />
                <div className="store-inline">
                  <button type="button" className="btn btn-settings-tool" onClick={() => void addStoreEncryptedKey()}>
                    Add encrypted key
                  </button>
                </div>
              </div>
            </div>
            <div className="store-list store-list--tall identity-store-list">
              {storeKeys.map((key) => (
                <div key={key.id} className="store-list-block">
                  <div className="store-list-row identity-store-row">
                    <span>
                      {key.name} ({key.type})
                    </span>
                    <div className="store-inline">
                      <button type="button" className="btn btn-settings-tool" onClick={() => void unlockStoreKey(key.id)}>
                        Unlock
                      </button>
                      <button
                        type="button"
                        className="btn btn-settings-tool btn-settings-danger"
                        onClick={() => void removeStoreKey(key.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="store-nested-fields">
                    <span className="field-label">Tags</span>
                    <div className="store-checkbox-grid">
                      {storeTags.length === 0 ? (
                        <span className="settings-card-lead">No tags yet.</span>
                      ) : (
                        storeTags.map((tag) => (
                          <label key={tag.id} className="store-checkbox-label">
                            <input
                              type="checkbox"
                              checked={(key.tagIds ?? []).includes(tag.id)}
                              onChange={(event) => toggleKeyTag(key.id, key, tag.id, event.target.checked)}
                            />
                            {tag.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
