import { invoke } from "@tauri-apps/api/core";
import type {
  AppPreferences,
  EntityStore,
  GroupObject,
  HostBinding,
  HostConfig,
  HostMetadataStore,
  LayoutProfile,
  LicensePayload,
  LicenseStatus,
  LocalDirEntry,
  PluginListEntry,
  QuickSshSessionRequest,
  RemoteSshSpec,
  SessionStarted,
  SftpDirEntry,
  SshDirInfo,
  SshKeyObject,
  TagObject,
  UserObject,
  ViewProfile,
} from "./types";
import type { ProxmoxStandalonePayload } from "./features/proxmox-standalone-payload";

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

export const getSshConfigRaw = (): Promise<string> => invoke("get_ssh_config_raw");

export const saveSshConfigRaw = (content: string): Promise<void> =>
  invoke("save_ssh_config_raw", { content });

export const getSshDirInfo = (): Promise<SshDirInfo> => invoke("get_ssh_dir_info");

export const setSshDirOverride = (path: string | null): Promise<void> =>
  invoke("set_ssh_dir_override", { path });

export const startSession = (host: HostConfig): Promise<SessionStarted> =>
  invoke("start_session", { host });

export const startLocalSession = (): Promise<SessionStarted> =>
  invoke("start_local_session");

export const startQuickSshSession = (request: QuickSshSessionRequest): Promise<SessionStarted> =>
  invoke("start_quick_ssh_session", { request });

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

export const getAppPreferences = (): Promise<AppPreferences> => invoke("get_app_preferences");

export const saveAppPreferences = (prefs: AppPreferences): Promise<AppPreferences> =>
  invoke("save_app_preferences", { prefs });

export const exportBackup = (path: string, password: string): Promise<void> =>
  invoke("export_backup", { path, password });

export const importBackup = (path: string, password: string): Promise<void> =>
  invoke("import_backup", { path, password });

export const exportResolvedOpensshConfig = (includeStrictHostKey: boolean): Promise<string> =>
  invoke("export_resolved_openssh_config", { includeStrictHostKey });

export const exportResolvedOpensshConfigToPath = (
  path: string,
  includeStrictHostKey: boolean,
): Promise<void> => invoke("export_resolved_openssh_config_to_path", { path, includeStrictHostKey });

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

export const listStoreObjects = (): Promise<EntityStore> =>
  invoke("list_store_objects");

export const saveStoreObjects = (store: EntityStore): Promise<void> =>
  invoke("save_store_objects", { store });

export const assignHostBinding = (hostAlias: string, binding: HostBinding): Promise<void> =>
  invoke("assign_host_binding", { hostAlias, binding });

export const listUsers = (): Promise<UserObject[]> =>
  invoke("list_users");

export const listGroups = (): Promise<GroupObject[]> =>
  invoke("list_groups");

export const listTags = (): Promise<TagObject[]> =>
  invoke("list_tags");

export const createEncryptedKey = (
  name: string,
  privateKeyPem: string,
  publicKey: string,
  passphrase?: string,
): Promise<SshKeyObject> =>
  invoke("create_encrypted_key", { name, privateKeyPem, publicKey, passphrase });

export const unlockKeyMaterial = (keyId: string, passphrase?: string): Promise<string> =>
  invoke("unlock_key_material", { keyId, passphrase });

export const deleteKeyById = (keyId: string): Promise<void> =>
  invoke("delete_key", { keyId });

export const sftpListRemoteDir = (spec: RemoteSshSpec, path: string): Promise<SftpDirEntry[]> =>
  invoke("sftp_list_remote_dir", { spec, path });

export const listLocalDir = (path: string): Promise<LocalDirEntry[]> =>
  invoke("list_local_dir", { path });

export const getLocalHomeCanonicalPath = (): Promise<string> =>
  invoke("get_local_home_canonical_path");

export const sftpDownloadFile = (
  spec: RemoteSshSpec,
  remoteFilePath: string,
  destDirPath: string,
): Promise<string> => invoke("sftp_download_file", { spec, remoteFilePath, destDirPath });

export const sftpExportPathsArchive = (
  spec: RemoteSshSpec,
  parentPath: string,
  names: string[],
  format: string,
  destDirPath: string,
  localOutputBaseName: string | null,
): Promise<string> =>
  invoke("sftp_export_paths_archive", {
    spec,
    parentPath,
    names,
    format,
    destDirPath,
    localOutputBaseName,
  });

export const localExportPathsArchive = (
  parentPathKey: string,
  names: string[],
  format: string,
  destDirPath: string,
  localOutputBaseName: string | null,
): Promise<string> =>
  invoke("local_export_paths_archive", {
    parentPathKey,
    names,
    format,
    destDirPath,
    localOutputBaseName,
  });

export const sftpUploadFile = (
  spec: RemoteSshSpec,
  localDirPath: string,
  localFileName: string,
  remoteFilePath: string,
): Promise<void> =>
  invoke("sftp_upload_file", { spec, localDirPath, localFileName, remoteFilePath });

export const copyLocalFile = (
  srcDirPath: string,
  srcName: string,
  destDirPath: string,
  destName: string,
): Promise<string> => invoke("copy_local_file", { srcDirPath, srcName, destDirPath, destName });

export const broadcastFileTransferClipboard = (payload: unknown): Promise<void> =>
  invoke("broadcast_file_transfer_clipboard", { payload });

export const openAuxWindow = (): Promise<void> => invoke("open_aux_window");

export const openExternalUrl = (url: string): Promise<void> => invoke("open_external_url", { url });

/** Opens the URL in a separate in-app webview window (not an iframe); use when sites block embedding. Returns the window label for {@link navigateInAppWebviewWindow}. */
export const openInAppWebviewWindow = (
  title: string,
  url: string,
  allowInsecureTls = false,
  tlsTrustedCertPem?: string | null,
  autoConsoleUrl?: string | null,
): Promise<string> =>
  invoke<string>("open_in_app_webview_window", {
    title,
    url,
    allowInsecureTls,
    tlsTrustedCertPem: tlsTrustedCertPem ?? null,
    ...(autoConsoleUrl != null && autoConsoleUrl !== "" ? { autoConsoleUrl } : {}),
  });

export const navigateInAppWebviewWindow = (label: string, url: string): Promise<void> =>
  invoke("navigate_in_app_webview_window", { label, url });

/** Second window with the same React native Proxmox consoles as the main pane (API tickets — no Proxmox web login). */
export async function openProxmoxNativeConsoleWindow(title: string, payload: ProxmoxStandalonePayload): Promise<void> {
  await invoke("open_proxmox_native_console_window", {
    args: {
      title,
      payloadJson: JSON.stringify(payload),
    },
  });
}

export async function takeProxmoxStandalonePayload(label: string): Promise<string | null> {
  return invoke<string | null>("take_proxmox_standalone_payload", { label });
}

export type { ProxmoxStandalonePayload } from "./features/proxmox-standalone-payload";

export const openVirtViewerFromSpicePayload = (spiceData: Record<string, unknown>): Promise<void> =>
  invoke("open_virt_viewer_from_spice_payload", { spiceData });

export const createLocalDir = (parentPathKey: string, dirName: string): Promise<void> =>
  invoke("create_local_dir", { parentPathKey, dirName });

export const deleteLocalEntry = (parentPathKey: string, name: string): Promise<void> =>
  invoke("delete_local_entry", { parentPathKey, name });

export type DeleteEntryMode = "strict" | "bestEffort" | "chmodOwnerWritableThenStrict";

export type DeletePathFailure = {
  path: string;
  message: string;
};

export type DeleteTreeResult = {
  completedFully: boolean;
  failures: DeletePathFailure[];
  hadPermissionDenied: boolean;
};

export const deleteLocalEntryWithMode = (
  parentPathKey: string,
  name: string,
  mode: DeleteEntryMode,
): Promise<DeleteTreeResult> => invoke("delete_local_entry_with_mode", { parentPathKey, name, mode });

export const renameLocalEntry = (parentPathKey: string, oldName: string, newName: string): Promise<void> =>
  invoke("rename_local_entry", { parentPathKey, oldName, newName });

export const openLocalEntryInOs = (parentPathKey: string, name: string): Promise<void> =>
  invoke("open_local_entry_in_os", { parentPathKey, name });

export const readLocalTextFile = (parentPathKey: string, name: string): Promise<string> =>
  invoke("read_local_text_file", { parentPathKey, name });

export const writeLocalTextFile = (parentPathKey: string, name: string, content: string): Promise<void> =>
  invoke("write_local_text_file", { parentPathKey, name, content });

export const createLocalTextFile = (parentPathKey: string, name: string, content: string): Promise<void> =>
  invoke("create_local_text_file", { parentPathKey, name, content });

export const sftpCreateDir = (spec: RemoteSshSpec, parentPath: string, dirName: string): Promise<void> =>
  invoke("sftp_create_dir", { spec, parentPath, dirName });

export const sftpRemoveKnownHostEntries = (hosts: string[]): Promise<void> =>
  invoke("sftp_remove_known_host_entries", { hosts });

export const sftpDeleteEntry = (spec: RemoteSshSpec, parentPath: string, name: string): Promise<void> =>
  invoke("sftp_delete_entry", { spec, parentPath, name });

export const sftpDeleteEntryWithMode = (
  spec: RemoteSshSpec,
  parentPath: string,
  name: string,
  mode: DeleteEntryMode,
): Promise<DeleteTreeResult> => invoke("sftp_delete_entry_with_mode", { spec, parentPath, name, mode });

export const sftpRenameEntry = (
  spec: RemoteSshSpec,
  parentPath: string,
  oldName: string,
  newName: string,
): Promise<void> => invoke("sftp_rename_entry", { spec, parentPath, oldName, newName });

export const sftpReadTextFile = (spec: RemoteSshSpec, parentPath: string, name: string): Promise<string> =>
  invoke("sftp_read_text_file", { spec, parentPath, name });

export const sftpCreateTextFile = (
  spec: RemoteSshSpec,
  parentPath: string,
  name: string,
  content: string,
): Promise<void> => invoke("sftp_create_text_file", { spec, parentPath, name, content });

export const sftpWriteTextFile = (
  spec: RemoteSshSpec,
  parentPath: string,
  name: string,
  content: string,
): Promise<void> => invoke("sftp_write_text_file", { spec, parentPath, name, content });

export const listPlugins = (): Promise<PluginListEntry[]> => invoke("list_plugins");

export const setPluginEnabled = (pluginId: string, enabled: boolean): Promise<void> =>
  invoke("set_plugin_enabled", { pluginId, enabled });

export const pluginInvoke = (
  pluginId: string,
  method: string,
  arg: Record<string, unknown>,
): Promise<unknown> => invoke("plugin_invoke", { pluginId, method, arg });

export type ProxmuxWsProxyStartResult = {
  proxyId: string;
  localWsUrl: string;
};

/** Start `127.0.0.1` WebSocket bridge to a Proxmox `wss://` console URL (for self-signed clusters). */
export const proxmuxWsProxyStart = (
  upstreamWssUrl: string,
  allowInsecureTls: boolean,
  tlsTrustedCertPem: string | null | undefined,
  authHeader?: string,
  authCookie?: string,
): Promise<ProxmuxWsProxyStartResult> =>
  invoke("proxmux_ws_proxy_start", {
    upstreamWssUrl,
    allowInsecureTls,
    tlsTrustedCertPem: tlsTrustedCertPem?.trim() ? tlsTrustedCertPem.trim() : null,
    authHeader: authHeader ?? null,
    authCookie: authCookie ?? null,
  });

export const proxmuxWsProxyStop = (proxyId: string): Promise<void> =>
  invoke("proxmux_ws_proxy_stop", { proxyId });

export const activateLicense = (token: string): Promise<LicensePayload> =>
  invoke("activate_license", { token });

export const licenseStatus = (): Promise<LicenseStatus> => invoke("license_status");

export const clearLicense = (): Promise<void> => invoke("clear_license");
