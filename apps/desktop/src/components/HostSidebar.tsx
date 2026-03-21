import type { RefObject } from "react";
import type { HostStatusFilter, SidebarViewId } from "../features/session-model";
import type { HostRowViewModel } from "../features/view-profile-filters";
import { HostListRow, type HostListRowBridgeProps } from "./HostListRow";

export type HostSidebarView = { id: SidebarViewId; label: string };

export type HostSidebarProps = {
  isSidebarOpen: boolean;
  isSidebarPinned: boolean;
  onToggleSidebarPinned: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  logoSrc: string;
  isQuickAddMenuOpen: boolean;
  quickAddMenuRef: RefObject<HTMLDivElement | null>;
  onOpenSettings: () => void;
  onToggleQuickAddMenu: () => void;
  onConnectLocalInActivePane: () => void;
  onOpenQuickConnect: () => void;
  onOpenAddHost: () => void;
  sidebarViews: HostSidebarView[];
  selectedSidebarViewId: SidebarViewId;
  onSelectSidebarView: (id: SidebarViewId) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showAdvancedFilters: boolean;
  onToggleAdvancedFilters: () => void;
  filteredHostCount: number;
  statusFilter: HostStatusFilter;
  onStatusFilterChange: (value: HostStatusFilter) => void;
  portFilter: string;
  onPortFilterChange: (value: string) => void;
  availableTags: string[];
  selectedTagFilter: string;
  onSelectedTagFilterChange: (value: string) => void;
  favoritesOnly: boolean;
  onToggleFavorites: () => void;
  recentOnly: boolean;
  onToggleRecent: () => void;
  onClearFilters: () => void;
  connectedHostRows: HostRowViewModel[];
  otherHostRows: HostRowViewModel[];
  hostListRowBridge: HostListRowBridgeProps;
};

export function HostSidebar({
  isSidebarOpen,
  isSidebarPinned,
  onToggleSidebarPinned,
  onMouseEnter,
  onMouseLeave,
  logoSrc,
  isQuickAddMenuOpen,
  quickAddMenuRef,
  onOpenSettings,
  onToggleQuickAddMenu,
  onConnectLocalInActivePane,
  onOpenQuickConnect,
  onOpenAddHost,
  sidebarViews,
  selectedSidebarViewId,
  onSelectSidebarView,
  searchQuery,
  onSearchQueryChange,
  showAdvancedFilters,
  onToggleAdvancedFilters,
  filteredHostCount,
  statusFilter,
  onStatusFilterChange,
  portFilter,
  onPortFilterChange,
  availableTags,
  selectedTagFilter,
  onSelectedTagFilterChange,
  favoritesOnly,
  onToggleFavorites,
  recentOnly,
  onToggleRecent,
  onClearFilters,
  connectedHostRows,
  otherHostRows,
  hostListRowBridge,
}: HostSidebarProps) {
  return (
    <aside
      className={`left-rail panel ${isSidebarOpen ? "is-visible" : "is-hidden"} ${
        isSidebarPinned ? "is-pinned" : "is-unpinned"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header className="brand">
        <div className={`brand-bar${isQuickAddMenuOpen ? " is-quick-add-open" : ""}`} ref={quickAddMenuRef}>
          <div className="brand-logo-area">
            <img src={logoSrc} alt="NoSuckShell logo" className="brand-logo" />
          </div>
          <div className="brand-add-column">
            <div className="brand-primary-add-wrap brand-toolbar-cluster">
              <button
                type="button"
                className="btn brand-sidebar-pin-btn"
                aria-pressed={isSidebarPinned}
                aria-label={
                  isSidebarPinned
                    ? "Unpin sidebar — enable auto-hide on mouse leave"
                    : "Pin sidebar — keep host list visible"
                }
                title={isSidebarPinned ? "Pinned — click to allow auto-hide" : "Unpinned — click to keep sidebar always visible"}
                onClick={onToggleSidebarPinned}
              >
                <svg className="sidebar-pin-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2C8.97 2 6.5 4.47 6.5 7.5c0 3.05 3.12 8.08 5.5 10.74 2.38-2.66 5.5-7.69 5.5-10.74C17.5 4.47 15.03 2 12 2zm0 9.25c-1.24 0-2.25-1.01-2.25-2.25S10.76 6.75 12 6.75s2.25 1.01 2.25 2.25S13.24 11.25 12 11.25z"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="btn brand-app-settings-btn"
                aria-label="Open app settings"
                title="App settings"
                onClick={onOpenSettings}
              >
                <svg className="settings-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.72-1.68-.97l-.38-2.65A.51.51 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.58-1.68.97l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.63c-.04.34-.07.67-.07.98s.03.66.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.68.97l.38 2.65c.03.24.24.43.5.43h4c.25 0 .46-.18.49-.42l.38-2.65c.62-.24 1.16-.57 1.68-.97l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.63z"
                  />
                </svg>
              </button>
              <div className="quick-add-wrap brand-quick-add-wrap brand-primary-add-inner">
                <button
                  className="btn host-plus-btn"
                  aria-label="Open add menu"
                  title="Add host"
                  onClick={onToggleQuickAddMenu}
                >
                  <svg className="add-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {isQuickAddMenuOpen && (
            <div className="quick-add-menu" role="menu">
              <button className="quick-add-menu-item" onClick={() => void onConnectLocalInActivePane()}>
                New local terminal
              </button>
              <button className="quick-add-menu-item" onClick={() => void onOpenQuickConnect()}>
                Quick connect terminal
              </button>
              <button className="quick-add-menu-item" onClick={onOpenAddHost}>
                Add host
              </button>
              <button className="quick-add-menu-item" disabled>
                Add group
              </button>
              <button className="quick-add-menu-item" disabled>
                Add user
              </button>
              <button className="quick-add-menu-item" disabled>
                Add key
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="host-filter-card">
        <div className="sidebar-view-tabs" role="tablist" aria-label="Sidebar views">
          {sidebarViews.map((view) => (
            <button
              key={view.id}
              className={`tab-pill sidebar-view-tab ${selectedSidebarViewId === view.id ? "is-active" : ""}`}
              role="tab"
              aria-selected={selectedSidebarViewId === view.id}
              onClick={() => onSelectSidebarView(view.id)}
              title={view.label}
            >
              {view.label}
            </button>
          ))}
        </div>
        <div className="filter-head-row">
          <input
            className="input host-search-input"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search alias, hostname, user"
          />
          <button
            className={`btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`}
            onClick={onToggleAdvancedFilters}
            aria-expanded={showAdvancedFilters}
            aria-controls="advanced-host-filters"
          >
            Filters {showAdvancedFilters ? "−" : "+"}
          </button>
          <span className="pill-muted">{filteredHostCount}</span>
        </div>
        <div id="advanced-host-filters" className={`advanced-filters ${showAdvancedFilters ? "is-open" : ""}`}>
          <div className="filter-row">
            <select className="input" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as HostStatusFilter)}>
              <option value="all">All status</option>
              <option value="connected">Connected</option>
              <option value="disconnected">Disconnected</option>
            </select>
            <input
              className="input"
              type="number"
              value={portFilter}
              onChange={(event) => onPortFilterChange(event.target.value)}
              placeholder="Port"
            />
          </div>
          <div className="filter-row">
            <select className="input" value={selectedTagFilter} onChange={(event) => onSelectedTagFilterChange(event.target.value)}>
              <option value="all">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button className={`btn ${favoritesOnly ? "btn-primary" : ""}`} onClick={onToggleFavorites}>
              Favorites
            </button>
          </div>
          <div className="filter-row">
            <button className={`btn ${recentOnly ? "btn-primary" : ""}`} onClick={onToggleRecent}>
              Recent
            </button>
            <button className="btn" onClick={onClearFilters}>
              Reset filters
            </button>
          </div>
        </div>
      </section>

      <div className="host-list">
        {filteredHostCount === 0 ? (
          <div className="empty-pane">
            <p>No hosts match the active filters.</p>
            <span>Adjust or reset filters to show hosts.</span>
          </div>
        ) : (
          <>
            {connectedHostRows.length > 0 && (
              <div className="host-list-top">
                <p className="host-list-section-title">Connected</p>
                {connectedHostRows.map((row, index) => (
                  <HostListRow
                    key={`connected-${row.host.host}-${row.host.port}-${index}`}
                    row={row}
                    {...hostListRowBridge}
                  />
                ))}
              </div>
            )}
            <div className="host-list-scroll">
              {otherHostRows.map((row, index) => (
                <HostListRow
                  key={`other-${row.host.host}-${row.host.port}-${index}`}
                  row={row}
                  {...hostListRowBridge}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
