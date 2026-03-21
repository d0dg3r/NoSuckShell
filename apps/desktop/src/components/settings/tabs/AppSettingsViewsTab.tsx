import type React from "react";
import type {
  ViewFilterField,
  ViewFilterOperator,
  ViewFilterRule,
  ViewProfile,
  ViewSortField,
} from "../../../types";

export type AppSettingsViewsTabProps = {
  sortedViewProfiles: ViewProfile[];
  selectedViewProfileIdInSettings: string;
  selectViewProfileForSettings: (profileId: string) => void;
  createNewViewDraft: () => void;
  reorderView: (direction: "up" | "down") => Promise<void>;
  deleteCurrentViewDraft: () => Promise<void>;
  viewDraft: ViewProfile;
  setViewDraft: React.Dispatch<React.SetStateAction<ViewProfile>>;
  createViewRule: () => ViewFilterRule;
  saveCurrentViewDraft: () => Promise<void>;
};

export function AppSettingsViewsTab({
  sortedViewProfiles,
  selectedViewProfileIdInSettings,
  selectViewProfileForSettings,
  createNewViewDraft,
  reorderView,
  deleteCurrentViewDraft,
  viewDraft,
  setViewDraft,
  createViewRule,
  saveCurrentViewDraft,
}: AppSettingsViewsTabProps) {
  return (
    <div className="settings-stack">
      <section className="view-manager-panel">
        <div className="view-manager-panel-head">
          <span className="field-label">Saved custom views</span>
          {sortedViewProfiles.length === 0 ? (
            <p className="muted-copy view-manager-empty">No custom views yet.</p>
          ) : (
            <div className="app-settings-subtabs view-manager-view-tabs" role="tablist" aria-label="Custom views">
              {sortedViewProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedViewProfileIdInSettings === profile.id}
                  className={`settings-tab settings-subtab ${selectedViewProfileIdInSettings === profile.id ? "is-active" : ""}`}
                  onClick={() => selectViewProfileForSettings(profile.id)}
                >
                  {profile.name}
                </button>
              ))}
            </div>
          )}
          <div className="view-manager-toolbar">
            <button type="button" className="btn btn-settings-tool" onClick={createNewViewDraft}>
              New view
            </button>
            <button
              type="button"
              className="btn btn-settings-tool"
              onClick={() => void reorderView("up")}
              disabled={!selectedViewProfileIdInSettings}
            >
              Move up
            </button>
            <button
              type="button"
              className="btn btn-settings-tool"
              onClick={() => void reorderView("down")}
              disabled={!selectedViewProfileIdInSettings}
            >
              Move down
            </button>
            <button
              type="button"
              className="btn btn-settings-tool btn-settings-danger"
              onClick={() => void deleteCurrentViewDraft()}
              disabled={!selectedViewProfileIdInSettings}
            >
              Delete
            </button>
          </div>
        </div>
        <div className="view-manager-editor">
          <label className="field view-manager-field-name">
            <span className="field-label">View name</span>
            <input
              className="input"
              value={viewDraft.name}
              onChange={(event) => setViewDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Production hosts"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="view-manager-rules-block">
            <span className="view-manager-block-label">Filter rules</span>
            <div className="filter-row view-manager-rule-mode-row">
              <label className="field">
                <span className="field-label">Rule mode</span>
                <select
                  className="input density-profile-select"
                  value={viewDraft.filterGroup.mode}
                  onChange={(event) =>
                    setViewDraft((prev) => ({
                      ...prev,
                      filterGroup: { ...prev.filterGroup, mode: event.target.value as "and" | "or" },
                    }))
                  }
                >
                  <option value="and">All rules (AND)</option>
                  <option value="or">Any rule (OR)</option>
                </select>
              </label>
            </div>
            <div className="view-rule-list">
              {viewDraft.filterGroup.rules.map((rule) => (
                <div className="filter-row view-rule-row" key={rule.id}>
                  <select
                    className="input density-profile-select"
                    value={rule.field}
                    onChange={(event) =>
                      setViewDraft((prev) => ({
                        ...prev,
                        filterGroup: {
                          ...prev.filterGroup,
                          rules: prev.filterGroup.rules.map((entry) =>
                            entry.id === rule.id ? { ...entry, field: event.target.value as ViewFilterField } : entry,
                          ),
                        },
                      }))
                    }
                  >
                    <option value="host">Alias</option>
                    <option value="hostName">Hostname</option>
                    <option value="user">User</option>
                    <option value="port">Port</option>
                    <option value="status">Status</option>
                    <option value="favorite">Favorite</option>
                    <option value="recent">Recent</option>
                    <option value="tag">Tag</option>
                  </select>
                  <select
                    className="input density-profile-select"
                    value={rule.operator}
                    onChange={(event) =>
                      setViewDraft((prev) => ({
                        ...prev,
                        filterGroup: {
                          ...prev.filterGroup,
                          rules: prev.filterGroup.rules.map((entry) =>
                            entry.id === rule.id
                              ? { ...entry, operator: event.target.value as ViewFilterOperator }
                              : entry,
                          ),
                        },
                      }))
                    }
                  >
                    <option value="contains">contains</option>
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="starts_with">starts with</option>
                    <option value="ends_with">ends with</option>
                    <option value="greater_than">greater than</option>
                    <option value="less_than">less than</option>
                    <option value="in">in (comma separated)</option>
                  </select>
                  <input
                    className="input view-rule-value-input"
                    value={rule.value}
                    onChange={(event) =>
                      setViewDraft((prev) => ({
                        ...prev,
                        filterGroup: {
                          ...prev.filterGroup,
                          rules: prev.filterGroup.rules.map((entry) =>
                            entry.id === rule.id ? { ...entry, value: event.target.value } : entry,
                          ),
                        },
                      }))
                    }
                    placeholder="value"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn btn-settings-tool btn-settings-danger"
                    onClick={() =>
                      setViewDraft((prev) => ({
                        ...prev,
                        filterGroup: {
                          ...prev.filterGroup,
                          rules: prev.filterGroup.rules.filter((entry) => entry.id !== rule.id),
                        },
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="action-row action-row--view-manager">
              <button
                type="button"
                className="btn btn-settings-tool"
                onClick={() =>
                  setViewDraft((prev) => ({
                    ...prev,
                    filterGroup: { ...prev.filterGroup, rules: [...prev.filterGroup.rules, createViewRule()] },
                  }))
                }
              >
                Add rule
              </button>
            </div>
          </div>
          <div className="view-manager-editor-footer">
            <span className="view-manager-footer-label">Sort & save</span>
            <div className="filter-row view-manager-sort-row">
              <select
                className="input density-profile-select"
                value={viewDraft.sortRules[0]?.field ?? "host"}
                onChange={(event) =>
                  setViewDraft((prev) => ({
                    ...prev,
                    sortRules: [
                      {
                        field: event.target.value as ViewSortField,
                        direction: prev.sortRules[0]?.direction ?? "asc",
                      },
                    ],
                  }))
                }
              >
                <option value="host">Sort by alias</option>
                <option value="hostName">Sort by hostname</option>
                <option value="user">Sort by user</option>
                <option value="port">Sort by port</option>
                <option value="lastUsedAt">Sort by last used</option>
                <option value="status">Sort by status</option>
                <option value="favorite">Sort by favorite</option>
              </select>
              <select
                className="input density-profile-select"
                value={viewDraft.sortRules[0]?.direction ?? "asc"}
                onChange={(event) =>
                  setViewDraft((prev) => ({
                    ...prev,
                    sortRules: [
                      {
                        field: prev.sortRules[0]?.field ?? "host",
                        direction: event.target.value as "asc" | "desc",
                      },
                    ],
                  }))
                }
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
              <button type="button" className="btn btn-settings-commit" onClick={() => void saveCurrentViewDraft()}>
                Save view
              </button>
            </div>
          </div>
        </div>
        <div className="view-manager-after">
          <p className="muted-copy view-manager-footnote">
            Built-in views are fixed (`All`, `Favorites`). Custom views are persisted and shown as sidebar tabs.
          </p>
        </div>
      </section>
    </div>
  );
}
