import type { HostBinding, HostConfig, HostKeyRef, PathSshKeyObject, SshKeyObject } from "../types";

export const IDENTITY_SELECT_NONE = "__none";
export const IDENTITY_KEY_PREFIX = "key:";

export function identitySelectKeyValue(keyId: string): string {
  return `${IDENTITY_KEY_PREFIX}${keyId}`;
}

function findPrimaryKeyRef(binding: HostBinding): HostKeyRef | undefined {
  return binding.keyRefs.find((r) => r.usage === "primary") ?? binding.keyRefs[0];
}

function pathKeyMatchingPath(storeKeys: SshKeyObject[], path: string): PathSshKeyObject | undefined {
  const t = path.trim();
  if (!t) {
    return undefined;
  }
  return storeKeys.find((k): k is PathSshKeyObject => k.type === "path" && k.identityFilePath.trim() === t);
}

/** Current `<select>` value: `__none`, `key:<id>`, or raw path (orphan). */
export function getIdentitySelectValue(host: HostConfig, binding: HostBinding, storeKeys: SshKeyObject[]): string {
  const primary = findPrimaryKeyRef(binding);
  if (primary && storeKeys.some((k) => k.id === primary.keyId)) {
    return identitySelectKeyValue(primary.keyId);
  }

  const pathFromHost = host.identityFile.trim();
  if (pathFromHost) {
    const pk = pathKeyMatchingPath(storeKeys, pathFromHost);
    if (pk) {
      return identitySelectKeyValue(pk.id);
    }
    return pathFromHost;
  }

  const pathFromLegacy = binding.legacyIdentityFile.trim();
  if (pathFromLegacy) {
    const pk = pathKeyMatchingPath(storeKeys, pathFromLegacy);
    if (pk) {
      return identitySelectKeyValue(pk.id);
    }
    return pathFromLegacy;
  }

  return IDENTITY_SELECT_NONE;
}

function replacePrimaryKeyRef(keyRefs: HostKeyRef[], keyId: string): HostKeyRef[] {
  const rest = keyRefs.filter((r) => r.usage !== "primary");
  return [{ keyId, usage: "primary" }, ...rest];
}

export type IdentitySelectionPatch = Pick<HostConfig, "identityFile"> &
  Pick<HostBinding, "keyRefs" | "legacyIdentityFile">;

/** Apply a `<select>` value to host + binding identity fields only. */
export function applyIdentitySelection(
  value: string,
  host: HostConfig,
  binding: HostBinding,
  storeKeys: SshKeyObject[],
): IdentitySelectionPatch {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === IDENTITY_SELECT_NONE) {
    return {
      identityFile: "",
      keyRefs: [],
      legacyIdentityFile: "",
    };
  }

  if (trimmed.startsWith(IDENTITY_KEY_PREFIX)) {
    const keyId = trimmed.slice(IDENTITY_KEY_PREFIX.length);
    const key = storeKeys.find((k) => k.id === keyId);
    if (!key) {
      return {
        identityFile: host.identityFile,
        keyRefs: binding.keyRefs,
        legacyIdentityFile: binding.legacyIdentityFile,
      };
    }
    if (key.type === "path") {
      return {
        identityFile: key.identityFilePath,
        keyRefs: replacePrimaryKeyRef(binding.keyRefs, key.id),
        legacyIdentityFile: "",
      };
    }
    return {
      identityFile: "",
      keyRefs: replacePrimaryKeyRef(binding.keyRefs, key.id),
      legacyIdentityFile: "",
    };
  }

  // Orphan / custom path: SSH config path only; clear store refs so resolution uses the file line.
  return {
    identityFile: trimmed,
    keyRefs: [],
    legacyIdentityFile: "",
  };
}

/** Align `identityFile` / binding identity fields with the canonical `<select>` value (e.g. after loading from SSH + store). */
export function normalizeHostIdentityWithBinding(
  host: HostConfig,
  binding: HostBinding,
  storeKeys: SshKeyObject[],
): { host: HostConfig; binding: HostBinding } {
  const v = getIdentitySelectValue(host, binding, storeKeys);
  const patch = applyIdentitySelection(v, host, binding, storeKeys);
  return {
    host: { ...host, identityFile: patch.identityFile },
    binding: { ...binding, keyRefs: patch.keyRefs, legacyIdentityFile: patch.legacyIdentityFile },
  };
}
