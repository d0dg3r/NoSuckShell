import type { EntityStore, HostConfig, HostMetadata, HostMetadataStore } from "../types";

export const emptyHost = (): HostConfig => ({
  host: "",
  hostName: "",
  user: "",
  port: 22,
  identityFile: "",
  proxyJump: "",
  proxyCommand: "",
});

export const createDefaultMetadataStore = (): HostMetadataStore => ({ defaultUser: "", hosts: {} });

export const createDefaultEntityStore = (): EntityStore => ({
  schemaVersion: 3,
  updatedAt: 0,
  users: {},
  groups: {},
  keys: {},
  tags: {},
  hostBindings: {},
});

export const normalizeEntityStore = (store: EntityStore): EntityStore => ({
  ...store,
  users: Object.fromEntries(
    Object.entries(store.users).map(([id, u]) => [
      id,
      {
        ...u,
        hostName: u.hostName ?? "",
        proxyJump: u.proxyJump ?? "",
      },
    ]),
  ),
});

export const createDefaultHostMetadata = (): HostMetadata => ({
  favorite: false,
  tags: [],
  lastUsedAt: null,
  trustHostDefault: false,
});

/** Block WebKit/Electron default context menu app-wide except in real text fields. */
export const allowNativeBrowserContextMenu = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest("textarea, select, [contenteditable='true'], [contenteditable='']")) {
    return true;
  }
  const input = target.closest("input");
  if (!input) {
    return false;
  }
  const type = (input as HTMLInputElement).type;
  return (
    type === "text" ||
    type === "search" ||
    type === "password" ||
    type === "email" ||
    type === "url" ||
    type === "tel" ||
    type === "number" ||
    type === "date" ||
    type === "time" ||
    type === "datetime-local" ||
    type === ""
  );
};
