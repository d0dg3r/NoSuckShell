import { openAuxWindow } from "../../../tauri-api";
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
            When off, the sidebar can auto-hide after you move away. If it is collapsed, click the expand control at the
            left window edge to show it again. Use the pin control in the host sidebar header to pin or unpin.
          </p>
          <div className="field field-span-2">
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
            <p className="muted-copy field-help">
              A second window shares the same sessions and can receive file copy/paste from the main window via the in-app
              clipboard.
            </p>
          </div>
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
              <strong>Free move</strong> keeps your splits until you pick another mode. The pane context menu item
              &quot;Pause auto-arrange (manual layout only)&quot; switches here to Free move; &quot;Resume auto-arrange
              for layout&quot; restores the last A/B/C preset. <strong>Off</strong> stops automation without remembering
              manual layout.
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
            When enabled, add targets from each pane&apos;s toolbar (target / all visible), the pane context menu, or
            this checkbox. The session footer shows state and how many panes are targeted. Turn off from the toolbar,
            here, or the context menu.
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
  );
}
