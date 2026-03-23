import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __forgetWebviewLabelForOriginForTests,
  __resetProxmoxWebviewReuseForTests,
  openProxmoxInAppWebviewWindow,
} from "./proxmox-webview-window";

vi.mock("../tauri-api", () => ({
  openInAppWebviewWindow: vi.fn().mockResolvedValue("web-label-new"),
  navigateInAppWebviewWindow: vi.fn().mockResolvedValue(undefined),
}));

import { navigateInAppWebviewWindow, openInAppWebviewWindow } from "../tauri-api";

describe("openProxmoxInAppWebviewWindow", () => {
  beforeEach(() => {
    __resetProxmoxWebviewReuseForTests();
    vi.mocked(openInAppWebviewWindow).mockClear();
    vi.mocked(navigateInAppWebviewWindow).mockClear();
    vi.mocked(navigateInAppWebviewWindow).mockResolvedValue(undefined);
    vi.mocked(openInAppWebviewWindow).mockResolvedValue("web-label-new");
  });

  afterEach(() => {
    __resetProxmoxWebviewReuseForTests();
  });

  it("opens a new webview with root URL when console deep link", async () => {
    const r = await openProxmoxInAppWebviewWindow({
      title: "noVNC",
      consoleUrl: "https://pve:8006/?console=kvm&novnc=1&vmid=1&node=n",
      allowInsecureTls: false,
    });
    expect(r.reused).toBe(false);
    expect(r.loginFirst).toBe(true);
    expect(r.label).toBe("web-label-new");
    expect(openInAppWebviewWindow).toHaveBeenCalledWith(
      "noVNC",
      "https://pve:8006/",
      false,
      "https://pve:8006/?console=kvm&novnc=1&vmid=1&node=n",
    );
    expect(navigateInAppWebviewWindow).not.toHaveBeenCalled();
  });

  it("reuses origin: second open navigates instead of creating a window", async () => {
    const u1 = "https://pve:8006/?console=kvm&novnc=1&vmid=1&node=n";
    const u2 = "https://pve:8006/?console=kvm&novnc=1&vmid=2&node=n";
    await openProxmoxInAppWebviewWindow({ title: "a", consoleUrl: u1, allowInsecureTls: true });
    const r2 = await openProxmoxInAppWebviewWindow({ title: "b", consoleUrl: u2, allowInsecureTls: true });
    expect(r2.reused).toBe(true);
    expect(r2.label).toBe("web-label-new");
    expect(navigateInAppWebviewWindow).toHaveBeenCalledWith("web-label-new", u2);
    expect(openInAppWebviewWindow).toHaveBeenCalledTimes(1);
  });

  it("opens again after navigate fails (stale label)", async () => {
    const u = "https://pve:8006/?console=kvm&novnc=1&vmid=1&node=n";
    await openProxmoxInAppWebviewWindow({ title: "a", consoleUrl: u, allowInsecureTls: false });
    vi.mocked(navigateInAppWebviewWindow).mockRejectedValueOnce(new Error("closed"));
    const r2 = await openProxmoxInAppWebviewWindow({ title: "b", consoleUrl: u, allowInsecureTls: false });
    expect(r2.reused).toBe(false);
    expect(openInAppWebviewWindow).toHaveBeenCalledTimes(2);
  });

  it("opens root first for new webview after forgetting origin label", async () => {
    const u = "https://pve:8006/?console=kvm&novnc=1&vmid=1&node=n";
    await openProxmoxInAppWebviewWindow({ title: "a", consoleUrl: u, allowInsecureTls: false });
    __forgetWebviewLabelForOriginForTests("https://pve:8006");
    const r = await openProxmoxInAppWebviewWindow({ title: "b", consoleUrl: u, allowInsecureTls: true });
    expect(r.loginFirst).toBe(true);
    expect(openInAppWebviewWindow).toHaveBeenLastCalledWith("b", "https://pve:8006/", true, u);
  });
});
