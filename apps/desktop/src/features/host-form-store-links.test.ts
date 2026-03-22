import { describe, expect, it } from "vitest";
import {
  applyBindingOnlyProxyJumpSelect,
  applyProxyJumpSelectChange,
  applyUserSelectChange,
  getBindingOnlyProxyJumpSelectValue,
  getProxyJumpSelectValue,
  getUserObjectProxyJumpSelectValue,
  getUserSelectValue,
  JUMP_SELECT_CUSTOM,
  JUMP_SELECT_NONE,
  jumpHostCandidates,
  jumpSelectHopValue,
  normalizeHostProxyJumpWithBinding,
  normalizeHostUserWithBinding,
  userProxyJumpFromSelect,
  USER_SELECT_LEGACY,
  userSelectIdValue,
} from "./host-form-store-links";
import type { HostBinding, HostConfig, HostMetadata, UserObject } from "../types";

const host = (overrides: Partial<HostConfig> = {}): HostConfig => ({
  host: "self",
  hostName: "self.example",
  user: "root",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
  ...overrides,
});

const binding = (overrides: Partial<HostBinding> = {}): HostBinding => ({
  userId: undefined,
  groupIds: [],
  tagIds: [],
  keyRefs: [],
  proxyJump: "",
  legacyUser: "",
  legacyTags: [],
  legacyIdentityFile: "",
  legacyProxyJump: "",
  legacyProxyCommand: "",
  ...overrides,
});

const u1: UserObject = {
  id: "user-1",
  name: "Deploy",
  username: "deploy",
  hostName: "",
  proxyJump: "",
  keyRefs: [],
  tagIds: [],
  createdAt: 0,
  updatedAt: 0,
};

describe("jumpHostCandidates", () => {
  it("excludes the editing alias", () => {
    const hosts = [host({ host: "a" }), host({ host: "b" }), host({ host: "self" })];
    expect(jumpHostCandidates(hosts, "self", {})).toEqual(["a", "b"]);
  });

  it("with no jump hosts marked, lists all aliases except self", () => {
    const hosts = [host({ host: "a" }), host({ host: "b" })];
    const meta: Record<string, HostMetadata> = {
      a: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false },
    };
    expect(jumpHostCandidates(hosts, "b", meta)).toEqual(["a"]);
  });

  it("when any host is jump-marked, lists only jump hosts except self", () => {
    const hosts = [host({ host: "bastion" }), host({ host: "app" }), host({ host: "db" })];
    const meta: Record<string, HostMetadata> = {
      bastion: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false, isJumpHost: true },
      app: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false },
      db: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false },
    };
    expect(jumpHostCandidates(hosts, "app", meta)).toEqual(["bastion"]);
  });

  it("excludes self from jump-only list when self is jump host", () => {
    const hosts = [host({ host: "bastion" }), host({ host: "app" })];
    const meta: Record<string, HostMetadata> = {
      bastion: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false, isJumpHost: true },
      app: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false, isJumpHost: true },
    };
    expect(jumpHostCandidates(hosts, "bastion", meta)).toEqual(["app"]);
  });
});

describe("getUserSelectValue / applyUserSelectChange", () => {
  it("returns user: when binding references existing store user", () => {
    expect(getUserSelectValue(host(), binding({ userId: "user-1" }), [u1])).toBe(userSelectIdValue("user-1"));
  });

  it("returns legacy when userId missing from store", () => {
    expect(getUserSelectValue(host(), binding({ userId: "gone" }), [u1])).toBe(USER_SELECT_LEGACY);
  });

  it("applies store user login and clears legacy", () => {
    const patch = applyUserSelectChange(userSelectIdValue("user-1"), host({ user: "old" }), binding({ legacyUser: "old" }), [u1]);
    expect(patch).toEqual({ user: "deploy", userId: "user-1", legacyUser: "" });
  });

  it("legacy mode clears userId and sets legacyUser from host.user", () => {
    const patch = applyUserSelectChange(USER_SELECT_LEGACY, host({ user: "ubuntu" }), binding({ userId: "user-1" }), [u1]);
    expect(patch.userId).toBeUndefined();
    expect(patch.legacyUser).toBe("ubuntu");
    expect(patch.user).toBe("ubuntu");
  });
});

describe("getProxyJumpSelectValue / applyProxyJumpSelectChange", () => {
  const candidates = ["bastion", "jump2"];

  it("returns none when empty", () => {
    expect(getProxyJumpSelectValue(host(), binding(), candidates)).toBe(JUMP_SELECT_NONE);
  });

  it("returns hop: when binding.proxyJump matches candidate", () => {
    expect(getProxyJumpSelectValue(host(), binding({ proxyJump: "bastion" }), candidates)).toBe(jumpSelectHopValue("bastion"));
  });

  it("falls back to host.proxyJump", () => {
    expect(getProxyJumpSelectValue(host({ proxyJump: "jump2" }), binding(), candidates)).toBe(jumpSelectHopValue("jump2"));
  });

  it("returns custom sentinel for non-candidate jump", () => {
    expect(getProxyJumpSelectValue(host({ proxyJump: "user@gw" }), binding(), candidates)).toBe(JUMP_SELECT_CUSTOM);
  });

  it("apply none clears jumps", () => {
    const patch = applyProxyJumpSelectChange(JUMP_SELECT_NONE, host({ proxyJump: "x" }), binding({ proxyJump: "y", legacyProxyJump: "z" }));
    expect(patch.proxyJump).toBe("");
    expect(patch.legacyProxyJump).toBe("");
  });

  it("apply hop sets alias", () => {
    const patch = applyProxyJumpSelectChange(jumpSelectHopValue("bastion"), host(), binding());
    expect(patch).toEqual({ proxyJump: "bastion", legacyProxyJump: "" });
  });

  it("apply custom sentinel keeps effective jump text", () => {
    const patch = applyProxyJumpSelectChange(JUMP_SELECT_CUSTOM, host({ proxyJump: "user@gw" }), binding());
    expect(patch.proxyJump).toBe("user@gw");
    expect(patch.legacyProxyJump).toBe("");
  });
});

describe("normalizeHostUserWithBinding", () => {
  it("syncs store user username", () => {
    const r = normalizeHostUserWithBinding(host({ user: "" }), binding({ userId: "user-1" }), [u1]);
    expect(r.host.user).toBe("deploy");
    expect(r.binding.legacyUser).toBe("");
  });

  it("fills user from legacy when host.user empty", () => {
    const r = normalizeHostUserWithBinding(host({ user: "" }), binding({ legacyUser: "ubuntu" }), []);
    expect(r.host.user).toBe("ubuntu");
    expect(r.binding.legacyUser).toBe("ubuntu");
  });
});

describe("normalizeHostProxyJumpWithBinding", () => {
  it("syncs hop from host when binding empty", () => {
    const r = normalizeHostProxyJumpWithBinding(host({ proxyJump: "bastion" }), binding(), ["bastion"]);
    expect(r.host.proxyJump).toBe("bastion");
    expect(r.binding.proxyJump).toBe("bastion");
    expect(r.binding.legacyProxyJump).toBe("");
  });
});

describe("binding-only / user ProxyJump pickers", () => {
  it("getBindingOnlyProxyJumpSelectValue maps saved alias to hop:", () => {
    expect(getBindingOnlyProxyJumpSelectValue(binding({ proxyJump: "" }), ["a"])).toBe(JUMP_SELECT_NONE);
    expect(getBindingOnlyProxyJumpSelectValue(binding({ proxyJump: "a" }), ["a"])).toBe(jumpSelectHopValue("a"));
    expect(getBindingOnlyProxyJumpSelectValue(binding({ proxyJump: "raw" }), ["a"])).toBe(JUMP_SELECT_CUSTOM);
  });

  it("applyBindingOnlyProxyJumpSelect sets alias from hop:", () => {
    const p = applyBindingOnlyProxyJumpSelect(jumpSelectHopValue("b"), binding());
    expect(p).toEqual({ proxyJump: "b", legacyProxyJump: "" });
  });

  it("getUserObjectProxyJumpSelectValue and userProxyJumpFromSelect", () => {
    const u = { id: "1", name: "U", username: "u", hostName: "", proxyJump: "gw", keyRefs: [], tagIds: [], createdAt: 0, updatedAt: 0 };
    expect(getUserObjectProxyJumpSelectValue(u, ["gw"])).toBe(jumpSelectHopValue("gw"));
    expect(userProxyJumpFromSelect(jumpSelectHopValue("gw"), u)).toBe("gw");
    expect(userProxyJumpFromSelect(JUMP_SELECT_NONE, u)).toBe("");
  });
});
