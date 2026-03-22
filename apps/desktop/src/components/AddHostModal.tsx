import type { HostBinding, HostConfig, HostMetadata, SshKeyObject, UserObject } from "../types";
import { HostForm } from "./HostForm";

export type AddHostModalProps = {
  newHostDraft: HostConfig;
  onChangeNewHost: (host: HostConfig) => void;
  storeKeys: SshKeyObject[];
  storeUsers: UserObject[];
  sshHosts: HostConfig[];
  hostMetadataByHost: Record<string, HostMetadata | undefined>;
  hostBindingDraft: HostBinding;
  onHostBindingDraftChange: (binding: HostBinding) => void;
  onClose: () => void;
  onCreateHost: () => void;
  canCreateHost: boolean;
  error: string;
};

export function AddHostModal({
  newHostDraft,
  onChangeNewHost,
  storeKeys,
  storeUsers,
  sshHosts,
  hostMetadataByHost,
  hostBindingDraft,
  onHostBindingDraftChange,
  onClose,
  onCreateHost,
  canCreateHost,
  error,
}: AddHostModalProps) {
  return (
    <div className="app-settings-overlay" onClick={onClose}>
      <section className="app-settings-modal panel add-host-modal" onClick={(event) => event.stopPropagation()}>
        <header className="panel-header">
          <h2>Add host</h2>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </header>
        <div className="app-settings-content">
          <HostForm
            host={newHostDraft}
            onChange={onChangeNewHost}
            storeKeys={storeKeys}
            hostBinding={hostBindingDraft}
            onHostBindingChange={onHostBindingDraftChange}
            storeUsers={storeUsers}
            sshHosts={sshHosts}
            hostAliasForJumpExclude={newHostDraft.host.trim()}
            hostMetadataByHost={hostMetadataByHost}
          />
          <div className="action-row">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onCreateHost} disabled={!canCreateHost}>
              Add host
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>
    </div>
  );
}
