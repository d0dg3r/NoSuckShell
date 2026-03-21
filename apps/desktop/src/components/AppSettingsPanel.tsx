import type React from "react";
import {
  Suspense,
  lazy,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { mergeManagedHostStarBlock } from "../features/ssh-config-managed-block";
import type {
  HostBinding,
  HostConfig,
  HostMetadataStore,
  GroupObject,
  HostKeyRef,
  SshKeyObject,
  TagObject,
  UserObject,
  ViewFilterField,
  ViewFilterOperator,
  ViewFilterRule,
  ViewProfile,
  ViewSortField,
  SshDirInfo,
} from "../types";
import logoTerminal from "../../../../img/logo_terminal.png";

const HelpPanel = lazy(async () => {
  const m = await import("./HelpPanel");
  return { default: m.HelpPanel };
});

export type AppSettingsTab =
  | "appearance"
  | "layout"
  | "data"
  | "ssh"
  | "views"
  | "store"
  | "help"
  | "about";

export type IdentityStoreSubTab = "overview" | "users" | "groups" | "tags" | "keys" | "hosts";

export type DensityProfile = "aggressive" | "balanced" | "safe";
export type ListTonePreset = "subtle" | "strong";
export type FrameModePreset = "cleaner" | "balanced" | "clearer";
export type UiFontPreset = "inter" | "manrope" | "ibm-plex-sans";
export type TerminalFontPreset = "jetbrains-mono" | "ibm-plex-mono" | "source-code-pro";
export type QuickConnectMode = "wizard" | "smart" | "command";
export type SettingsOpenMode = "modal" | "docked";
export type LayoutMode = "auto" | "wide" | "compact";
export type SplitRatioPreset = "50-50" | "60-40" | "70-30";
export type AutoArrangeMode = "off" | "a" | "b" | "c" | "free";

/** Order: look & workspace & quick connect → views → identities → advanced SSH → data safety → meta. */
const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout & Navigation" },
  { id: "views", label: "Views" },
  { id: "store", label: "Identity Store" },
  { id: "ssh", label: "SSH" },
  { id: "data", label: "Data & Backup" },
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
];

/** Overview first; then people → credentials → taxonomy → host bindings. */
const IDENTITY_STORE_SUBTABS: Array<{ id: IdentityStoreSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "keys", label: "SSH keys" },
  { id: "groups", label: "Groups" },
  { id: "tags", label: "Tags" },
  { id: "hosts", label: "Hosts" },
];

const TERMINAL_FONT_OFFSET_MIN = -3;
const TERMINAL_FONT_OFFSET_MAX = 6;

export type AppSettingsPanelProps = {
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
    patch: Partial<Pick<UserObject, "name" | "username" | "keyRefs" | "tagIds">>,
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
  storeSelectedHostForBinding: string;
  setStoreSelectedHostForBinding: (value: string) => void;
  storeBindingDraft: HostBinding;
  setStoreBindingDraft: React.Dispatch<React.SetStateAction<HostBinding>>;
  saveHostBindingDraft: () => Promise<void>;
  sshConfigRaw: string;
  setSshConfigRaw: React.Dispatch<React.SetStateAction<string>>;
  onSaveSshConfig: () => Promise<void>;
  sshDirInfo: SshDirInfo | null;
  sshDirOverrideDraft: string;
  setSshDirOverrideDraft: (value: string) => void;
  onApplySshDirOverride: () => Promise<void>;
  onResetSshDirOverride: () => Promise<void>;
};

export function AppSettingsPanel(props: AppSettingsPanelProps) {
  const {
    settingsOpenMode,
    setSettingsOpenMode,
    onCloseSettings,
    settingsSectionRef,
    onSettingsHeaderPointerDown,
    isSettingsDragging,
    settingsModalPosition,
    activeAppSettingsTab,
    setActiveAppSettingsTab,
    densityProfile,
    setDensityProfile,
    uiFontPreset,
    setUiFontPreset,
    terminalFontPreset,
    setTerminalFontPreset,
    terminalFontOffset,
    setTerminalFontOffset,
    terminalFontSize,
    listTonePreset,
    setListTonePreset,
    frameModePreset,
    setFrameModePreset,
    layoutMode,
    setLayoutMode,
    splitRatioPreset,
    setSplitRatioPreset,
    autoArrangeMode,
    setAutoArrangeMode,
    isBroadcastModeEnabled,
    setBroadcastMode,
    isSidebarPinned,
    setSidebarPinned,
    metadataStore,
    setMetadataStore,
    applyDefaultUser,
    setError,
    quickConnectMode,
    setQuickConnectMode,
    quickConnectAutoTrust,
    setQuickConnectAutoTrust,
    sortedViewProfiles,
    selectedViewProfileIdInSettings,
    selectViewProfileForSettings,
    createNewViewDraft,
    reorderView,
    deleteCurrentViewDraft,
    viewDraft,
    setViewDraft,
    createViewRule,
    saveCurrentViewDraft,
    defaultBackupPath,
    backupExportPath,
    setBackupExportPath,
    backupExportPassword,
    setBackupExportPassword,
    handleExportBackup,
    backupImportPath,
    setBackupImportPath,
    backupImportPassword,
    setBackupImportPassword,
    handleImportBackup,
    backupMessage,
    storePassphrase,
    setStorePassphrase,
    storeUsers,
    storeGroups,
    storeTags,
    storeKeys,
    hosts,
    storeUserDraft,
    setStoreUserDraft,
    addStoreUser,
    storeGroupDraft,
    setStoreGroupDraft,
    addStoreGroup,
    storeTagDraft,
    setStoreTagDraft,
    addStoreTag,
    importStoreUsersFromHosts,
    updateStoreUser,
    deleteStoreUser,
    setStoreUserGroupMembership,
    updateStoreGroup,
    deleteStoreGroup,
    updateStoreTag,
    deleteStoreTag,
    patchStoreKey,
    reorderUserStoreKeys,
    storePathKeyNameDraft,
    setStorePathKeyNameDraft,
    storePathKeyPathDraft,
    setStorePathKeyPathDraft,
    addStorePathKey,
    storeEncryptedKeyNameDraft,
    setStoreEncryptedKeyNameDraft,
    storeEncryptedPublicKeyDraft,
    setStoreEncryptedPublicKeyDraft,
    storeEncryptedPrivateKeyDraft,
    setStoreEncryptedPrivateKeyDraft,
    addStoreEncryptedKey,
    unlockStoreKey,
    removeStoreKey,
    storeSelectedHostForBinding,
    setStoreSelectedHostForBinding,
    storeBindingDraft,
    setStoreBindingDraft,
    saveHostBindingDraft,
    sshConfigRaw,
    setSshConfigRaw,
    onSaveSshConfig,
    sshDirInfo,
    sshDirOverrideDraft,
    setSshDirOverrideDraft,
    onApplySshDirOverride,
    onResetSshDirOverride,
  } = props;

  const [identityStoreSubTab, setIdentityStoreSubTab] = useState<IdentityStoreSubTab>("overview");
  const [expandedStoreUserId, setExpandedStoreUserId] = useState<string | null>(null);
  const [sshHostStarServerAliveInterval, setSshHostStarServerAliveInterval] = useState("");
  const [sshHostStarServerAliveCountMax, setSshHostStarServerAliveCountMax] = useState("");
  const [sshHostStarTcpKeepAlive, setSshHostStarTcpKeepAlive] = useState<"" | "yes" | "no">("");
  const [sshHostStarIdentityFile, setSshHostStarIdentityFile] = useState("");
  const [sshHostStarUser, setSshHostStarUser] = useState("");

  const applyHostStarBlockToBuffer = () => {
    const lines: string[] = [];
    if (sshHostStarServerAliveInterval.trim()) {
      lines.push(`ServerAliveInterval ${sshHostStarServerAliveInterval.trim()}`);
    }
    if (sshHostStarServerAliveCountMax.trim()) {
      lines.push(`ServerAliveCountMax ${sshHostStarServerAliveCountMax.trim()}`);
    }
    if (sshHostStarTcpKeepAlive === "yes" || sshHostStarTcpKeepAlive === "no") {
      lines.push(`TCPKeepAlive ${sshHostStarTcpKeepAlive}`);
    }
    if (sshHostStarIdentityFile.trim()) {
      lines.push(`IdentityFile ${sshHostStarIdentityFile.trim()}`);
    }
    if (sshHostStarUser.trim()) {
      lines.push(`User ${sshHostStarUser.trim()}`);
    }
    if (lines.length === 0) {
      setError("Add at least one directive, or edit the raw config.");
      return;
    }
    setError("");
    setSshConfigRaw((prev) => mergeManagedHostStarBlock(prev, lines));
  };

  const normalizeKeyRefs = (refs: HostKeyRef[]): HostKeyRef[] =>
    refs.map((r, i) => ({ ...r, usage: i === 0 ? "primary" : "additional" }));

  const toggleUserKey = (userId: string, user: UserObject, keyId: string, checked: boolean) => {
    let next = user.keyRefs.filter((r) => r.keyId !== keyId);
    if (checked) {
      next = [...next, { keyId, usage: "additional" }];
    }
    void updateStoreUser(userId, { keyRefs: normalizeKeyRefs(next) });
  };

  const toggleUserTag = (userId: string, user: UserObject, tagId: string, checked: boolean) => {
    const nextIds = checked
      ? [...user.tagIds, tagId]
      : user.tagIds.filter((id) => id !== tagId);
    void updateStoreUser(userId, { tagIds: nextIds });
  };

  const toggleUserInGroup = (userId: string, groupId: string, checked: boolean) => {
    const memberGroupIds = storeGroups.filter((g) => g.memberUserIds.includes(userId)).map((g) => g.id);
    const next = checked
      ? [...new Set([...memberGroupIds, groupId])]
      : memberGroupIds.filter((id) => id !== groupId);
    void setStoreUserGroupMembership(userId, next);
  };

  const toggleHostBindingKey = (keyId: string, checked: boolean) => {
    setStoreBindingDraft((prev) => {
      let next = prev.keyRefs.filter((r) => r.keyId !== keyId);
      if (checked) {
        next = [...next, { keyId, usage: "additional" }];
      }
      return { ...prev, keyRefs: normalizeKeyRefs(next) };
    });
  };

  const toggleHostBindingTag = (tagId: string, checked: boolean) => {
    setStoreBindingDraft((prev) => ({
      ...prev,
      tagIds: checked
        ? [...prev.tagIds, tagId]
        : prev.tagIds.filter((id) => id !== tagId),
    }));
  };

  const toggleHostBindingGroup = (groupId: string, checked: boolean) => {
    setStoreBindingDraft((prev) => ({
      ...prev,
      groupIds: checked
        ? [...prev.groupIds, groupId]
        : prev.groupIds.filter((id) => id !== groupId),
    }));
  };

  const toggleGroupTag = (groupId: string, group: GroupObject, tagId: string, checked: boolean) => {
    const cur = group.tagIds ?? [];
    const nextIds = checked ? [...cur, tagId] : cur.filter((id) => id !== tagId);
    void updateStoreGroup(groupId, { tagIds: nextIds });
  };

  const toggleKeyTag = (keyId: string, key: SshKeyObject, tagId: string, checked: boolean) => {
    const cur = key.tagIds ?? [];
    const nextIds = checked ? [...cur, tagId] : cur.filter((id) => id !== tagId);
    void patchStoreKey(keyId, { tagIds: nextIds });
  };

  return (
        <div
          className={`app-settings-overlay ${settingsOpenMode === "docked" ? "is-docked" : ""}`}
          onClick={settingsOpenMode === "modal" ? onCloseSettings : undefined}
        >
          <section
            ref={settingsSectionRef}
            className={`app-settings-modal panel ${settingsOpenMode === "docked" ? "app-settings-modal-docked" : ""}${
              isSettingsDragging ? " is-dragging" : ""
            }`}
            style={
              settingsOpenMode === "modal" && settingsModalPosition
                ? ({ left: `${settingsModalPosition.x}px`, top: `${settingsModalPosition.y}px` } as CSSProperties)
                : undefined
            }
            onClick={(event) => event.stopPropagation()}
          >
            <header
              className={`panel-header app-settings-header ${settingsOpenMode === "modal" ? "is-draggable" : ""}`}
              onPointerDown={onSettingsHeaderPointerDown}
            >
              <h2>App settings</h2>
              <div className="app-settings-header-actions">
                <div className="app-settings-mode-switch" role="group" aria-label="Settings display mode">
                  <button
                    className={`btn ${settingsOpenMode === "modal" ? "btn-primary" : ""}`}
                    onClick={() => setSettingsOpenMode("modal")}
                  >
                    Window
                  </button>
                  <button
                    className={`btn ${settingsOpenMode === "docked" ? "btn-primary" : ""}`}
                    onClick={() => setSettingsOpenMode("docked")}
                  >
                    Docked
                  </button>
                </div>
                <button className="btn" onClick={onCloseSettings}>
                  Close
                </button>
              </div>
            </header>
            <div className="app-settings-tabs" role="tablist" aria-label="Settings sections">
              {APP_SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeAppSettingsTab === tab.id}
                  className={`settings-tab ${activeAppSettingsTab === tab.id ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveAppSettingsTab(tab.id);
                    if (tab.id !== "store") {
                      setIdentityStoreSubTab("overview");
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeAppSettingsTab === "store" && (
              <div className="app-settings-subtabs" role="tablist" aria-label="Identity store sections">
                {IDENTITY_STORE_SUBTABS.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    role="tab"
                    aria-selected={identityStoreSubTab === sub.id}
                    className={`settings-tab settings-subtab ${identityStoreSubTab === sub.id ? "is-active" : ""}`}
                    onClick={() => setIdentityStoreSubTab(sub.id)}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
            <div className="app-settings-content">
              {activeAppSettingsTab === "appearance" && (
                <div className="settings-stack">
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>Visual style</h3>
                      <p className="muted-copy">Tune typography, density and contrast for your workspace.</p>
                    </header>
                    <div className="host-form-grid">
                      <label className="field">
                        <span className="field-label">Density profile</span>
                        <select
                          className="input density-profile-select"
                          value={densityProfile}
                          onChange={(event) => setDensityProfile(event.target.value as DensityProfile)}
                        >
                          <option value="aggressive">Aggressive compact</option>
                          <option value="balanced">Balanced compact</option>
                          <option value="safe">Safe compact</option>
                        </select>
                        <span className="field-help">Controls spacing and font density across the app.</span>
                      </label>
                      <label className="field">
                        <span className="field-label">GUI font</span>
                        <select
                          className="input density-profile-select"
                          value={uiFontPreset}
                          onChange={(event) => setUiFontPreset(event.target.value as UiFontPreset)}
                        >
                          <option value="inter">Inter (balanced, neutral)</option>
                          <option value="manrope">Manrope (modern, tighter)</option>
                          <option value="ibm-plex-sans">IBM Plex Sans (technical, clear)</option>
                        </select>
                        <span className="field-help">Sets typography for labels, forms and controls.</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Terminal font preset</span>
                        <select
                          className="input density-profile-select"
                          value={terminalFontPreset}
                          onChange={(event) => setTerminalFontPreset(event.target.value as TerminalFontPreset)}
                        >
                          <option value="jetbrains-mono">JetBrains Mono</option>
                          <option value="ibm-plex-mono">IBM Plex Mono</option>
                          <option value="source-code-pro">Source Code Pro</option>
                        </select>
                        <span className="field-help">Nerd font fallbacks remain active for symbols.</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Terminal font offset</span>
                        <input
                          className="input"
                          type="number"
                          value={terminalFontOffset}
                          min={TERMINAL_FONT_OFFSET_MIN}
                          max={TERMINAL_FONT_OFFSET_MAX}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (!Number.isFinite(parsed)) {
                              return;
                            }
                            setTerminalFontOffset(
                              Math.min(TERMINAL_FONT_OFFSET_MAX, Math.max(TERMINAL_FONT_OFFSET_MIN, Math.round(parsed))),
                            );
                          }}
                        />
                        <span className="field-help">Current terminal size: {terminalFontSize}px.</span>
                      </label>
                      <label className="field">
                        <span className="field-label">List tone intensity</span>
                        <select
                          className="input density-profile-select"
                          value={listTonePreset}
                          onChange={(event) => setListTonePreset(event.target.value as ListTonePreset)}
                        >
                          <option value="subtle">Subtle</option>
                          <option value="strong">Strong</option>
                        </select>
                        <span className="field-help">Controls host/session/chip color intensity.</span>
                      </label>
                      <label className="field">
                        <span className="field-label">Frame mode</span>
                        <select
                          className="input density-profile-select"
                          value={frameModePreset}
                          onChange={(event) => setFrameModePreset(event.target.value as FrameModePreset)}
                        >
                          <option value="cleaner">Cleaner</option>
                          <option value="balanced">Balanced</option>
                          <option value="clearer">Clearer</option>
                        </select>
                        <span className="field-help">Hover/focus frame strength.</span>
                      </label>
                    </div>
                  </section>
                </div>
              )}
              {activeAppSettingsTab === "layout" && (
                <div className="settings-stack">
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>Window behavior</h3>
                      <p className="muted-copy">Define how hosts and terminals are arranged across screen sizes.</p>
                    </header>
                    <div className="host-form-grid">
                      <label className="field field-span-2 checkbox-field">
                        <input
                          id="settings-sidebar-pinned"
                          type="checkbox"
                          className="checkbox-input"
                          checked={isSidebarPinned}
                          onChange={(event) => setSidebarPinned(event.target.checked)}
                        />
                        <span className="field-label">Host sidebar always visible (pinned)</span>
                      </label>
                      <p className="muted-copy field-span-2">
                        When off, the sidebar can auto-hide; hover the left edge or use the slim handle to show it. You
                        can still toggle pin from that edge handle.
                      </p>
                      <label className="field">
                        <span className="field-label">Window layout</span>
                        <select
                          className="input density-profile-select"
                          value={layoutMode}
                          onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
                        >
                          <option value="auto">Auto — stack below 900px</option>
                          <option value="wide">Wide — always side-by-side</option>
                          <option value="compact">Compact — always stacked</option>
                        </select>
                        <span className="field-help">
                          Auto uses mobile shell on narrow screens. Wide keeps desktop grid. Compact stays stacked.
                        </span>
                      </label>
                      <label className="field">
                        <span className="field-label">Default split ratio preset</span>
                        <select
                          className="input density-profile-select"
                          value={splitRatioPreset}
                          onChange={(event) => setSplitRatioPreset(event.target.value as SplitRatioPreset)}
                        >
                          <option value="50-50">50/50</option>
                          <option value="60-40">60/40</option>
                          <option value="70-30">70/30</option>
                        </select>
                        <span className="field-help">Applies only to newly created pane splits.</span>
                      </label>
                      <label className="field field-span-2">
                        <span className="field-label">Auto arrange mode</span>
                        <select
                          className="input density-profile-select"
                          value={autoArrangeMode}
                          onChange={(event) => setAutoArrangeMode(event.target.value as AutoArrangeMode)}
                        >
                          <option value="a">Mode A (open/close only)</option>
                          <option value="b">Mode B (layout changes only)</option>
                          <option value="c">Mode C (open/close + layout changes)</option>
                          <option value="free">Free move (manual layout, no auto arrange)</option>
                          <option value="off">Off</option>
                        </select>
                        <span className="field-help">
                          Mode A compacts session slots. Mode B rebalances split ratios. Mode C applies both.{" "}
                          <strong>Free move</strong> keeps your splits until you pick another mode. The pane context menu
                          item &quot;Pause auto-arrange (manual layout only)&quot; switches here to Free move; &quot;Resume
                          auto-arrange for layout&quot; restores the last A/B/C preset. <strong>Off</strong> stops automation
                          without remembering manual layout.
                        </span>
                      </label>
                      <label className="field field-span-2 checkbox-field">
                        <input
                          id="settings-broadcast-mode"
                          type="checkbox"
                          className="checkbox-input"
                          checked={isBroadcastModeEnabled}
                          onChange={(event) => setBroadcastMode(event.target.checked)}
                        />
                        <span className="field-label">Broadcast keyboard to multiple terminals</span>
                      </label>
                      <p className="muted-copy field-span-2">
                        When enabled, add targets from each pane&apos;s toolbar (target / all visible), the pane context
                        menu, or this checkbox. The session footer shows state and how many panes are targeted. Turn off
                        from the toolbar, here, or the context menu.
                      </p>
                    </div>
                  </section>
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>Quick connect</h3>
                      <p className="muted-copy">Choose interaction style and trust behavior for ad-hoc connections.</p>
                    </header>
                    <div className="host-form-grid">
                      <label className="field">
                        <span className="field-label">Quick connect mode</span>
                        <select
                          className="input density-profile-select"
                          value={quickConnectMode}
                          onChange={(event) => setQuickConnectMode(event.target.value as QuickConnectMode)}
                        >
                          <option value="wizard">Wizard (step-by-step)</option>
                          <option value="smart">Smart form (single screen)</option>
                          <option value="command">Command palette</option>
                        </select>
                        <span className="field-help">Defines how host/user input is collected.</span>
                      </label>
                      <label className="field checkbox-field">
                        <input
                          className="checkbox-input"
                          type="checkbox"
                          checked={quickConnectAutoTrust}
                          onChange={(event) => setQuickConnectAutoTrust(event.target.checked)}
                        />
                        <span className="field-label">Auto trust host keys for quick connect</span>
                      </label>
                      <p className="field-help field-span-2">
                        Default is off. When enabled, quick-connect sessions auto-accept host key prompts.
                      </p>
                    </div>
                  </section>
                </div>
              )}
              {activeAppSettingsTab === "views" && (
                <div className="settings-stack">
                  <section className="view-manager-panel">
                    <div className="view-manager-panel-head">
                      <span className="field-label">Saved custom views</span>
                      {sortedViewProfiles.length === 0 ? (
                        <p className="muted-copy view-manager-empty">No custom views yet.</p>
                      ) : (
                        <div className="app-settings-subtabs view-manager-view-tabs" role="tablist" aria-label="Custom views">
                          {sortedViewProfiles.map((profile) => (
                            <button
                              key={profile.id}
                              type="button"
                              role="tab"
                              aria-selected={selectedViewProfileIdInSettings === profile.id}
                              className={`settings-tab settings-subtab ${selectedViewProfileIdInSettings === profile.id ? "is-active" : ""}`}
                              onClick={() => selectViewProfileForSettings(profile.id)}
                            >
                              {profile.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="view-manager-toolbar">
                        <button type="button" className="btn btn-view-tool" onClick={createNewViewDraft}>
                          New view
                        </button>
                        <button
                          type="button"
                          className="btn btn-view-tool"
                          onClick={() => void reorderView("up")}
                          disabled={!selectedViewProfileIdInSettings}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="btn btn-view-tool"
                          onClick={() => void reorderView("down")}
                          disabled={!selectedViewProfileIdInSettings}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          className="btn btn-view-tool btn-view-tool-danger"
                          onClick={() => void deleteCurrentViewDraft()}
                          disabled={!selectedViewProfileIdInSettings}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="view-manager-editor">
                      <label className="field view-manager-field-name">
                        <span className="field-label">View name</span>
                        <input
                          className="input"
                          value={viewDraft.name}
                          onChange={(event) => setViewDraft((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Production hosts"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <div className="view-manager-rules-block">
                        <span className="view-manager-block-label">Filter rules</span>
                        <div className="filter-row view-manager-rule-mode-row">
                          <label className="field">
                            <span className="field-label">Rule mode</span>
                            <select
                              className="input density-profile-select"
                              value={viewDraft.filterGroup.mode}
                              onChange={(event) =>
                                setViewDraft((prev) => ({
                                  ...prev,
                                  filterGroup: { ...prev.filterGroup, mode: event.target.value as "and" | "or" },
                                }))
                              }
                            >
                              <option value="and">All rules (AND)</option>
                              <option value="or">Any rule (OR)</option>
                            </select>
                          </label>
                        </div>
                        <div className="view-rule-list">
                          {viewDraft.filterGroup.rules.map((rule) => (
                            <div className="filter-row view-rule-row" key={rule.id}>
                              <select
                                className="input density-profile-select"
                                value={rule.field}
                                onChange={(event) =>
                                  setViewDraft((prev) => ({
                                    ...prev,
                                    filterGroup: {
                                      ...prev.filterGroup,
                                      rules: prev.filterGroup.rules.map((entry) =>
                                        entry.id === rule.id ? { ...entry, field: event.target.value as ViewFilterField } : entry,
                                      ),
                                    },
                                  }))
                                }
                              >
                                <option value="host">Alias</option>
                                <option value="hostName">Hostname</option>
                                <option value="user">User</option>
                                <option value="port">Port</option>
                                <option value="status">Status</option>
                                <option value="favorite">Favorite</option>
                                <option value="recent">Recent</option>
                                <option value="tag">Tag</option>
                              </select>
                              <select
                                className="input density-profile-select"
                                value={rule.operator}
                                onChange={(event) =>
                                  setViewDraft((prev) => ({
                                    ...prev,
                                    filterGroup: {
                                      ...prev.filterGroup,
                                      rules: prev.filterGroup.rules.map((entry) =>
                                        entry.id === rule.id
                                          ? { ...entry, operator: event.target.value as ViewFilterOperator }
                                          : entry,
                                      ),
                                    },
                                  }))
                                }
                              >
                                <option value="contains">contains</option>
                                <option value="equals">equals</option>
                                <option value="not_equals">not equals</option>
                                <option value="starts_with">starts with</option>
                                <option value="ends_with">ends with</option>
                                <option value="greater_than">greater than</option>
                                <option value="less_than">less than</option>
                                <option value="in">in (comma separated)</option>
                              </select>
                              <input
                                className="input view-rule-value-input"
                                value={rule.value}
                                onChange={(event) =>
                                  setViewDraft((prev) => ({
                                    ...prev,
                                    filterGroup: {
                                      ...prev.filterGroup,
                                      rules: prev.filterGroup.rules.map((entry) =>
                                        entry.id === rule.id ? { ...entry, value: event.target.value } : entry,
                                      ),
                                    },
                                  }))
                                }
                                placeholder="value"
                                spellCheck={false}
                              />
                              <button
                                type="button"
                                className="btn btn-view-tool btn-view-tool-danger"
                                onClick={() =>
                                  setViewDraft((prev) => ({
                                    ...prev,
                                    filterGroup: {
                                      ...prev.filterGroup,
                                      rules: prev.filterGroup.rules.filter((entry) => entry.id !== rule.id),
                                    },
                                  }))
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="action-row action-row--view-manager">
                          <button
                            type="button"
                            className="btn btn-view-tool"
                            onClick={() =>
                              setViewDraft((prev) => ({
                                ...prev,
                                filterGroup: { ...prev.filterGroup, rules: [...prev.filterGroup.rules, createViewRule()] },
                              }))
                            }
                          >
                            Add rule
                          </button>
                        </div>
                      </div>
                      <div className="view-manager-editor-footer">
                        <span className="view-manager-footer-label">Sort & save</span>
                        <div className="filter-row view-manager-sort-row">
                          <select
                            className="input density-profile-select"
                            value={viewDraft.sortRules[0]?.field ?? "host"}
                            onChange={(event) =>
                              setViewDraft((prev) => ({
                                ...prev,
                                sortRules: [
                                  {
                                    field: event.target.value as ViewSortField,
                                    direction: prev.sortRules[0]?.direction ?? "asc",
                                  },
                                ],
                              }))
                            }
                          >
                            <option value="host">Sort by alias</option>
                            <option value="hostName">Sort by hostname</option>
                            <option value="user">Sort by user</option>
                            <option value="port">Sort by port</option>
                            <option value="lastUsedAt">Sort by last used</option>
                            <option value="status">Sort by status</option>
                            <option value="favorite">Sort by favorite</option>
                          </select>
                          <select
                            className="input density-profile-select"
                            value={viewDraft.sortRules[0]?.direction ?? "asc"}
                            onChange={(event) =>
                              setViewDraft((prev) => ({
                                ...prev,
                                sortRules: [
                                  {
                                    field: prev.sortRules[0]?.field ?? "host",
                                    direction: event.target.value as "asc" | "desc",
                                  },
                                ],
                              }))
                            }
                          >
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                          </select>
                          <button type="button" className="btn btn-view-save" onClick={() => void saveCurrentViewDraft()}>
                            Save view
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="view-manager-after">
                      <p className="muted-copy view-manager-footnote">
                        Built-in views are fixed (`All`, `Favorites`). Custom views are persisted and shown as sidebar
                        tabs.
                      </p>
                    </div>
                  </section>
                </div>
              )}
              {activeAppSettingsTab === "data" && (
                <div className="settings-stack">
                  <section className="settings-card backup-panel">
                  <label className="field">
                    <span className="field-label">Export path</span>
                    <input
                      className="input"
                      value={backupExportPath}
                      onChange={(event) => setBackupExportPath(event.target.value)}
                      placeholder={defaultBackupPath}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Export password</span>
                    <input
                      className="input"
                      type="password"
                      value={backupExportPassword}
                      onChange={(event) => setBackupExportPassword(event.target.value)}
                      placeholder="Enter backup password"
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="btn" onClick={() => void handleExportBackup()} disabled={!backupExportPassword}>
                    Export backup
                  </button>
                  <label className="field">
                    <span className="field-label">Import path</span>
                    <input
                      className="input"
                      value={backupImportPath}
                      onChange={(event) => setBackupImportPath(event.target.value)}
                      placeholder={defaultBackupPath}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Import password</span>
                    <input
                      className="input"
                      type="password"
                      value={backupImportPassword}
                      onChange={(event) => setBackupImportPassword(event.target.value)}
                      placeholder="Enter backup password"
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="btn" onClick={() => void handleImportBackup()} disabled={!backupImportPassword}>
                    Import backup
                  </button>
                  <p className="muted-copy">Backups are always encrypted. Passwords are never stored.</p>
                    {backupMessage && <p className="muted-copy">{backupMessage}</p>}
                  </section>
                </div>
              )}
              {activeAppSettingsTab === "ssh" && (
                <div className="settings-stack">
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>SSH directory</h3>
                      <p className="muted-copy">
                        Default is <code className="inline-code">~/.ssh</code> (on Windows typically{" "}
                        <code className="inline-code">%USERPROFILE%\.ssh</code>). The identity store,{" "}
                        <code className="inline-code">config</code>, and related files live under the active folder.
                        Override must be an <strong>absolute</strong> path. After changing it, hosts and store reload from
                        the new location.
                      </p>
                    </header>
                    {sshDirInfo && (
                      <div className="ssh-dir-info-block">
                        <p className="muted-copy">
                          <strong>Detected default:</strong>{" "}
                          <code className="inline-code">{sshDirInfo.defaultPath}</code>
                        </p>
                        <p className="muted-copy">
                          <strong>Active:</strong> <code className="inline-code">{sshDirInfo.effectivePath}</code>
                        </p>
                        {sshDirInfo.userProfile ? (
                          <p className="muted-copy">
                            <strong>USERPROFILE:</strong>{" "}
                            <code className="inline-code">{sshDirInfo.userProfile}</code>
                          </p>
                        ) : null}
                      </div>
                    )}
                    <label className="field field-span-2">
                      <span className="field-label">Custom SSH directory (optional)</span>
                      <input
                        className="input"
                        value={sshDirOverrideDraft}
                        onChange={(event) => setSshDirOverrideDraft(event.target.value)}
                        placeholder={sshDirInfo?.defaultPath ?? "Absolute path to .ssh folder"}
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </label>
                    <div className="action-row">
                      <button type="button" className="btn btn-primary" onClick={() => void onApplySshDirOverride()}>
                        Apply SSH directory
                      </button>
                      <button type="button" className="btn" onClick={() => void onResetSshDirOverride()}>
                        Use default
                      </button>
                    </div>
                  </section>
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>SSH config</h3>
                      <p className="muted-copy">
                        Full <code className="inline-code">config</code> inside the active SSH directory (see above).
                        Content reloads when you open this tab. Broken syntax can prevent the host list from loading until
                        you fix the file or restore a backup.
                      </p>
                    </header>
                    <textarea
                      className="input ssh-config-textarea"
                      value={sshConfigRaw}
                      onChange={(event) => setSshConfigRaw(event.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      aria-label="SSH config file contents"
                    />
                    <div className="action-row">
                      <button type="button" className="btn btn-primary" onClick={() => void onSaveSshConfig()}>
                        Save SSH config
                      </button>
                    </div>
                  </section>
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>Global defaults (Host *)</h3>
                      <p className="muted-copy">
                        Inserts or replaces only the block between{" "}
                        <code className="inline-code">BEGIN_NOSUCKSHELL_HOST_STAR</code> /{" "}
                        <code className="inline-code">END_NOSUCKSHELL_HOST_STAR</code>. The block is placed at the top of
                        the buffer if missing (later stanzas can override). Use Apply, then Save SSH config, to write to
                        disk.
                      </p>
                    </header>
                    <div className="host-form-grid">
                      <label className="field">
                        <span className="field-label">ServerAliveInterval</span>
                        <input
                          className="input"
                          value={sshHostStarServerAliveInterval}
                          onChange={(event) => setSshHostStarServerAliveInterval(event.target.value)}
                          placeholder="60"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">ServerAliveCountMax</span>
                        <input
                          className="input"
                          value={sshHostStarServerAliveCountMax}
                          onChange={(event) => setSshHostStarServerAliveCountMax(event.target.value)}
                          placeholder="3"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">TCPKeepAlive</span>
                        <select
                          className="input density-profile-select"
                          value={sshHostStarTcpKeepAlive}
                          onChange={(event) => setSshHostStarTcpKeepAlive(event.target.value as "" | "yes" | "no")}
                        >
                          <option value="">(omit)</option>
                          <option value="yes">yes</option>
                          <option value="no">no</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">IdentityFile</span>
                        <input
                          className="input"
                          value={sshHostStarIdentityFile}
                          onChange={(event) => setSshHostStarIdentityFile(event.target.value)}
                          placeholder="~/.ssh/id_ed25519"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">User</span>
                        <input
                          className="input"
                          value={sshHostStarUser}
                          onChange={(event) => setSshHostStarUser(event.target.value)}
                          placeholder="default user"
                        />
                      </label>
                    </div>
                    <div className="action-row">
                      <button type="button" className="btn" onClick={applyHostStarBlockToBuffer}>
                        Apply to config buffer
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {activeAppSettingsTab === "store" && (
                <div className="settings-stack">
                  <div className="store-panel store-panel--identity">
                    {identityStoreSubTab === "overview" && (
                      <section className="identity-store-section">
                        <p className="muted-copy">
                          Hybrid store: host fields stay compatible; users, groups, tags, and keys can be linked as
                          objects.
                        </p>
                        <label className="field field-span-2">
                          <span className="field-label">Master passphrase (Keychain fallback)</span>
                          <input
                            className="input"
                            type="password"
                            value={storePassphrase}
                            onChange={(event) => setStorePassphrase(event.target.value)}
                            placeholder="Optional, fuer encrypted keys"
                          />
                        </label>
                      </section>
                    )}

                    {identityStoreSubTab === "users" && (
                      <section className="identity-store-section">
                        <h4>Users</h4>
                        <p className="muted-copy">
                          Import creates store users from each distinct <span className="inline-code">User</span> value
                          on your saved hosts. Keys on the user apply when a host binding does not set its own keys.
                        </p>
                        <label className="field">
                          <span className="field-label">Default login user</span>
                          <input
                            className="input"
                            value={metadataStore.defaultUser}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setMetadataStore((prev) => ({ ...prev, defaultUser: nextValue }));
                            }}
                            onBlur={(event) => {
                              void applyDefaultUser(event.target.value).catch((e: unknown) => setError(String(e)));
                            }}
                            placeholder="ubuntu"
                          />
                          <span className="field-help">
                            Used when a host has no explicit user (SSH config / host entry).
                          </span>
                        </label>
                        <div className="store-inline">
                          <button type="button" className="btn" onClick={() => void importStoreUsersFromHosts()}>
                            Import from SSH hosts
                          </button>
                        </div>
                        <div className="store-list store-list--tall identity-store-list">
                          {storeUsers.map((user) => (
                            <div key={user.id} className="store-list-block">
                              <div className="store-list-row store-list-row-clickable identity-store-row">
                                <button
                                  type="button"
                                  className="btn btn-ghost store-expand-toggle"
                                  onClick={() =>
                                    setExpandedStoreUserId((prev) => (prev === user.id ? null : user.id))
                                  }
                                  aria-expanded={expandedStoreUserId === user.id}
                                >
                                  {expandedStoreUserId === user.id ? "▼" : "▶"}
                                </button>
                                <span className="store-list-title">
                                  {user.name}
                                  {user.username && user.username !== user.name ? ` (${user.username})` : ""}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => {
                                    setExpandedStoreUserId((prev) => (prev === user.id ? null : prev));
                                    void deleteStoreUser(user.id);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                              {expandedStoreUserId === user.id && (
                                <div className="store-nested-fields">
                                  <label className="field">
                                    <span className="field-label">Display name</span>
                                    <input
                                      key={`${user.id}-name`}
                                      className="input"
                                      defaultValue={user.name}
                                      onBlur={(event) => {
                                        const v = event.target.value.trim();
                                        if (v && v !== user.name) {
                                          void updateStoreUser(user.id, { name: v });
                                        }
                                      }}
                                    />
                                  </label>
                                  <label className="field">
                                    <span className="field-label">SSH username</span>
                                    <input
                                      key={`${user.id}-username`}
                                      className="input"
                                      defaultValue={user.username}
                                      onBlur={(event) => {
                                        const v = event.target.value.trim();
                                        if (v !== user.username) {
                                          void updateStoreUser(user.id, { username: v });
                                        }
                                      }}
                                    />
                                  </label>
                                  <div className="field">
                                    <span className="field-label">SSH keys (first = primary for sessions)</span>
                                    <div className="store-checkbox-grid">
                                      {storeKeys.length === 0 ? (
                                        <span className="muted-copy">No keys in store yet.</span>
                                      ) : (
                                        storeKeys.map((key) => (
                                          <label key={key.id} className="store-checkbox-label">
                                            <input
                                              type="checkbox"
                                              checked={user.keyRefs.some((r) => r.keyId === key.id)}
                                              onChange={(event) =>
                                                toggleUserKey(user.id, user, key.id, event.target.checked)
                                              }
                                            />
                                            {key.name}
                                          </label>
                                        ))
                                      )}
                                    </div>
                                    {user.keyRefs.length > 0 && (
                                      <div className="store-key-order-wrap">
                                        <span className="field-label">Current order (sessions use the primary first)</span>
                                        <ol className="store-key-order-ol">
                                          {user.keyRefs.map((ref, idx) => {
                                            const keyName =
                                              storeKeys.find((k) => k.id === ref.keyId)?.name ?? ref.keyId;
                                            const role = idx === 0 ? "Primary" : "Additional";
                                            return (
                                              <li key={ref.keyId} className="store-key-order-item">
                                                <span>
                                                  {idx + 1}. {role} — {keyName}
                                                </span>
                                                <span className="store-inline">
                                                  <button
                                                    type="button"
                                                    className="btn"
                                                    disabled={idx === 0}
                                                    onClick={() => void reorderUserStoreKeys(user.id, idx, "up")}
                                                  >
                                                    Up
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="btn"
                                                    disabled={idx === user.keyRefs.length - 1}
                                                    onClick={() => void reorderUserStoreKeys(user.id, idx, "down")}
                                                  >
                                                    Down
                                                  </button>
                                                </span>
                                              </li>
                                            );
                                          })}
                                        </ol>
                                      </div>
                                    )}
                                  </div>
                                  <div className="field">
                                    <span className="field-label">Tags</span>
                                    <div className="store-checkbox-grid">
                                      {storeTags.length === 0 ? (
                                        <span className="muted-copy">No tags yet.</span>
                                      ) : (
                                        storeTags.map((tag) => (
                                          <label key={tag.id} className="store-checkbox-label">
                                            <input
                                              type="checkbox"
                                              checked={user.tagIds.includes(tag.id)}
                                              onChange={(event) =>
                                                toggleUserTag(user.id, user, tag.id, event.target.checked)
                                              }
                                            />
                                            {tag.name}
                                          </label>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                  <div className="field">
                                    <span className="field-label">Groups</span>
                                    <div className="store-checkbox-grid">
                                      {storeGroups.length === 0 ? (
                                        <span className="muted-copy">No groups yet.</span>
                                      ) : (
                                        storeGroups.map((group) => (
                                          <label key={group.id} className="store-checkbox-label">
                                            <input
                                              type="checkbox"
                                              checked={group.memberUserIds.includes(user.id)}
                                              onChange={(event) =>
                                                toggleUserInGroup(user.id, group.id, event.target.checked)
                                              }
                                            />
                                            {group.name}
                                          </label>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="store-inline">
                          <input
                            className="input"
                            value={storeUserDraft}
                            onChange={(event) => setStoreUserDraft(event.target.value)}
                            placeholder="New user (display / SSH name)"
                          />
                          <button type="button" className="btn" onClick={() => void addStoreUser()}>
                            Add
                          </button>
                        </div>
                      </section>
                    )}

                    {identityStoreSubTab === "groups" && (
                      <section className="identity-store-section">
                        <h4>Groups</h4>
                        <div className="store-list identity-store-list">
                          {storeGroups.map((group) => (
                            <div key={group.id} className="store-list-block">
                              <div className="store-list-row identity-store-row">
                                <input
                                  className="input"
                                  defaultValue={group.name}
                                  onBlur={(event) => {
                                    const v = event.target.value.trim();
                                    if (v && v !== group.name) {
                                      void updateStoreGroup(group.id, { name: v });
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => void deleteStoreGroup(group.id)}
                                >
                                  Delete
                                </button>
                              </div>
                              <div className="store-nested-fields">
                                <span className="field-label">Members</span>
                                <div className="store-checkbox-grid">
                                  {storeUsers.length === 0 ? (
                                    <span className="muted-copy">No users yet.</span>
                                  ) : (
                                    storeUsers.map((user) => (
                                      <label key={user.id} className="store-checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={group.memberUserIds.includes(user.id)}
                                          onChange={(event) => {
                                            const next = event.target.checked
                                              ? [...group.memberUserIds, user.id]
                                              : group.memberUserIds.filter((id) => id !== user.id);
                                            void updateStoreGroup(group.id, { memberUserIds: next });
                                          }}
                                        />
                                        {user.name}
                                      </label>
                                    ))
                                  )}
                                </div>
                                <span className="field-label">Tags</span>
                                <div className="store-checkbox-grid">
                                  {storeTags.length === 0 ? (
                                    <span className="muted-copy">No tags yet.</span>
                                  ) : (
                                    storeTags.map((tag) => (
                                      <label key={tag.id} className="store-checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={(group.tagIds ?? []).includes(tag.id)}
                                          onChange={(event) =>
                                            toggleGroupTag(group.id, group, tag.id, event.target.checked)
                                          }
                                        />
                                        {tag.name}
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="store-inline">
                          <input
                            className="input"
                            value={storeGroupDraft}
                            onChange={(event) => setStoreGroupDraft(event.target.value)}
                            placeholder="New group name"
                          />
                          <button type="button" className="btn" onClick={() => void addStoreGroup()}>
                            Add
                          </button>
                        </div>
                      </section>
                    )}

                    {identityStoreSubTab === "tags" && (
                      <section className="identity-store-section">
                        <h4>Tags</h4>
                        <div className="store-list identity-store-list">
                          {storeTags.map((tag) => (
                            <div key={tag.id} className="store-list-row identity-store-row">
                              <input
                                className="input"
                                defaultValue={tag.name}
                                onBlur={(event) => {
                                  const v = event.target.value.trim();
                                  if (v && v !== tag.name) {
                                    void updateStoreTag(tag.id, v);
                                  }
                                }}
                              />
                              <button type="button" className="btn btn-danger" onClick={() => void deleteStoreTag(tag.id)}>
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="store-inline">
                          <input
                            className="input"
                            value={storeTagDraft}
                            onChange={(event) => setStoreTagDraft(event.target.value)}
                            placeholder="New tag name"
                          />
                          <button type="button" className="btn" onClick={() => void addStoreTag()}>
                            Add
                          </button>
                        </div>
                      </section>
                    )}

                    {identityStoreSubTab === "keys" && (
                      <section className="identity-store-section">
                        <h4>SSH Keys</h4>
                        <div className="identity-store-form">
                          <div className="store-key-grid">
                            <div className="store-inline">
                              <input
                                className="input"
                                value={storePathKeyNameDraft}
                                onChange={(event) => setStorePathKeyNameDraft(event.target.value)}
                                placeholder="Pfad-Key Name"
                              />
                              <input
                                className="input"
                                value={storePathKeyPathDraft}
                                onChange={(event) => setStorePathKeyPathDraft(event.target.value)}
                                placeholder="~/.ssh/id_ed25519"
                              />
                              <button className="btn" onClick={() => void addStorePathKey()}>
                                Add path key
                              </button>
                            </div>
                            <div className="store-inline">
                              <input
                                className="input"
                                value={storeEncryptedKeyNameDraft}
                                onChange={(event) => setStoreEncryptedKeyNameDraft(event.target.value)}
                                placeholder="Encrypted key name"
                              />
                              <input
                                className="input"
                                value={storeEncryptedPublicKeyDraft}
                                onChange={(event) => setStoreEncryptedPublicKeyDraft(event.target.value)}
                                placeholder="optional public key"
                              />
                            </div>
                            <textarea
                              className="input store-textarea"
                              value={storeEncryptedPrivateKeyDraft}
                              onChange={(event) => setStoreEncryptedPrivateKeyDraft(event.target.value)}
                              placeholder="-----BEGIN PRIVATE KEY-----"
                            />
                            <div className="store-inline">
                              <button className="btn" onClick={() => void addStoreEncryptedKey()}>
                                Add encrypted key
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="store-list store-list--tall identity-store-list">
                          {storeKeys.map((key) => (
                            <div key={key.id} className="store-list-block">
                              <div className="store-list-row identity-store-row">
                                <span>
                                  {key.name} ({key.type})
                                </span>
                                <div className="store-inline">
                                  <button type="button" className="btn" onClick={() => void unlockStoreKey(key.id)}>
                                    Unlock
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => void removeStoreKey(key.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <div className="store-nested-fields">
                                <span className="field-label">Tags</span>
                                <div className="store-checkbox-grid">
                                  {storeTags.length === 0 ? (
                                    <span className="muted-copy">No tags yet.</span>
                                  ) : (
                                    storeTags.map((tag) => (
                                      <label key={tag.id} className="store-checkbox-label">
                                        <input
                                          type="checkbox"
                                          checked={(key.tagIds ?? []).includes(tag.id)}
                                          onChange={(event) =>
                                            toggleKeyTag(key.id, key, tag.id, event.target.checked)
                                          }
                                        />
                                        {tag.name}
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {identityStoreSubTab === "hosts" && (
                      <section className="identity-store-section">
                        <h4>Hosts</h4>
                        <p className="muted-copy">
                          Per-host overrides: linked user, SSH keys (first selected = primary), groups, and tags. If no
                          keys are set here, the linked user&apos;s keys apply when a user is selected.
                        </p>
                        <div className="store-inline">
                          <select
                            className="input"
                            value={storeSelectedHostForBinding}
                            onChange={(event) => setStoreSelectedHostForBinding(event.target.value)}
                          >
                            <option value="">Select host</option>
                            {hosts.map((host, hostIndex) => (
                              <option key={`host-opt-${hostIndex}`} value={host.host}>
                                {host.host}
                              </option>
                            ))}
                          </select>
                          <select
                            className="input"
                            value={storeBindingDraft.userId ?? ""}
                            onChange={(event) =>
                              setStoreBindingDraft((prev) => ({
                                ...prev,
                                userId: event.target.value || undefined,
                              }))
                            }
                          >
                            <option value="">Store user (optional)</option>
                            {storeUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <span className="field-label">SSH keys for this host</span>
                          <div className="store-checkbox-grid">
                            {storeKeys.length === 0 ? (
                              <span className="muted-copy">No keys in store.</span>
                            ) : (
                              storeKeys.map((key) => (
                                <label key={key.id} className="store-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={storeBindingDraft.keyRefs.some((r) => r.keyId === key.id)}
                                    onChange={(event) => toggleHostBindingKey(key.id, event.target.checked)}
                                  />
                                  {key.name}
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="field">
                          <span className="field-label">Groups</span>
                          <div className="store-checkbox-grid">
                            {storeGroups.length === 0 ? (
                              <span className="muted-copy">No groups.</span>
                            ) : (
                              storeGroups.map((group) => (
                                <label key={group.id} className="store-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={storeBindingDraft.groupIds.includes(group.id)}
                                    onChange={(event) => toggleHostBindingGroup(group.id, event.target.checked)}
                                  />
                                  {group.name}
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="field">
                          <span className="field-label">Tags</span>
                          <div className="store-checkbox-grid">
                            {storeTags.length === 0 ? (
                              <span className="muted-copy">No tags.</span>
                            ) : (
                              storeTags.map((tag) => (
                                <label key={tag.id} className="store-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={storeBindingDraft.tagIds.includes(tag.id)}
                                    onChange={(event) => toggleHostBindingTag(tag.id, event.target.checked)}
                                  />
                                  {tag.name}
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="store-inline">
                          <input
                            className="input"
                            value={storeBindingDraft.proxyJump}
                            onChange={(event) =>
                              setStoreBindingDraft((prev) => ({
                                ...prev,
                                proxyJump: event.target.value,
                              }))
                            }
                            placeholder="ProxyJump override"
                          />
                          <button type="button" className="btn btn-primary" onClick={() => void saveHostBindingDraft()}>
                            Save host binding
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}
              {activeAppSettingsTab === "help" && (
                <Suspense fallback={null}>
                  <HelpPanel />
                </Suspense>
              )}
              {activeAppSettingsTab === "about" && (
                <section className="about-hero">
                  <img src={logoTerminal} alt="NoSuckShell hero" className="about-hero-image" />
                  <p className="muted-copy">NoSuckShell helps you manage SSH hosts and sessions in one clean desktop workspace.</p>
                </section>
              )}
            </div>
          </section>
        </div>
  );
}
