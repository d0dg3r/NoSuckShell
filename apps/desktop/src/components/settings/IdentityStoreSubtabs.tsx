import type { IdentityStoreSubTab } from "./app-settings-types";
import { IDENTITY_STORE_SUBTABS } from "./app-settings-constants";

export type IdentityStoreSubtabsProps = {
  identityStoreSubTab: IdentityStoreSubTab;
  setIdentityStoreSubTab: (tab: IdentityStoreSubTab) => void;
};

export function IdentityStoreSubtabs({ identityStoreSubTab, setIdentityStoreSubTab }: IdentityStoreSubtabsProps) {
  return (
    <div className="app-settings-subtabs" role="tablist" aria-label="Identity store sections">
      {IDENTITY_STORE_SUBTABS.map((sub) => (
        <button
          key={sub.id}
          type="button"
          role="tab"
          aria-selected={identityStoreSubTab === sub.id}
          className={`settings-tab settings-subtab ${identityStoreSubTab === sub.id ? "is-active" : ""}`}
          onClick={() => setIdentityStoreSubTab(sub.id)}
        >
          {sub.label}
        </button>
      ))}
    </div>
  );
}
