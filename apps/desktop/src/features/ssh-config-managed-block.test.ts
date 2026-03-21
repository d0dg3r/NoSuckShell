import { describe, expect, it } from "vitest";
import {
  mergeManagedHostStarBlock,
  NOSUCKSHELL_HOST_STAR_BEGIN,
  NOSUCKSHELL_HOST_STAR_END,
} from "./ssh-config-managed-block";

describe("mergeManagedHostStarBlock", () => {
  it("prepends block when missing", () => {
    const next = mergeManagedHostStarBlock("Host foo\n  HostName x\n", ["ServerAliveInterval 30"]);
    expect(next.startsWith(NOSUCKSHELL_HOST_STAR_BEGIN)).toBe(true);
    expect(next).toContain("Host *");
    expect(next).toContain("ServerAliveInterval 30");
    expect(next).toContain(NOSUCKSHELL_HOST_STAR_END);
    expect(next).toContain("Host foo");
  });

  it("replaces existing managed block", () => {
    const raw = [
      NOSUCKSHELL_HOST_STAR_BEGIN,
      "Host *",
      "  ServerAliveInterval 1",
      NOSUCKSHELL_HOST_STAR_END,
      "",
      "Host bar",
    ].join("\n");
    const next = mergeManagedHostStarBlock(raw, ["ServerAliveInterval 99"]);
    expect(next.match(/ServerAliveInterval 99/g)?.length).toBe(1);
    expect(next).not.toContain("ServerAliveInterval 1");
    expect(next).toContain("Host bar");
  });
});
