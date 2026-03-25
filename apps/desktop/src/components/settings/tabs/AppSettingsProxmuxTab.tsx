import { useCallback, useEffect, useMemo, useState } from "react";
import { licenseStatus, listPlugins, pluginInvoke, setPluginEnabled } from "../../../tauri-api";
import type { LicenseStatus, PluginListEntry } from "../../../types";
import { PROXMUX_PLUGIN_ID } from "../../../features/builtin-plugin-ids";
import { PLUGIN_STORE_CATALOG, storeItemAccessGranted } from "../../../features/plugin-store-catalog";
import { SettingsHelpHint } from "../SettingsHelpHint";

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
  tlsTrustedCertPem?: string | null;
  tlsTrustedLeafSha256?: string | null;
  /** `null`/missing = global default proxy; `"direct"` = none; else profile id. */
  proxyId?: string | null;
};

type ProxyProfileRow = {
  id: string;
  name: string;
  url: string;
  noProxyExtra: string;
  isEnabled: boolean;
};

type ListStateResponse = {
  activeClusterId: string | null;
  clusters: ProxmuxClusterRow[];
  usesEncryptedSecrets?: boolean;
  usesPlainSecrets?: boolean;
  legacyTokenClusters?: number;
  favoritesByCluster?: Record<string, string[]>;
  /** Corporate HTTP(S) proxy for Proxmox API (optional). */
  httpProxyUrl?: string;
  /** Comma-separated bypass list (same idea as NO_PROXY). */
  noProxy?: string;
  proxyProfiles?: ProxyProfileRow[];
};

type ResourceRow = Record<string, unknown>;
type DraftAuthPayload = {
  proxmoxUrl: string;
  apiUser: string;
  totpCode: string;
  password: string;
  failoverUrls: string[];
  allowInsecureTls: boolean;
};

function resourceString(row: ResourceRow, key: string): string {
  const v = row[key];
  if (v == null) return "";
  return String(v);
}

function normalizeFailoverUrls(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDraftAuthPayload(input: {
  draftUrl: string;
  draftUser: string;
  draftTotpCode: string;
  draftPassword: string;
  draftFailoverText: string;
  draftInsecure: boolean;
}): DraftAuthPayload {
  return {
    proxmoxUrl: input.draftUrl.trim(),
    apiUser: input.draftUser.trim(),
    totpCode: input.draftTotpCode.trim(),
    password: input.draftPassword,
    failoverUrls: normalizeFailoverUrls(input.draftFailoverText),
    allowInsecureTls: input.draftInsecure,
  };
}

function validateDraftAuthPayload(payload: DraftAuthPayload, mode: "save-new" | "save-edit" | "test"): string | null {
  if (!payload.proxmoxUrl) return "Proxmox URL is required.";
  if (!payload.apiUser) return "Username is required.";
  if (mode === "test" && !payload.password) return "Password is required to test a connection.";
  if (mode === "save-new" && !payload.password) return "Password is required for a new cluster.";
  return null;
}

function mapPluginError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.trim();
  if (/HTTP\s+401/i.test(normalized) || /authentication failure/i.test(normalized)) {
    return "Authentication failed. Verify username, password, and TOTP code, then try again.";
  }
  return normalized || "Unexpected plugin error.";
}

function clusterProxyLabel(proxyId: string | null | undefined, profiles: ProxyProfileRow[]): string {
  if (proxyId == null || proxyId === "") return "Global default";
  if (proxyId === "direct") return "Direct (no proxy)";
  const p = profiles.find((x) => x.id === proxyId);
  return p ? `${p.name}` : proxyId;
}

type ProxmuxSettingsSubTab = "clusters" | "network" | "sidebar";

const PROXMUX_SETTINGS_SUB_TABS: { id: ProxmuxSettingsSubTab; label: string }[] = [
  { id: "clusters", label: "Clusters" },
  { id: "network", label: "Network" },
  { id: "sidebar", label: "Sidebar" },
];

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
  const [draftTlsCertPem, setDraftTlsCertPem] = useState("");
  const [draftTlsLeafSha256, setDraftTlsLeafSha256] = useState("");
  const [draftHttpProxy, setDraftHttpProxy] = useState("");
  const [draftNoProxy, setDraftNoProxy] = useState("");
  const [draftProxyProfiles, setDraftProxyProfiles] = useState<ProxyProfileRow[]>([]);
  const [draftClusterProxy, setDraftClusterProxy] = useState("");
  const [proxmuxSubTab, setProxmuxSubTab] = useState<ProxmuxSettingsSubTab>("clusters");

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
      setDraftHttpProxy(parsed.httpProxyUrl ?? "");
      setDraftNoProxy(parsed.noProxy ?? "");
      setDraftProxyProfiles(parsed.proxyProfiles ?? []);
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
      setMessage(mapPluginError(e));
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
    setDraftTlsCertPem("");
    setDraftTlsLeafSha256("");
    setDraftClusterProxy("");
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
    setDraftTlsCertPem(c.tlsTrustedCertPem?.trim() ?? "");
    setDraftTlsLeafSha256(c.tlsTrustedLeafSha256?.trim() ?? "");
    const pid = c.proxyId;
    if (pid == null || pid === "") {
      setDraftClusterProxy("");
    } else {
      setDraftClusterProxy(pid);
    }
  };

  const onSaveCluster = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = buildDraftAuthPayload({
        draftUrl,
        draftUser,
        draftTotpCode,
        draftPassword,
        draftFailoverText,
        draftInsecure,
      });
      const validationError = validateDraftAuthPayload(payload, draftId ? "save-edit" : "save-new");
      if (validationError) {
        setMessage(validationError);
        return;
      }
      await pluginInvoke(PROXMUX_PLUGIN_ID, "saveCluster", {
        cluster: {
          id: draftId ?? undefined,
          name: draftName.trim(),
          proxmoxUrl: payload.proxmoxUrl,
          apiUser: payload.apiUser,
          totpCode: payload.totpCode,
          password: payload.password,
          failoverUrls: payload.failoverUrls,
          isEnabled: true,
          allowInsecureTls: payload.allowInsecureTls,
          tlsTrustedCertPem: draftTlsCertPem.trim(),
          proxyId: draftClusterProxy.trim() || null,
        },
      });
      setMessage("Cluster saved.");
      clearDraft();
      await refreshState();
    } catch (e) {
      setMessage(mapPluginError(e));
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
      setMessage(mapPluginError(e));
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
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const onTestDraft = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = buildDraftAuthPayload({
        draftUrl,
        draftUser,
        draftTotpCode,
        draftPassword,
        draftFailoverText,
        draftInsecure,
      });
      const validationError = validateDraftAuthPayload(payload, "test");
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "testConnectionDraft", {
        proxmoxUrl: payload.proxmoxUrl,
        apiUser: payload.apiUser,
        totpCode: payload.totpCode,
        password: payload.password,
        failoverUrls: payload.failoverUrls,
        allowInsecureTls: payload.allowInsecureTls,
        tlsTrustedCertPem: draftTlsCertPem.trim() || null,
        proxyId: draftClusterProxy.trim() || null,
      })) as { ok?: boolean; message?: string };
      if (out.ok) {
        setMessage("Connection OK (Proxmox API responded).");
      } else {
        setMessage(out.message || "Connection failed.");
      }
    } catch (e) {
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const onFetchTlsCertificate = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      if (!draftId?.trim() && !draftUrl.trim()) {
        setMessage("Enter a Proxmox URL or load a saved cluster first.");
        return;
      }
      const arg =
        draftId != null && draftId.trim() !== "" ? { clusterId: draftId } : { proxmoxUrl: draftUrl.trim() };
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchTlsCertificate", arg)) as {
        ok?: boolean;
        pem?: string;
        leafSha256?: string;
      };
      if (!out.ok || !out.pem) {
        setMessage("Could not fetch the server certificate.");
        return;
      }
      if (draftTlsLeafSha256 && out.leafSha256 && out.leafSha256 !== draftTlsLeafSha256) {
        const ok = window.confirm(
          "The server certificate fingerprint changed compared to the saved trusted certificate. Replace the stored certificate with the one from the server now?",
        );
        if (!ok) {
          return;
        }
      }
      setDraftTlsCertPem(out.pem);
      setDraftTlsLeafSha256(out.leafSha256 ?? "");
      setMessage("Certificate loaded. Save the cluster to store trust for API and consoles.");
    } catch (e) {
      setMessage(mapPluginError(e));
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
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveProxySettings = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      await pluginInvoke(PROXMUX_PLUGIN_ID, "saveProxySettings", {
        httpProxyUrl: draftHttpProxy.trim(),
        noProxy: draftNoProxy.trim(),
      });
      setMessage("Network settings saved.");
      await refreshState();
    } catch (e) {
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveProxyProfiles = async () => {
    if (!pluginReady) return;
    setBusy(true);
    setMessage("");
    try {
      await pluginInvoke(PROXMUX_PLUGIN_ID, "saveProxyProfiles", {
        profiles: draftProxyProfiles.map((p) => ({
          id: p.id.trim(),
          name: p.name.trim(),
          url: p.url.trim(),
          noProxyExtra: p.noProxyExtra.trim(),
          isEnabled: p.isEnabled,
        })),
      });
      setMessage("Proxy profiles saved.");
      await refreshState();
    } catch (e) {
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const addProxyProfileRow = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `proxy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setDraftProxyProfiles((prev) => [...prev, { id, name: "New proxy", url: "", noProxyExtra: "", isEnabled: true }]);
  };

  const removeProxyProfileRow = (id: string) => {
    setDraftProxyProfiles((prev) => prev.filter((p) => p.id !== id));
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
      setMessage(mapPluginError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!storeAccess) {
    return (
      <div className="settings-stack settings-stack--proxmux">
        <header className="proxmux-settings-page-head">
          <div className="proxmux-settings-page-head-row">
            <h3 className="proxmux-settings-page-title">PROXMUX</h3>
            <SettingsHelpHint
              topic="PROXMUX license"
              description="Proxmox VE inventory via the official API. Requires a license entitlement: Settings → Plugins → activate a token, then return here."
            />
          </div>
          <p className="proxmux-settings-page-sub">Add-on not included in your current license.</p>
          {loadError ? <p className="error-text">{loadError}</p> : null}
        </header>
      </div>
    );
  }

  if (!proxmuxPlugin?.entitlementOk) {
    return (
      <div className="settings-stack settings-stack--proxmux">
        <header className="proxmux-settings-page-head">
          <div className="proxmux-settings-page-head-row">
            <h3 className="proxmux-settings-page-title">PROXMUX</h3>
            <SettingsHelpHint
              topic="Proxmox entitlement"
              description="Activate a license token that includes the Proxmox entitlement under Settings → Plugins."
            />
          </div>
          <p className="proxmux-settings-page-sub">This license does not include the Proxmox entitlement.</p>
        </header>
      </div>
    );
  }

  if (!proxmuxPlugin.enabled) {
    return (
      <div className="settings-stack settings-stack--proxmux">
        <header className="proxmux-settings-page-head">
          <div className="proxmux-settings-page-head-row">
            <h3 className="proxmux-settings-page-title">PROXMUX</h3>
            <SettingsHelpHint topic="Enable PROXMUX" description="Turn on the built-in plugin to load clusters and use the Proxmox sidebar." />
          </div>
          <p className="proxmux-settings-page-sub">The plugin is off.</p>
        </header>
        <div className="settings-actions-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onEnablePlugin()}>
            Enable PROXMUX
          </button>
        </div>
        {message ? <p className="proxmux-settings-status">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="settings-stack settings-stack--proxmux">
      <header className="proxmux-settings-page-head">
        <div className="proxmux-settings-page-head-row">
          <h3 className="proxmux-settings-page-title">PROXMUX</h3>
          <SettingsHelpHint
            topic="PROXMUX"
            description="Clusters: API login and TLS. Network: HTTP proxy. Sidebar: in-app consoles and a manual inventory refresh for debugging."
          />
        </div>
        {loadError ? <p className="error-text">{loadError}</p> : null}
      </header>

      <div className="app-settings-subtabs" role="tablist" aria-label="PROXMUX sections">
        {PROXMUX_SETTINGS_SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={proxmuxSubTab === tab.id}
            className={`settings-tab settings-subtab ${proxmuxSubTab === tab.id ? "is-active" : ""}`}
            onClick={() => setProxmuxSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="proxmux-settings-tab-panel">
        {proxmuxSubTab === "clusters" ? (
          <section className="settings-card">
            <header className="settings-card-head">
              <div className="settings-card-head-row">
                <h4>Clusters</h4>
                <SettingsHelpHint
                  topic="Proxmox clusters"
                  description="Sign in with user@realm and password; optional TOTP. Set a cluster active for the sidebar. Use Allow insecure TLS only for self-signed lab hosts."
                />
              </div>
            </header>
            {state?.usesPlainSecrets ? (
              <div className="proxmux-settings-banner proxmux-settings-banner--warn" role="status">
                Plaintext secrets in <code className="inline-code">nosuckshell.proxmux.v1.json</code>. Set{" "}
                <code className="inline-code">NOSUCKSHELL_MASTER_KEY</code> or add <code className="inline-code">nosuckshell.master.key</code> in your SSH
                directory to encrypt them.
              </div>
            ) : null}
            {(state?.legacyTokenClusters ?? 0) > 0 ? (
              <div className="proxmux-settings-banner proxmux-settings-banner--warn" role="status">
                {state?.legacyTokenClusters} cluster{state?.legacyTokenClusters === 1 ? "" : "s"} still use legacy API tokens. Open each, enter a password, and
                save to migrate.
              </div>
            ) : null}

            <div className="proxmux-settings-clusters-split">
              <div className="proxmux-settings-clusters-col">
                <h5 className="proxmux-settings-col-title">Saved</h5>
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
                          <div className="muted-copy">Proxy: {clusterProxyLabel(c.proxyId, state?.proxyProfiles ?? [])}</div>
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
                  <p className="muted-copy">No clusters yet.</p>
                )}
              </div>

              <div className="proxmux-settings-clusters-col">
                <h5 className="proxmux-settings-col-title">{draftId ? "Edit cluster" : "Add cluster"}</h5>
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
                <label className="settings-field settings-field-span-2 settings-field--inline">
                  <input type="checkbox" checked={draftInsecure} onChange={(e) => setDraftInsecure(e.target.checked)} disabled={busy} />
                  <span>Allow insecure TLS (self-signed)</span>
                </label>
                <label className="settings-field settings-field-span-2">
                  <span className="field-label-inline-hint">
                    Trusted TLS certificate (PEM)
                    <SettingsHelpHint
                      topic="Trusted TLS certificate"
                      description="Optional. Fetch from server saves the peer chain and a leaf fingerprint so you can spot certificate rotation. With a stored PEM, TLS verification is relaxed for this cluster (same practical trust as Allow insecure TLS, but you keep the PEM and fingerprint for clarity). Clear the field to remove."
                    />
                  </span>
                  <div className="settings-actions-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-settings-tool"
                      disabled={busy || (!draftUrl.trim() && !draftId)}
                      onClick={() => void onFetchTlsCertificate()}
                    >
                      Fetch from server
                    </button>
                    {draftTlsLeafSha256 ? (
                      <span className="muted-copy">
                        SHA-256: {draftTlsLeafSha256.slice(0, 16)}…{draftTlsLeafSha256.slice(-12)}
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    className="input ssh-config-textarea"
                    rows={5}
                    value={draftTlsCertPem}
                    onChange={(e) => setDraftTlsCertPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    disabled={busy}
                    spellCheck={false}
                  />
                </label>
                <label className="settings-field settings-field-span-2">
                  <span className="field-label-inline-hint">
                    HTTP proxy for this cluster
                    <SettingsHelpHint
                      topic="Cluster HTTP proxy"
                      description="Named profiles are configured on the Network tab. Global default uses the default proxy URL there."
                    />
                  </span>
                  <select className="input" value={draftClusterProxy} onChange={(e) => setDraftClusterProxy(e.target.value)} disabled={busy}>
                    <option value="">Global default</option>
                    <option value="direct">Direct (no proxy)</option>
                    {draftProxyProfiles.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.isEnabled}>
                        {p.name || p.id}
                        {!p.isEnabled ? " (disabled)" : ""}
                      </option>
                    ))}
                  </select>
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
              </div>
            </div>
          </section>
        ) : null}

        {proxmuxSubTab === "network" ? (
          <section className="settings-card">
            <header className="settings-card-head">
              <div className="settings-card-head-row">
                <h4>Network</h4>
                <SettingsHelpHint
                  topic="HTTP proxy"
                  description="Optional corporate proxy. Saved cluster host URLs are added to the bypass list automatically. Add extra bypass patterns (e.g. .lan) if needed."
                />
              </div>
            </header>

            <h5 className="proxmux-settings-subheading">Default</h5>
            <div className="settings-form-grid">
              <label className="settings-field settings-field-span-2">
                <span className="field-label-inline-hint">
                  HTTP(S) proxy URL
                  <SettingsHelpHint
                    topic="HTTP(S) proxy URL"
                    description="Leave empty for a direct connection. Authentication: include user and password in the URL if required."
                  />
                </span>
                <input
                  className="input"
                  type="url"
                  autoComplete="off"
                  placeholder="http://proxy.company.example:8080"
                  value={draftHttpProxy}
                  onChange={(e) => setDraftHttpProxy(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="settings-field settings-field-span-2">
                <span className="field-label-inline-hint">
                  No proxy (bypass)
                  <SettingsHelpHint
                    topic="No proxy bypass list"
                    description="Optional extra bypass list (comma-separated). Cluster hosts from saved URLs are merged in automatically when a proxy is set."
                  />
                </span>
                <input
                  className="input"
                  type="text"
                  autoComplete="off"
                  placeholder="localhost, 127.0.0.1, .lan, *.internal"
                  value={draftNoProxy}
                  onChange={(e) => setDraftNoProxy(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="settings-actions-row">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSaveProxySettings()}>
                Save defaults
              </button>
            </div>

            <hr className="proxmux-settings-section-divider" />

            <h5 className="proxmux-settings-subheading">
              Named profiles
              <SettingsHelpHint
                topic="Named proxy profiles"
                description="Optional extra proxies; enable or disable without deleting. Assign a profile per cluster on the Clusters tab, or use Global default / Direct."
              />
            </h5>
            <div className="proxmux-settings-proxy-profiles-stack">
              {draftProxyProfiles.map((row, idx) => (
                <div key={row.id} className="settings-form-grid proxmux-proxy-profile-card">
                  <label className="settings-field">
                    <span>Name</span>
                    <input
                      className="input"
                      value={row.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftProxyProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)));
                      }}
                      disabled={busy}
                    />
                  </label>
                  <label className="settings-field settings-field-span-2">
                    <span>HTTP(S) URL</span>
                    <input
                      className="input"
                      type="url"
                      placeholder="http://proxy.example:8080"
                      value={row.url}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftProxyProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, url: v } : p)));
                      }}
                      disabled={busy}
                    />
                  </label>
                  <label className="settings-field settings-field-span-2">
                    <span>Extra no-proxy (optional)</span>
                    <input
                      className="input"
                      placeholder="Comma-separated; merged with global bypass + cluster hosts"
                      value={row.noProxyExtra}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftProxyProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, noProxyExtra: v } : p)));
                      }}
                      disabled={busy}
                    />
                  </label>
                  <label className="settings-field settings-field--inline">
                    <input
                      type="checkbox"
                      checked={row.isEnabled}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setDraftProxyProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, isEnabled: v } : p)));
                      }}
                      disabled={busy}
                    />
                    <span>Enabled</span>
                  </label>
                  <div className="settings-field proxmux-proxy-profile-card__actions">
                    <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={() => removeProxyProfileRow(row.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="settings-actions-row">
              <button type="button" className="btn btn-settings-tool" disabled={busy} onClick={addProxyProfileRow}>
                Add profile
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSaveProxyProfiles()}>
                Save profiles
              </button>
            </div>
          </section>
        ) : null}

        {proxmuxSubTab === "sidebar" ? (
          <>
            <section className="settings-card">
              <header className="settings-card-head">
                <div className="settings-card-head-row">
                  <h4>Web consoles</h4>
                  <SettingsHelpHint
                    topic="Web consoles"
                    description="By default, noVNC and web shells open inside the app (iframe). If a page blocks embedding, use Open in app window on the pane toolbar. Turn off to always use the system browser."
                  />
                </div>
              </header>
              <label className="settings-field settings-field-span-2 settings-field--inline">
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
                <div className="settings-card-head-row">
                  <h4>Inventory</h4>
                  <SettingsHelpHint topic="Inventory" description="Calls /cluster/resources (nodes, QEMU, LXC) for the selected cluster." />
                </div>
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
          </>
        ) : null}
      </div>

      {message ? <p className="proxmux-settings-status">{message}</p> : null}
    </div>
  );
}
