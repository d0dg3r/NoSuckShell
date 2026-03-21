import { describe, expect, it } from "vitest";
import {
  buildQuickConnectUserCandidates,
  parseHostPortInput,
  parseQuickConnectCommandInput,
} from "./quick-connect";

describe("quick connect helpers", () => {
  it("parses host only input", () => {
    expect(parseHostPortInput("server.local")).toEqual({ hostName: "server.local" });
  });

  it("parses host with port input", () => {
    expect(parseHostPortInput("10.0.0.8:2222")).toEqual({ hostName: "10.0.0.8", port: 2222 });
  });

  it("parses bracketed ipv6 with port", () => {
    expect(parseHostPortInput("[2001:db8::1]:2200")).toEqual({ hostName: "2001:db8::1", port: 2200 });
  });

  it("keeps unbracketed ipv6 as host only", () => {
    expect(parseHostPortInput("2001:db8::1")).toEqual({ hostName: "2001:db8::1" });
  });

  it("returns validation error for invalid ports", () => {
    expect(parseHostPortInput("box:99999").error).toBe("Port must be an integer between 1 and 65535.");
  });

  it("parses command style user host and port", () => {
    expect(parseQuickConnectCommandInput("ubuntu@example.com:2200")).toEqual({
      user: "ubuntu",
      hostName: "example.com",
      port: 2200,
      error: undefined,
    });
  });

  it("builds unique user candidates with default user priority", () => {
    expect(buildQuickConnectUserCandidates("ubuntu", ["root", "ubuntu", "Admin"])).toEqual([
      "ubuntu",
      "root",
      "Admin",
    ]);
  });
});
