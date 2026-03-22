import { describe, expect, it } from "vitest";
import { buildProxmoxConsoleUrl, normalizeProxmoxBaseUrl } from "./proxmox-console-urls";

describe("normalizeProxmoxBaseUrl", () => {
  it("trims and strips trailing slashes", () => {
    expect(normalizeProxmoxBaseUrl("  https://pve:8006///  ")).toBe("https://pve:8006");
  });
});

describe("buildProxmoxConsoleUrl", () => {
  it("encodes node and vmid for qemu", () => {
    const u = buildProxmoxConsoleUrl("https://pve.local:8006", {
      kind: "qemu",
      node: "hv_a",
      vmid: "100",
    });
    expect(u).toBe("https://pve.local:8006/?console=kvm&novnc=1&vmid=100&node=hv_a");
  });

  it("encodes special characters in node name", () => {
    const u = buildProxmoxConsoleUrl("https://x", {
      kind: "node",
      node: "a b",
    });
    expect(u).toContain("node=a%20b");
    expect(u).toContain("console=shell");
    expect(u).toContain("xtermjs=1");
  });

  it("builds lxc shell URL", () => {
    const u = buildProxmoxConsoleUrl("https://host", { kind: "lxc", node: "n", vmid: "200" });
    expect(u).toBe("https://host/?console=lxc&xtermjs=1&vmid=200&node=n");
  });
});
