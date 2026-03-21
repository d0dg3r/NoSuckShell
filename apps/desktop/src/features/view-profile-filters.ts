import type {
  HostConfig,
  HostMetadata,
  ViewFilterField,
  ViewFilterGroup,
  ViewFilterOperator,
  ViewFilterRule,
  ViewProfile,
} from "../types";

export type HostRowViewModel = {
  host: HostConfig;
  metadata: HostMetadata;
  connected: boolean;
  displayUser: string;
};

function newId(): string {
  return crypto.randomUUID();
}

export function createEmptyFilterGroup(): ViewFilterGroup {
  return {
    id: newId(),
    mode: "and",
    rules: [],
    groups: [],
  };
}

export function createEmptyViewFilterRule(): ViewFilterRule {
  return {
    id: newId(),
    field: "host",
    operator: "contains",
    value: "",
  };
}

export function createDefaultViewProfile(): ViewProfile {
  const now = Date.now();
  return {
    id: newId(),
    name: "New view",
    order: 0,
    filterGroup: createEmptyFilterGroup(),
    sortRules: [{ field: "host", direction: "asc" }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Parses common boolean spellings for favorite / recent / status-style rules. */
export function parseBooleanRuleValue(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (!s) {
    return null;
  }
  if (["true", "yes", "1", "y", "on"].includes(s)) {
    return true;
  }
  if (["false", "no", "0", "n", "off"].includes(s)) {
    return false;
  }
  return null;
}

export function getRuleFieldValue(row: HostRowViewModel, field: ViewFilterField): string {
  switch (field) {
    case "host":
      return row.host.host;
    case "hostName":
      return row.host.hostName;
    case "user":
      return row.displayUser;
    case "port":
      return String(row.host.port);
    case "status":
      return row.connected ? "connected" : "disconnected";
    case "favorite":
      return row.metadata.favorite ? "true" : "false";
    case "recent":
      return row.metadata.lastUsedAt !== null ? "true" : "false";
    case "tag":
      return row.metadata.tags.join(", ");
    default:
      return "";
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function compareText(haystack: string, needle: string, op: ViewFilterOperator): boolean {
  const h = haystack.toLowerCase();
  const n = needle.trim().toLowerCase();

  switch (op) {
    case "equals":
      return h === n;
    case "not_equals":
      return h !== n;
    case "contains":
      return n.length === 0 ? true : h.includes(n);
    case "starts_with":
      return n.length === 0 ? true : h.startsWith(n);
    case "ends_with":
      return n.length === 0 ? true : h.endsWith(n);
    case "greater_than":
      return h.localeCompare(n) > 0;
    case "less_than":
      return h.localeCompare(n) < 0;
    case "in": {
      if (!needle.trim()) {
        return true;
      }
      const tokens = needle
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return tokens.length === 0 ? true : tokens.includes(h);
    }
    default:
      return true;
  }
}

function comparePort(port: number, raw: string, op: ViewFilterOperator): boolean {
  const needleNum = Number(raw.trim());
  const hasNum = raw.trim().length > 0 && Number.isFinite(needleNum);
  const asStr = String(port);

  switch (op) {
    case "equals":
      return hasNum && port === needleNum;
    case "not_equals":
      return hasNum && port !== needleNum;
    case "contains":
      return norm(raw).length === 0 ? true : asStr.includes(raw.trim());
    case "starts_with":
      return norm(raw).length === 0 ? true : asStr.startsWith(raw.trim());
    case "ends_with":
      return norm(raw).length === 0 ? true : asStr.endsWith(raw.trim());
    case "greater_than":
      return hasNum && port > needleNum;
    case "less_than":
      return hasNum && port < needleNum;
    case "in": {
      const tokens = raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => Number(t))
        .filter((n) => Number.isFinite(n));
      return tokens.length === 0 ? true : tokens.includes(port);
    }
    default:
      return true;
  }
}

function compareStatus(connected: boolean, raw: string, op: ViewFilterOperator): boolean {
  const actual = connected ? "connected" : "disconnected";
  return compareText(actual, raw, op);
}

function compareFavoriteOrRecent(actual: boolean, raw: string, op: ViewFilterOperator): boolean {
  const parsed = parseBooleanRuleValue(raw);
  if (parsed === null) {
    return false;
  }
  const actualStr = actual ? "true" : "false";
  const expectedStr = parsed ? "true" : "false";
  switch (op) {
    case "equals":
      return actualStr === expectedStr;
    case "not_equals":
      return actualStr !== expectedStr;
    default:
      return compareText(actualStr, expectedStr, op);
  }
}

function normalizedTags(tags: string[]): string[] {
  return tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function compareTag(tags: string[], raw: string, op: ViewFilterOperator): boolean {
  const nt = normalizedTags(tags);
  const v = raw.trim().toLowerCase();

  switch (op) {
    case "equals":
      return v.length === 0 ? true : nt.some((t) => t === v);
    case "not_equals":
      return v.length === 0 ? true : !nt.some((t) => t === v);
    case "contains":
      return v.length === 0 ? true : nt.some((t) => t.includes(v));
    case "starts_with":
      return v.length === 0 ? true : nt.some((t) => t.startsWith(v));
    case "ends_with":
      return v.length === 0 ? true : nt.some((t) => t.endsWith(v));
    case "greater_than":
    case "less_than":
      return nt.some((t) => compareText(t, raw, op));
    case "in": {
      if (!raw.trim()) {
        return true;
      }
      const tokens = raw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return tokens.length === 0 ? true : nt.some((t) => tokens.includes(t));
    }
    default:
      return true;
  }
}

export function evaluateRule(row: HostRowViewModel, rule: ViewFilterRule): boolean {
  const { field, operator: op } = rule;

  switch (field) {
    case "host":
      return compareText(row.host.host, rule.value, op);
    case "hostName":
      return compareText(row.host.hostName, rule.value, op);
    case "user":
      return compareText(row.displayUser, rule.value, op);
    case "port":
      return comparePort(row.host.port, rule.value, op);
    case "status":
      return compareStatus(row.connected, rule.value, op);
    case "favorite":
      return compareFavoriteOrRecent(row.metadata.favorite, rule.value, op);
    case "recent":
      return compareFavoriteOrRecent(row.metadata.lastUsedAt !== null, rule.value, op);
    case "tag":
      return compareTag(row.metadata.tags, rule.value, op);
    default:
      return true;
  }
}

export function evaluateGroup(row: HostRowViewModel, group: ViewFilterGroup): boolean {
  const parts: boolean[] = [
    ...group.rules.map((r) => evaluateRule(row, r)),
    ...group.groups.map((g) => evaluateGroup(row, g)),
  ];
  if (parts.length === 0) {
    return true;
  }
  if (group.mode === "and") {
    return parts.every(Boolean);
  }
  return parts.some(Boolean);
}
