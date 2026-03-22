import { useCallback, useEffect, useState } from "react";
import {
  activateLicense,
  clearLicense,
  licenseStatus,
  listPlugins,
  pluginInvoke,
  setPluginEnabled,
} from "../../../tauri-api";
import type { LicenseStatus, PluginListEntry } from "../../../types";
import { DEMO_PLUGIN_ID } from "../../../features/builtin-plugin-ids";
import {
  PLUGIN_STORE_CATALOG,
  formatLicenseExpSummary,
  storeItemAccessGranted,
} from "../../../features/plugin-store-catalog";

export function AppSettingsPluginsTab() {
  const [plugins, setPlugins] = useState<PluginListEntry[]>([]);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const [p, s] = await Promise.all([listPlugins(), licenseStatus()]);
      setPlugins(p);
      setStatus(s);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onTogglePlugin = async (pluginId: string, enabled: boolean) => {
    setActionMessage("");
    setBusy(true);
    try {
      await setPluginEnabled(pluginId, enabled);
      await refresh();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPingDemo = async () => {
    setActionMessage("");
    setBusy(true);
    try {
      const out = await pluginInvoke(DEMO_PLUGIN_ID, "ping", { hello: "from-ui" });
      setActionMessage(typeof out === "object" ? JSON.stringify(out) : String(out));
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async () => {
    setActionMessage("");
    const t = tokenDraft.trim();
    if (!t) {
      setActionMessage("Paste a license token first.");
      return;
    }
    setBusy(true);
    try {
      await activateLicense(t);
      setTokenDraft("");
      await refresh();
      setActionMessage("License activated.");
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClearLicense = async () => {
    setActionMessage("");
    setBusy(true);
    try {
      await clearLicense();
      await refresh();
      setActionMessage("License cleared.");
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const entitlements = status?.entitlements ?? [];
  const licenseExpLabel = formatLicenseExpSummary(status?.exp ?? null);

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>Plugin store</h3>
          <p className="muted-copy">
            NoSuckShell is <strong>open source (MIT)</strong>; only a few built-in add-ons ask for a <strong>license token</strong> in
            official builds. Add-ons ship inside the app — purchasing on Ko-fi (or your checkout) should give you a token to paste below.
            Replace the default Ko-fi link in <code className="inline-code">plugin-store-catalog.ts</code> with your shop or membership URL.
          </p>
        </header>
        <ul className="plugin-store-list">
          {PLUGIN_STORE_CATALOG.map((item) => {
            const accessGranted = storeItemAccessGranted(entitlements, item);
            const pluginRow = item.relatedPluginId
              ? plugins.find((p) => p.manifest.id === item.relatedPluginId)
              : undefined;
            const badgeClass = item.isFree ? "is-free" : accessGranted ? "is-unlocked" : "is-locked";
            const badgeLabel = item.isFree ? "Free" : accessGranted ? "Unlocked" : "Locked";
            return (
              <li key={item.id} className="plugin-store-card">
                <div className="plugin-store-card-head">
                  <div className="plugin-store-card-title-row">
                    {item.logoSrc ? (
                      <img src={item.logoSrc} alt="" className="plugin-store-logo" width={40} height={40} />
                    ) : null}
                    <strong>{item.title}</strong>
                  </div>
                  <span className={`plugin-store-badge ${badgeClass}`}>{badgeLabel}</span>
                </div>
                <p className="muted-copy">{item.description}</p>
                {item.trialHint ? <p className="muted-copy plugin-store-trial-hint">{item.trialHint}</p> : null}
                {accessGranted && licenseExpLabel && !item.isFree ? (
                  <p className="muted-copy">
                    <strong>License expires:</strong> {licenseExpLabel}
                  </p>
                ) : null}
                {!accessGranted && item.requiredEntitlements.length > 0 ? (
                  <p className="muted-copy">
                    <strong>Required entitlements:</strong>{" "}
                    <code className="inline-code">{item.requiredEntitlements.join(", ")}</code>
                  </p>
                ) : null}
                {pluginRow ? (
                  <p className="muted-copy">
                    Installed plugin: <code className="inline-code">{pluginRow.manifest.id}</code>
                    {pluginRow.enabled && pluginRow.entitlementOk ? " (enabled)" : null}
                    {pluginRow.enabled && !pluginRow.entitlementOk ? " (waiting on entitlement — enable after activating license)" : null}
                  </p>
                ) : null}
                {item.purchaseUrl ? (
                  <div className="settings-actions-row">
                    <a className="btn btn-settings-tool" href={item.purchaseUrl} target="_blank" rel="noreferrer">
                      {item.isFree ? "Support on Ko-fi" : "Open on Ko-fi"}
                    </a>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h3>License</h3>
          <p className="muted-copy">
            Optional paid add-ons use an offline-signed token (separate from the MIT license on the source). After a purchase or donation,
            paste the token issued by the project (for example via a Ko-fi webhook service you operate). See{" "}
            <a href="https://ko-fi.com/" target="_blank" rel="noreferrer">
              Ko-fi
            </a>
            , <code className="inline-code">docs/licensing.md</code>, <code className="inline-code">docs/terms-of-sale.md</code>, and{" "}
            <code className="inline-code">docs/license-server-runbook.md</code>.
          </p>
        </header>
        {loadError ? <p className="error-text">{loadError}</p> : null}
        {status && (
          <div className="muted-copy">
            <p>
              <strong>Status:</strong> {status.active ? "Active" : "None"}
            </p>
            {status.active ? (
              <>
                <p>
                  <strong>License ID:</strong> <code className="inline-code">{status.licenseId}</code>
                </p>
                <p>
                  <strong>Entitlements:</strong>{" "}
                  {status.entitlements.length ? status.entitlements.join(", ") : "(none)"}
                </p>
                {status.exp != null ? (
                  <p>
                    <strong>Expires:</strong> {new Date(status.exp * 1000).toISOString()}
                    <span className="muted-copy"> — time-limited (trial or subscription)</span>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        )}
        <label className="settings-card-title">
          <span>License token</span>
          <textarea
            className="input ssh-config-textarea"
            rows={3}
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="base64url(payload).base64url(signature)"
            disabled={busy}
          />
        </label>
        <div className="settings-actions-row">
          <button type="button" className="btn btn-primary" onClick={() => void onActivate()} disabled={busy}>
            Activate
          </button>
          <button type="button" className="btn btn-settings-tool" onClick={() => void onClearLicense()} disabled={busy}>
            Clear license
          </button>
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h3>Installed plugins</h3>
          <p className="muted-copy">
            Built-in plugins register hooks in the desktop core. Future secret backends (for example Vault or Bitwarden)
            can ship as additional modules using the same interface.
          </p>
        </header>
        <ul className="muted-copy" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {plugins.map((row) => (
            <li
              key={row.manifest.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <strong>{row.manifest.displayName}</strong>{" "}
                <span className="muted-copy">
                  <code className="inline-code">{row.manifest.id}</code> v{row.manifest.version}
                </span>
                {!row.entitlementOk ? (
                  <p className="muted-copy">Waiting on license entitlement for this plugin.</p>
                ) : null}
                <p className="muted-copy">Capabilities: {row.manifest.capabilities.join(", ") || "(none)"}</p>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={busy}
                  onChange={(e) => void onTogglePlugin(row.manifest.id, e.target.checked)}
                />
                <span>Enabled</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="settings-actions-row">
          <button type="button" className="btn btn-settings-tool" onClick={() => void onPingDemo()} disabled={busy}>
            Ping demo plugin
          </button>
        </div>
        {actionMessage ? (
          <p className="muted-copy">
            <strong>Last result:</strong> {actionMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
