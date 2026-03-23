import type { HostMetadata, StrictHostKeyPolicy } from "../types";
import { hostMetadataIsJumpHost } from "../features/jump-host";
import {
  HOST_METADATA_FIELDS_COPY_COMPACT,
  HOST_METADATA_FIELDS_COPY_VERBOSE,
  type HostMetadataFieldsCopy,
} from "../features/host-form-copy";
import { SettingsHelpHint } from "./settings/SettingsHelpHint";

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
  /** App Settings Hosts tab: tooltips instead of inline paragraphs. */
  settingsLayout?: boolean;
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
  settingsLayout = false,
  className = "host-meta-edit",
}: Props) {
  const t: HostMetadataFieldsCopy =
    copyDensity === "compact" ? HOST_METADATA_FIELDS_COPY_COMPACT : HOST_METADATA_FIELDS_COPY_VERBOSE;
  const hint: HostMetadataFieldsCopy = settingsLayout ? HOST_METADATA_FIELDS_COPY_VERBOSE : t;
  const selClass = settingsLayout ? "input density-profile-select settings-control-intrinsic" : "input density-profile-select";
  const textClass = settingsLayout ? "input settings-control-intrinsic" : "input";

  return (
    <div className={className}>
      <label className="field">
        <span className={settingsLayout ? "field-label field-label-inline-hint" : "field-label"}>
          {t.hostKeyLabel}
          {settingsLayout ? (
            <SettingsHelpHint topic={t.hostKeyLabel} description={hint.hostKeyHelp} />
          ) : null}
        </span>
        <select
          className={selClass}
          aria-label={t.hostKeyLabel}
          value={hostKeyPolicyDraft}
          onChange={(event) => setHostKeyPolicyDraft(event.target.value as StrictHostKeyPolicy)}
        >
          <option value="ask">Interactive prompt (default)</option>
          <option value="accept-new">Auto-accept new keys (no prompt)</option>
          <option value="no">Accept any key (insecure — MITM risk)</option>
        </select>
        {!settingsLayout ? <span className="field-help">{t.hostKeyHelp}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">{t.tagsLabel}</span>
        <input
          className={textClass}
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
        <span className={settingsLayout ? "field-label field-label-inline-hint" : "field-label"}>
          {t.jumpHostLabel}
          {settingsLayout ? <SettingsHelpHint topic={t.jumpHostLabel} description={hint.jumpHostHelp} /> : null}
        </span>
      </label>
      {!settingsLayout ? <p className="field-help">{t.jumpHostHelp}</p> : null}
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
