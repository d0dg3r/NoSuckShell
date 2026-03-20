import { invoke } from "@tauri-apps/api/core";
import type { HostConfig, HostMetadataStore, LayoutProfile, SessionStarted, ViewProfile } from "./types";

const sendInputQueueBySession = new Map<string, Array<{ data: string; resolves: Array<() => void>; rejects: Array<(reason?: unknown) => void> }>>();
const sendInputDrainingSessions = new Set<string>();

const isSingleChar = (data: string): boolean => data.length === 1;
const enqueueSessionInput = (
  sessionId: string,
  data: string,
  resolve: () => void,
  reject: (reason?: unknown) => void,
) => {
  const queue = sendInputQueueBySession.get(sessionId) ?? [];
  const lastEntry = queue[queue.length - 1];
  const canCoalesce =
    Boolean(lastEntry) &&
    isSingleChar(data) &&
    isSingleChar(lastEntry.data) &&
    lastEntry.data[lastEntry.data.length - 1] === data;
  if (canCoalesce) {
    lastEntry.data += data;
    lastEntry.resolves.push(resolve);
    lastEntry.rejects.push(reject);
  } else {
    queue.push({ data, resolves: [resolve], rejects: [reject] });
  }
  sendInputQueueBySession.set(sessionId, queue);
};

const drainSessionInputQueue = (sessionId: string) => {
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
        } catch (error) {
          for (const rejecter of entry.rejects) {
            rejecter(error);
          }
        }
      }
    } finally {
      sendInputDrainingSessions.delete(sessionId);
    }
  })();
};

export const listHosts = (): Promise<HostConfig[]> => invoke("list_hosts");

export const saveHost = (host: HostConfig): Promise<void> =>
  invoke("save_host", { host });

export const deleteHost = (hostName: string): Promise<void> =>
  invoke("delete_host", { hostName });

export const startSession = (host: HostConfig): Promise<SessionStarted> =>
  invoke("start_session", { host });

export const sendInput = (sessionId: string, data: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    enqueueSessionInput(sessionId, data, resolve, reject);
    drainSessionInputQueue(sessionId);
  });
};

export const resizeSession = (
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> => invoke("resize_session", { sessionId, cols, rows });

export const closeSession = (sessionId: string): Promise<void> =>
  invoke("close_session", { sessionId });

export const listHostMetadata = (): Promise<HostMetadataStore> =>
  invoke("list_host_metadata");

export const saveHostMetadata = (metadata: HostMetadataStore): Promise<void> =>
  invoke("save_host_metadata", { metadata });

export const touchHostLastUsed = (hostAlias: string): Promise<void> =>
  invoke("touch_host_last_used", { hostAlias });

export const exportBackup = (path: string, password: string): Promise<void> =>
  invoke("export_backup", { path, password });

export const importBackup = (path: string, password: string): Promise<void> =>
  invoke("import_backup", { path, password });

export const listLayoutProfiles = (): Promise<LayoutProfile[]> =>
  invoke("list_layout_profiles");

export const saveLayoutProfile = (profile: LayoutProfile): Promise<void> =>
  invoke("save_layout_profile", { profile });

export const deleteLayoutProfile = (profileId: string): Promise<void> =>
  invoke("delete_layout_profile", { profileId });

export const listViewProfiles = (): Promise<ViewProfile[]> =>
  invoke("list_view_profiles");

export const saveViewProfile = (profile: ViewProfile): Promise<void> =>
  invoke("save_view_profile", { profile });

export const deleteViewProfile = (profileId: string): Promise<void> =>
  invoke("delete_view_profile", { profileId });

export const reorderViewProfiles = (ids: string[]): Promise<void> =>
  invoke("reorder_view_profiles", { ids });
