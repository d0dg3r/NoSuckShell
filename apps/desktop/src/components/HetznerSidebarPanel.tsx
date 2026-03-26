import { useCallback, useEffect, useMemo, useState } from "react";
import { pluginInvoke } from "../tauri-api";
import { HETZNER_PLUGIN_ID } from "../features/builtin-plugin-ids";
import type { HetznerListStateResponse, HetznerProjectRow, HetznerServerRow } from "../types";

export type HetznerSidebarPanelProps = {
  searchQuery: string;
  onResourceCountChange: (count: number) => void;
  /** Connect to the server via SSH (uses IP). */
  onSshToServer?: (ctx: { ip: string; name: string }) => void | Promise<void>;
};

export function HetznerSidebarPanel({
  searchQuery,
  onResourceCountChange,
  onSshToServer,
}: HetznerSidebarPanelProps) {
  const [projects, setProjects] = useState<HetznerProjectRow[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [resources, setResources] = useState<HetznerServerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const raw = await pluginInvoke(HETZNER_PLUGIN_ID, "listState", {}) as HetznerListStateResponse;
      setProjects(raw.projects || []);
      setActiveProjectId(raw.activeProjectId || (raw.projects?.[0]?.id || null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const fetchResources = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    setError("");
    try {
      const out = await pluginInvoke(HETZNER_PLUGIN_ID, "fetchResources", {
        projectId: activeProjectId,
      }) as { resources: HetznerServerRow[] };
      setResources(out.resources || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  // Polling for status updates
  useEffect(() => {
    if (!activeProjectId) return;
    const timer = setInterval(() => {
      void fetchResources();
    }, 10000); // Poll every 10 seconds
    return () => clearInterval(timer);
  }, [activeProjectId, fetchResources]);

  const filteredResources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(r => 
      r.name.toLowerCase().includes(q) || 
      r.ip4.includes(q) || 
      r.status.toLowerCase().includes(q)
    );
  }, [resources, searchQuery]);

  useEffect(() => {
    onResourceCountChange(filteredResources.length);
  }, [filteredResources.length, onResourceCountChange]);

  const handleAction = async (serverId: string, action: string) => {
    setActionBusy(serverId);
    setError("");
    try {
      await pluginInvoke(HETZNER_PLUGIN_ID, "serverAction", {
        projectId: activeProjectId,
        serverId,
        action,
      });
      await fetchResources();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  if (projects.length === 0 && !loading) {
    return (
      <div className="empty-pane">
        <p>No Hetzner projects configured.</p>
        <span>Add a project in Settings → Hetzner Cloud.</span>
      </div>
    );
  }

  return (
    <div className="proxmux-sidebar-panel">
      {error && <div className="pve-error-banner">{error}</div>}
      
      <div className="proxmux-cluster-picker">
        <select 
          className="input" 
          value={activeProjectId || ""} 
          onChange={(e) => setActiveProjectId(e.target.value)}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button 
          className="btn btn-icon" 
          onClick={() => void fetchResources()} 
          disabled={loading}
          title="Refresh servers"
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      <div className="proxmux-resource-list">
        {filteredResources.map(server => (
          <div key={server.id} className={`proxmux-row is-server status-${server.status}`}>
            <div className="proxmux-row-main">
              <div className="proxmux-row-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20,13H4V11H20V13M20,17H4V15H20V17M20,21H4V19H20V21M20,9H4V7H20V9M20,5H4V3H20V5Z" /></svg>
              </div>
              <div className="proxmux-row-info">
                <div className="proxmux-row-name">{server.name}</div>
                <div className="proxmux-row-meta">
                  <span className="proxmux-status-pill">{server.status}</span>
                  {server.ip4 && <span className="proxmux-ip">{server.ip4}</span>}
                </div>
              </div>
              <div className="proxmux-sidebar-actions">
                {server.ip4 && onSshToServer && (
                  <button 
                    className="proxmux-action-btn proxmux-action-ssh" 
                    title="SSH connect"
                    onClick={() => void onSshToServer({ ip: server.ip4, name: server.name })}
                  >
                    SSH
                  </button>
                )}
                <div className="proxmux-sidebar-actions-spacer" />
                <button 
                  className="proxmux-action-btn"
                  disabled={actionBusy === server.id || server.status === "running"}
                  onClick={() => handleAction(server.id, "poweron")}
                  title="Power On"
                >
                  ▶
                </button>
                <button 
                  className="proxmux-action-btn"
                  disabled={actionBusy === server.id || server.status === "off"}
                  onClick={() => handleAction(server.id, "poweroff")}
                  title="Power Off"
                >
                  ■
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredResources.length === 0 && (
          <div className="empty-pane">No servers found.</div>
        )}
      </div>
    </div>
  );
}
