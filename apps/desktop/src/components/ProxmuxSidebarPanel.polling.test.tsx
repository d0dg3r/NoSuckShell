import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxmuxSidebarPanel } from "./ProxmuxSidebarPanel";

const pluginInvokeMock = vi.fn<
  (pluginId: string, method: string, arg: Record<string, unknown>) => Promise<unknown>
>();
let originalLocalStorage: Storage | undefined;

vi.mock("../tauri-api", () => ({
  pluginInvoke: (...args: [string, string, Record<string, unknown>]) => pluginInvokeMock(...args),
}));

function buildResourceRow() {
  return {
    type: "qemu",
    vmid: 101,
    name: "vm-101",
    node: "pve-a",
    status: "running",
    template: 0,
  };
}

function renderPanel() {
  return render(
    <ProxmuxSidebarPanel
      searchQuery=""
      onResourceCountChange={vi.fn()}
      onOpenProxmoxExternalUrl={vi.fn()}
      onOpenProxmoxSpice={vi.fn()}
      onSshToProxmoxNode={vi.fn()}
    />,
  );
}

describe("ProxmuxSidebarPanel guest status polling cadence", () => {
  beforeEach(() => {
    pluginInvokeMock.mockReset();
    pluginInvokeMock.mockImplementation(async (_pluginId, method) => {
      if (method === "listState") {
        return {
          activeClusterId: "cluster-a",
          clusters: [{ id: "cluster-a", name: "Cluster A", proxmoxUrl: "https://pve-a.example" }],
          favoritesByCluster: {},
        };
      }
      if (method === "fetchResources") {
        return { ok: true, resources: [buildResourceRow()] };
      }
      if (method === "guestStatus") {
        return { ok: true, data: { status: "running", cpu: 0.12, uptime: 120 } };
      }
      if (method === "qemuSpiceCapable") {
        return { ok: true, spiceCapable: false };
      }
      if (method === "toggleProxmuxFavorite") {
        return { ok: true, favorites: [] };
      }
      return { ok: true };
    });
    vi.spyOn(Math, "random").mockReturnValue(0);
    if (typeof window.localStorage?.getItem !== "function") {
      originalLocalStorage = window.localStorage as Storage | undefined;
      const localStorageMock = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      } as unknown as Storage;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: localStorageMock,
      });
    }
  });

  afterEach(() => {
    cleanup();
    if (originalLocalStorage != null) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
      originalLocalStorage = undefined;
    }
    vi.restoreAllMocks();
  });

  async function sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("does not poll guest status before the 5s adaptive baseline", async () => {
    const { container } = renderPanel();
    await waitFor(() => {
      expect(container.querySelector(".proxmux-sidebar-row--guest")).toBeTruthy();
    });
    const guestRow = container.querySelector<HTMLElement>(".proxmux-sidebar-row--guest");
    expect(guestRow).toBeTruthy();
    fireEvent.click(guestRow!);
    await waitFor(() =>
      expect(pluginInvokeMock).toHaveBeenCalledWith(
        expect.any(String),
        "guestStatus",
        expect.objectContaining({ vmid: "101", node: "pve-a" }),
      ),
    );
    const guestStatusCallsAfterOpen = pluginInvokeMock.mock.calls.filter((c) => c[1] === "guestStatus").length;
    expect(guestStatusCallsAfterOpen).toBe(1);

    await sleep(4_900);

    const guestStatusCallsBeforeBaseline = pluginInvokeMock.mock.calls.filter((c) => c[1] === "guestStatus").length;
    expect(guestStatusCallsBeforeBaseline).toBe(1);
  }, 15_000);

  it("skips adaptive poll ticks while document is hidden", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    const { container } = renderPanel();
    await waitFor(() => {
      expect(container.querySelector(".proxmux-sidebar-row--guest")).toBeTruthy();
    });
    const guestRow = container.querySelector<HTMLElement>(".proxmux-sidebar-row--guest");
    expect(guestRow).toBeTruthy();
    fireEvent.click(guestRow!);
    await waitFor(() => {
      expect(pluginInvokeMock.mock.calls.filter((c) => c[1] === "guestStatus").length).toBe(1);
    });

    visibilityState = "hidden";
    await sleep(6_200);

    const guestStatusCallsWhenHidden = pluginInvokeMock.mock.calls.filter((c) => c[1] === "guestStatus").length;
    expect(guestStatusCallsWhenHidden).toBe(1);
  }, 15_000);
});
