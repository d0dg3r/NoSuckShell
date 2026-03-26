import { useCallback, useEffect, useState } from "react";
import { pluginInvoke } from "../../../tauri-api";
import { HETZNER_PLUGIN_ID } from "../../../features/builtin-plugin-ids";
import type { HetznerListStateResponse, HetznerProjectRow } from "../../../types";

export function AppSettingsHetznerTab() {
  const [projects, setProjects] = useState<HetznerProjectRow[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const raw = await pluginInvoke(HETZNER_PLUGIN_ID, "listState", {}) as HetznerListStateResponse;
      setProjects(raw.projects || []);
      setActiveProjectId(raw.activeProjectId || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!newName.trim() || (!editingId && !newToken.trim())) {
      setError("Name and Token are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await pluginInvoke(HETZNER_PLUGIN_ID, "saveProject", {
        id: editingId,
        name: newName,
        apiToken: newToken,
      });
      setNewName("");
      setNewToken("");
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (p: HetznerProjectRow) => {
    setEditingId(p.id);
    setNewName(p.name);
    setNewToken(""); // Token is typically not fetched back for security
    setError("");
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Are you sure you want to remove this project?")) return;
    setBusy(true);
    try {
      await pluginInvoke(HETZNER_PLUGIN_ID, "removeProject", { id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await pluginInvoke(HETZNER_PLUGIN_ID, "setActiveProject", { id });
      setActiveProjectId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="app-settings-tab-content">
      <div className="settings-section">
        <h3>Hetzner Cloud Projects</h3>
        <p className="settings-help">
          Manage your Hetzner Cloud API tokens. Tokens are encrypted using your app master key if set.
        </p>

        {error && <div className="pve-error-banner" style={{ marginBottom: "1rem" }}>{error}</div>}

        <div className="settings-grid">
          <label className="settings-field">
            <span className="settings-field-label">Project Name</span>
            <input 
              className="input" 
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              placeholder="e.g. Production"
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">API Token {editingId && "(leave empty to keep current)"}</span>
            <input 
              className="input" 
              type="password"
              value={newToken} 
              onChange={e => setNewToken(e.target.value)} 
            />
          </label>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
              {editingId ? "Update Project" : "Add Project"}
            </button>
            {editingId && (
              <button className="btn" onClick={() => { setEditingId(null); setNewName(""); setNewToken(""); }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="resource-list" style={{ marginTop: "2rem" }}>
          {projects.map(p => (
            <div key={p.id} className={`resource-row ${activeProjectId === p.id ? "is-active" : ""}`}>
              <div className="resource-row-main">
                <strong>{p.name}</strong>
                <span className="resource-row-meta">{p.id}</span>
              </div>
              <div className="resource-row-actions">
                <button className="btn btn-sm" onClick={() => handleSetActive(p.id)} disabled={activeProjectId === p.id}>
                  {activeProjectId === p.id ? "Active" : "Set Active"}
                </button>
                <button className="btn btn-sm" onClick={() => handleEdit(p)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleRemove(p.id)}>Remove</button>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="empty-pane">No projects added yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
