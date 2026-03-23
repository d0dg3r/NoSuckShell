import { describe, expect, it } from "vitest";
import { buildProxmoxConsoleWebSocketUrl, parseProxmoxConsoleProxyData } from "./proxmox-console-ws";

describe("parseProxmoxConsoleProxyData", () => {
  it("reads port and ticket from object", () => {
    expect(parseProxmoxConsoleProxyData({ port: 5900, ticket: "PVEVNC:abc" })).toEqual({
      port: 5900,
      ticket: "PVEVNC:abc",
    });
  });

  it("accepts string port", () => {
    expect(parseProxmoxConsoleProxyData({ port: "5900", ticket: "x" })).toEqual({ port: "5900", ticket: "x" });
  });

  it("returns null when fields missing", () => {
    expect(parseProxmoxConsoleProxyData({ port: 1 })).toBeNull();
    expect(parseProxmoxConsoleProxyData(null)).toBeNull();
  });
});

describe("buildProxmoxConsoleWebSocketUrl", () => {
  it("builds qemu vncwebsocket wss URL with encoded ticket", () => {
    const u = buildProxmoxConsoleWebSocketUrl(
      "https://pve.local:8006",
      "node1",
      "100",
      "qemu",
      { port: 5900, ticket: "PVEVNC:1+2/3" },
    );
    expect(u.startsWith("wss://pve.local:8006/api2/json/nodes/node1/qemu/100/vncwebsocket?")).toBe(true);
    expect(u).toContain("port=5900");
    expect(u).toContain(encodeURIComponent("PVEVNC:1+2/3"));
  });

  it("builds lxc path segment", () => {
    const u = buildProxmoxConsoleWebSocketUrl(
      "https://host:8006/",
      "n",
      "200",
      "lxc",
      { port: 1, ticket: "t" },
    );
    expect(u).toContain("/nodes/n/lxc/200/vncwebsocket");
  });
});
