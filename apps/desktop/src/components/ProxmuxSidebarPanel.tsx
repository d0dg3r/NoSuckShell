import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { pluginInvoke } from "../tauri-api";
import { PROXMUX_PLUGIN_ID } from "../features/builtin-plugin-ids";
import { buildProxmoxConsoleUrl } from "../features/proxmox-console-urls";

type ProxmuxClusterRow = {
  id: string;
  name: string;
  proxmoxUrl: string;
};

type ListStateResponse = {
  activeClusterId: string | null;
  clusters: ProxmuxClusterRow[];
  favoritesByCluster?: Record<string, string[]>;
};

type ResourceRow = Record<string, unknown>;

function rowText(row: ResourceRow): string {
  const parts = [row.type, row.vmid, row.name, row.node, row.status].map((v) => (v == null ? "" : String(v)));
  return parts.join(" ").toLowerCase();
}

function guestKey(row: ResourceRow): string {
  const t = String(row.type ?? "");
  const vmid = row.vmid != null ? String(row.vmid) : "";
  const node = row.node != null ? String(row.node) : "";
  return `${t}:${node}:${vmid}`;
}

/** Parses `guestKey` values (`type:node:vmid`). Node may contain `:`, so use first/last colon. */
function parseGuestKey(key: string): { guestType: "qemu" | "lxc"; node: string; vmid: string } | null {
  const first = key.indexOf(":");
  const last = key.lastIndexOf(":");
  if (first <= 0 || last <= first) return null;
  const rawType = key.slice(0, first);
  const node = key.slice(first + 1, last);
  const vmid = key.slice(last + 1);
  const guestType = rawType.toLowerCase();
  if (guestType !== "qemu" && guestType !== "lxc") return null;
  if (!node || !vmid) return null;
  return { guestType: guestType as "qemu" | "lxc", node, vmid };
}

function formatBytes(n: unknown): string | null {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v) || v < 0) return null;
  const u = ["B", "KiB", "MiB", "GiB", "TiB"];
  let x = v;
  let i = 0;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : x >= 100 ? 0 : x >= 10 ? 1 : 2;
  return `${x.toFixed(digits)} ${u[i]}`;
}

function formatUptimeSeconds(sec: unknown): string | null {
  const s = typeof sec === "number" ? sec : typeof sec === "string" ? Number(sec) : NaN;
  if (!Number.isFinite(s) || s < 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function formatCpu(cpu: unknown): string | null {
  if (typeof cpu !== "number" || !Number.isFinite(cpu)) return null;
  if (cpu >= 0 && cpu <= 1) return `${(cpu * 100).toFixed(1)}%`;
  return `${cpu.toFixed(2)}`;
}

function guestStatusRunning(data: Record<string, unknown>): boolean {
  return String(data.status ?? "").toLowerCase() === "running";
}

function guestQemuPaused(data: Record<string, unknown>, guestType: string): boolean {
  if (guestType !== "qemu") return false;
  const q = String(data.qmpstatus ?? "").toLowerCase();
  return q === "paused";
}

function isGuestRow(row: ResourceRow): boolean {
  const t = String(row.type ?? "").toLowerCase();
  return t === "qemu" || t === "lxc";
}

/** Stable favorite / API key: `node:{name}` or `guestKey` for qemu/lxc. */
function proxmuxResourceKey(row: ResourceRow): string | null {
  const t = String(row.type ?? "").toLowerCase();
  if (t === "node") {
    const node = row.node != null ? String(row.node) : "";
    return node ? `node:${node}` : null;
  }
  if (t === "qemu" || t === "lxc") {
    return guestKey(row);
  }
  return null;
}

function rowIsUp(row: ResourceRow): boolean {
  const s = String(row.status ?? "").toLowerCase();
  if (String(row.type ?? "").toLowerCase() === "node") {
    return s === "online";
  }
  return s === "running";
}

/** Proxmox cluster resources mark QEMU templates with `template` truthy / 1. */
function rowIsQemuTemplate(row: ResourceRow): boolean {
  const v = row.template;
  if (v === true || v === 1) return true;
  if (typeof v === "number" && v !== 0) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  }
  return false;
}

export type ProxmuxRowCategory = "node" | "qemu" | "qemu-template" | "lxc";

/** Row tint category for styling (templates are still `type: qemu` in the API). */
export function proxmuxCategory(row: ResourceRow): ProxmuxRowCategory {
  const t = String(row.type ?? "").toLowerCase();
  if (t === "node") return "node";
  if (t === "lxc") return "lxc";
  if (t === "qemu") return rowIsQemuTemplate(row) ? "qemu-template" : "qemu";
  return "node";
}

/** Power / health strip: templates use neutral styling, not red "stopped". */
export type ProxmuxRowPower = "up" | "down" | "template";

export function proxmuxPower(row: ResourceRow): ProxmuxRowPower {
  if (proxmuxCategory(row) === "qemu-template") return "template";
  return rowIsUp(row) ? "up" : "down";
}

export type ProxmuxSidebarPanelProps = {
  searchQuery: string;
  onResourceCountChange: (count: number) => void;
  /** Open an SSH session to the PVE node hostname in a new pane (in-app). */
  onSshToProxmoxNode?: (ctx: { clusterId: string; node: string }) => void | Promise<void>;
  /** Open a Proxmox web console URL in the system browser. */
  onOpenProxmoxExternalUrl?: (url: string) => void | Promise<void>;
  /** Fetch SPICE proxy via plugin and open a virt-viewer file (handled in App / shell). */
  onOpenProxmoxSpice?: (ctx: { clusterId: string; node: string; vmid: string }) => void | Promise<void>;
};

function stopRowEvent(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
  if ("preventDefault" in e) e.preventDefault();
}

export function ProxmuxSidebarPanel({
  searchQuery,
  onResourceCountChange,
  onSshToProxmoxNode,
  onOpenProxmoxExternalUrl,
  onOpenProxmoxSpice,
}: ProxmuxSidebarPanelProps) {
  const [clusters, setClusters] = useState<ProxmuxClusterRow[]>([]);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  /** Expanded VM/CT row (`guestKey`); empty when none. */
  const [expandedGuestKey, setExpandedGuestKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guestStatus, setGuestStatus] = useState<Record<string, unknown> | null>(null);
  const [guestDetailError, setGuestDetailError] = useState("");
  const [guestStatusLoading, setGuestStatusLoading] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const guestStatusReq = useRef(0);
  const [favoritesByCluster, setFavoritesByCluster] = useState<Record<string, string[]>>({});
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [spiceBusyKey, setSpiceBusyKey] = useState<string | null>(null);

  const expandedGuestParsed = useMemo(
    () => (expandedGuestKey ? parseGuestKey(expandedGuestKey) : null),
    [expandedGuestKey],
  );

  const refreshClusters = useCallback(async () => {
    setLoadError("");
    try {
      const raw = await pluginInvoke(PROXMUX_PLUGIN_ID, "listState", {});
      const parsed = raw as ListStateResponse;
      const list = parsed.clusters ?? [];
      setFavoritesByCluster(parsed.favoritesByCluster ?? {});
      setClusters(list);
      setClusterId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        if (parsed.activeClusterId && list.some((c) => c.id === parsed.activeClusterId)) {
          return parsed.activeClusterId;
        }
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setClusters([]);
      setClusterId(null);
      setFavoritesByCluster({});
    }
  }, []);

  useEffect(() => {
    void refreshClusters();
  }, [refreshClusters]);

  const fetchResources = useCallback(async () => {
    if (!clusterId) {
      setResources([]);
      return;
    }
    setBusy(true);
    setLoadError("");
    try {
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchResources", {
        clusterId,
      })) as { ok?: boolean; resources?: ResourceRow[] };
      setResources(out.resources ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setResources([]);
    } finally {
      setBusy(false);
    }
  }, [clusterId]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    setExpandedGuestKey("");
  }, [clusterId]);

  useEffect(() => {
    if (!expandedGuestKey) return;
    const exists = resources.some((r) => guestKey(r) === expandedGuestKey);
    if (!exists) setExpandedGuestKey("");
  }, [resources, expandedGuestKey]);

  const loadGuestStatus = useCallback(async (opts?: { silent?: boolean }) => {
    if (!clusterId || !expandedGuestParsed) {
      setGuestStatus(null);
      setGuestDetailError("");
      return;
    }
    const my = ++guestStatusReq.current;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setGuestStatusLoading(true);
    }
    setGuestDetailError("");
    try {
      const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "guestStatus", {
        clusterId,
        node: expandedGuestParsed.node,
        guestType: expandedGuestParsed.guestType,
        vmid: expandedGuestParsed.vmid,
      })) as { ok?: boolean; data?: Record<string, unknown> };
      if (my !== guestStatusReq.current) return;
      if (out.ok && out.data != null && typeof out.data === "object" && !Array.isArray(out.data)) {
        setGuestStatus(out.data as Record<string, unknown>);
      } else {
        setGuestStatus(null);
        setGuestDetailError("Unexpected guest status response.");
      }
    } catch (e) {
      if (my !== guestStatusReq.current) return;
      setGuestStatus(null);
      setGuestDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === guestStatusReq.current && !silent) {
        setGuestStatusLoading(false);
      }
    }
  }, [clusterId, expandedGuestParsed]);

  useEffect(() => {
    if (!clusterId || !expandedGuestParsed) {
      guestStatusReq.current += 1;
      setGuestStatus(null);
      setGuestDetailError("");
      setGuestStatusLoading(false);
      return;
    }
    void loadGuestStatus();
  }, [clusterId, expandedGuestParsed, loadGuestStatus]);

  useEffect(() => {
    if (!clusterId || !expandedGuestParsed) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadGuestStatus({ silent: true });
    }, 4000);
    return () => clearInterval(id);
  }, [clusterId, expandedGuestParsed, loadGuestStatus]);

  const runPowerAction = useCallback(
    async (action: string) => {
      if (!clusterId || !expandedGuestParsed) return;
      setPowerBusy(true);
      setGuestDetailError("");
      try {
        await pluginInvoke(PROXMUX_PLUGIN_ID, "guestPower", {
          clusterId,
          node: expandedGuestParsed.node,
          guestType: expandedGuestParsed.guestType,
          vmid: expandedGuestParsed.vmid,
          action,
        });
        await loadGuestStatus();
      } catch (e) {
        setGuestDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setPowerBusy(false);
      }
    },
    [clusterId, expandedGuestParsed, loadGuestStatus],
  );

  const favoriteSet = useMemo(() => {
    if (!clusterId) return new Set<string>();
    return new Set(favoritesByCluster[clusterId] ?? []);
  }, [clusterId, favoritesByCluster]);

  const toggleProxmuxFavorite = useCallback(
    async (resourceKey: string) => {
      if (!clusterId) return;
      try {
        const out = (await pluginInvoke(PROXMUX_PLUGIN_ID, "toggleProxmuxFavorite", {
          clusterId,
          resourceKey,
        })) as { ok?: boolean; favorites?: string[] };
        if (out.ok && Array.isArray(out.favorites)) {
          setFavoritesByCluster((prev) => ({ ...prev, [clusterId]: out.favorites as string[] }));
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [clusterId],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredResources = useMemo(() => {
    let rows = resources;
    if (normalizedSearch) {
      rows = rows.filter((row) => rowText(row).includes(normalizedSearch));
    }
    if (favoritesOnly && clusterId) {
      rows = rows.filter((row) => {
        const k = proxmuxResourceKey(row);
        return k != null && favoriteSet.has(k);
      });
    }
    return rows;
  }, [resources, normalizedSearch, favoritesOnly, clusterId, favoriteSet]);

  useEffect(() => {
    onResourceCountChange(filteredResources.length);
  }, [filteredResources.length, onResourceCountChange]);

  const grouped = useMemo(() => {
    const nodes = filteredResources.filter((r) => r.type === "node");
    const qemus = filteredResources.filter((r) => r.type === "qemu");
    const lxcs = filteredResources.filter((r) => r.type === "lxc");
    return [
      { title: "Nodes", rows: nodes },
      { title: "Virtual machines", rows: qemus },
      { title: "Containers", rows: lxcs },
    ];
  }, [filteredResources]);

  const powerDisabled = powerBusy || busy;
  const guestMemLine =
    guestStatus &&
    (() => {
      const mem = formatBytes(guestStatus.mem);
      const max = formatBytes(guestStatus.maxmem);
      if (mem && max) return `${mem} / ${max}`;
      if (max) return `n/a / ${max}`;
      if (mem) return mem;
      return null;
    })();
  const guestStatusLine =
    guestStatus &&
    (() => {
      const main = String(guestStatus.status ?? "").trim() || "n/a";
      if (expandedGuestParsed?.guestType !== "qemu") return main;
      const qmp = String(guestStatus.qmpstatus ?? "").trim();
      if (qmp && qmp.toLowerCase() !== main.toLowerCase()) return `${main} (${qmp})`;
      return main;
    })();

  const toggleGuestRow = useCallback((gk: string) => {
    setExpandedGuestKey((prev) => (prev === gk ? "" : gk));
  }, []);

  const activeCluster = useMemo(
    () => clusters.find((c) => c.id === clusterId) ?? null,
    [clusters, clusterId],
  );
  const proxmoxBaseUrl = activeCluster?.proxmoxUrl ?? "";

  const runOpenUrl = useCallback(
    async (url: string) => {
      if (!onOpenProxmoxExternalUrl) return;
      try {
        await onOpenProxmoxExternalUrl(url);
      } catch {
        /* App surfaces errors */
      }
    },
    [onOpenProxmoxExternalUrl],
  );

  const runSpice = useCallback(
    async (node: string, vmid: string) => {
      if (!clusterId || !onOpenProxmoxSpice) return;
      const key = `${node}:${vmid}`;
      setSpiceBusyKey(key);
      try {
        await onOpenProxmoxSpice({ clusterId, node, vmid });
      } finally {
        setSpiceBusyKey((k) => (k === key ? null : k));
      }
    },
    [clusterId, onOpenProxmoxSpice],
  );

  function rowActionStrip(row: ResourceRow) {
    const spacer = () => <span className="proxmux-sidebar-actions-spacer" aria-hidden />;
    if (!clusterId || !proxmoxBaseUrl) {
      return spacer();
    }
    const cat = proxmuxCategory(row);
    const node = row.node != null ? String(row.node) : "";
    const vmid = row.vmid != null ? String(row.vmid) : "";
    const running = rowIsUp(row);
    const spiceKey = `${node}:${vmid}`;
    const spiceBusy = spiceBusyKey === spiceKey;

    if (cat === "qemu-template") {
      return spacer();
    }

    if (cat === "node") {
      if (!onSshToProxmoxNode && !onOpenProxmoxExternalUrl) {
        return spacer();
      }
      if (!node) return spacer();
      return (
        <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
          {onSshToProxmoxNode ? (
            <button
              type="button"
              className="proxmux-action-btn proxmux-action-ssh"
              title="Open SSH session in a new pane"
              aria-label="Open SSH session in a new pane"
              onClick={(e) => {
                stopRowEvent(e);
                void onSshToProxmoxNode({ clusterId, node });
              }}
            >
              SSH
            </button>
          ) : null}
          {onOpenProxmoxExternalUrl ? (
            <button
              type="button"
              className="proxmux-action-btn proxmux-action-shell"
              title="Open Proxmox node shell in browser"
              aria-label="Open Proxmox node shell in browser"
              onClick={(e) => {
                stopRowEvent(e);
                void runOpenUrl(buildProxmoxConsoleUrl(proxmoxBaseUrl, { kind: "node", node }));
              }}
            >
              Shell
            </button>
          ) : null}
        </div>
      );
    }

    if (cat === "qemu") {
      if (!running || (!onOpenProxmoxExternalUrl && !onOpenProxmoxSpice) || !node || !vmid) {
        return spacer();
      }
      return (
        <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
          {onOpenProxmoxExternalUrl ? (
            <button
              type="button"
              className="proxmux-action-btn proxmux-action-novnc"
              title="Open noVNC in browser"
              aria-label="Open noVNC in browser"
              onClick={(e) => {
                stopRowEvent(e);
                void runOpenUrl(buildProxmoxConsoleUrl(proxmoxBaseUrl, { kind: "qemu", node, vmid }));
              }}
            >
              VNC
            </button>
          ) : null}
          {onOpenProxmoxSpice ? (
            <button
              type="button"
              className="proxmux-action-btn proxmux-action-spice"
              disabled={spiceBusy}
              title="Open SPICE console (virt-viewer)"
              aria-label="Open SPICE console"
              onClick={(e) => {
                stopRowEvent(e);
                void runSpice(node, vmid);
              }}
            >
              {spiceBusy ? "…" : "SPICE"}
            </button>
          ) : null}
        </div>
      );
    }

    if (cat === "lxc") {
      if (!onOpenProxmoxExternalUrl || !node || !vmid) {
        return spacer();
      }
      return (
        <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="proxmux-action-btn proxmux-action-shell"
            disabled={!running}
            title={
              running ? "Open container console in browser" : "Start the container to open the console"
            }
            aria-label="Open LXC console in browser"
            onClick={(e) => {
              stopRowEvent(e);
              if (!running) return;
              void runOpenUrl(buildProxmoxConsoleUrl(proxmoxBaseUrl, { kind: "lxc", node, vmid }));
            }}
          >
            Shell
          </button>
        </div>
      );
    }

    return spacer();
  }

  if (clusters.length === 0 && !loadError) {
    return (
      <div className="proxmux-sidebar-panel">
        <div className="empty-pane">
          <p>No Proxmox clusters</p>
          <span>Add a cluster under Settings → PROXMUX.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="proxmux-sidebar-panel">
      {loadError ? <p className="error-text proxmux-sidebar-error">{loadError}</p> : null}
      <div className="proxmux-sidebar-toolbar">
        <label className="proxmux-sidebar-cluster-label">
          <span className="proxmux-sidebar-field-label">Cluster</span>
          <select
            className="input proxmux-sidebar-cluster-select"
            value={clusterId ?? ""}
            onChange={(e) => setClusterId(e.target.value || null)}
            disabled={busy || clusters.length === 0}
            aria-label="Proxmox cluster"
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn btn-settings-tool ${favoritesOnly ? "btn-primary" : ""}`}
          disabled={!clusterId}
          onClick={() => setFavoritesOnly((v) => !v)}
          title={favoritesOnly ? "Show all resources" : "Show favorites only"}
          aria-pressed={favoritesOnly}
        >
          Favorites
        </button>
        <button
          type="button"
          className="btn btn-settings-tool proxmux-sidebar-refresh"
          disabled={busy || !clusterId}
          onClick={() => void fetchResources()}
          title="Refresh inventory"
        >
          Refresh
        </button>
      </div>
      {busy && resources.length === 0 ? (
        <p className="muted-copy proxmux-sidebar-loading">Loading…</p>
      ) : null}
      <div className="proxmux-sidebar-scroll host-list-scroll" role="region" aria-label="Proxmox inventory">
        {grouped.every((g) => g.rows.length === 0) && !busy ? (
          <div className="empty-pane">
            <p>No resources</p>
            <span>{normalizedSearch ? "Try a different search." : "This cluster returned no nodes, VMs, or containers."}</span>
          </div>
        ) : (
          grouped
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <section key={section.title} className="proxmux-sidebar-section">
                <p className="host-list-section-title">{section.title}</p>
                <ul className="proxmux-sidebar-rows">
                  {section.rows.map((row, idx) => {
                    const vmid = row.vmid != null ? String(row.vmid) : "";
                    const name = row.name != null ? String(row.name) : "";
                    const node = row.node != null ? String(row.node) : "";
                    const status = row.status != null ? String(row.status) : "";
                    const rowKey = `${String(row.type)}-${vmid || name || idx}-${node}-${idx}`;
                    const gk = guestKey(row);
                    const guest = isGuestRow(row);
                    const expanded = guest && expandedGuestKey === gk;
                    const rk = proxmuxResourceKey(row);
                    const category = proxmuxCategory(row);
                    const power = proxmuxPower(row);
                    const isFav = rk != null && favoriteSet.has(rk);

                    return (
                      <li
                        key={rowKey}
                        className={`proxmux-sidebar-row-wrap${guest && expanded ? " proxmux-sidebar-row-wrap--expanded" : ""}`}
                        data-proxmux-category={category}
                        data-proxmux-power={power}
                        data-proxmux-favorite={isFav ? "true" : "false"}
                      >
                        <div className="proxmux-sidebar-item-shell">
                          {rk ? (
                            <button
                              type="button"
                              className={`proxmux-sidebar-favorite-btn ${isFav ? "is-active" : ""}`}
                              aria-label={isFav ? "Remove from PROXMUX favorites" : "Add to PROXMUX favorites"}
                              title={isFav ? "Remove favorite" : "Favorite"}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleProxmuxFavorite(rk);
                              }}
                            >
                              ★
                            </button>
                          ) : (
                            <span className="proxmux-sidebar-favorite-spacer" aria-hidden="true" />
                          )}
                          <div
                            className={`proxmux-sidebar-row ${guest ? "proxmux-sidebar-row--guest" : "proxmux-sidebar-row--node"} ${expanded ? "is-expanded" : ""}`}
                            role={guest ? "button" : undefined}
                            tabIndex={guest ? 0 : undefined}
                            aria-expanded={guest ? expanded : undefined}
                            onClick={
                              guest
                                ? () => {
                                    toggleGuestRow(gk);
                                  }
                                : undefined
                            }
                            onKeyDown={
                              guest
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      toggleGuestRow(gk);
                                    }
                                  }
                                : undefined
                            }
                          >
                            <span className="proxmux-sidebar-row-main">{name || vmid || node || "—"}</span>
                            <span className="proxmux-sidebar-row-meta">
                              {guest ? (
                                <span className="proxmux-sidebar-row-chevron" aria-hidden="true">
                                  {expanded ? "▾" : "▸"}
                                </span>
                              ) : null}
                              {vmid ? `VMID ${vmid}` : ""}
                              {vmid && node ? " · " : ""}
                              {node ? node : ""}
                              {status ? ` · ${status}` : ""}
                            </span>
                          </div>
                          {rowActionStrip(row)}
                        </div>
                        {guest ? (
                          <div className={`host-slide-menu proxmux-guest-slide ${expanded ? "is-open" : ""}`}>
                            {expanded ? (
                              <div className="host-slide-content">
                                <div className="proxmux-sidebar-guest-detail proxmux-sidebar-guest-detail--embedded">
                                  {!expandedGuestParsed ? (
                                    <p className="error-text proxmux-sidebar-guest-detail-error">
                                      Could not parse this guest. Try refreshing the inventory.
                                    </p>
                                  ) : (
                                    <>
                                      <p className="proxmux-sidebar-guest-detail-head">
                                        <span className="proxmux-sidebar-guest-detail-title">Guest</span>
                                        <span className="proxmux-sidebar-guest-detail-id">
                                          {expandedGuestParsed.guestType.toUpperCase()} {expandedGuestParsed.vmid} ·{" "}
                                          {expandedGuestParsed.node}
                                        </span>
                                      </p>
                                      {guestStatusLoading && !guestStatus ? (
                                        <p className="muted-copy proxmux-sidebar-guest-detail-loading">Loading status…</p>
                                      ) : null}
                                      {guestStatus ? (
                                        <dl className="proxmux-sidebar-guest-stats">
                                          {guestStatusLine ? (
                                            <>
                                              <dt>Status</dt>
                                              <dd>{guestStatusLine}</dd>
                                            </>
                                          ) : null}
                                          {formatUptimeSeconds(guestStatus.uptime) ? (
                                            <>
                                              <dt>Uptime</dt>
                                              <dd>{formatUptimeSeconds(guestStatus.uptime)}</dd>
                                            </>
                                          ) : null}
                                          {formatCpu(guestStatus.cpu) ? (
                                            <>
                                              <dt>CPU</dt>
                                              <dd>{formatCpu(guestStatus.cpu)}</dd>
                                            </>
                                          ) : null}
                                          {guestMemLine ? (
                                            <>
                                              <dt>Memory</dt>
                                              <dd>{guestMemLine}</dd>
                                            </>
                                          ) : null}
                                        </dl>
                                      ) : null}
                                      {guestStatus ? (
                                        <div
                                          className="proxmux-sidebar-guest-actions"
                                          role="group"
                                          aria-label="Guest power actions"
                                        >
                                          {(() => {
                                            const running = guestStatusRunning(guestStatus);
                                            const paused = guestQemuPaused(guestStatus, expandedGuestParsed.guestType);
                                            if (paused) {
                                              return (
                                                <button
                                                  type="button"
                                                  className="btn btn-settings-tool"
                                                  disabled={powerDisabled}
                                                  onClick={() => void runPowerAction("resume")}
                                                >
                                                  Resume
                                                </button>
                                              );
                                            }
                                            if (!running) {
                                              return (
                                                <button
                                                  type="button"
                                                  className="btn btn-settings-tool"
                                                  disabled={powerDisabled}
                                                  onClick={() => void runPowerAction("start")}
                                                >
                                                  Start
                                                </button>
                                              );
                                            }
                                            return (
                                              <>
                                                <button
                                                  type="button"
                                                  className="btn btn-settings-tool"
                                                  disabled={powerDisabled}
                                                  onClick={() => void runPowerAction("shutdown")}
                                                >
                                                  Shutdown
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn btn-settings-tool"
                                                  disabled={powerDisabled}
                                                  onClick={() => {
                                                    if (
                                                      !window.confirm(
                                                        "Force-stop this guest immediately? Unsaved data in the guest may be lost.",
                                                      )
                                                    ) {
                                                      return;
                                                    }
                                                    void runPowerAction("stop");
                                                  }}
                                                >
                                                  Stop
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn btn-settings-tool"
                                                  disabled={powerDisabled}
                                                  onClick={() => void runPowerAction("reboot")}
                                                >
                                                  Reboot
                                                </button>
                                                {expandedGuestParsed.guestType === "qemu" ? (
                                                  <button
                                                    type="button"
                                                    className="btn btn-settings-tool"
                                                    disabled={powerDisabled}
                                                    onClick={() => void runPowerAction("pause")}
                                                  >
                                                    Pause
                                                  </button>
                                                ) : null}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      ) : null}
                                      {guestDetailError ? (
                                        <p className="error-text proxmux-sidebar-guest-detail-error">{guestDetailError}</p>
                                      ) : null}
                                      {guestDetailError && expandedGuestParsed ? (
                                        <button
                                          type="button"
                                          className="btn btn-settings-tool"
                                          disabled={powerBusy || busy}
                                          onClick={() => void loadGuestStatus()}
                                        >
                                          Retry status
                                        </button>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
        )}
      </div>
    </div>
  );
}
