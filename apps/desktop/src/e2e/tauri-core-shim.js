import { emitSessionOutput } from "./tauri-event-shim";
const nowSeconds = () => Math.floor(Date.now() / 1000);
let hosts = [];
let metadataStore = { defaultUser: "", hosts: {} };
let layoutProfiles = [];
let viewProfiles = [];
let entityStore = {
    schemaVersion: 1,
    updatedAt: 0,
    users: {},
    groups: {},
    keys: {},
    tags: {},
    hostBindings: {},
};
const activeSessionIds = new Set();
const newSessionId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};
const scheduleWelcomeChunks = (sessionId) => {
    // Defer past React layout so TerminalPane has registered its `listen` handler.
    window.setTimeout(() => {
        emitSessionOutput({
            session_id: sessionId,
            chunk: "\r\n[e2e mock shell]\r\n$ ",
            host_key_prompt: false,
        });
    }, 50);
};
const startAnySession = () => {
    const session_id = newSessionId();
    activeSessionIds.add(session_id);
    scheduleWelcomeChunks(session_id);
    return { session_id };
};
const hostConfigFromQuickRequest = (request) => ({
    host: request.hostName,
    hostName: request.hostName,
    user: request.user,
    port: request.port ?? 22,
    identityFile: request.identityFile,
    proxyJump: request.proxyJump,
    proxyCommand: request.proxyCommand,
});
export function invoke(cmd, args) {
    switch (cmd) {
        case "list_hosts":
            return Promise.resolve(structuredClone(hosts));
        case "save_host": {
            const { host } = args;
            const next = hosts.filter((h) => h.host !== host.host);
            next.push({ ...host });
            hosts = next;
            return Promise.resolve(undefined);
        }
        case "delete_host": {
            const { hostName } = args;
            hosts = hosts.filter((h) => h.host !== hostName);
            delete metadataStore.hosts[hostName];
            return Promise.resolve(undefined);
        }
        case "list_host_metadata":
            return Promise.resolve(structuredClone(metadataStore));
        case "save_host_metadata": {
            const { metadata } = args;
            metadataStore = { ...metadata, hosts: { ...metadata.hosts } };
            return Promise.resolve(undefined);
        }
        case "touch_host_last_used": {
            const { hostAlias } = args;
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
            return Promise.resolve(undefined);
        }
        case "start_session":
            return Promise.resolve(startAnySession());
        case "start_local_session":
            return Promise.resolve(startAnySession());
        case "start_quick_ssh_session": {
            const { request } = args;
            void hostConfigFromQuickRequest(request);
            return Promise.resolve(startAnySession());
        }
        case "send_input": {
            const { sessionId, data } = args;
            if (activeSessionIds.has(sessionId) && data.trim().length > 0) {
                emitSessionOutput({
                    session_id: sessionId,
                    chunk: data.includes("\r") ? `\r\n[e2e echo]\r\n` : data,
                    host_key_prompt: false,
                });
            }
            return Promise.resolve(undefined);
        }
        case "resize_session":
            return Promise.resolve(undefined);
        case "close_session": {
            const { sessionId } = args;
            activeSessionIds.delete(sessionId);
            return Promise.resolve(undefined);
        }
        case "export_backup":
        case "import_backup":
            return Promise.resolve(undefined);
        case "list_layout_profiles":
            return Promise.resolve(structuredClone(layoutProfiles));
        case "save_layout_profile": {
            const { profile } = args;
            const rest = layoutProfiles.filter((p) => p.id !== profile.id);
            layoutProfiles = [...rest, { ...profile }];
            return Promise.resolve(undefined);
        }
        case "delete_layout_profile": {
            const { profileId } = args;
            layoutProfiles = layoutProfiles.filter((p) => p.id !== profileId);
            return Promise.resolve(undefined);
        }
        case "list_view_profiles":
            return Promise.resolve(structuredClone(viewProfiles));
        case "save_view_profile": {
            const { profile } = args;
            const rest = viewProfiles.filter((p) => p.id !== profile.id);
            viewProfiles = [...rest, { ...profile }];
            return Promise.resolve(undefined);
        }
        case "delete_view_profile": {
            const { profileId } = args;
            viewProfiles = viewProfiles.filter((p) => p.id !== profileId);
            return Promise.resolve(undefined);
        }
        case "reorder_view_profiles": {
            const { ids } = args;
            const order = new Map(ids.map((id, index) => [id, index]));
            viewProfiles = [...viewProfiles].sort((a, b) => {
                const ai = order.get(a.id) ?? 999;
                const bi = order.get(b.id) ?? 999;
                return ai - bi;
            });
            return Promise.resolve(undefined);
        }
        case "list_store_objects":
            return Promise.resolve(structuredClone(entityStore));
        case "save_store_objects": {
            const { store } = args;
            entityStore = {
                ...store,
                users: { ...store.users },
                groups: { ...store.groups },
                keys: { ...store.keys },
                tags: { ...store.tags },
                hostBindings: { ...store.hostBindings },
            };
            return Promise.resolve(undefined);
        }
        case "assign_host_binding": {
            const { hostAlias, binding } = args;
            entityStore = {
                ...entityStore,
                hostBindings: {
                    ...entityStore.hostBindings,
                    [hostAlias]: { ...binding },
                },
                updatedAt: nowSeconds(),
            };
            return Promise.resolve(undefined);
        }
        case "list_users":
            return Promise.resolve(Object.values(entityStore.users));
        case "list_groups":
            return Promise.resolve(Object.values(entityStore.groups));
        case "list_tags":
            return Promise.resolve(Object.values(entityStore.tags));
        case "create_encrypted_key": {
            const { name, publicKey } = args;
            const ts = nowSeconds();
            const key = {
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
            return Promise.resolve(key);
        }
        case "unlock_key_material":
            return Promise.resolve("-----BEGIN MOCK KEY-----\ne2e\n-----END MOCK KEY-----\n");
        case "delete_key": {
            const { keyId } = args;
            const nextKeys = { ...entityStore.keys };
            delete nextKeys[keyId];
            entityStore = { ...entityStore, keys: nextKeys, updatedAt: nowSeconds() };
            return Promise.resolve(undefined);
        }
        default:
            return Promise.reject(new Error(`e2e invoke: unhandled command ${cmd}`));
    }
}
