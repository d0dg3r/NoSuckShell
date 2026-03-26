import type { CSSProperties } from "react";
import {
  APP_SETTINGS_TABS,
  HELP_ABOUT_SUBTABS,
  INTEGRATIONS_SUBTABS,
  INTERFACE_SUBTABS,
  WORKSPACE_SUBTABS,
} from "./settings/app-settings-constants";
import type { AppSettingsPanelProps } from "./settings/app-settings-panel-props";
import { IdentityStoreSubtabs } from "./settings/IdentityStoreSubtabs";
import { SettingsSubtabRow } from "./settings/SettingsSubtabRow";
import { AppSettingsAboutTab } from "./settings/tabs/AppSettingsAboutTab";
import { AppSettingsAppearanceTab } from "./settings/tabs/AppSettingsAppearanceTab";
import { AppSettingsDataTab } from "./settings/tabs/AppSettingsDataTab";
import { AppSettingsFilesTab } from "./settings/tabs/AppSettingsFilesTab";
import { AppSettingsHelpTab } from "./settings/tabs/AppSettingsHelpTab";
import { AppSettingsKeyboardTab } from "./settings/tabs/AppSettingsKeyboardTab";
import { AppSettingsLayoutTab } from "./settings/tabs/AppSettingsLayoutTab";
import { AppSettingsPluginsTab } from "./settings/tabs/AppSettingsPluginsTab";
import { AppSettingsProxmuxTab } from "./settings/tabs/AppSettingsProxmuxTab";
import { AppSettingsSshTab } from "./settings/tabs/AppSettingsSshTab";
import { AppSettingsHostsTab } from "./settings/tabs/AppSettingsHostsTab";
import { AppSettingsStoreTabContent } from "./settings/tabs/AppSettingsStoreTabContent";
import { AppSettingsViewsTab } from "./settings/tabs/AppSettingsViewsTab";
import { AppSettingsHetznerTab } from "./settings/tabs/AppSettingsHetznerTab";
import { AppSettingsNssCommanderTab } from "./settings/tabs/AppSettingsNssCommanderTab";

export type {
  AppSettingsTab,
  AutoArrangeMode,
  DensityProfile,
  FileExportArchiveFormat,
  FileExportDestMode,
  FrameModePreset,
  HelpAboutSubTab,
  IdentityStoreSubTab,
  InterfaceSubTab,
  LayoutMode,
  ListTonePreset,
  QuickConnectMode,
  SettingsOpenMode,
  SplitRatioPreset,
  TerminalFontPreset,
  UiFontPreset,
  IntegrationsSubTab,
  WorkspaceSubTab,
} from "./settings/app-settings-types";

export type { AppSettingsPanelProps } from "./settings/app-settings-panel-props";

export function AppSettingsPanel(props: AppSettingsPanelProps) {
  const {
    keyboardShortcutChords,
    setKeyboardShortcutChords,
    keyboardLeaderChord,
    setKeyboardLeaderChord,
    resolveHelpShortcutLabel,
    shortcutCheatsheetLines,
    keyboardShortcutSuspendEscapeRef,
    settingsOpenMode,
    setSettingsOpenMode,
    onCloseSettings,
    settingsSectionRef,
    onSettingsHeaderPointerDown,
    isSettingsDragging,
    settingsModalPosition,
    activeAppSettingsTab,
    setActiveAppSettingsTab,
    workspaceSubTab,
    setWorkspaceSubTab,
    interfaceSubTab,
    setInterfaceSubTab,
    helpAboutSubTab,
    setHelpAboutSubTab,
    identityStoreSubTab,
    setIdentityStoreSubTab,
    integrationsSubTab,
    setIntegrationsSubTab,
    densityProfile,
    setDensityProfile,
    uiDensityOffset,
    setUiDensityOffset,
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
    showFullPathInFilePaneTitle,
    setShowFullPathInFilePaneTitle,
    onResetVisualStyle,
    fileExportDestMode,
    setFileExportDestMode,
    fileExportPathKey,
    setFileExportPathKey,
    fileExportArchiveFormat,
    setFileExportArchiveFormat,
    filePaneSemanticNameColors,
    setFilePaneSemanticNameColors,
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
    error,
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
    sshConfigRaw,
    setSshConfigRaw,
    onSaveSshConfig,
    onExportResolvedOpensshConfig,
    sshDirInfo,
    sshDirOverrideDraft,
    setSshDirOverrideDraft,
    onApplySshDirOverride,
    onResetSshDirOverride,
    hostSettingsSelectedAlias,
    onHostSettingsSelectAlias,
    hostSettingsDraftHost,
    setHostSettingsDraftHost,
    hostSettingsDraftBinding,
    setHostSettingsDraftBinding,
    hostSettingsTagDraft,
    setHostSettingsTagDraft,
    hostSettingsKeyPolicy,
    setHostSettingsKeyPolicy,
    hostSettingsMetadataForSelected,
    onSaveHostSettingsTab,
    hostSettingsTabSaveDisabled,
    onRemoveHostSettingsTabIntent,
    hostSettingsTabRemoveConfirmActive,
    toggleFavoriteForHost,
    toggleJumpHostForHost,
    proxmuxOpenWebConsolesInPane,
    setProxmuxOpenWebConsolesInPane,
    appPreferences,
    onSaveAppPreferences,
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
        <div className="app-settings-modal-body">
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
        {activeAppSettingsTab === "workspace" && (
          <SettingsSubtabRow
            ariaLabel="Workspace sections"
            tabs={WORKSPACE_SUBTABS}
            activeTab={workspaceSubTab}
            onSelect={setWorkspaceSubTab}
          />
        )}
        {activeAppSettingsTab === "interface" && (
          <SettingsSubtabRow
            ariaLabel="Interface sections"
            tabs={INTERFACE_SUBTABS}
            activeTab={interfaceSubTab}
            onSelect={setInterfaceSubTab}
          />
        )}
        {activeAppSettingsTab === "integrations" && (
          <SettingsSubtabRow
            ariaLabel="Integrations sections"
            tabs={INTEGRATIONS_SUBTABS}
            activeTab={integrationsSubTab}
            onSelect={setIntegrationsSubTab}
          />
        )}
        {activeAppSettingsTab === "help" && (
          <SettingsSubtabRow
            ariaLabel="Help and about sections"
            tabs={HELP_ABOUT_SUBTABS}
            activeTab={helpAboutSubTab}
            onSelect={setHelpAboutSubTab}
          />
        )}
        <div className="app-settings-content app-settings-panel-body">
          {activeAppSettingsTab === "interface" && interfaceSubTab === "appearance" && (
            <AppSettingsAppearanceTab
              densityProfile={densityProfile}
              setDensityProfile={setDensityProfile}
              uiDensityOffset={uiDensityOffset}
              setUiDensityOffset={setUiDensityOffset}
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
              showFullPathInFilePaneTitle={showFullPathInFilePaneTitle}
              setShowFullPathInFilePaneTitle={setShowFullPathInFilePaneTitle}
              onResetVisualStyle={onResetVisualStyle}
            />
          )}
          {activeAppSettingsTab === "interface" && interfaceSubTab === "keyboard" && (
            <AppSettingsKeyboardTab
              chordMap={keyboardShortcutChords}
              setChordMap={setKeyboardShortcutChords}
              leaderChord={keyboardLeaderChord}
              setLeaderChord={setKeyboardLeaderChord}
              suspendEscapeRef={keyboardShortcutSuspendEscapeRef}
            />
          )}
          {activeAppSettingsTab === "workspace" && workspaceSubTab === "layout" && (
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
          {activeAppSettingsTab === "workspace" && workspaceSubTab === "files" && (
            <AppSettingsFilesTab
              fileExportDestMode={fileExportDestMode}
              setFileExportDestMode={setFileExportDestMode}
              fileExportPathKey={fileExportPathKey}
              setFileExportPathKey={setFileExportPathKey}
              fileExportArchiveFormat={fileExportArchiveFormat}
              setFileExportArchiveFormat={setFileExportArchiveFormat}
              filePaneSemanticNameColors={filePaneSemanticNameColors}
              setFilePaneSemanticNameColors={setFilePaneSemanticNameColors}
            />
          )}
          {activeAppSettingsTab === "workspace" && workspaceSubTab === "views" && (
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
              appPreferences={appPreferences}
              onSaveAppPreferences={onSaveAppPreferences}
              setError={setError}
              setSshConfigRaw={setSshConfigRaw}
              sshConfigRaw={sshConfigRaw}
              onSaveSshConfig={onSaveSshConfig}
              onExportResolvedOpensshConfig={onExportResolvedOpensshConfig}
              sshDirInfo={sshDirInfo}
              sshDirOverrideDraft={sshDirOverrideDraft}
              setSshDirOverrideDraft={setSshDirOverrideDraft}
              onApplySshDirOverride={onApplySshDirOverride}
              onResetSshDirOverride={onResetSshDirOverride}
            />
          )}
         
          {activeAppSettingsTab === "store" && identityStoreSubTab === "hosts" && (
            <AppSettingsHostsTab
              hosts={hosts}
              selectedHostAlias={hostSettingsSelectedAlias}
              onSelectHostAlias={onHostSettingsSelectAlias}
              draftHost={hostSettingsDraftHost}
              setDraftHost={setHostSettingsDraftHost}
              draftBinding={hostSettingsDraftBinding}
              setDraftBinding={setHostSettingsDraftBinding}
              tagDraft={hostSettingsTagDraft}
              setTagDraft={setHostSettingsTagDraft}
              hostKeyPolicyDraft={hostSettingsKeyPolicy}
              setHostKeyPolicyDraft={setHostSettingsKeyPolicy}
              metadataForSelected={hostSettingsMetadataForSelected}
              hostMetadataByHost={metadataStore.hosts}
              storeKeys={storeKeys}
              storeUsers={storeUsers}
              storeGroups={storeGroups}
              storeTags={storeTags}
              toggleFavoriteForHost={toggleFavoriteForHost}
              toggleJumpHostForHost={toggleJumpHostForHost}
              onSaveHost={onSaveHostSettingsTab}
              saveDisabled={hostSettingsTabSaveDisabled}
              onRemoveHost={onRemoveHostSettingsTabIntent}
              removeConfirmActive={hostSettingsTabRemoveConfirmActive}
              error={error}
            />
          )}
          {activeAppSettingsTab === "store" && identityStoreSubTab !== "hosts" && (
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
            />
          )}
          {activeAppSettingsTab === "integrations" && integrationsSubTab === "plugins" && <AppSettingsPluginsTab />}
          {activeAppSettingsTab === "integrations" && integrationsSubTab === "nss-commander" && (
            <AppSettingsNssCommanderTab
              appPreferences={appPreferences}
              onSaveAppPreferences={onSaveAppPreferences}
            />
          )}
          {activeAppSettingsTab === "integrations" && integrationsSubTab === "proxmux" && (
            <AppSettingsProxmuxTab
              openWebConsolesInAppPane={proxmuxOpenWebConsolesInPane}
              setOpenWebConsolesInAppPane={setProxmuxOpenWebConsolesInPane}
            />
          )}
          {activeAppSettingsTab === "integrations" && integrationsSubTab === "hetzner" && (
            <AppSettingsHetznerTab />
          )}
          {activeAppSettingsTab === "help" && helpAboutSubTab === "help" && (
            <AppSettingsHelpTab
              resolveHelpShortcutLabel={resolveHelpShortcutLabel}
              shortcutCheatsheetLines={shortcutCheatsheetLines}
            />
          )}
          {activeAppSettingsTab === "help" && helpAboutSubTab === "about" && <AppSettingsAboutTab />}
        </div>
        </div>
      </section>
    </div>
  );
}
