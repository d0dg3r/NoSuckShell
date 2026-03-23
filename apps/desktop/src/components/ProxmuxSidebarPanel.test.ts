import { describe, expect, it } from "vitest";
import {
  expandableProxmuxRow,
  expansionKeyForRow,
  proxmuxCategory,
  proxmuxPower,
  resourceIpStat,
} from "./ProxmuxSidebarPanel";

describe("proxmuxCategory / proxmuxPower", () => {
  it("classifies nodes and power", () => {
    expect(proxmuxCategory({ type: "node", status: "online" })).toBe("node");
    expect(proxmuxPower({ type: "node", status: "online" })).toBe("up");
    expect(proxmuxPower({ type: "node", status: "offline" })).toBe("down");
  });

  it("classifies qemu vs qemu-template from template flag", () => {
    expect(proxmuxCategory({ type: "qemu", template: 0, status: "running" })).toBe("qemu");
    expect(proxmuxCategory({ type: "qemu", template: 1, status: "stopped" })).toBe("qemu-template");
    expect(proxmuxCategory({ type: "qemu", template: true })).toBe("qemu-template");
    expect(proxmuxPower({ type: "qemu", template: 1, status: "stopped" })).toBe("template");
  });

  it("classifies lxc power", () => {
    expect(proxmuxCategory({ type: "lxc" })).toBe("lxc");
    expect(proxmuxPower({ type: "lxc", status: "running" })).toBe("up");
    expect(proxmuxPower({ type: "lxc", status: "stopped" })).toBe("down");
  });

  it("falls back unknown type to node", () => {
    expect(proxmuxCategory({ type: "storage" })).toBe("node");
  });
});

describe("expansionKeyForRow / expandableProxmuxRow", () => {
  it("uses guestKey for qemu and lxc", () => {
    expect(expansionKeyForRow({ type: "qemu", node: "pve", vmid: 100 })).toBe("qemu:pve:100");
    expect(expansionKeyForRow({ type: "lxc", node: "pve", vmid: 200 })).toBe("lxc:pve:200");
    expect(expandableProxmuxRow({ type: "qemu", node: "pve", vmid: 1 })).toBe(true);
  });

  it("uses node: prefix for PVE nodes", () => {
    expect(expansionKeyForRow({ type: "node", node: "px01", status: "online" })).toBe("node:px01");
    expect(expandableProxmuxRow({ type: "node", node: "px01" })).toBe(true);
  });

  it("returns null for types without slide expansion", () => {
    expect(expansionKeyForRow({ type: "storage" })).toBe(null);
    expect(expandableProxmuxRow({ type: "storage" })).toBe(false);
  });

  it("returns null for node row missing node name", () => {
    expect(expansionKeyForRow({ type: "node", status: "online" })).toBe(null);
    expect(expandableProxmuxRow({ type: "node", status: "online" })).toBe(false);
  });
});

describe("resourceIpStat", () => {
  it("shows em dash when missing or blank", () => {
    expect(resourceIpStat({}, "ip4")).toBe("—");
    expect(resourceIpStat({ ip4: "" }, "ip4")).toBe("—");
    expect(resourceIpStat({ ip4: "   " }, "ip4")).toBe("—");
    expect(resourceIpStat({}, "ip6")).toBe("—");
  });

  it("returns trimmed address strings", () => {
    expect(resourceIpStat({ ip4: " 10.0.0.1 " }, "ip4")).toBe("10.0.0.1");
    expect(resourceIpStat({ ip6: "2001:db8::1" }, "ip6")).toBe("2001:db8::1");
  });
});
