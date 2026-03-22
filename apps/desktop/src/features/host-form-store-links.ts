import type { HostBinding, HostConfig, UserObject } from "../types";

export const USER_SELECT_LEGACY = "__user_legacy";
export const USER_ID_PREFIX = "user:";

export function userSelectIdValue(id: string): string {
  return `${USER_ID_PREFIX}${id}`;
}

export function jumpHostCandidates(allHosts: HostConfig[], excludeAlias: string): string[] {
  const ex = excludeAlias.trim();
  return allHosts
    .map((h) => h.host.trim())
    .filter((alias) => alias.length > 0 && alias !== ex)
    .sort((a, b) => a.localeCompare(b));
}

export function getUserSelectValue(_host: HostConfig, binding: HostBinding, users: UserObject[]): string {
  const uid = binding.userId?.trim();
  if (uid && users.some((u) => u.id === uid)) {
    return userSelectIdValue(uid);
  }
  return USER_SELECT_LEGACY;
}

export type UserSelectPatch = Pick<HostConfig, "user"> & Pick<HostBinding, "userId" | "legacyUser">;

export function applyUserSelectChange(
  value: string,
  host: HostConfig,
  binding: HostBinding,
  users: UserObject[],
): UserSelectPatch {
  if (value.startsWith(USER_ID_PREFIX)) {
    const id = value.slice(USER_ID_PREFIX.length);
    const u = users.find((x) => x.id === id);
    if (!u) {
      return { user: host.user, userId: binding.userId, legacyUser: binding.legacyUser };
    }
    const login = u.username.trim() || u.name.trim();
    return { user: login, userId: id, legacyUser: "" };
  }
  return {
    user: host.user,
    userId: undefined,
    legacyUser: host.user.trim(),
  };
}

/** Align SSH user + binding after load (store link vs legacy). */
export function normalizeHostUserWithBinding(
  host: HostConfig,
  binding: HostBinding,
  users: UserObject[],
): { host: HostConfig; binding: HostBinding } {
  const v = getUserSelectValue(host, binding, users);
  if (v.startsWith(USER_ID_PREFIX)) {
    const patch = applyUserSelectChange(v, host, binding, users);
    return {
      host: { ...host, user: patch.user },
      binding: { ...binding, userId: patch.userId, legacyUser: patch.legacyUser },
    };
  }
  const legacyUser = host.user.trim() || binding.legacyUser.trim();
  return {
    host: { ...host, user: legacyUser },
    binding: { ...binding, userId: undefined, legacyUser },
  };
}

export const JUMP_SELECT_NONE = "__jump_none";
export const JUMP_SELECT_CUSTOM = "__jump_custom";
export const JUMP_HOST_PREFIX = "hop:";

export function jumpSelectHopValue(alias: string): string {
  return `${JUMP_HOST_PREFIX}${alias}`;
}

export function getProxyJumpSelectValue(host: HostConfig, binding: HostBinding, candidates: string[]): string {
  const eff = binding.proxyJump.trim() || host.proxyJump.trim();
  if (!eff) {
    return JUMP_SELECT_NONE;
  }
  if (candidates.includes(eff)) {
    return jumpSelectHopValue(eff);
  }
  return JUMP_SELECT_CUSTOM;
}

export type ProxyJumpPatch = Pick<HostConfig, "proxyJump"> & Pick<HostBinding, "proxyJump" | "legacyProxyJump">;

export function applyProxyJumpSelectChange(
  value: string,
  host: HostConfig,
  binding: HostBinding,
): ProxyJumpPatch {
  if (value === JUMP_SELECT_NONE || value.trim() === "") {
    return { proxyJump: "", legacyProxyJump: "" };
  }
  if (value === JUMP_SELECT_CUSTOM) {
    const p = binding.proxyJump.trim() || host.proxyJump.trim();
    return { proxyJump: p, legacyProxyJump: "" };
  }
  if (value.startsWith(JUMP_HOST_PREFIX)) {
    const alias = value.slice(JUMP_HOST_PREFIX.length);
    return { proxyJump: alias, legacyProxyJump: "" };
  }
  return { proxyJump: value.trim(), legacyProxyJump: "" };
}

/** Apply patch to both HostConfig and binding.proxyJump (same string for SSH + store override). */
export function normalizeHostProxyJumpWithBinding(
  host: HostConfig,
  binding: HostBinding,
  candidates: string[],
): { host: HostConfig; binding: HostBinding } {
  const v = getProxyJumpSelectValue(host, binding, candidates);
  const patch = applyProxyJumpSelectChange(v, host, binding);
  return {
    host: { ...host, proxyJump: patch.proxyJump },
    binding: { ...binding, proxyJump: patch.proxyJump, legacyProxyJump: patch.legacyProxyJump },
  };
}

/** Identity Store host binding: ProxyJump lives only on `binding`. */
export function getBindingOnlyProxyJumpSelectValue(binding: HostBinding, candidates: string[]): string {
  const eff = binding.proxyJump.trim();
  if (!eff) {
    return JUMP_SELECT_NONE;
  }
  if (candidates.includes(eff)) {
    return jumpSelectHopValue(eff);
  }
  return JUMP_SELECT_CUSTOM;
}

export function applyBindingOnlyProxyJumpSelect(
  value: string,
  binding: HostBinding,
): Pick<HostBinding, "proxyJump" | "legacyProxyJump"> {
  if (value === JUMP_SELECT_NONE || value.trim() === "") {
    return { proxyJump: "", legacyProxyJump: "" };
  }
  if (value === JUMP_SELECT_CUSTOM) {
    return { proxyJump: binding.proxyJump.trim(), legacyProxyJump: "" };
  }
  if (value.startsWith(JUMP_HOST_PREFIX)) {
    const alias = value.slice(JUMP_HOST_PREFIX.length);
    return { proxyJump: alias, legacyProxyJump: "" };
  }
  return { proxyJump: value.trim(), legacyProxyJump: "" };
}

export function getUserObjectProxyJumpSelectValue(user: UserObject, candidates: string[]): string {
  const eff = user.proxyJump.trim();
  if (!eff) {
    return JUMP_SELECT_NONE;
  }
  if (candidates.includes(eff)) {
    return jumpSelectHopValue(eff);
  }
  return JUMP_SELECT_CUSTOM;
}

export function userProxyJumpFromSelect(value: string, user: UserObject): string {
  if (value === JUMP_SELECT_NONE || value.trim() === "") {
    return "";
  }
  if (value === JUMP_SELECT_CUSTOM) {
    return user.proxyJump.trim();
  }
  if (value.startsWith(JUMP_HOST_PREFIX)) {
    return value.slice(JUMP_HOST_PREFIX.length);
  }
  return value.trim();
}
