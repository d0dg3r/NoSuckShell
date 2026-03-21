import { fireEvent, render, screen } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostRowViewModel } from "../features/view-profile-filters";
import type { HostConfig, HostMetadata } from "../types";
import { HostListRow, type HostListRowBridgeProps } from "./HostListRow";

const sampleHost: HostConfig = {
  host: "mybox",
  hostName: "mybox.example",
  user: "deploy",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
};

const sampleMetadata: HostMetadata = {
  favorite: false,
  tags: [],
  lastUsedAt: null,
  trustHostDefault: false,
};

function sampleRow(overrides: Partial<HostRowViewModel> = {}): HostRowViewModel {
  return {
    host: sampleHost,
    metadata: sampleMetadata,
    connected: false,
    displayUser: "deploy",
    ...overrides,
  };
}

function noopBridge(overrides: Partial<HostListRowBridgeProps> = {}): HostListRowBridgeProps {
  const suppressHostClickAliasRef: MutableRefObject<string | null> = { current: null };
  const missingDragPayloadLoggedRef: MutableRefObject<boolean> = { current: false };

  return {
    activeHost: "",
    openHostMenuHostAlias: "",
    currentHost: sampleHost,
    setCurrentHost: vi.fn(),
    hosts: [sampleHost],
    tagDraft: "",
    setTagDraft: vi.fn(),
    activeHostMetadata: sampleMetadata,
    error: "",
    canSave: true,
    pendingRemoveConfirm: null,
    suppressHostClickAliasRef,
    setContextMenu: vi.fn(),
    setHostContextMenu: vi.fn(),
    setHoveredHostAlias: vi.fn(),
    setActiveHost: vi.fn(),
    setDragOverPaneIndex: vi.fn(),
    setError: vi.fn(),
    toggleFavoriteForHost: vi.fn(),
    toggleHostSelection: vi.fn(),
    connectToHostInNewPane: vi.fn(),
    setDragPayload: vi.fn(),
    setDraggingKind: vi.fn(),
    missingDragPayloadLoggedRef,
    toggleHostMenu: vi.fn(),
    onSave: vi.fn(),
    saveTagsForActiveHost: vi.fn(),
    handleRemoveHostIntent: vi.fn(),
    ...overrides,
  };
}

describe("HostListRow", () => {
  it("renders host alias and display user", () => {
    render(<HostListRow row={sampleRow()} {...noopBridge()} />);
    expect(screen.getByText("mybox")).toBeInTheDocument();
    expect(screen.getByText("deploy")).toBeInTheDocument();
  });

  it("calls toggleFavoriteForHost when favorite is clicked", () => {
    const toggleFavoriteForHost = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ toggleFavoriteForHost })} />);
    const rowEl = container.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    const btn = rowEl!.querySelector<HTMLButtonElement>('[aria-label="Toggle favorite for mybox"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(toggleFavoriteForHost).toHaveBeenCalledWith("mybox");
  });

  it("calls toggleHostSelection when host item is activated", () => {
    const toggleHostSelection = vi.fn();
    const { container } = render(<HostListRow row={sampleRow()} {...noopBridge({ toggleHostSelection })} />);
    const rowEl = container.querySelector(".host-row");
    expect(rowEl).toBeTruthy();
    const hostItem = rowEl!.querySelector<HTMLElement>('[aria-label="SSH host mybox"]');
    expect(hostItem).toBeTruthy();
    fireEvent.click(hostItem!);
    expect(toggleHostSelection).toHaveBeenCalledWith(sampleHost);
  });

  it("opens slide panel with HostForm when menu is open for this row", () => {
    render(
      <HostListRow
        row={sampleRow()}
        {...noopBridge({
          openHostMenuHostAlias: "mybox",
          activeHost: "mybox",
        })}
      />,
    );
    expect(screen.getAllByDisplayValue("mybox")[0]).toBeInTheDocument();
  });
});
