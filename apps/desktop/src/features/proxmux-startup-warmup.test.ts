import { describe, expect, it } from "vitest";
import {
  computeProxmuxWarmupDelayMs,
  selectProxmuxWarmupClusterId,
  shouldDeferHostBootstrapForCliLaunch,
  shouldPrefetchProxmuxSidebarResources,
  shouldRunProxmuxStartupWarmup,
} from "./proxmux-startup-warmup";

describe("computeProxmuxWarmupDelayMs", () => {
  it("returns delay in 1-3 second range", () => {
    expect(computeProxmuxWarmupDelayMs(0)).toBe(1_000);
    expect(computeProxmuxWarmupDelayMs(0.5)).toBe(2_000);
    expect(computeProxmuxWarmupDelayMs(1)).toBe(3_000);
  });

  it("clamps out-of-range random input", () => {
    expect(computeProxmuxWarmupDelayMs(-1)).toBe(1_000);
    expect(computeProxmuxWarmupDelayMs(9)).toBe(3_000);
  });
});

describe("selectProxmuxWarmupClusterId", () => {
  it("prefers active cluster id when present in list", () => {
    const id = selectProxmuxWarmupClusterId("b", [{ id: "a" }, { id: "b" }]);
    expect(id).toBe("b");
  });

  it("falls back to first cluster", () => {
    const id = selectProxmuxWarmupClusterId("missing", [{ id: "a" }, { id: "b" }]);
    expect(id).toBe("a");
  });

  it("returns null when no cluster can be selected", () => {
    expect(selectProxmuxWarmupClusterId(null, [])).toBe(null);
    expect(selectProxmuxWarmupClusterId("", [{ id: "" }])).toBe(null);
  });
});

describe("shouldRunProxmuxStartupWarmup", () => {
  it("requires plugin enabled and not-yet-warmed", () => {
    expect(shouldRunProxmuxStartupWarmup(true, false)).toBe(true);
    expect(shouldRunProxmuxStartupWarmup(true, true)).toBe(false);
    expect(shouldRunProxmuxStartupWarmup(false, false)).toBe(false);
  });
});

describe("shouldPrefetchProxmuxSidebarResources", () => {
  it("requires plugin, open sidebar, and PROXMUX view", () => {
    expect(shouldPrefetchProxmuxSidebarResources(true, true, "builtin:proxmux")).toBe(true);
    expect(shouldPrefetchProxmuxSidebarResources(true, false, "builtin:proxmux")).toBe(false);
    expect(shouldPrefetchProxmuxSidebarResources(true, true, "builtin:all")).toBe(false);
    expect(shouldPrefetchProxmuxSidebarResources(false, true, "builtin:proxmux")).toBe(false);
  });
});

describe("shouldDeferHostBootstrapForCliLaunch", () => {
  it("defers for local-terminal and local-commander flags", () => {
    expect(shouldDeferHostBootstrapForCliLaunch({ singleLocalShell: true })).toBe(true);
    expect(shouldDeferHostBootstrapForCliLaunch({ localCommander: true })).toBe(true);
    expect(shouldDeferHostBootstrapForCliLaunch({})).toBe(false);
  });
});
