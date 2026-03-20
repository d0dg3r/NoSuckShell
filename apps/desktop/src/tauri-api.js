import { invoke } from "@tauri-apps/api/core";
const sendInputQueueBySession = new Map();
const sendInputDrainingSessions = new Set();
const isSingleChar = (data) => data.length === 1;
const enqueueSessionInput = (sessionId, data, resolve, reject) => {
    const queue = sendInputQueueBySession.get(sessionId) ?? [];
    const lastEntry = queue[queue.length - 1];
    const canCoalesce = Boolean(lastEntry) &&
        isSingleChar(data) &&
        isSingleChar(lastEntry.data) &&
        lastEntry.data[lastEntry.data.length - 1] === data;
    if (canCoalesce) {
        lastEntry.data += data;
        lastEntry.resolves.push(resolve);
        lastEntry.rejects.push(reject);
    }
    else {
        queue.push({ data, resolves: [resolve], rejects: [reject] });
    }
    sendInputQueueBySession.set(sessionId, queue);
};
const drainSessionInputQueue = (sessionId) => {
    if (sendInputDrainingSessions.has(sessionId)) {
        return;
    }
    sendInputDrainingSessions.add(sessionId);
    void (async () => {
        try {
            while (true) {
                const queue = sendInputQueueBySession.get(sessionId) ?? [];
                const entry = queue.shift();
                if (!entry) {
                    sendInputQueueBySession.set(sessionId, queue);
                    break;
                }
                sendInputQueueBySession.set(sessionId, queue);
                try {
                    await invoke("send_input", { sessionId, data: entry.data });
                    for (const resolver of entry.resolves) {
                        resolver();
                    }
                }
                catch (error) {
                    for (const rejecter of entry.rejects) {
                        rejecter(error);
                    }
                }
            }
        }
        finally {
            sendInputDrainingSessions.delete(sessionId);
        }
    })();
};
export const listHosts = () => invoke("list_hosts");
export const saveHost = (host) => invoke("save_host", { host });
export const deleteHost = (hostName) => invoke("delete_host", { hostName });
export const startSession = (host) => invoke("start_session", { host });
export const startLocalSession = () => invoke("start_local_session");
export const startQuickSshSession = (request) => invoke("start_quick_ssh_session", { request });
export const sendInput = (sessionId, data) => {
    return new Promise((resolve, reject) => {
        enqueueSessionInput(sessionId, data, resolve, reject);
        drainSessionInputQueue(sessionId);
    });
};
export const resizeSession = (sessionId, cols, rows) => invoke("resize_session", { sessionId, cols, rows });
export const closeSession = (sessionId) => invoke("close_session", { sessionId });
export const listHostMetadata = () => invoke("list_host_metadata");
export const saveHostMetadata = (metadata) => invoke("save_host_metadata", { metadata });
export const touchHostLastUsed = (hostAlias) => invoke("touch_host_last_used", { hostAlias });
export const exportBackup = (path, password) => invoke("export_backup", { path, password });
export const importBackup = (path, password) => invoke("import_backup", { path, password });
export const listLayoutProfiles = () => invoke("list_layout_profiles");
export const saveLayoutProfile = (profile) => invoke("save_layout_profile", { profile });
export const deleteLayoutProfile = (profileId) => invoke("delete_layout_profile", { profileId });
export const listViewProfiles = () => invoke("list_view_profiles");
export const saveViewProfile = (profile) => invoke("save_view_profile", { profile });
export const deleteViewProfile = (profileId) => invoke("delete_view_profile", { profileId });
export const reorderViewProfiles = (ids) => invoke("reorder_view_profiles", { ids });
export const listStoreObjects = () => invoke("list_store_objects");
export const saveStoreObjects = (store) => invoke("save_store_objects", { store });
export const assignHostBinding = (hostAlias, binding) => invoke("assign_host_binding", { hostAlias, binding });
export const listUsers = () => invoke("list_users");
export const listGroups = () => invoke("list_groups");
export const listTags = () => invoke("list_tags");
export const createEncryptedKey = (name, privateKeyPem, publicKey, passphrase) => invoke("create_encrypted_key", { name, privateKeyPem, publicKey, passphrase });
export const unlockKeyMaterial = (keyId, passphrase) => invoke("unlock_key_material", { keyId, passphrase });
export const deleteKeyById = (keyId) => invoke("delete_key", { keyId });
