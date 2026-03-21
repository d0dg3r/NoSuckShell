import type { MutableRefObject } from "react";
import { vi } from "vitest";
import type { HostRowViewModel } from "../features/view-profile-filters";
import type { HostConfig, HostMetadata } from "../types";
import type { HostListRowBridgeProps } from "../components/HostListRow";

export const sampleHost: HostConfig = {
  host: "mybox",
  hostName: "mybox.example",
  user: "deploy",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
};

export const sampleMetadata: HostMetadata = {
  favorite: false,
  tags: [],
  lastUsedAt: null,
  trustHostDefault: false,
};

export function sampleRow(overrides: Partial<HostRowViewModel> = {}): HostRowViewModel {
  return {
    host: sampleHost,
    metadata: sampleMetadata,
    connected: false,
    displayUser: "deploy",
    ...overrides,
  };
}

export function noopBridge(overrides: Partial<HostListRowBridgeProps> = {}): HostListRowBridgeProps {
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
