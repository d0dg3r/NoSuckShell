import { describe, expect, it } from "vitest";
import type { ViewFilterGroup, ViewFilterRule } from "../types";
import {
  evaluateGroup,
  evaluateRule,
  getRuleFieldValue,
  parseBooleanRuleValue,
  type HostRowViewModel,
} from "./view-profile-filters";

function row(partial: Partial<HostRowViewModel> & Pick<HostRowViewModel, "host">): HostRowViewModel {
  return {
    metadata: {
      favorite: false,
      tags: [],
      lastUsedAt: null,
      trustHostDefault: false,
      ...partial.metadata,
    },
    connected: partial.connected ?? false,
    displayUser: partial.displayUser ?? (partial.host.user || "n/a"),
    host: partial.host,
  };
}

function rule(entry: Omit<ViewFilterRule, "id"> & { id?: string }): ViewFilterRule {
  return {
    id: entry.id ?? "r1",
    field: entry.field,
    operator: entry.operator,
    value: entry.value,
  };
}

function group(g: Omit<ViewFilterGroup, "id"> & { id?: string }): ViewFilterGroup {
  return {
    id: g.id ?? "g1",
    mode: g.mode,
    rules: g.rules,
    groups: g.groups,
  };
}

describe("parseBooleanRuleValue", () => {
  it("recognizes true and false spellings", () => {
    expect(parseBooleanRuleValue("yes")).toBe(true);
    expect(parseBooleanRuleValue("NO")).toBe(false);
    expect(parseBooleanRuleValue("1")).toBe(true);
    expect(parseBooleanRuleValue("off")).toBe(false);
    expect(parseBooleanRuleValue("  ")).toBe(null);
    expect(parseBooleanRuleValue("maybe")).toBe(null);
  });
});

describe("getRuleFieldValue", () => {
  it("reflects host row shape used by App", () => {
    const r = row({
      host: { host: "srv", hostName: "srv.example", user: "u", port: 2222, identityFile: "", proxyJump: "", proxyCommand: "" },
      displayUser: "effective",
      connected: true,
      metadata: { favorite: true, tags: ["a", "B"], lastUsedAt: 1, trustHostDefault: true },
    });
    expect(getRuleFieldValue(r, "host")).toBe("srv");
    expect(getRuleFieldValue(r, "hostName")).toBe("srv.example");
    expect(getRuleFieldValue(r, "user")).toBe("effective");
    expect(getRuleFieldValue(r, "port")).toBe("2222");
    expect(getRuleFieldValue(r, "status")).toBe("connected");
    expect(getRuleFieldValue(r, "favorite")).toBe("true");
    expect(getRuleFieldValue(r, "recent")).toBe("true");
    expect(getRuleFieldValue(r, "tag")).toBe("a, B");
  });
});

describe("evaluateRule — string fields (equals, contains)", () => {
  const baseHost = {
    host: "MyBox",
    hostName: "box.internal",
    user: "root",
    port: 22,
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
  };

  it("equals is case-insensitive on alias", () => {
    const r = row({ host: baseHost });
    expect(evaluateRule(r, rule({ field: "host", operator: "equals", value: "mybox" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "host", operator: "equals", value: "other" }))).toBe(false);
  });

  it("contains matches hostname substring", () => {
    const r = row({ host: baseHost });
    expect(evaluateRule(r, rule({ field: "hostName", operator: "contains", value: "internal" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "hostName", operator: "contains", value: "EXAMPLE" }))).toBe(false);
  });

  it("in matches any comma-separated token for text fields", () => {
    const r = row({ host: baseHost });
    expect(evaluateRule(r, rule({ field: "host", operator: "in", value: "foo, mybox, bar" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "host", operator: "in", value: "foo, bar" }))).toBe(false);
  });
});

describe("evaluateRule — tag", () => {
  it("equals matches a single tag case-insensitively", () => {
    const r = row({
      host: { host: "h", hostName: "", user: "", port: 22, identityFile: "", proxyJump: "", proxyCommand: "" },
      metadata: { favorite: false, tags: ["Prod", " EU "], lastUsedAt: null, trustHostDefault: false },
    });
    expect(evaluateRule(r, rule({ field: "tag", operator: "equals", value: "prod" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "tag", operator: "equals", value: "eu" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "tag", operator: "equals", value: "staging" }))).toBe(false);
  });

  it("contains matches when any tag includes needle", () => {
    const r = row({
      host: { host: "h", hostName: "", user: "", port: 22, identityFile: "", proxyJump: "", proxyCommand: "" },
      metadata: { favorite: false, tags: ["team-a", "team-b"], lastUsedAt: null, trustHostDefault: false },
    });
    expect(evaluateRule(r, rule({ field: "tag", operator: "contains", value: "team" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "tag", operator: "contains", value: "z" }))).toBe(false);
  });

  it("in matches if any host tag is listed", () => {
    const r = row({
      host: { host: "h", hostName: "", user: "", port: 22, identityFile: "", proxyJump: "", proxyCommand: "" },
      metadata: { favorite: false, tags: ["db", "eu"], lastUsedAt: null, trustHostDefault: false },
    });
    expect(evaluateRule(r, rule({ field: "tag", operator: "in", value: "web, DB, cache" }))).toBe(true);
    expect(evaluateRule(r, rule({ field: "tag", operator: "in", value: "web, cache" }))).toBe(false);
  });
});

describe("evaluateGroup", () => {
  const h = {
    host: "x",
    hostName: "",
    user: "",
    port: 22,
    identityFile: "",
    proxyJump: "",
    proxyCommand: "",
  };

  it("AND requires all rules; empty group matches", () => {
    const r = row({ host: h, metadata: { favorite: true, tags: ["t"], lastUsedAt: null, trustHostDefault: false } });
    const g = group({
      mode: "and",
      rules: [
        rule({ id: "a", field: "favorite", operator: "equals", value: "yes" }),
        rule({ id: "b", field: "tag", operator: "contains", value: "t" }),
      ],
      groups: [],
    });
    expect(evaluateGroup(r, g)).toBe(true);

    const g2 = group({
      mode: "and",
      rules: [rule({ id: "a", field: "favorite", operator: "equals", value: "yes" }), rule({ id: "b", field: "tag", operator: "equals", value: "missing" })],
      groups: [],
    });
    expect(evaluateGroup(r, g2)).toBe(false);

    expect(evaluateGroup(r, group({ mode: "and", rules: [], groups: [] }))).toBe(true);
  });

  it("OR matches any rule", () => {
    const r = row({ host: h, metadata: { favorite: false, tags: [], lastUsedAt: null, trustHostDefault: false } });
    const g = group({
      mode: "or",
      rules: [
        rule({ id: "a", field: "host", operator: "equals", value: "x" }),
        rule({ id: "b", field: "favorite", operator: "equals", value: "yes" }),
      ],
      groups: [],
    });
    expect(evaluateGroup(r, g)).toBe(true);
  });

  it("nested groups combine with parent mode", () => {
    const r = row({
      host: { host: "app1", hostName: "", user: "", port: 22, identityFile: "", proxyJump: "", proxyCommand: "" },
      metadata: { favorite: true, tags: [], lastUsedAt: null, trustHostDefault: false },
    });
    const inner = group({
      id: "inner",
      mode: "or",
      rules: [
        rule({ id: "i1", field: "host", operator: "equals", value: "nomatch" }),
        rule({ id: "i2", field: "favorite", operator: "equals", value: "true" }),
      ],
      groups: [],
    });
    const outer = group({
      mode: "and",
      rules: [rule({ id: "o1", field: "host", operator: "contains", value: "app" })],
      groups: [inner],
    });
    expect(evaluateGroup(r, outer)).toBe(true);
  });
});
