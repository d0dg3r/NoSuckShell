import { fireEvent, render, screen } from "@testing-library/react";
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
});
