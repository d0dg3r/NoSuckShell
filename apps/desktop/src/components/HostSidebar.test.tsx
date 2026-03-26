import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostSidebarProps } from "./HostSidebar";
import { HostSidebar } from "./HostSidebar";
import { noopBridge, sampleRow } from "../test/host-list-row-fixtures";

function minimalHostSidebarProps(overrides: Partial<HostSidebarProps> = {}): HostSidebarProps {
  return {
    isSidebarOpen: true,
    isSidebarPinned: true,
    onToggleSidebarPinned: vi.fn(),
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
    logoSrc: "",
    isQuickAddMenuOpen: false,
    quickAddMenuRef: { current: null },
    onOpenSettings: vi.fn(),
    onToggleQuickAddMenu: vi.fn(),
    onConnectLocalInActivePane: vi.fn(),
    onOpenQuickConnect: vi.fn(),
    onOpenAddHost: vi.fn(),
    onOpenIdentityStoreSubTab: vi.fn(),
    onCreateWorkspace: vi.fn(),
    sidebarViews: [{ id: "builtin:all", label: "All" }],
    selectedSidebarViewId: "builtin:all",
    onSelectSidebarView: vi.fn(),
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    showAdvancedFilters: false,
    onToggleAdvancedFilters: vi.fn(),
    onCloseAdvancedFilters: vi.fn(),
    listFilterCount: 0,
    showHostAdvancedFilters: true,
    searchInputPlaceholder: undefined,
    proxmuxPanel: null,
    hetznerPanel: null,
    statusFilter: "all",
    onStatusFilterChange: vi.fn(),
    portFilter: "",
    onPortFilterChange: vi.fn(),
    availableTags: [],
    selectedTagFilter: "all",
    onSelectedTagFilterChange: vi.fn(),
    recentOnly: false,
    onToggleRecent: vi.fn(),
    onClearFilters: vi.fn(),
    connectedHostRows: [],
    otherHostRows: [],
    hostListRowBridge: noopBridge(),
    isBroadcastModeEnabled: false,
    broadcastTargetCount: 0,
    ...overrides,
  };
}

describe("HostSidebar", () => {
  it("shows empty state when filtered host count is zero", () => {
    render(<HostSidebar {...minimalHostSidebarProps()} />);
    expect(screen.getByText(/No hosts match/i)).toBeInTheDocument();
  });

  it("renders a host row when filters yield hosts", () => {
    const { container } = render(
      <HostSidebar
        {...minimalHostSidebarProps({
          listFilterCount: 1,
          otherHostRows: [sampleRow()],
        })}
      />,
    );
    const hostList = container.querySelector(".host-list");
    expect(hostList).toBeTruthy();
    const rowEl = hostList!.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    expect(rowEl!.textContent).toContain("mybox");
  });

  it("calls onOpenSettings when the app settings button is clicked", () => {
    const onOpenSettings = vi.fn();
    const { container } = render(<HostSidebar {...minimalHostSidebarProps({ onOpenSettings })} />);
    const aside = container.querySelector("aside.left-rail");
    expect(aside).toBeTruthy();
    const btn = aside!.querySelector<HTMLButtonElement>('[aria-label="Open app settings"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleSidebarPinned when the pin sidebar button is clicked", () => {
    const onToggleSidebarPinned = vi.fn();
    const { container } = render(
      <HostSidebar {...minimalHostSidebarProps({ onToggleSidebarPinned, isSidebarPinned: false })} />,
    );
    const aside = container.querySelector("aside.left-rail");
    expect(aside).toBeTruthy();
    const btn = aside!.querySelector<HTMLButtonElement>(
      '[aria-label="Pin sidebar — keep host list visible"]',
    );
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onToggleSidebarPinned).toHaveBeenCalledTimes(1);
  });

  it("renders proxmux panel when PROXMUX tab is active", () => {
    const { container } = render(
      <HostSidebar
        {...minimalHostSidebarProps({
          sidebarViews: [
            { id: "builtin:all", label: "All" },
            { id: "builtin:proxmux", label: "PROXMUX" },
          ],
          selectedSidebarViewId: "builtin:proxmux",
          listFilterCount: 0,
          showHostAdvancedFilters: false,
          proxmuxPanel: <div data-testid="proxmux-panel">Proxmox UI</div>,
        })}
      />,
    );
    expect(screen.getByTestId("proxmux-panel")).toBeInTheDocument();
    expect(container.querySelector(".filter-toggle-btn")).toBeNull();
  });

  it("renders hetzner panel when HETZNER tab is active", () => {
    const { container } = render(
      <HostSidebar
        {...minimalHostSidebarProps({
          sidebarViews: [
            { id: "builtin:all", label: "All" },
            { id: "builtin:hetzner", label: "HETZNER" },
          ],
          selectedSidebarViewId: "builtin:hetzner",
          listFilterCount: 0,
          showHostAdvancedFilters: false,
          hetznerPanel: <div data-testid="hetzner-panel">Hetzner UI</div>,
        })}
      />,
    );
    expect(screen.getByTestId("hetzner-panel")).toBeInTheDocument();
    expect(container.querySelector(".filter-toggle-btn")).toBeNull();
  });

  it("calls onToggleQuickAddMenu when the Add dropdown trigger is clicked", () => {
    const onToggleQuickAddMenu = vi.fn();
    const { container } = render(
      <HostSidebar {...minimalHostSidebarProps({ onToggleQuickAddMenu })} />,
    );
    const aside = container.querySelector("aside.left-rail");
    expect(aside).toBeTruthy();
    const btn = aside!.querySelector<HTMLButtonElement>('[aria-label="Open add menu"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onToggleQuickAddMenu).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenIdentityStoreSubTab when Add user is chosen from the quick-add menu", () => {
    const onOpenIdentityStoreSubTab = vi.fn();
    render(
      <HostSidebar
        {...minimalHostSidebarProps({
          isQuickAddMenuOpen: true,
          onOpenIdentityStoreSubTab,
        })}
      />,
    );
    fireEvent.click(within(screen.getByRole("menu")).getByRole("button", { name: "Add user" }));
    expect(onOpenIdentityStoreSubTab).toHaveBeenCalledTimes(1);
    expect(onOpenIdentityStoreSubTab).toHaveBeenCalledWith("users");
  });

  it("calls onCreateWorkspace when New workspace is chosen from the quick-add menu", () => {
    const onCreateWorkspace = vi.fn();
    render(
      <HostSidebar
        {...minimalHostSidebarProps({
          isQuickAddMenuOpen: true,
          onCreateWorkspace,
        })}
      />,
    );
    const menus = screen.getAllByRole("menu");
    const menu = menus[menus.length - 1];
    fireEvent.click(within(menu).getByRole("button", { name: "New workspace" }));
    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
  });

  it("renders sidebar footer with broadcast status", () => {
    const { container } = render(
      <HostSidebar
        {...minimalHostSidebarProps({
          isBroadcastModeEnabled: true,
          broadcastTargetCount: 2,
        })}
      />,
    );
    const footer = container.querySelector(".left-rail-sidebar-footer");
    expect(footer).toBeTruthy();
    expect(within(footer as HTMLElement).getByText(/Broadcast: enabled \(2 targets\)/)).toBeInTheDocument();
  });
});
