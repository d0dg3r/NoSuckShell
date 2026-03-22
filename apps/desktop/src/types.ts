export type HostConfig = {
  host: string;
  hostName: string;
  user: string;
  port: number;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
};

/** OpenSSH StrictHostKeyChecking modes persisted per host (kebab-case JSON, matches Rust). */
export type StrictHostKeyPolicy = "ask" | "accept-new" | "no";

export type HostMetadata = {
  favorite: boolean;
  tags: string[];
  lastUsedAt: number | null;
  trustHostDefault: boolean;
  /** When set, drives SSH `-o StrictHostKeyChecking=…` for saved hosts. */
  strictHostKeyPolicy?: StrictHostKeyPolicy;
};

export type HostMetadataStore = {
  defaultUser: string;
  hosts: Record<string, HostMetadata>;
};

export type StoreSchemaVersion = 1;
export type KeyKdf = "argon2id";

export type HostKeyRef = {
  keyId: string;
  usage: string;
};

export type UserObject = {
  id: string;
  name: string;
  username: string;
  /** When set and this user is linked on a host binding, overrides SSH HostName for the session. */
  hostName: string;
  /** When set and the host binding has no ProxyJump, used as ProxyJump for the session. */
  proxyJump: string;
  keyRefs: HostKeyRef[];
  tagIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type GroupObject = {
  id: string;
  name: string;
  memberUserIds: string[];
  tagIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type TagObject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type PathSshKeyObject = {
  type: "path";
  id: string;
  name: string;
  identityFilePath: string;
  tagIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type EncryptedSshKeyObject = {
  type: "encrypted";
  id: string;
  name: string;
  ciphertext: string;
  kdf: KeyKdf;
  salt: string;
  nonce: string;
  fingerprint: string;
  publicKey: string;
  tagIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type SshKeyObject = PathSshKeyObject | EncryptedSshKeyObject;

export type HostBinding = {
  userId?: string;
  groupIds: string[];
  tagIds: string[];
  keyRefs: HostKeyRef[];
  proxyJump: string;
  legacyUser: string;
  legacyTags: string[];
  legacyIdentityFile: string;
  legacyProxyJump: string;
  legacyProxyCommand: string;
};

export type EntityStore = {
  schemaVersion: StoreSchemaVersion | number;
  updatedAt: number;
  users: Record<string, UserObject>;
  groups: Record<string, GroupObject>;
  keys: Record<string, SshKeyObject>;
  tags: Record<string, TagObject>;
  hostBindings: Record<string, HostBinding>;
};

export type BackupPayload = {
  sshConfig: string;
  metadata: HostMetadataStore;
  exportedAt: number;
};

/** Paths for OpenSSH data root (`config`, store, etc.). From `get_ssh_dir_info`. */
export type SshDirInfo = {
  defaultPath: string;
  effectivePath: string;
  overridePath: string | null;
  userProfile: string | null;
};

export type SessionOutputEvent = {
  session_id: string;
  chunk: string;
  host_key_prompt: boolean;
};

export type SessionStarted = {
  session_id: string;
};

export type QuickSshSessionRequest = {
  hostName: string;
  user: string;
  port?: number;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
  /** Overrides metadata for Quick Connect sessions. */
  strictHostKeyPolicy?: StrictHostKeyPolicy;
};

export type SftpDirEntry = {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number | null;
  /** Permission mode string only, e.g. `drwxr-xr-x` (owner/group are separate fields). */
  modeDisplay: string;
  /** Permission bits only, e.g. `755`. */
  modeOctal: string;
  /** Numeric uid from the server when available. */
  userDisplay: string;
  /** Numeric gid from the server when available. */
  groupDisplay: string;
};

export type LocalDirEntry = {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number | null;
  /** Permission mode string only; owner/group are in `userDisplay` / `groupDisplay`. */
  modeDisplay: string;
  modeOctal: string;
  userDisplay: string;
  groupDisplay: string;
};

export type RemoteSshSpec =
  | { kind: "saved"; host: HostConfig }
  | { kind: "quick"; request: QuickSshSessionRequest };

export type PaneLayoutItem = {
  id: string;
  width: number;
  height: number;
};

export type LayoutPaneSessionKind = "sshSaved" | "local" | "sshQuick";

export type LayoutPaneSnapshot = {
  width: number;
  height: number;
  hostAlias: string | null;
  /** Present in saved layouts v2; omitted in older files (infer from hostAlias). */
  sessionKind?: LayoutPaneSessionKind | null;
  /** Required when sessionKind is sshQuick. */
  quickSsh?: QuickSshSessionRequest | null;
};

export type LayoutSplitTreeNode =
  | {
      id: string;
      type: "leaf";
      paneIndex: number;
    }
  | {
      id: string;
      type: "split";
      axis: "horizontal" | "vertical";
      ratio: number;
      first: LayoutSplitTreeNode;
      second: LayoutSplitTreeNode;
    };

export type LayoutProfile = {
  id: string;
  name: string;
  withHosts: boolean;
  panes: LayoutPaneSnapshot[];
  splitTree?: LayoutSplitTreeNode | null;
  createdAt: number;
  updatedAt: number;
};

export type ViewBuiltInId = "all" | "favorites";

export type ViewFilterField =
  | "host"
  | "hostName"
  | "user"
  | "port"
  | "status"
  | "favorite"
  | "recent"
  | "tag";

export type ViewFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "in";

export type ViewFilterRule = {
  id: string;
  field: ViewFilterField;
  operator: ViewFilterOperator;
  value: string;
};

export type ViewFilterGroup = {
  id: string;
  mode: "and" | "or";
  rules: ViewFilterRule[];
  groups: ViewFilterGroup[];
};

export type ViewSortField = "host" | "hostName" | "user" | "port" | "lastUsedAt" | "status" | "favorite";

export type ViewSortRule = {
  field: ViewSortField;
  direction: "asc" | "desc";
};

export type ViewProfile = {
  id: string;
  name: string;
  order: number;
  filterGroup: ViewFilterGroup;
  sortRules: ViewSortRule[];
  createdAt: number;
  updatedAt: number;
};

export type PluginCapability = "credentialProvider" | "settingsUi" | "hostMetadataEnricher";

export type PluginManifest = {
  id: string;
  version: string;
  displayName: string;
  capabilities: PluginCapability[];
};

export type PluginListEntry = {
  manifest: PluginManifest;
  enabled: boolean;
  entitlementOk: boolean;
};

export type LicensePayload = {
  v: number;
  licenseId: string;
  entitlements: string[];
  iat: number;
  exp?: number | null;
};

export type LicenseStatus = {
  active: boolean;
  licenseId: string | null;
  entitlements: string[];
  exp: number | null;
};
