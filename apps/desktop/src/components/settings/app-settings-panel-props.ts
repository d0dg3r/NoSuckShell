import type React from "react";
import type { MutableRefObject, Ref, PointerEvent as ReactPointerEvent } from "react";
import type {
  HostBinding,
  HostConfig,
  HostMetadata,
  HostMetadataStore,
  GroupObject,
  SshKeyObject,
  StrictHostKeyPolicy,
  TagObject,
  UserObject,
  ViewFilterRule,
  ViewProfile,
  SshDirInfo,
} from "../../types";
import type {
  AppSettingsTab,
  AutoArrangeMode,
  DensityProfile,
  FileExportArchiveFormat,
  FileExportDestMode,
  FrameModePreset,
  LayoutMode,
  ListTonePreset,
  QuickConnectMode,
  SettingsOpenMode,
  SplitRatioPreset,
  TerminalFontPreset,
  UiFontPreset,
} from "./app-settings-types";
import type { FilePaneSemanticNameColorsStored } from "../../features/file-pane-semantic-name-colors-prefs";
import type { KeyboardShortcutCommandId, KeyChord } from "../../features/keyboard-shortcuts-types";

export type AppSettingsPanelProps = {
  keyboardShortcutChords: Record<KeyboardShortcutCommandId, KeyChord>;
  setKeyboardShortcutChords: React.Dispatch<React.SetStateAction<Record<KeyboardShortcutCommandId, KeyChord>>>;
  keyboardLeaderChord: KeyChord;
  setKeyboardLeaderChord: React.Dispatch<React.SetStateAction<KeyChord>>;
  resolveHelpShortcutLabel: (action: string) => string | undefined;
  shortcutCheatsheetLines: Array<{ label: string; keys: string }>;
  keyboardShortcutSuspendEscapeRef: MutableRefObject<boolean>;
  settingsOpenMode: SettingsOpenMode;
  setSettingsOpenMode: (mode: SettingsOpenMode) => void;
  onCloseSettings: () => void;
  settingsSectionRef: Ref<HTMLElement | null>;
  onSettingsHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  isSettingsDragging: boolean;
  settingsModalPosition: { x: number; y: number } | null;
  activeAppSettingsTab: AppSettingsTab;
  setActiveAppSettingsTab: (tab: AppSettingsTab) => void;
  densityProfile: DensityProfile;
  setDensityProfile: (value: DensityProfile) => void;
  uiFontPreset: UiFontPreset;
  setUiFontPreset: (value: UiFontPreset) => void;
  terminalFontPreset: TerminalFontPreset;
  setTerminalFontPreset: (value: TerminalFontPreset) => void;
  terminalFontOffset: number;
  setTerminalFontOffset: (value: number) => void;
  terminalFontSize: number;
  listTonePreset: ListTonePreset;
  setListTonePreset: (value: ListTonePreset) => void;
  frameModePreset: FrameModePreset;
  setFrameModePreset: (value: FrameModePreset) => void;
  showFullPathInFilePaneTitle: boolean;
  setShowFullPathInFilePaneTitle: (value: boolean) => void;
  fileExportDestMode: FileExportDestMode;
  setFileExportDestMode: (value: FileExportDestMode) => void;
  fileExportPathKey: string;
  setFileExportPathKey: (value: string) => void;
  fileExportArchiveFormat: FileExportArchiveFormat;
  setFileExportArchiveFormat: (value: FileExportArchiveFormat) => void;
  filePaneSemanticNameColors: FilePaneSemanticNameColorsStored;
  setFilePaneSemanticNameColors: React.Dispatch<React.SetStateAction<FilePaneSemanticNameColorsStored>>;
  layoutMode: LayoutMode;
  setLayoutMode: (value: LayoutMode) => void;
  splitRatioPreset: SplitRatioPreset;
  setSplitRatioPreset: (value: SplitRatioPreset) => void;
  autoArrangeMode: AutoArrangeMode;
  setAutoArrangeMode: (value: AutoArrangeMode) => void;
  isBroadcastModeEnabled: boolean;
  setBroadcastMode: (enabled: boolean) => void;
  isSidebarPinned: boolean;
  setSidebarPinned: (value: boolean) => void;
  metadataStore: HostMetadataStore;
  setMetadataStore: React.Dispatch<React.SetStateAction<HostMetadataStore>>;
  applyDefaultUser: (value: string) => Promise<void>;
  setError: (message: string) => void;
  error: string;
  quickConnectMode: QuickConnectMode;
  setQuickConnectMode: (value: QuickConnectMode) => void;
  quickConnectAutoTrust: boolean;
  setQuickConnectAutoTrust: (value: boolean) => void;
  sortedViewProfiles: ViewProfile[];
  selectedViewProfileIdInSettings: string;
  selectViewProfileForSettings: (profileId: string) => void;
  createNewViewDraft: () => void;
  reorderView: (direction: "up" | "down") => Promise<void>;
  deleteCurrentViewDraft: () => Promise<void>;
  viewDraft: ViewProfile;
  setViewDraft: React.Dispatch<React.SetStateAction<ViewProfile>>;
  createViewRule: () => ViewFilterRule;
  saveCurrentViewDraft: () => Promise<void>;
  defaultBackupPath: string;
  backupExportPath: string;
  setBackupExportPath: (value: string) => void;
  backupExportPassword: string;
  setBackupExportPassword: (value: string) => void;
  handleExportBackup: () => Promise<void>;
  backupImportPath: string;
  setBackupImportPath: (value: string) => void;
  backupImportPassword: string;
  setBackupImportPassword: (value: string) => void;
  handleImportBackup: () => Promise<void>;
  backupMessage: string;
  storePassphrase: string;
  setStorePassphrase: (value: string) => void;
  storeUsers: UserObject[];
  storeGroups: GroupObject[];
  storeTags: TagObject[];
  storeKeys: SshKeyObject[];
  hosts: HostConfig[];
  storeUserDraft: string;
  setStoreUserDraft: (value: string) => void;
  addStoreUser: () => Promise<void>;
  storeGroupDraft: string;
  setStoreGroupDraft: (value: string) => void;
  addStoreGroup: () => Promise<void>;
  storeTagDraft: string;
  setStoreTagDraft: (value: string) => void;
  addStoreTag: () => Promise<void>;
  importStoreUsersFromHosts: () => Promise<void>;
  updateStoreUser: (
    userId: string,
    patch: Partial<Pick<UserObject, "name" | "username" | "hostName" | "proxyJump" | "keyRefs" | "tagIds">>,
  ) => Promise<void>;
  deleteStoreUser: (userId: string) => Promise<void>;
  setStoreUserGroupMembership: (userId: string, groupIds: string[]) => Promise<void>;
  updateStoreGroup: (
    groupId: string,
    patch: Partial<Pick<GroupObject, "name" | "memberUserIds" | "tagIds">>,
  ) => Promise<void>;
  deleteStoreGroup: (groupId: string) => Promise<void>;
  updateStoreTag: (tagId: string, name: string) => Promise<void>;
  deleteStoreTag: (tagId: string) => Promise<void>;
  patchStoreKey: (keyId: string, patch: { tagIds: string[] }) => Promise<void>;
  reorderUserStoreKeys: (userId: string, index: number, direction: "up" | "down") => Promise<void>;
  storePathKeyNameDraft: string;
  setStorePathKeyNameDraft: (value: string) => void;
  storePathKeyPathDraft: string;
  setStorePathKeyPathDraft: (value: string) => void;
  addStorePathKey: () => Promise<void>;
  storeEncryptedKeyNameDraft: string;
  setStoreEncryptedKeyNameDraft: (value: string) => void;
  storeEncryptedPublicKeyDraft: string;
  setStoreEncryptedPublicKeyDraft: (value: string) => void;
  storeEncryptedPrivateKeyDraft: string;
  setStoreEncryptedPrivateKeyDraft: (value: string) => void;
  addStoreEncryptedKey: () => Promise<void>;
  unlockStoreKey: (keyId: string) => Promise<void>;
  removeStoreKey: (keyId: string) => Promise<void>;
  sshConfigRaw: string;
  setSshConfigRaw: React.Dispatch<React.SetStateAction<string>>;
  onSaveSshConfig: () => Promise<void>;
  sshDirInfo: SshDirInfo | null;
  sshDirOverrideDraft: string;
  setSshDirOverrideDraft: (value: string) => void;
  onApplySshDirOverride: () => Promise<void>;
  onResetSshDirOverride: () => Promise<void>;
  hostSettingsSelectedAlias: string;
  onHostSettingsSelectAlias: (alias: string) => void;
  hostSettingsDraftHost: HostConfig;
  setHostSettingsDraftHost: React.Dispatch<React.SetStateAction<HostConfig>>;
  hostSettingsDraftBinding: HostBinding;
  setHostSettingsDraftBinding: React.Dispatch<React.SetStateAction<HostBinding>>;
  hostSettingsTagDraft: string;
  setHostSettingsTagDraft: React.Dispatch<React.SetStateAction<string>>;
  hostSettingsKeyPolicy: StrictHostKeyPolicy;
  setHostSettingsKeyPolicy: React.Dispatch<React.SetStateAction<StrictHostKeyPolicy>>;
  hostSettingsMetadataForSelected: HostMetadata;
  onSaveHostSettingsTab: () => Promise<void>;
  hostSettingsTabSaveDisabled: boolean;
  onRemoveHostSettingsTabIntent: () => void;
  hostSettingsTabRemoveConfirmActive: boolean;
  toggleFavoriteForHost: (hostAlias: string) => void | Promise<void>;
  toggleJumpHostForHost: (hostAlias: string) => void | Promise<void>;
  /** When true, PROXMUX web consoles open inside a split pane instead of the system browser. */
  proxmuxOpenWebConsolesInPane: boolean;
  setProxmuxOpenWebConsolesInPane: (value: boolean) => void;
};
