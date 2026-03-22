import { useEffect, useRef, type ReactNode, type RefObject } from "react";
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
  onCloseAdvancedFilters: () => void;
  statusFilter: HostStatusFilter;
  onStatusFilterChange: (value: HostStatusFilter) => void;
  portFilter: string;
  onPortFilterChange: (value: string) => void;
  availableTags: string[];
  selectedTagFilter: string;
  onSelectedTagFilterChange: (value: string) => void;
  recentOnly: boolean;
  onToggleRecent: () => void;
  onClearFilters: () => void;
  /** Shown in the filter row count pill (host rows or Proxmox resource count). */
  listFilterCount: number;
  /** When false, hides host-only advanced filters (Status / Port / Tag). */
  showHostAdvancedFilters: boolean;
  /** Optional search field placeholder (e.g. Proxmox filter hint). */
  searchInputPlaceholder?: string;
  /** When the PROXMUX sidebar tab is selected, render this instead of SSH host rows. */
  proxmuxPanel: ReactNode | null;
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
  onCloseAdvancedFilters,
  statusFilter,
  onStatusFilterChange,
  portFilter,
  onPortFilterChange,
  availableTags,
  selectedTagFilter,
  onSelectedTagFilterChange,
  recentOnly,
  onToggleRecent,
  onClearFilters,
  listFilterCount,
  showHostAdvancedFilters,
  searchInputPlaceholder,
  proxmuxPanel,
  connectedHostRows,
  otherHostRows,
  hostListRowBridge,
}: HostSidebarProps) {
  const hostFilterPopoverRef = useRef<HTMLDivElement>(null);
  const isProxmuxView = selectedSidebarViewId === "builtin:proxmux" && proxmuxPanel != null;

  useEffect(() => {
    if (!showAdvancedFilters) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (hostFilterPopoverRef.current && !hostFilterPopoverRef.current.contains(target)) {
        onCloseAdvancedFilters();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showAdvancedFilters, onCloseAdvancedFilters]);

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
          <div className="brand-bar-logo-row">
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
                  className="sidebar-pin-outer"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                />
                <circle className="sidebar-pin-inner" cx="12" cy="10.5" r="2.5" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <div className="brand-logo-area">
              <img src={logoSrc} alt="NoSuckShell logo" className="brand-logo" />
            </div>
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
          </div>
          <div className="quick-add-wrap brand-quick-add-wrap">
            <button
              type="button"
              className="btn brand-quick-add-trigger"
              aria-label="Open add menu"
              aria-expanded={isQuickAddMenuOpen}
              aria-haspopup="menu"
              aria-controls={isQuickAddMenuOpen ? "brand-sidebar-quick-add-menu" : undefined}
              title="Add host, terminal, or connection"
              onClick={onToggleQuickAddMenu}
            >
              <svg className="brand-quick-add-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
              </svg>
              <span className="brand-quick-add-trigger-label">ADD</span>
              <svg className="brand-quick-add-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
              </svg>
            </button>
          </div>
          {isQuickAddMenuOpen && (
            <div className="quick-add-menu" id="brand-sidebar-quick-add-menu" role="menu">
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
        <div className="host-filter-controls" ref={hostFilterPopoverRef}>
          <div className="filter-head-row">
            <input
              className="input host-search-input"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={searchInputPlaceholder ?? "Search alias, hostname, user"}
            />
            {showHostAdvancedFilters ? (
              <button
                type="button"
                className={`btn filter-toggle-btn ${showAdvancedFilters ? "is-open" : ""}`}
                onClick={onToggleAdvancedFilters}
                aria-expanded={showAdvancedFilters}
                aria-controls="advanced-host-filters"
                aria-label="More filters"
                title="More filters"
              >
                Filters {showAdvancedFilters ? "−" : "+"}
              </button>
            ) : null}
            <span className="host-filter-count pill-muted" aria-live="polite">
              {listFilterCount}
            </span>
          </div>
          {showHostAdvancedFilters && showAdvancedFilters ? (
            <div
              id="advanced-host-filters"
              className="host-filter-popover"
              role="region"
              aria-label="Host list filters"
            >
              <div className="host-filter-popover-fields">
                <label className="host-filter-field">
                  <span className="host-filter-field-label">Status</span>
                  <select
                    className="input"
                    value={statusFilter}
                    onChange={(event) => onStatusFilterChange(event.target.value as HostStatusFilter)}
                  >
                    <option value="all">All status</option>
                    <option value="connected">Connected</option>
                    <option value="disconnected">Disconnected</option>
                  </select>
                </label>
                <label className="host-filter-field">
                  <span className="host-filter-field-label">Port</span>
                  <input
                    className="input"
                    type="number"
                    value={portFilter}
                    onChange={(event) => onPortFilterChange(event.target.value)}
                    placeholder="Any port"
                  />
                </label>
                <label className="host-filter-field">
                  <span className="host-filter-field-label">Tag</span>
                  <select
                    className="input"
                    value={selectedTagFilter}
                    onChange={(event) => onSelectedTagFilterChange(event.target.value)}
                  >
                    <option value="all">All tags</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="host-filter-popover-actions">
                  <button type="button" className={`btn ${recentOnly ? "btn-primary" : ""}`} onClick={onToggleRecent}>
                    Recent first
                  </button>
                  <button type="button" className="btn" onClick={onClearFilters}>
                    Reset filters
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="host-list">
        {isProxmuxView ? (
          proxmuxPanel
        ) : listFilterCount === 0 ? (
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
