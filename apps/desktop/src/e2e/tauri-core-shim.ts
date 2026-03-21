import type {
  EntityStore,
  HostBinding,
  HostConfig,
  HostMetadataStore,
  LayoutProfile,
  QuickSshSessionRequest,
  SessionStarted,
  SshKeyObject,
  ViewProfile,
} from "../types";
import { emitSessionOutput } from "./tauri-event-shim";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

let hosts: HostConfig[] = [];
let metadataStore: HostMetadataStore = { defaultUser: "", hosts: {} };
let layoutProfiles: LayoutProfile[] = [];
let viewProfiles: ViewProfile[] = [];
let entityStore: EntityStore = {
  schemaVersion: 1,
  updatedAt: 0,
  users: {},
  groups: {},
  keys: {},
  tags: {},
  hostBindings: {},
};

const activeSessionIds = new Set<string>();

const newSessionId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const scheduleWelcomeChunks = (sessionId: string): void => {
  // Defer past React layout so TerminalPane has registered its `listen` handler.
  window.setTimeout(() => {
    emitSessionOutput({
      session_id: sessionId,
      chunk: "\r\n[e2e mock shell]\r\n$ ",
      host_key_prompt: false,
    });
  }, 50);
};

const startAnySession = (): SessionStarted => {
  const session_id = newSessionId();
  activeSessionIds.add(session_id);
  scheduleWelcomeChunks(session_id);
  return { session_id };
};

const hostConfigFromQuickRequest = (request: QuickSshSessionRequest): HostConfig => ({
  host: request.hostName,
  hostName: request.hostName,
  user: request.user,
  port: request.port ?? 22,
  identityFile: request.identityFile,
  proxyJump: request.proxyJump,
  proxyCommand: request.proxyCommand,
});

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "list_hosts":
      return Promise.resolve(structuredClone(hosts) as T);

    case "save_host": {
      const { host } = args as { host: HostConfig };
      const next = hosts.filter((h) => h.host !== host.host);
      next.push({ ...host });
      hosts = next;
      return Promise.resolve(undefined as T);
    }

    case "delete_host": {
      const { hostName } = args as { hostName: string };
      hosts = hosts.filter((h) => h.host !== hostName);
      delete metadataStore.hosts[hostName];
      return Promise.resolve(undefined as T);
    }

    case "list_host_metadata":
      return Promise.resolve(structuredClone(metadataStore) as T);

    case "save_host_metadata": {
      const { metadata } = args as { metadata: HostMetadataStore };
      metadataStore = { ...metadata, hosts: { ...metadata.hosts } };
      return Promise.resolve(undefined as T);
    }

    case "touch_host_last_used": {
      const { hostAlias } = args as { hostAlias: string };
      const prev = metadataStore.hosts[hostAlias] ?? {
        favorite: false,
        tags: [],
        lastUsedAt: null,
        trustHostDefault: false,
      };
      metadataStore = {
        ...metadataStore,
        hosts: {
          ...metadataStore.hosts,
          [hostAlias]: { ...prev, lastUsedAt: nowSeconds() },
        },
      };
      return Promise.resolve(undefined as T);
    }

    case "start_session":
      return Promise.resolve(startAnySession() as T);

    case "start_local_session":
      return Promise.resolve(startAnySession() as T);

    case "start_quick_ssh_session": {
      const { request } = args as { request: QuickSshSessionRequest };
      void hostConfigFromQuickRequest(request);
      return Promise.resolve(startAnySession() as T);
    }

    case "send_input": {
      const { sessionId, data } = args as { sessionId: string; data: string };
      if (activeSessionIds.has(sessionId) && data.trim().length > 0) {
        emitSessionOutput({
          session_id: sessionId,
          chunk: data.includes("\r") ? `\r\n[e2e echo]\r\n` : data,
          host_key_prompt: false,
        });
      }
      return Promise.resolve(undefined as T);
    }

    case "resize_session":
      return Promise.resolve(undefined as T);

    case "close_session": {
      const { sessionId } = args as { sessionId: string };
      activeSessionIds.delete(sessionId);
      return Promise.resolve(undefined as T);
    }

    case "export_backup":
    case "import_backup":
      return Promise.resolve(undefined as T);

    case "list_layout_profiles":
      return Promise.resolve(structuredClone(layoutProfiles) as T);

    case "save_layout_profile": {
      const { profile } = args as { profile: LayoutProfile };
      const rest = layoutProfiles.filter((p) => p.id !== profile.id);
      layoutProfiles = [...rest, { ...profile }];
      return Promise.resolve(undefined as T);
    }

    case "delete_layout_profile": {
      const { profileId } = args as { profileId: string };
      layoutProfiles = layoutProfiles.filter((p) => p.id !== profileId);
      return Promise.resolve(undefined as T);
    }

    case "list_view_profiles":
      return Promise.resolve(structuredClone(viewProfiles) as T);

    case "save_view_profile": {
      const { profile } = args as { profile: ViewProfile };
      const rest = viewProfiles.filter((p) => p.id !== profile.id);
      viewProfiles = [...rest, { ...profile }];
      return Promise.resolve(undefined as T);
    }

    case "delete_view_profile": {
      const { profileId } = args as { profileId: string };
      viewProfiles = viewProfiles.filter((p) => p.id !== profileId);
      return Promise.resolve(undefined as T);
    }

    case "reorder_view_profiles": {
      const { ids } = args as { ids: string[] };
      const order = new Map(ids.map((id, index) => [id, index]));
      viewProfiles = [...viewProfiles].sort((a, b) => {
        const ai = order.get(a.id) ?? 999;
        const bi = order.get(b.id) ?? 999;
        return ai - bi;
      });
      return Promise.resolve(undefined as T);
    }

    case "list_store_objects":
      return Promise.resolve(structuredClone(entityStore) as T);

    case "save_store_objects": {
      const { store } = args as { store: EntityStore };
      entityStore = {
        ...store,
        users: { ...store.users },
        groups: { ...store.groups },
        keys: { ...store.keys },
        tags: { ...store.tags },
        hostBindings: { ...store.hostBindings },
      };
      return Promise.resolve(undefined as T);
    }

    case "assign_host_binding": {
      const { hostAlias, binding } = args as { hostAlias: string; binding: HostBinding };
      entityStore = {
        ...entityStore,
        hostBindings: {
          ...entityStore.hostBindings,
          [hostAlias]: { ...binding },
        },
        updatedAt: nowSeconds(),
      };
      return Promise.resolve(undefined as T);
    }

    case "list_users":
      return Promise.resolve(Object.values(entityStore.users) as T);

    case "list_groups":
      return Promise.resolve(Object.values(entityStore.groups) as T);

    case "list_tags":
      return Promise.resolve(Object.values(entityStore.tags) as T);

    case "create_encrypted_key": {
      const { name, publicKey } = args as {
        name: string;
        privateKeyPem: string;
        publicKey: string;
        passphrase?: string;
      };
      const ts = nowSeconds();
      const key: SshKeyObject = {
        type: "encrypted",
        id: newSessionId(),
        name,
        ciphertext: "e2e",
        kdf: "argon2id",
        salt: "AA",
        nonce: "AA",
        fingerprint: "e2e",
        publicKey,
        createdAt: ts,
        updatedAt: ts,
      };
      entityStore = {
        ...entityStore,
        keys: { ...entityStore.keys, [key.id]: key },
        updatedAt: ts,
      };
      return Promise.resolve(key as T);
    }

    case "unlock_key_material":
      return Promise.resolve("-----BEGIN MOCK KEY-----\ne2e\n-----END MOCK KEY-----\n" as T);

    case "delete_key": {
      const { keyId } = args as { keyId: string };
      const nextKeys = { ...entityStore.keys };
      delete nextKeys[keyId];
      entityStore = { ...entityStore, keys: nextKeys, updatedAt: nowSeconds() };
      return Promise.resolve(undefined as T);
    }

    default:
      return Promise.reject(new Error(`e2e invoke: unhandled command ${cmd}`));
  }
}
