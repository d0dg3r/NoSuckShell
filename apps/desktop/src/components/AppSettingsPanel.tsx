import type { CSSProperties } from "react";
import { useState } from "react";
import { APP_SETTINGS_TABS } from "./settings/app-settings-constants";
import type { AppSettingsPanelProps } from "./settings/app-settings-panel-props";
import type { IdentityStoreSubTab } from "./settings/app-settings-types";
import { IdentityStoreSubtabs } from "./settings/IdentityStoreSubtabs";
import { AppSettingsAboutTab } from "./settings/tabs/AppSettingsAboutTab";
import { AppSettingsAppearanceTab } from "./settings/tabs/AppSettingsAppearanceTab";
import { AppSettingsDataTab } from "./settings/tabs/AppSettingsDataTab";
import { AppSettingsHelpTab } from "./settings/tabs/AppSettingsHelpTab";
import { AppSettingsLayoutTab } from "./settings/tabs/AppSettingsLayoutTab";
import { AppSettingsSshTab } from "./settings/tabs/AppSettingsSshTab";
import { AppSettingsStoreTabContent } from "./settings/tabs/AppSettingsStoreTabContent";
import { AppSettingsViewsTab } from "./settings/tabs/AppSettingsViewsTab";

export type {
  AppSettingsTab,
  AutoArrangeMode,
  DensityProfile,
  FrameModePreset,
  IdentityStoreSubTab,
  LayoutMode,
  ListTonePreset,
  QuickConnectMode,
  SettingsOpenMode,
  SplitRatioPreset,
  TerminalFontPreset,
  UiFontPreset,
} from "./settings/app-settings-types";

export type { AppSettingsPanelProps } from "./settings/app-settings-panel-props";

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
                type="button"
                className={`btn btn-settings-mode ${settingsOpenMode === "modal" ? "is-active" : ""}`}
                onClick={() => setSettingsOpenMode("modal")}
              >
                Window
              </button>
              <button
                type="button"
                className={`btn btn-settings-mode ${settingsOpenMode === "docked" ? "is-active" : ""}`}
                onClick={() => setSettingsOpenMode("docked")}
              >
                Docked
              </button>
            </div>
            <button type="button" className="btn btn-settings-tool" onClick={onCloseSettings}>
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
          <IdentityStoreSubtabs identityStoreSubTab={identityStoreSubTab} setIdentityStoreSubTab={setIdentityStoreSubTab} />
        )}
        <div className="app-settings-content">
          {activeAppSettingsTab === "appearance" && (
            <AppSettingsAppearanceTab
              densityProfile={densityProfile}
              setDensityProfile={setDensityProfile}
              uiFontPreset={uiFontPreset}
              setUiFontPreset={setUiFontPreset}
              terminalFontPreset={terminalFontPreset}
              setTerminalFontPreset={setTerminalFontPreset}
              terminalFontOffset={terminalFontOffset}
              setTerminalFontOffset={setTerminalFontOffset}
              terminalFontSize={terminalFontSize}
              listTonePreset={listTonePreset}
              setListTonePreset={setListTonePreset}
              frameModePreset={frameModePreset}
              setFrameModePreset={setFrameModePreset}
            />
          )}
          {activeAppSettingsTab === "layout" && (
            <AppSettingsLayoutTab
              isSidebarPinned={isSidebarPinned}
              setSidebarPinned={setSidebarPinned}
              layoutMode={layoutMode}
              setLayoutMode={setLayoutMode}
              splitRatioPreset={splitRatioPreset}
              setSplitRatioPreset={setSplitRatioPreset}
              autoArrangeMode={autoArrangeMode}
              setAutoArrangeMode={setAutoArrangeMode}
              isBroadcastModeEnabled={isBroadcastModeEnabled}
              setBroadcastMode={setBroadcastMode}
              quickConnectMode={quickConnectMode}
              setQuickConnectMode={setQuickConnectMode}
              quickConnectAutoTrust={quickConnectAutoTrust}
              setQuickConnectAutoTrust={setQuickConnectAutoTrust}
            />
          )}
          {activeAppSettingsTab === "views" && (
            <AppSettingsViewsTab
              sortedViewProfiles={sortedViewProfiles}
              selectedViewProfileIdInSettings={selectedViewProfileIdInSettings}
              selectViewProfileForSettings={selectViewProfileForSettings}
              createNewViewDraft={createNewViewDraft}
              reorderView={reorderView}
              deleteCurrentViewDraft={deleteCurrentViewDraft}
              viewDraft={viewDraft}
              setViewDraft={setViewDraft}
              createViewRule={createViewRule}
              saveCurrentViewDraft={saveCurrentViewDraft}
            />
          )}
          {activeAppSettingsTab === "data" && (
            <AppSettingsDataTab
              defaultBackupPath={defaultBackupPath}
              backupExportPath={backupExportPath}
              setBackupExportPath={setBackupExportPath}
              backupExportPassword={backupExportPassword}
              setBackupExportPassword={setBackupExportPassword}
              handleExportBackup={handleExportBackup}
              backupImportPath={backupImportPath}
              setBackupImportPath={setBackupImportPath}
              backupImportPassword={backupImportPassword}
              setBackupImportPassword={setBackupImportPassword}
              handleImportBackup={handleImportBackup}
              backupMessage={backupMessage}
            />
          )}
          {activeAppSettingsTab === "ssh" && (
            <AppSettingsSshTab
              setError={setError}
              setSshConfigRaw={setSshConfigRaw}
              sshConfigRaw={sshConfigRaw}
              onSaveSshConfig={onSaveSshConfig}
              sshDirInfo={sshDirInfo}
              sshDirOverrideDraft={sshDirOverrideDraft}
              setSshDirOverrideDraft={setSshDirOverrideDraft}
              onApplySshDirOverride={onApplySshDirOverride}
              onResetSshDirOverride={onResetSshDirOverride}
            />
          )}
          {activeAppSettingsTab === "store" && (
            <AppSettingsStoreTabContent
              identityStoreSubTab={identityStoreSubTab}
              metadataStore={metadataStore}
              setMetadataStore={setMetadataStore}
              applyDefaultUser={applyDefaultUser}
              setError={setError}
              storePassphrase={storePassphrase}
              setStorePassphrase={setStorePassphrase}
              storeUsers={storeUsers}
              storeGroups={storeGroups}
              storeTags={storeTags}
              storeKeys={storeKeys}
              hosts={hosts}
              storeUserDraft={storeUserDraft}
              setStoreUserDraft={setStoreUserDraft}
              addStoreUser={addStoreUser}
              storeGroupDraft={storeGroupDraft}
              setStoreGroupDraft={setStoreGroupDraft}
              addStoreGroup={addStoreGroup}
              storeTagDraft={storeTagDraft}
              setStoreTagDraft={setStoreTagDraft}
              addStoreTag={addStoreTag}
              importStoreUsersFromHosts={importStoreUsersFromHosts}
              updateStoreUser={updateStoreUser}
              deleteStoreUser={deleteStoreUser}
              setStoreUserGroupMembership={setStoreUserGroupMembership}
              updateStoreGroup={updateStoreGroup}
              deleteStoreGroup={deleteStoreGroup}
              updateStoreTag={updateStoreTag}
              deleteStoreTag={deleteStoreTag}
              patchStoreKey={patchStoreKey}
              reorderUserStoreKeys={reorderUserStoreKeys}
              storePathKeyNameDraft={storePathKeyNameDraft}
              setStorePathKeyNameDraft={setStorePathKeyNameDraft}
              storePathKeyPathDraft={storePathKeyPathDraft}
              setStorePathKeyPathDraft={setStorePathKeyPathDraft}
              addStorePathKey={addStorePathKey}
              storeEncryptedKeyNameDraft={storeEncryptedKeyNameDraft}
              setStoreEncryptedKeyNameDraft={setStoreEncryptedKeyNameDraft}
              storeEncryptedPublicKeyDraft={storeEncryptedPublicKeyDraft}
              setStoreEncryptedPublicKeyDraft={setStoreEncryptedPublicKeyDraft}
              storeEncryptedPrivateKeyDraft={storeEncryptedPrivateKeyDraft}
              setStoreEncryptedPrivateKeyDraft={setStoreEncryptedPrivateKeyDraft}
              addStoreEncryptedKey={addStoreEncryptedKey}
              unlockStoreKey={unlockStoreKey}
              removeStoreKey={removeStoreKey}
              storeSelectedHostForBinding={storeSelectedHostForBinding}
              setStoreSelectedHostForBinding={setStoreSelectedHostForBinding}
              storeBindingDraft={storeBindingDraft}
              setStoreBindingDraft={setStoreBindingDraft}
              saveHostBindingDraft={saveHostBindingDraft}
            />
          )}
          {activeAppSettingsTab === "help" && <AppSettingsHelpTab />}
          {activeAppSettingsTab === "about" && <AppSettingsAboutTab />}
        </div>
      </section>
    </div>
  );
}
