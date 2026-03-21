import type React from "react";
import {
  Suspense,
  lazy,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type {
  HostBinding,
  HostConfig,
  HostMetadataStore,
  GroupObject,
  SshKeyObject,
  TagObject,
  UserObject,
  ViewFilterField,
  ViewFilterOperator,
  ViewFilterRule,
  ViewProfile,
  ViewSortField,
} from "../types";
import logoTerminal from "../../../../img/logo_terminal.png";

const HelpPanel = lazy(async () => {
  const m = await import("./HelpPanel");
  return { default: m.HelpPanel };
});

export type AppSettingsTab =
  | "appearance"
  | "layout"
  | "connections"
  | "data"
  | "store"
  | "views"
  | "help"
  | "about";

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

const APP_SETTINGS_TABS: Array<{ id: AppSettingsTab; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "layout", label: "Layout & Navigation" },
  { id: "connections", label: "Connections" },
  { id: "data", label: "Data & Backup" },
  { id: "views", label: "Views" },
  { id: "store", label: "Identity Store" },
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
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
  } = props;

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
            <div className="app-settings-tabs">
              {APP_SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-pill ${activeAppSettingsTab === tab.id ? "is-active" : ""}`}
                  onClick={() => setActiveAppSettingsTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
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
                      <label className="field field-span-2">
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
                      <label className="field field-span-2">
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
                </div>
              )}
              {activeAppSettingsTab === "connections" && (
                <div className="settings-stack">
                  <section className="settings-card">
                    <header className="settings-card-head">
                      <h3>Defaults</h3>
                      <p className="muted-copy">Connection defaults applied before manual overrides.</p>
                    </header>
                    <div className="host-form-grid">
                      <label className="field field-span-2">
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
                        <span className="field-help">Used when a host has no explicit user.</span>
                      </label>
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
                  <section className="settings-card backup-panel view-manager-panel">
                  <div className="field">
                    <span className="field-label">Saved custom views</span>
                    <div className="view-manager-list">
                      {sortedViewProfiles.length === 0 ? (
                        <p className="muted-copy">No custom views yet.</p>
                      ) : (
                        sortedViewProfiles.map((profile) => (
                          <button
                            key={profile.id}
                            className={`btn ${selectedViewProfileIdInSettings === profile.id ? "btn-primary" : ""}`}
                            onClick={() => selectViewProfileForSettings(profile.id)}
                          >
                            {profile.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="btn" onClick={createNewViewDraft}>
                      New view
                    </button>
                    <button className="btn" onClick={() => void reorderView("up")} disabled={!selectedViewProfileIdInSettings}>
                      Move up
                    </button>
                    <button className="btn" onClick={() => void reorderView("down")} disabled={!selectedViewProfileIdInSettings}>
                      Move down
                    </button>
                    <button className="btn btn-danger" onClick={() => void deleteCurrentViewDraft()} disabled={!selectedViewProfileIdInSettings}>
                      Delete
                    </button>
                  </div>
                  <label className="field">
                    <span className="field-label">View name</span>
                    <input
                      className="input"
                      value={viewDraft.name}
                      onChange={(event) => setViewDraft((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Production hosts"
                    />
                  </label>
                  <div className="filter-row">
                    <label className="field">
                      <span className="field-label">Rule mode</span>
                      <select
                        className="input"
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
                      <div className="filter-row" key={rule.id}>
                        <select
                          className="input"
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
                          className="input"
                          value={rule.operator}
                          onChange={(event) =>
                            setViewDraft((prev) => ({
                              ...prev,
                              filterGroup: {
                                ...prev.filterGroup,
                                rules: prev.filterGroup.rules.map((entry) =>
                                  entry.id === rule.id ? { ...entry, operator: event.target.value as ViewFilterOperator } : entry,
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
                          className="input"
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
                        />
                        <button
                          className="btn btn-danger"
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
                  <div className="action-row">
                    <button
                      className="btn"
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
                  <div className="filter-row">
                    <select
                      className="input"
                      value={viewDraft.sortRules[0]?.field ?? "host"}
                      onChange={(event) =>
                        setViewDraft((prev) => ({
                          ...prev,
                          sortRules: [{ field: event.target.value as ViewSortField, direction: prev.sortRules[0]?.direction ?? "asc" }],
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
                      className="input"
                      value={viewDraft.sortRules[0]?.direction ?? "asc"}
                      onChange={(event) =>
                        setViewDraft((prev) => ({
                          ...prev,
                          sortRules: [{ field: prev.sortRules[0]?.field ?? "host", direction: event.target.value as "asc" | "desc" }],
                        }))
                      }
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                    <button className="btn btn-primary" onClick={() => void saveCurrentViewDraft()}>
                      Save view
                    </button>
                  </div>
                  <p className="muted-copy">
                    Built-in views are fixed (`Alle`, `Favoriten`). Custom views are persisted and shown as sidebar tabs.
                  </p>
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
              {activeAppSettingsTab === "store" && (
                <div className="settings-stack">
                  <div className="settings-card store-panel">
                  <p className="muted-copy">
                    Hybrid store: Host-Felder bleiben kompatibel, zusaetzlich koennen User/Gruppen/Tags/Keys als Objekte
                    verknuepft werden.
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

                  <div className="store-grid">
                    <section className="store-card">
                      <h4>Users</h4>
                      <div className="store-list">
                        {storeUsers.map((user) => (
                          <div key={user.id} className="store-list-row">
                            <span>{user.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="store-inline">
                        <input
                          className="input"
                          value={storeUserDraft}
                          onChange={(event) => setStoreUserDraft(event.target.value)}
                          placeholder="neuer user"
                        />
                        <button className="btn" onClick={() => void addStoreUser()}>
                          Add
                        </button>
                      </div>
                    </section>

                    <section className="store-card">
                      <h4>Groups</h4>
                      <div className="store-list">
                        {storeGroups.map((group) => (
                          <div key={group.id} className="store-list-row">
                            <span>{group.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="store-inline">
                        <input
                          className="input"
                          value={storeGroupDraft}
                          onChange={(event) => setStoreGroupDraft(event.target.value)}
                          placeholder="neue gruppe"
                        />
                        <button className="btn" onClick={() => void addStoreGroup()}>
                          Add
                        </button>
                      </div>
                    </section>

                    <section className="store-card">
                      <h4>Tags</h4>
                      <div className="store-list">
                        {storeTags.map((tag) => (
                          <div key={tag.id} className="store-list-row">
                            <span>{tag.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="store-inline">
                        <input
                          className="input"
                          value={storeTagDraft}
                          onChange={(event) => setStoreTagDraft(event.target.value)}
                          placeholder="neuer tag"
                        />
                        <button className="btn" onClick={() => void addStoreTag()}>
                          Add
                        </button>
                      </div>
                    </section>
                  </div>

                  <section className="store-card store-card-wide">
                    <h4>SSH Keys</h4>
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
                    <div className="store-list">
                      {storeKeys.map((key) => (
                        <div key={key.id} className="store-list-row">
                          <span>
                            {key.name} ({key.type})
                          </span>
                          <div className="store-inline">
                            <button className="btn" onClick={() => void unlockStoreKey(key.id)}>
                              Unlock
                            </button>
                            <button className="btn btn-danger" onClick={() => void removeStoreKey(key.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="store-card store-card-wide">
                    <h4>Host binding</h4>
                    <div className="store-inline">
                      <select
                        className="input"
                        value={storeSelectedHostForBinding}
                        onChange={(event) => setStoreSelectedHostForBinding(event.target.value)}
                      >
                        <option value="">Host waehlen</option>
                        {hosts.map((host) => (
                          <option key={host.host} value={host.host}>
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
                        <option value="">User (optional)</option>
                        {storeUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        value={storeBindingDraft.keyRefs[0]?.keyId ?? ""}
                        onChange={(event) =>
                          setStoreBindingDraft((prev) => ({
                            ...prev,
                            keyRefs: event.target.value
                              ? [{ keyId: event.target.value, usage: "primary" }]
                              : [],
                          }))
                        }
                      >
                        <option value="">Primary key (optional)</option>
                        {storeKeys.map((key) => (
                          <option key={key.id} value={key.id}>
                            {key.name}
                          </option>
                        ))}
                      </select>
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
                      <button className="btn btn-primary" onClick={() => void saveHostBindingDraft()}>
                        Save host binding
                      </button>
                    </div>
                    <p className="muted-copy">
                      Groups and tags also remain available on legacy host records in the hybrid model and can be fully
                      migrated later.
                    </p>
                  </section>
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
