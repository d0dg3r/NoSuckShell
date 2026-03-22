import { describe, expect, it } from "vitest";
import { proxmuxCategory, proxmuxPower } from "./ProxmuxSidebarPanel";

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
