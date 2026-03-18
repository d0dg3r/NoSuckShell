import { invoke } from "@tauri-apps/api/core";
import type { HostConfig, HostMetadataStore, LayoutProfile, SessionStarted } from "./types";

export const listHosts = (): Promise<HostConfig[]> => invoke("list_hosts");

export const saveHost = (host: HostConfig): Promise<void> =>
  invoke("save_host", { host });

export const deleteHost = (hostName: string): Promise<void> =>
  invoke("delete_host", { hostName });

export const startSession = (host: HostConfig): Promise<SessionStarted> =>
  invoke("start_session", { host });

export const sendInput = (sessionId: string, data: string): Promise<void> =>
  invoke("send_input", { sessionId, data });

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
