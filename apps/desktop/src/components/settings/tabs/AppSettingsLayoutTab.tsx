import { openAuxWindow } from "../../../tauri-api";
import { SettingsHelpHint } from "../SettingsHelpHint";
import type { AutoArrangeMode, LayoutMode, QuickConnectMode, SplitRatioPreset } from "../app-settings-types";

export type AppSettingsLayoutTabProps = {
  isSidebarPinned: boolean;
  setSidebarPinned: (value: boolean) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (value: LayoutMode) => void;
  splitRatioPreset: SplitRatioPreset;
  setSplitRatioPreset: (value: SplitRatioPreset) => void;
  autoArrangeMode: AutoArrangeMode;
  setAutoArrangeMode: (value: AutoArrangeMode) => void;
  isBroadcastModeEnabled: boolean;
  setBroadcastMode: (enabled: boolean) => void;
  quickConnectMode: QuickConnectMode;
  setQuickConnectMode: (value: QuickConnectMode) => void;
  quickConnectAutoTrust: boolean;
  setQuickConnectAutoTrust: (value: boolean) => void;
};

export function AppSettingsLayoutTab({
  isSidebarPinned,
  setSidebarPinned,
  layoutMode,
  setLayoutMode,
  splitRatioPreset,
  setSplitRatioPreset,
  autoArrangeMode,
  setAutoArrangeMode,
  isBroadcastModeEnabled,
  setBroadcastMode,
  quickConnectMode,
  setQuickConnectMode,
  quickConnectAutoTrust,
  setQuickConnectAutoTrust,
}: AppSettingsLayoutTabProps) {
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>Window behavior</h3>
            <SettingsHelpHint
              topic="Window behavior"
              description="Controls how the host list and terminal area are arranged across window sizes: sidebar pinning, extra windows, layout mode, split defaults, auto-arrange, and keyboard broadcast."
            />
          </div>
          <p className="settings-card-lead">Hosts, terminals, and layout automation.</p>
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
            <span className="field-label field-label-inline-hint">
              Host sidebar always visible (pinned)
              <SettingsHelpHint
                topic="Pinned host sidebar"
                description="When off, the sidebar can auto-hide after you move away. If it is collapsed, use the expand control at the left window edge. Use the pin control in the host sidebar header to pin or unpin."
              />
            </span>
          </label>
          <div className="field field-span-2">
            <div className="settings-action-with-hint">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  void openAuxWindow().catch(() => {
                    /* no-op outside desktop */
                  });
                }}
              >
                Open additional app window
              </button>
              <SettingsHelpHint
                topic="Additional app window"
                description="A second window shares the same sessions and can receive file copy/paste from the main window via the in-app clipboard."
              />
            </div>
          </div>
          <div className="settings-form-row field-span-2">
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Window layout
                <SettingsHelpHint
                  topic="Window layout"
                  description="Auto uses the mobile shell on narrow screens. Wide keeps the desktop side-by-side grid. Compact keeps the stacked layout at all sizes."
                />
              </span>
              <select
                className="input density-profile-select"
                value={layoutMode}
                onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
              >
                <option value="auto">Auto — stack below 900px</option>
                <option value="wide">Wide — always side-by-side</option>
                <option value="compact">Compact — always stacked</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Default split ratio preset
                <SettingsHelpHint
                  topic="Default split ratio preset"
                  description="Applies only to newly created pane splits (not existing layouts)."
                />
              </span>
              <select
                className="input density-profile-select"
                value={splitRatioPreset}
                onChange={(event) => setSplitRatioPreset(event.target.value as SplitRatioPreset)}
              >
                <option value="50-50">50/50</option>
                <option value="60-40">60/40</option>
                <option value="70-30">70/30</option>
              </select>
            </label>
          </div>
          <label className="field field-span-2">
            <span className="field-label field-label-inline-hint">
              Auto arrange mode
              <SettingsHelpHint
                topic="Auto arrange mode"
                description='Mode A compacts session slots. Mode B rebalances split ratios. Mode C applies both. "Free move" keeps your splits until you pick another mode. The pane context menu item "Pause auto-arrange (manual layout only)" switches here to Free move; "Resume auto-arrange for layout" restores the last A/B/C preset. Off stops automation without remembering manual layout.'
              />
            </span>
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
          </label>
          <label className="field field-span-2 checkbox-field">
            <input
              id="settings-broadcast-mode"
              type="checkbox"
              className="checkbox-input"
              checked={isBroadcastModeEnabled}
              onChange={(event) => setBroadcastMode(event.target.checked)}
            />
            <span className="field-label field-label-inline-hint">
              Broadcast keyboard to multiple terminals
              <SettingsHelpHint
                topic="Keyboard broadcast"
                description="When enabled, add targets from each pane toolbar (target / all visible), the pane context menu, or this checkbox. The session footer shows state and how many panes are targeted. Turn off from the toolbar, here, or the context menu."
              />
            </span>
          </label>
        </div>
      </section>
      <section className="settings-card">
        <header className="settings-card-head">
          <div className="settings-card-head-row">
            <h3>Quick connect</h3>
            <SettingsHelpHint
              topic="Quick connect"
              description="Ad-hoc connections: choose how the connect flow is presented (wizard vs single form vs command palette) and whether host keys are trusted automatically."
            />
          </div>
          <p className="settings-card-lead">Flow style and host key trust.</p>
        </header>
        <div className="host-form-grid">
          <div className="settings-form-row field-span-2">
            <label className="field">
              <span className="field-label field-label-inline-hint">
                Quick connect mode
                <SettingsHelpHint
                  topic="Quick connect mode"
                  description="Defines how host and user input is collected for quick connections."
                />
              </span>
              <select
                className="input density-profile-select"
                value={quickConnectMode}
                onChange={(event) => setQuickConnectMode(event.target.value as QuickConnectMode)}
              >
                <option value="wizard">Wizard (step-by-step)</option>
                <option value="smart">Smart form (single screen)</option>
                <option value="command">Command palette</option>
              </select>
            </label>
            <label className="field checkbox-field">
              <input
                className="checkbox-input"
                type="checkbox"
                checked={quickConnectAutoTrust}
                onChange={(event) => setQuickConnectAutoTrust(event.target.checked)}
              />
              <span className="field-label field-label-inline-hint">
                Auto trust host keys for quick connect
                <SettingsHelpHint
                  topic="Auto trust host keys for quick connect"
                  description="Default is off. When enabled, quick-connect sessions auto-accept host key prompts."
                />
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
