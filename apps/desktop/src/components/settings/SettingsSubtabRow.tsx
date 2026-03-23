export type SettingsSubtabRowProps<T extends string> = {
  ariaLabel: string;
  tabs: Array<{ id: T; label: string }>;
  activeTab: T;
  onSelect: (id: T) => void;
};

export function SettingsSubtabRow<T extends string>({
  ariaLabel,
  tabs,
  activeTab,
  onSelect,
}: SettingsSubtabRowProps<T>) {
  return (
    <div className="app-settings-subtabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`settings-tab settings-subtab ${activeTab === tab.id ? "is-active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
