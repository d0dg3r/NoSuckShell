import type { EntityStore, HostBinding, HostConfig, HostMetadata, HostMetadataStore } from "../types";
import { ENTITY_STORE_SCHEMA_VERSION } from "../types";

export const createDefaultHostBinding = (): HostBinding => ({
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
  schemaVersion: ENTITY_STORE_SCHEMA_VERSION,
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
  isJumpHost: false,
});

/**
 * Defers a startup task until after the WebView has had a chance to paint and
 * process pointer events. Uses `requestIdleCallback` when available (Chromium /
 * recent WebKitGTK), falling back to `setTimeout(0)` so behavior degrades safely
 * in environments without idle scheduling.
 *
 * Returns a cancel function so callers can clean up on unmount.
 */
export const scheduleAfterFirstPaint = (fn: () => void): (() => void) => {
  if (typeof window === "undefined") {
    fn();
    return () => {};
  }
  type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    // Cap the wait so a permanently busy main thread does not starve startup IPC.
    const handle = w.requestIdleCallback(fn, { timeout: 1500 });
    return () => {
      if (typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(handle);
      }
    };
  }
  const timer = window.setTimeout(fn, 0);
  return () => window.clearTimeout(timer);
};

/** Resolves after two animation frames (layout + paint committed). */
export const waitForNextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
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
