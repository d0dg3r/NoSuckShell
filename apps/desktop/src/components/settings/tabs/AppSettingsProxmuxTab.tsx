import { useCallback, useEffect, useMemo, useState } from "react";
import { licenseStatus, listPlugins, pluginInvoke, setPluginEnabled } from "../../../tauri-api";
import type { LicenseStatus, PluginListEntry } from "../../../types";
import { PROXMUX_PLUGIN_ID } from "../../../features/builtin-plugin-ids";
import { PLUGIN_STORE_CATALOG, storeItemAccessGranted } from "../../../features/plugin-store-catalog";

const PROXMUX_ENTITLEMENT = "dev.nosuckshell.addon.proxmox";

type ProxmuxClusterRow = {
  id: string;
  name: string;
  proxmoxUrl: string;
  apiUser: string;
  totpCode?: string;
  hasPassword: boolean;
  requiresReauth: boolean;
  failoverUrls: string[];
  isEnabled: boolean;
  allowInsecureTls: boolean;
};

type ListStateResponse = {
  activeClusterId: string | null;
  clusters: ProxmuxClusterRow[];
  usesEncryptedSecrets?: boolean;
  usesPlainSecrets?: boolean;
  legacyTokenClusters?: number;
  favoritesByCluster?: Record<string, string[]>;
};

type ResourceRow = Record<string, unknown>;

function resourceString(row: ResourceRow, key: string): string {
  const v = row[key];
  if (v == null) return "";
  return String(v);
}

export type AppSettingsProxmuxTabProps = {
  openWebConsolesInAppPane: boolean;
  setOpenWebConsolesInAppPane: (value: boolean) => void;
};

export function AppSettingsProxmuxTab({
  openWebConsolesInAppPane,
  setOpenWebConsolesInAppPane,
}: AppSettingsProxmuxTabProps) {
  const [plugins, setPlugins] = useState<PluginListEntry[]>([]);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [state, setState] = useState<ListStateResponse | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [resourceClusterId, setResourceClusterId] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftUser, setDraftUser] = useState("");
  const [draftTotpCode, setDraftTotpCode] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftFailoverText, setDraftFailoverText] = useState("");
  const [draftInsecure, setDraftInsecure] = useState(false);

  const catalogItem = useMemo(
    () => PLUGIN_STORE_CATALOG.find((i) => i.id === "proxmox-integration"),
    [],
  );

  const entitlements = status?.entitlements ?? [];
  const storeAccess = catalogItem ? storeItemAccessGranted(entitlements, catalogItem) : entitlements.includes(PROXMUX_ENTITLEMENT);

  const proxmuxPlugin = plugins.find((p) => p.manifest.id === PROXMUX_PLUGIN_ID);
  const pluginReady = Boolean(proxmuxPlugin?.enabled && proxmuxPlugin?.entitlementOk);

  const refreshMeta = useCallback(async () => {
    setLoadError("");
    try {
      const [p, s] = await Promise.all([listPlugins(), licenseStatus()]);
      setPlugins(p);
      setStatus(s);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshState = useCallback(async () => {
    if (!pluginReady) return;
    setLoadError("");
    try {
      const raw = await pluginInvoke(PROXMUX_PLUGIN_ID, "listState", {});
      const parsed = raw as ListStateResponse;
      setState(parsed);
      setResourceClusterId((prev) => prev ?? parsed.activeClusterId ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [pluginReady]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (pluginReady) {
      void refreshState();
    }
  }, [pluginReady, refreshState]);

  const onEnablePlugin = async () => {
    setBusy(true);
    setMessage("");
    try {
      await setPluginEnabled(PROXMUX_PLUGIN_ID, true);
      await refreshMeta();
      setMessage("PROXMUX plugin enabled.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearDraft = () => {
    setDraftId(null);
    setDraftName("");
    setDraftUrl("");
    setDraftUser("");
    setDraftTotpCode("");
    setDraftPassword("");
    setDraftFailoverText("");
    setDraftInsecure(false);
  };

  const loadClusterIntoDraft = (c: ProxmuxClusterRow) => {
    setDraftId(c.id);
    setDraftName(c.name);
    setDraftUrl(c.proxmoxUrl);
    setDraftUser(c.apiUser);
    setDraftTotpCode(c.totpCode ?? "");
    setDraftPassword("");
    setDraftFailoverText(c.failoverUrls.join("\n"));
    setDraftInsecure(c.allowInsecureTls);
  };

  const onSaveCluster = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      const failoverUrls = draftFailoverText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await pluginInvoke(PROXMUX_PLUGIN_ID, "saveCluster", {
        cluster: {
          id: draftId ?? undefined,
          name: draftName.trim(),
          proxmoxUrl: draftUrl.trim(),
          apiUser: draftUser.trim(),
          totpCode: draftTotpCode.trim(),
          password: draftPassword,
          failoverUrls,
          isEnabled: true,
          allowInsecureTls: draftInsecure,
        },
      });
      setMessage("Cluster saved.");
      clearDraft();
      await refreshState();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveCluster = async (id: string) => {
    if (!pluginReady) return;
    if (!window.confirm(`Remove cluster “${id}” from PROXMUX?`)) return;
    setBusy(true);
    setMessage("");
    try {
      await pluginInvoke(PROXMUX_PLUGIN_ID, "removeCluster", { clusterId: id });
      setMessage("Cluster removed.");
      if (resourceClusterId === id) setResourceClusterId(null);
      await refreshState();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSetActive = async (id: string) => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      await pluginInvoke(PROXMUX_PLUGIN_ID, "setActiveCluster", { clusterId: id });
      setResourceClusterId(id);
      await refreshState();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onTestDraft = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      const failoverUrls = draftFailoverText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "testConnectionDraft", {
        proxmoxUrl: draftUrl.trim(),
        apiUser: draftUser.trim(),
        totpCode: draftTotpCode.trim(),
        password: draftPassword,
        failoverUrls,
        allowInsecureTls: draftInsecure,
      })) as { ok?: boolean; message?: string };
      if (out.ok) {
        setMessage("Connection OK (Proxmox API responded).");
      } else {
        setMessage(out.message || "Connection failed.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onTestSaved = async (id: string) => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "testConnection", { clusterId: id })) as {
        ok?: boolean;
        message?: string;
      };
      if (out.ok) {
        setMessage("Connection OK (Proxmox API responded).");
      } else {
        setMessage(out.message || "Connection failed.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFetchResources = async () => {
    if (!pluginReady || !resourceClusterId) return;
    setBusy(true);
    setMessage("");
    try {
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchResources", {
        clusterId: resourceClusterId,
      })) as { ok?: boolean; resources?: ResourceRow[] };
      setResources(out.resources ?? []);
      setMessage(`Loaded ${(out.resources ?? []).length} resources (nodes, VMs, LXCs).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!storeAccess) {
    return (
      <div className="settings-stack">
        <section className="settings-card">
          <header className="settings-card-head">
            <h3>PROXMUX</h3>
            <p className="muted-copy">
              Browse Proxmox VE nodes, VMs, and LXCs via the official API. This add-on requires a license entitlement. Open{" "}
              <strong>Plugins &amp; license</strong> to activate a token, then return here.
            </p>
          </header>
          {loadError ? <p className="error-text">{loadError}</p> : null}
        </section>
      </div>
    );
  }

  if (!proxmuxPlugin?.entitlementOk) {
    return (
      <div className="settings-stack">
        <section className="settings-card">
          <header className="settings-card-head">
            <h3>PROXMUX</h3>
            <p className="muted-copy">Your license is missing the Proxmox entitlement. Activate a token that includes it under Plugins &amp; license.</p>
          </header>
        </section>
      </div>
    );
  }

  if (!proxmuxPlugin.enabled) {
    return (
      <div className="settings-stack">
        <section className="settings-card">
          <header className="settings-card-head">
            <h3>PROXMUX</h3>
            <p className="muted-copy">Enable the built-in PROXMUX plugin to use Proxmox inventory.</p>
          </header>
          <div className="settings-actions-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onEnablePlugin()}>
              Enable PROXMUX plugin
            </button>
          </div>
          {message ? <p className="muted-copy">{message}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card-head">
          <h3>PROXMUX</h3>
          <p className="muted-copy">
            Connect to <strong>Proxmox VE</strong> with username/password login (<code className="inline-code">user@realm</code>) and optional TOTP. Use{" "}
            <strong>Allow insecure TLS</strong> only for homelab hosts with self-signed certificates.
          </p>
          {state?.usesPlainSecrets ? (
            <p className="muted-copy">
              Secrets are stored in <code className="inline-code">nosuckshell.proxmux.v1.json</code> under your SSH directory. Set{" "}
              <code className="inline-code">NOSUCKSHELL_MASTER_KEY</code> or create <code className="inline-code">nosuckshell.master.key</code> there to
              encrypt passwords like other app credentials.
            </p>
          ) : null}
          {(state?.legacyTokenClusters ?? 0) > 0 ? (
            <p className="muted-copy">
              {state?.legacyTokenClusters} legacy token-based cluster{state?.legacyTokenClusters === 1 ? "" : "s"} detected. Edit and save each one with a
              password to finish the direct-login migration.
            </p>
          ) : null}
        </header>
        {loadError ? <p className="error-text">{loadError}</p> : null}
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h4>Web consoles</h4>
          <p className="muted-copy">
            noVNC and Proxmox web shells open in a <strong>split pane</strong> by default (iframe with same-origin sandbox so WebSockets work).
            If a site still blocks embedding (for example <code>X-Frame-Options</code>), use <strong>Open in app window</strong> on that pane’s
            toolbar for a top-level in-app webview. Turn this off to
            use your default system browser instead.
          </p>
        </header>
        <label
          className="settings-field settings-field-span-2"
          style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}
        >
          <input
            type="checkbox"
            checked={openWebConsolesInAppPane}
            onChange={(e) => setOpenWebConsolesInAppPane(e.target.checked)}
          />
          <span>Open web consoles in an app pane (instead of the system browser)</span>
        </label>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h4>{draftId ? "Edit cluster" : "Add cluster"}</h4>
        </header>
        <div className="settings-form-grid">
          <label className="settings-field">
            <span>Name</span>
            <input
              className="input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Homelab"
              disabled={busy}
            />
          </label>
          <label className="settings-field">
            <span>Proxmox URL</span>
            <input
              className="input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://pve.example.com:8006"
              disabled={busy}
            />
          </label>
          <label className="settings-field">
            <span>Username</span>
            <input
              className="input"
              value={draftUser}
              onChange={(e) => setDraftUser(e.target.value)}
              placeholder="root@pam"
              disabled={busy}
            />
          </label>
          <label className="settings-field">
            <span>TOTP code (optional)</span>
            <input
              className="input"
              value={draftTotpCode}
              onChange={(e) => setDraftTotpCode(e.target.value)}
              placeholder="123456"
              disabled={busy}
            />
          </label>
          <label className="settings-field settings-field-span-2">
            <span>Password {draftId ? "(leave blank to keep)" : ""}</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={draftPassword}
              onChange={(e) => setDraftPassword(e.target.value)}
              placeholder="••••••••"
              disabled={busy}
            />
          </label>
          <label className="settings-field settings-field-span-2">
            <span>Failover URLs (one per line)</span>
            <textarea
              className="input ssh-config-textarea"
              rows={3}
              value={draftFailoverText}
              onChange={(e) => setDraftFailoverText(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="settings-field settings-field-span-2" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={draftInsecure} onChange={(e) => setDraftInsecure(e.target.checked)} disabled={busy} />
            <span>Allow insecure TLS (self-signed)</span>
          </label>
        </div>
        <div className="settings-actions-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSaveCluster()}>
            Save cluster
          </button>
          <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => void onTestDraft()}>
            Test connection
          </button>
          {draftId ? (
            <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={clearDraft}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h4>Clusters</h4>
        </header>
        {state?.clusters?.length ? (
          <ul className="proxmux-cluster-list">
            {state.clusters.map((c) => (
              <li key={c.id} className="proxmux-cluster-row">
                <div>
                  <strong>{c.name}</strong>{" "}
                  <span className="muted-copy">
                    <code className="inline-code">{c.id}</code>
                  </span>
                  <div className="muted-copy">{c.proxmoxUrl}</div>
                  {c.requiresReauth ? <span className="proxmux-badge-insecure">Re-auth required</span> : null}
                  {c.allowInsecureTls ? <span className="proxmux-badge-insecure">Insecure TLS</span> : null}
                </div>
                <div className="proxmux-cluster-actions">
                  <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => loadClusterIntoDraft(c)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => void onTestSaved(c.id)}>
                    Test
                  </button>
                  <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => void onSetActive(c.id)}>
                    {state.activeClusterId === c.id ? "Active" : "Set active"}
                  </button>
                  <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => void onRemoveCluster(c.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No clusters yet. Add one above.</p>
        )}
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <h4>Inventory</h4>
          <p className="muted-copy">Fetches <code className="inline-code">/cluster/resources</code> (nodes, QEMU, LXC).</p>
        </header>
        <label className="settings-field">
          <span>Cluster</span>
          <select
            className="input"
            value={resourceClusterId ?? ""}
            onChange={(e) => setResourceClusterId(e.target.value || null)}
            disabled={busy || !state?.clusters?.length}
          >
            <option value="">Select cluster</option>
            {state?.clusters?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </label>
        <div className="settings-actions-row">
          <button type="button" className="btn btn-primary" disabled={busy || !resourceClusterId} onClick={() => void onFetchResources()}>
            Refresh inventory
          </button>
        </div>
        {resources.length > 0 ? (
          <div className="proxmux-table-wrap">
            <table className="proxmux-resource-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>VMID</th>
                  <th>Name</th>
                  <th>Node</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((row, idx) => (
                  <tr key={`${resourceString(row, "id")}-${idx}`}>
                    <td>{resourceString(row, "type")}</td>
                    <td>{resourceString(row, "vmid")}</td>
                    <td>{resourceString(row, "name")}</td>
                    <td>{resourceString(row, "node")}</td>
                    <td>{resourceString(row, "status")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="muted-copy">
          <strong>Notice:</strong> {message}
        </p>
      ) : null}
    </div>
  );
}
