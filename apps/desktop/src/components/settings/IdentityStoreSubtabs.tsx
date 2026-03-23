import type { IdentityStoreSubTab } from "./app-settings-types";
import { IDENTITY_STORE_SUBTABS } from "./app-settings-constants";
import { SettingsSubtabRow } from "./SettingsSubtabRow";

export type IdentityStoreSubtabsProps = {
  identityStoreSubTab: IdentityStoreSubTab;
  setIdentityStoreSubTab: (tab: IdentityStoreSubTab) => void;
};

export function IdentityStoreSubtabs({ identityStoreSubTab, setIdentityStoreSubTab }: IdentityStoreSubtabsProps) {
  return (
    <SettingsSubtabRow
      ariaLabel="Identity store sections"
      tabs={IDENTITY_STORE_SUBTABS}
      activeTab={identityStoreSubTab}
      onSelect={setIdentityStoreSubTab}
    />
  );
}
