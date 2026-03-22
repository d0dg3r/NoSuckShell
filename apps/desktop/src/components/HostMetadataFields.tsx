import type { HostMetadata, StrictHostKeyPolicy } from "../types";
import { hostMetadataIsJumpHost } from "../features/jump-host";
import {
  HOST_METADATA_FIELDS_COPY_COMPACT,
  HOST_METADATA_FIELDS_COPY_VERBOSE,
  type HostMetadataFieldsCopy,
} from "../features/host-form-copy";

type Props = {
  hostAlias: string;
  metadata: HostMetadata;
  tagDraft: string;
  setTagDraft: (value: string) => void;
  hostKeyPolicyDraft: StrictHostKeyPolicy;
  setHostKeyPolicyDraft: (value: StrictHostKeyPolicy) => void;
  toggleFavoriteForHost: (alias: string) => void | Promise<void>;
  toggleJumpHostForHost: (alias: string) => void | Promise<void>;
  copyDensity?: "verbose" | "compact";
  /** Optional class for outer wrapper (e.g. host-meta-edit) */
  className?: string;
};

export function HostMetadataFields({
  hostAlias,
  metadata,
  tagDraft,
  setTagDraft,
  hostKeyPolicyDraft,
  setHostKeyPolicyDraft,
  toggleFavoriteForHost,
  toggleJumpHostForHost,
  copyDensity = "verbose",
  className = "host-meta-edit",
}: Props) {
  const t: HostMetadataFieldsCopy =
    copyDensity === "compact" ? HOST_METADATA_FIELDS_COPY_COMPACT : HOST_METADATA_FIELDS_COPY_VERBOSE;

  return (
    <div className={className}>
      <label className="field">
        <span className="field-label">{t.hostKeyLabel}</span>
        <select
          className="input density-profile-select"
          aria-label={t.hostKeyLabel}
          value={hostKeyPolicyDraft}
          onChange={(event) => setHostKeyPolicyDraft(event.target.value as StrictHostKeyPolicy)}
        >
          <option value="ask">Interactive prompt (default)</option>
          <option value="accept-new">Auto-accept new keys (no prompt)</option>
          <option value="no">Accept any key (insecure — MITM risk)</option>
        </select>
        <span className="field-help">{t.hostKeyHelp}</span>
      </label>
      <label className="field">
        <span className="field-label">{t.tagsLabel}</span>
        <input
          className="input"
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          placeholder={t.tagsPlaceholder}
        />
      </label>
      <label className="field checkbox-field">
        <input
          className="checkbox-input"
          type="checkbox"
          checked={hostMetadataIsJumpHost(metadata)}
          onChange={() => void toggleJumpHostForHost(hostAlias)}
        />
        <span className="field-label">{t.jumpHostLabel}</span>
      </label>
      <p className="field-help">{t.jumpHostHelp}</p>
      <label className="field checkbox-field">
        <input
          className="checkbox-input"
          type="checkbox"
          checked={metadata.favorite}
          onChange={() => void toggleFavoriteForHost(hostAlias)}
        />
        <span className="field-label">{t.favoriteLabel}</span>
      </label>
    </div>
  );
}
