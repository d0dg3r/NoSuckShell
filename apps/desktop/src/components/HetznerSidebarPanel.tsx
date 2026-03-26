import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { pluginInvoke } from "../tauri-api";
import { InlineSpinner } from "./InlineSpinner";
import { HETZNER_PLUGIN_ID } from "../features/builtin-plugin-ids";
import type { HetznerListStateResponse, HetznerProjectRow, HetznerServerRow } from "../types";

const RESOURCE_TTL_MS = 9_000;
const SERVER_POLL_BASELINE_MS = 5_000;
const SERVER_POLL_JITTER_MS = 1_200;

type TimedCacheEntry<T> = {
  value: T;
  fetchedAt: number;
};

function isSufficientlyFresh(fetchedAt: number, ttlMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return false;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  return now - fetchedAt <= ttlMs;
}

function computeAdaptivePollDelayMs(randomValue = Math.random()): number {
  const clamped = Math.min(1, Math.max(0, randomValue));
  return SERVER_POLL_BASELINE_MS + Math.round(clamped * SERVER_POLL_JITTER_MS);
}

function shouldRunPollTick(
  appVisible: boolean,
  docVisibility: DocumentVisibilityState | string,
): boolean {
  return appVisible && docVisibility === "visible";
}

function formatBytes(gb: number): string {
  if (!Number.isFinite(gb) || gb < 0) return "—";
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TiB`;
  return `${gb} GB`;
}

function stopRowEvent(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
  if ("preventDefault" in e) e.preventDefault();
}

export type HetznerSidebarPanelProps = {
  searchQuery: string;
  onResourceCountChange: (count: number) => void;
  onSshToServer?: (ctx: { ip: string; name: string }) => void | Promise<void>;
  onOpenHetznerVncInPane?: (ctx: {
    projectId: string;
    serverId: string;
    serverName: string;
  }) => void | Promise<void>;
};

export function HetznerSidebarPanel({
  searchQuery,
  onResourceCountChange,
  onSshToServer,
  onOpenHetznerVncInPane,
}: HetznerSidebarPanelProps) {
  const [projects, setProjects] = useState<HetznerProjectRow[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [resources, setResources] = useState<HetznerServerRow[]>([]);
  const [appVisible, setAppVisible] = useState(() =>
    typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : true,
  );
  const [expandedServerId, setExpandedServerId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [projectsListReady, setProjectsListReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverDetail, setServerDetail] = useState<HetznerServerRow | null>(null);
  const [serverDetailError, setServerDetailError] = useState("");
  const [serverDetailLoading, setServerDetailLoading] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const serverDetailReq = useRef(0);
  const [favoritesByProject, setFavoritesByProject] = useState<Record<string, string[]>>({});
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [consoleBusyId, setConsoleBusyId] = useState<string | null>(null);
  const resourcesCacheRef = useRef<Record<string, TimedCacheEntry<HetznerServerRow[]>>>({});
  const resourcesInflightRef = useRef<Record<string, Promise<void> | undefined>>({});

  const refreshProjects = useCallback(async () => {
    setLoadError("");
    try {
      const raw = await pluginInvoke(HETZNER_PLUGIN_ID, "listState", {}) as HetznerListStateResponse;
      const list = raw.projects ?? [];
      setFavoritesByProject(raw.favoritesByProject ?? {});
      setProjects(list);
      setActiveProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        if (raw.activeProjectId && list.some((p) => p.id === raw.activeProjectId)) {
          return raw.activeProjectId;
        }
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setProjects([]);
      setActiveProjectId(null);
      setFavoritesByProject({});
    } finally {
      setProjectsListReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    const onFocus = () => setAppVisible(true);
    const onBlur = () => setAppVisible(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && typeof document.hasFocus === "function") {
        setAppVisible(document.hasFocus());
        return;
      }
      if (document.visibilityState !== "visible") {
        setAppVisible(false);
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const fetchResources = useCallback(async (opts?: { force?: boolean }) => {
    if (!activeProjectId) {
      setResources([]);
      return;
    }
    const now = Date.now();
    const cacheEntry = resourcesCacheRef.current[activeProjectId];
    const force = Boolean(opts?.force);
    if (cacheEntry) {
      setResources(cacheEntry.value);
    }
    if (!force && cacheEntry && isSufficientlyFresh(cacheEntry.fetchedAt, RESOURCE_TTL_MS, now)) {
      return;
    }
    const existingInflight = resourcesInflightRef.current[activeProjectId];
    if (existingInflight) {
      await existingInflight;
      return;
    }
    const cacheStaleOrMissing = !cacheEntry || !isSufficientlyFresh(cacheEntry.fetchedAt, RESOURCE_TTL_MS, now);
    const showBusy = force || cacheStaleOrMissing;
    if (showBusy) {
      setBusy(true);
    }
    setLoadError("");
    const run = (async () => {
      try {
        const out = await pluginInvoke(HETZNER_PLUGIN_ID, "fetchResources", {
          projectId: activeProjectId,
        }) as { resources: HetznerServerRow[] };
        const nextResources = out.resources ?? [];
        resourcesCacheRef.current[activeProjectId] = {
          value: nextResources,
          fetchedAt: Date.now(),
        };
        setResources(nextResources);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        if (!cacheEntry) {
          setResources([]);
        }
      } finally {
        if (showBusy) {
          setBusy(false);
        }
      }
    })();
    resourcesInflightRef.current[activeProjectId] = run;
    try {
      await run;
    } finally {
      resourcesInflightRef.current[activeProjectId] = undefined;
    }
  }, [activeProjectId]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    setExpandedServerId("");
  }, [activeProjectId]);

  useEffect(() => {
    if (!expandedServerId) return;
    const exists = resources.some((r) => r.id === expandedServerId);
    if (!exists) setExpandedServerId("");
  }, [resources, expandedServerId]);

  const loadServerDetail = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!activeProjectId || !expandedServerId) {
      setServerDetail(null);
      setServerDetailError("");
      return;
    }
    const my = ++serverDetailReq.current;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setServerDetailLoading(true);
    }
    setServerDetailError("");
    try {
      const out = await pluginInvoke(HETZNER_PLUGIN_ID, "serverStatus", {
        projectId: activeProjectId,
        serverId: expandedServerId,
      }) as { ok?: boolean; server?: HetznerServerRow };
      if (my !== serverDetailReq.current) return;
      if (out.ok && out.server) {
        setServerDetail(out.server);
      } else {
        setServerDetail(null);
        setServerDetailError("Unexpected server status response.");
      }
    } catch (e) {
      if (my !== serverDetailReq.current) return;
      setServerDetail(null);
      setServerDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === serverDetailReq.current && !silent) {
        setServerDetailLoading(false);
      }
    }
  }, [activeProjectId, expandedServerId]);

  useEffect(() => {
    if (!activeProjectId || !expandedServerId) {
      serverDetailReq.current += 1;
      setServerDetail(null);
      setServerDetailError("");
      setServerDetailLoading(false);
      return;
    }
    void loadServerDetail();
  }, [activeProjectId, expandedServerId, loadServerDetail]);

  useEffect(() => {
    if (!activeProjectId || !expandedServerId) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    const schedule = () => {
      if (cancelled) return;
      const delay = computeAdaptivePollDelayMs();
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        if (shouldRunPollTick(appVisible, document.visibilityState)) {
          void loadServerDetail({ silent: true, force: true });
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeProjectId, expandedServerId, loadServerDetail, appVisible]);

  const runPowerAction = useCallback(
    async (action: string) => {
      if (!activeProjectId || !expandedServerId) return;
      setPowerBusy(true);
      setServerDetailError("");
      try {
        await pluginInvoke(HETZNER_PLUGIN_ID, "serverAction", {
          projectId: activeProjectId,
          serverId: expandedServerId,
          action,
        });
        await loadServerDetail({ force: true });
      } catch (e) {
        setServerDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setPowerBusy(false);
      }
    },
    [activeProjectId, expandedServerId, loadServerDetail],
  );

  const favoriteSet = useMemo(() => {
    if (!activeProjectId) return new Set<string>();
    return new Set(favoritesByProject[activeProjectId] ?? []);
  }, [activeProjectId, favoritesByProject]);

  const toggleFavorite = useCallback(
    async (serverId: string) => {
      if (!activeProjectId) return;
      try {
        const out = await pluginInvoke(HETZNER_PLUGIN_ID, "toggleFavorite", {
          projectId: activeProjectId,
          serverId,
        }) as { ok?: boolean; favorites?: string[] };
        if (out.ok && Array.isArray(out.favorites)) {
          setFavoritesByProject((prev) => ({ ...prev, [activeProjectId]: out.favorites as string[] }));
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeProjectId],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredResources = useMemo(() => {
    let rows = resources;
    if (normalizedSearch) {
      rows = rows.filter((r) =>
        [r.name, r.status, r.ip4, r.ip6, r.serverType, r.datacenter, r.image]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      );
    }
    if (favoritesOnly && activeProjectId) {
      rows = rows.filter((r) => favoriteSet.has(r.id));
    }
    return rows;
  }, [resources, normalizedSearch, favoritesOnly, activeProjectId, favoriteSet]);

  useEffect(() => {
    onResourceCountChange(filteredResources.length);
  }, [filteredResources.length, onResourceCountChange]);

  const sortedResources = useMemo(() => {
    return [...filteredResources].sort((a, b) => {
      const aFav = favoriteSet.has(a.id) ? 0 : 1;
      const bFav = favoriteSet.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;

      const aUp = a.status === "running" ? 0 : 1;
      const bUp = b.status === "running" ? 0 : 1;
      if (aUp !== bUp) return aUp - bUp;

      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [filteredResources, favoriteSet]);

  const powerDisabled = powerBusy || busy;
  const toggleExpandRow = useCallback((id: string) => {
    setExpandedServerId((prev) => (prev === id ? "" : id));
  }, []);

  const openConsole = useCallback(
    async (server: HetznerServerRow) => {
      if (!onOpenHetznerVncInPane || !activeProjectId) return;
      setConsoleBusyId(server.id);
      try {
        await onOpenHetznerVncInPane({
          projectId: activeProjectId,
          serverId: server.id,
          serverName: server.name,
        });
      } finally {
        setConsoleBusyId((prev) => (prev === server.id ? null : prev));
      }
    },
    [activeProjectId, onOpenHetznerVncInPane],
  );

  function rowActionStrip(server: HetznerServerRow) {
    const running = server.status === "running";
    return (
      <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
        {server.ip4 && onSshToServer && (
          <button
            type="button"
            className="proxmux-action-btn proxmux-action-ssh"
            title="Open SSH session"
            aria-label="Open SSH session"
            onClick={(e) => {
              stopRowEvent(e);
              void onSshToServer({ ip: server.ip4, name: server.name });
            }}
          >
            SSH
          </button>
        )}
        {onOpenHetznerVncInPane && running && (
          <button
            type="button"
            className="proxmux-action-btn proxmux-action-novnc"
            disabled={consoleBusyId === server.id}
            title="Open VNC console"
            aria-label="Open VNC console"
            onClick={(e) => {
              stopRowEvent(e);
              void openConsole(server);
            }}
          >
            {consoleBusyId === server.id ? "…" : "VNC"}
          </button>
        )}
      </div>
    );
  }

  if (!projectsListReady && !loadError) {
    return (
      <div className="proxmux-sidebar-panel proxmux-sidebar-panel--boot" role="status" aria-busy="true" aria-label="Loading Hetzner">
        <p className="muted-copy proxmux-sidebar-loading proxmux-sidebar-loading-row proxmux-sidebar-boot-loading">
          <InlineSpinner label="Loading Hetzner Cloud" />
          <span>Loading projects…</span>
        </p>
      </div>
    );
  }

  if (projects.length === 0 && !loadError) {
    return (
      <div className="proxmux-sidebar-panel">
        <div className="empty-pane">
          <p>No Hetzner projects</p>
          <span>Add a project under Settings → Connection → Hetzner Cloud.</span>
        </div>
      </div>
    );
  }

  const detailData = serverDetail ?? resources.find((r) => r.id === expandedServerId) ?? null;

  return (
    <div className="proxmux-sidebar-panel">
      {loadError ? <p className="error-text proxmux-sidebar-error">{loadError}</p> : null}
      <div className="proxmux-sidebar-toolbar">
        <label className="proxmux-sidebar-cluster-label">
          <span className="proxmux-sidebar-field-label">Project</span>
          <select
            className="input proxmux-sidebar-cluster-select"
            value={activeProjectId ?? ""}
            onChange={(e) => setActiveProjectId(e.target.value || null)}
            disabled={busy || projects.length === 0}
            aria-label="Hetzner project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn btn-settings-tool ${favoritesOnly ? "btn-primary" : ""}`}
          disabled={!activeProjectId}
          onClick={() => setFavoritesOnly((v) => !v)}
          title={favoritesOnly ? "Show all servers" : "Show favorites only"}
          aria-pressed={favoritesOnly}
        >
          Favorites
        </button>
        <button
          type="button"
          className="btn btn-settings-tool proxmux-sidebar-refresh"
          disabled={busy || !activeProjectId}
          onClick={() => void fetchResources({ force: true })}
          title="Refresh servers"
        >
          Refresh
        </button>
      </div>
      {busy ? (
        <p
          className="muted-copy proxmux-sidebar-loading proxmux-sidebar-loading-row proxmux-sidebar-inventory-loading"
          role="status"
          aria-live="polite"
        >
          <InlineSpinner label={resources.length === 0 ? "Loading servers" : "Refreshing servers"} />
          <span>{resources.length === 0 ? "Loading servers…" : "Refreshing servers…"}</span>
        </p>
      ) : null}
      <div className="proxmux-sidebar-scroll host-list-scroll" role="region" aria-label="Hetzner inventory">
        {sortedResources.length === 0 && !busy ? (
          <div className="empty-pane">
            <p>No servers</p>
            <span>{normalizedSearch ? "Try a different search." : "This project has no servers."}</span>
          </div>
        ) : (
          <section className="proxmux-sidebar-section">
            <p className="host-list-section-title">Servers</p>
            <ul className="proxmux-sidebar-rows">
              {sortedResources.map((server) => {
                const expanded = expandedServerId === server.id;
                const isFav = favoriteSet.has(server.id);
                const running = server.status === "running";

                return (
                  <li
                    key={server.id}
                    className={`proxmux-sidebar-row-wrap${expanded ? " proxmux-sidebar-row-wrap--expanded" : ""}`}
                    data-proxmux-category="node"
                    data-proxmux-power={running ? "up" : "down"}
                    data-proxmux-favorite={isFav ? "true" : "false"}
                  >
                    <div className="proxmux-sidebar-item-shell">
                      <button
                        type="button"
                        className={`proxmux-sidebar-favorite-btn ${isFav ? "is-active" : ""}`}
                        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                        title={isFav ? "Remove favorite" : "Favorite"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavorite(server.id);
                        }}
                      >
                        ★
                      </button>
                      <div
                        className={`proxmux-sidebar-row proxmux-sidebar-row--guest ${expanded ? "is-expanded" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => toggleExpandRow(server.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpandRow(server.id);
                          }
                        }}
                      >
                        <span className="proxmux-sidebar-row-main">{server.name}</span>
                        <span className="proxmux-sidebar-row-meta">
                          <span className="proxmux-sidebar-row-chevron" aria-hidden="true">
                            {expanded ? "▾" : "▸"}
                          </span>
                          {server.serverType ? server.serverType.toUpperCase() : ""}
                          {server.serverType && server.datacenter ? " · " : ""}
                          {server.datacenter || ""}
                          {" · "}
                          {server.status}
                        </span>
                      </div>
                      {rowActionStrip(server)}
                    </div>
                    <div className={`host-slide-menu proxmux-guest-slide ${expanded ? "is-open" : ""}`}>
                      {expanded ? (
                        <div className="host-slide-content">
                          <div className="proxmux-sidebar-guest-detail proxmux-sidebar-guest-detail--embedded">
                            <p className="proxmux-sidebar-guest-detail-head">
                              <span className="proxmux-sidebar-guest-detail-title">Server</span>
                              <span className="proxmux-sidebar-guest-detail-id">
                                {server.name} · {server.serverType ? server.serverType.toUpperCase() : server.id}
                              </span>
                            </p>
                            {serverDetailLoading && !detailData ? (
                              <p
                                className="muted-copy proxmux-sidebar-guest-detail-loading proxmux-sidebar-loading-row"
                                role="status"
                              >
                                <InlineSpinner label="Loading server status" />
                                <span>Loading status…</span>
                              </p>
                            ) : null}
                            {detailData ? (
                              <>
                                <dl className="proxmux-sidebar-guest-stats">
                                  <dt>IPv4</dt>
                                  <dd>{detailData.ip4 || "—"}</dd>
                                  <dt>IPv6</dt>
                                  <dd>{detailData.ip6 || "—"}</dd>
                                  <dt>Status</dt>
                                  <dd>{detailData.status}</dd>
                                  <dt>Type</dt>
                                  <dd>{detailData.serverType ? detailData.serverType.toUpperCase() : "—"}</dd>
                                  <dt>CPU</dt>
                                  <dd>{detailData.cores > 0 ? `${detailData.cores} cores` : "—"}</dd>
                                  <dt>Memory</dt>
                                  <dd>{detailData.memoryGb > 0 ? formatBytes(detailData.memoryGb) : "—"}</dd>
                                  <dt>Disk</dt>
                                  <dd>{detailData.diskGb > 0 ? formatBytes(detailData.diskGb) : "—"}</dd>
                                  <dt>Datacenter</dt>
                                  <dd>{detailData.datacenter || "—"}</dd>
                                  <dt>Image</dt>
                                  <dd>{detailData.image || "—"}</dd>
                                </dl>
                                <div
                                  className="proxmux-sidebar-guest-actions"
                                  role="group"
                                  aria-label="Server actions"
                                >
                                  {detailData.status !== "running" ? (
                                    <button
                                      type="button"
                                      className="btn btn-settings-tool"
                                      disabled={powerDisabled}
                                      onClick={() => void runPowerAction("poweron")}
                                    >
                                      Start
                                    </button>
                                  ) : (
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
                                              "Force-stop this server immediately? Unsaved data may be lost.",
                                            )
                                          ) {
                                            return;
                                          }
                                          void runPowerAction("poweroff");
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
                                      <button
                                        type="button"
                                        className="btn btn-settings-tool"
                                        disabled={powerDisabled}
                                        onClick={() => {
                                          if (
                                            !window.confirm(
                                              "Hard-reset this server? This is equivalent to a power cycle.",
                                            )
                                          ) {
                                            return;
                                          }
                                          void runPowerAction("reset");
                                        }}
                                      >
                                        Reset
                                      </button>
                                    </>
                                  )}
                                  {onOpenHetznerVncInPane && detailData.status === "running" ? (
                                    <button
                                      type="button"
                                      className="btn btn-settings-tool"
                                      disabled={consoleBusyId === server.id}
                                      onClick={() => void openConsole(detailData)}
                                    >
                                      {consoleBusyId === server.id ? "Opening…" : "Console"}
                                    </button>
                                  ) : null}
                                </div>
                              </>
                            ) : null}
                            {serverDetailError ? (
                              <p className="error-text proxmux-sidebar-guest-detail-error">{serverDetailError}</p>
                            ) : null}
                            {serverDetailError ? (
                              <button
                                type="button"
                                className="btn btn-settings-tool"
                                disabled={powerBusy || busy}
                                onClick={() => void loadServerDetail({ force: true })}
                              >
                                Retry status
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
