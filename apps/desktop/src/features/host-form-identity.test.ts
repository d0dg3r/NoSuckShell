import { describe, expect, it } from "vitest";
import {
  applyIdentitySelection,
  getIdentitySelectValue,
  IDENTITY_SELECT_NONE,
  identitySelectKeyValue,
} from "./host-form-identity";
import type { HostBinding, HostConfig, SshKeyObject } from "../types";

const baseHost = (): HostConfig => ({
  host: "h1",
  hostName: "h1.example",
  user: "u",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

const baseBinding = (): HostBinding => ({
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
});

const pathKey = (id: string, path: string): SshKeyObject => ({
  type: "path",
  id,
  name: `Key ${id}`,
  identityFilePath: path,
  tagIds: [],
  createdAt: 0,
  updatedAt: 0,
});

const encKey = (id: string): SshKeyObject => ({
  type: "encrypted",
  id,
  name: `Enc ${id}`,
  ciphertext: "",
  kdf: "argon2id",
  salt: "",
  nonce: "",
  fingerprint: "",
  publicKey: "",
  tagIds: [],
  createdAt: 0,
  updatedAt: 0,
});

describe("getIdentitySelectValue", () => {
  it("returns __none when no identity", () => {
    expect(getIdentitySelectValue(baseHost(), baseBinding(), [])).toBe(IDENTITY_SELECT_NONE);
  });

  it("returns key: when primary ref matches store key", () => {
    const keys = [pathKey("k1", "~/.ssh/a")];
    const binding = {
      ...baseBinding(),
      keyRefs: [{ keyId: "k1", usage: "primary" }],
    };
    expect(getIdentitySelectValue(baseHost(), binding, keys)).toBe(identitySelectKeyValue("k1"));
  });

  it("returns key: for encrypted primary", () => {
    const keys = [encKey("e1")];
    const binding = { ...baseBinding(), keyRefs: [{ keyId: "e1", usage: "primary" }] };
    expect(getIdentitySelectValue(baseHost(), binding, keys)).toBe(identitySelectKeyValue("e1"));
  });

  it("falls back to host path matching path key when no ref", () => {
    const keys = [pathKey("k1", "~/.ssh/a")];
    const host = { ...baseHost(), identityFile: "~/.ssh/a" };
    expect(getIdentitySelectValue(host, baseBinding(), keys)).toBe(identitySelectKeyValue("k1"));
  });

  it("returns raw path for orphan", () => {
    const keys = [pathKey("k1", "~/.ssh/a")];
    const host = { ...baseHost(), identityFile: "/custom/key" };
    expect(getIdentitySelectValue(host, baseBinding(), keys)).toBe("/custom/key");
  });

  it("uses legacyIdentityFile when host identity empty", () => {
    const keys = [pathKey("k1", "~/.ssh/a")];
    const binding = { ...baseBinding(), legacyIdentityFile: "~/.ssh/a" };
    expect(getIdentitySelectValue(baseHost(), binding, keys)).toBe(identitySelectKeyValue("k1"));
  });

  it("ignores primary ref if key missing from store", () => {
    const binding = { ...baseBinding(), keyRefs: [{ keyId: "missing", usage: "primary" }] };
    const host = { ...baseHost(), identityFile: "/orphan" };
    expect(getIdentitySelectValue(host, binding, [pathKey("k1", "~/.ssh/a")])).toBe("/orphan");
  });
});

describe("applyIdentitySelection", () => {
  it("clears all for __none", () => {
    const host = { ...baseHost(), identityFile: "/x" };
    const binding = {
      ...baseBinding(),
      keyRefs: [{ keyId: "k1", usage: "primary" }],
      legacyIdentityFile: "/y",
    };
    const patch = applyIdentitySelection(IDENTITY_SELECT_NONE, host, binding, [pathKey("k1", "~/.ssh/a")]);
    expect(patch).toEqual({
      identityFile: "",
      keyRefs: [],
      legacyIdentityFile: "",
    });
  });

  it("path key sets identity path, replaces primary, clears legacy", () => {
    const host = baseHost();
    const binding = {
      ...baseBinding(),
      keyRefs: [
        { keyId: "old", usage: "primary" },
        { keyId: "extra", usage: "sign" },
      ],
    };
    const keys = [pathKey("k1", "~/.ssh/new")];
    const patch = applyIdentitySelection(identitySelectKeyValue("k1"), host, binding, keys);
    expect(patch.identityFile).toBe("~/.ssh/new");
    expect(patch.legacyIdentityFile).toBe("");
    expect(patch.keyRefs).toEqual([
      { keyId: "k1", usage: "primary" },
      { keyId: "extra", usage: "sign" },
    ]);
  });

  it("encrypted key clears identity file and replaces primary", () => {
    const host = { ...baseHost(), identityFile: "~/.ssh/x" };
    const binding = baseBinding();
    const keys = [encKey("e1")];
    const patch = applyIdentitySelection(identitySelectKeyValue("e1"), host, binding, keys);
    expect(patch).toEqual({
      identityFile: "",
      keyRefs: [{ keyId: "e1", usage: "primary" }],
      legacyIdentityFile: "",
    });
  });

  it("orphan path clears refs and legacy", () => {
    const host = baseHost();
    const binding = { ...baseBinding(), keyRefs: [{ keyId: "k1", usage: "primary" }] };
    const patch = applyIdentitySelection("/custom/pem", host, binding, [pathKey("k1", "~/.ssh/a")]);
    expect(patch).toEqual({
      identityFile: "/custom/pem",
      keyRefs: [],
      legacyIdentityFile: "",
    });
  });

  it("unknown key id leaves host and binding unchanged", () => {
    const host = { ...baseHost(), identityFile: "/x" };
    const binding = { ...baseBinding(), keyRefs: [{ keyId: "k1", usage: "primary" }] };
    const patch = applyIdentitySelection(identitySelectKeyValue("nope"), host, binding, []);
    expect(patch).toEqual({
      identityFile: "/x",
      keyRefs: binding.keyRefs,
      legacyIdentityFile: "",
    });
  });
});
