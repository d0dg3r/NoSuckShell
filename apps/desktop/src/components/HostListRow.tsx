import type { Dispatch, DragEvent as ReactDragEvent, MutableRefObject, SetStateAction } from "react";
import type { HostRowViewModel } from "../features/view-profile-filters";
import type { ContextMenuState } from "../features/session-model";
import type { DragPayload } from "../features/pane-dnd";
import type { HostConfig, HostMetadata } from "../types";
import { HostForm } from "./HostForm";

export type HostListRowProps = {
  row: HostRowViewModel;
  activeHost: string;
  openHostMenuHostAlias: string;
  currentHost: HostConfig;
  setCurrentHost: Dispatch<SetStateAction<HostConfig>>;
  hosts: HostConfig[];
  tagDraft: string;
  setTagDraft: Dispatch<SetStateAction<string>>;
  activeHostMetadata: HostMetadata;
  error: string;
  canSave: boolean;
  pendingRemoveConfirm: { hostAlias: string; scope: "settings" } | null;
  suppressHostClickAliasRef: MutableRefObject<string | null>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState>>;
  setHostContextMenu: Dispatch<SetStateAction<{ x: number; y: number; host: HostConfig } | null>>;
  setHoveredHostAlias: Dispatch<SetStateAction<string | null>>;
  setActiveHost: Dispatch<SetStateAction<string>>;
  setDragOverPaneIndex: Dispatch<SetStateAction<number | null>>;
  setError: Dispatch<SetStateAction<string>>;
  toggleFavoriteForHost: (hostAlias: string) => void | Promise<void>;
  toggleHostSelection: (host: HostConfig) => void;
  connectToHostInNewPane: (host: HostConfig) => void | Promise<void>;
  setDragPayload: (event: ReactDragEvent, payload: DragPayload) => void;
  setDraggingKind: (kind: DragPayload["type"] | null) => void;
  missingDragPayloadLoggedRef: MutableRefObject<boolean>;
  toggleHostMenu: (host: HostConfig) => void;
  onSave: () => void | Promise<void>;
  saveTagsForActiveHost: () => Promise<void>;
  handleRemoveHostIntent: (hostAlias: string, scope: "settings") => void;
};

export function HostListRow({
  row,
  activeHost,
  openHostMenuHostAlias,
  currentHost,
  setCurrentHost,
  hosts,
  tagDraft,
  setTagDraft,
  activeHostMetadata,
  error,
  canSave,
  pendingRemoveConfirm,
  suppressHostClickAliasRef,
  setContextMenu,
  setHostContextMenu,
  setHoveredHostAlias,
  setActiveHost,
  setDragOverPaneIndex,
  setError,
  toggleFavoriteForHost,
  toggleHostSelection,
  connectToHostInNewPane,
  setDragPayload,
  setDraggingKind,
  missingDragPayloadLoggedRef,
  toggleHostMenu,
  onSave,
  saveTagsForActiveHost,
  handleRemoveHostIntent,
}: HostListRowProps) {
  return (
    <div
      className="host-row"
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setHostContextMenu({
          x: event.clientX,
          y: event.clientY,
          host: row.host,
        });
      }}
    >
      <div
        className={`host-item-shell ${row.connected ? "is-connected" : "is-disconnected"} ${
          activeHost === row.host.host ? "is-active" : ""
        } ${openHostMenuHostAlias === row.host.host ? "is-menu-open" : ""}`}
      >
        <button
          className={`host-favorite-btn host-favorite-btn-inline host-favorite-in-shell ${
            row.metadata.favorite ? "is-active" : ""
          }`}
          aria-label={`Toggle favorite for ${row.host.host}`}
          onClick={(event) => {
            event.stopPropagation();
            void toggleFavoriteForHost(row.host.host);
          }}
        >
          ★
        </button>
        <div
          role="button"
          tabIndex={0}
          aria-label={`SSH host ${row.host.host}`}
          className="host-item"
          onClick={() => {
            if (suppressHostClickAliasRef.current) {
              const suppressedAlias = suppressHostClickAliasRef.current;
              suppressHostClickAliasRef.current = null;
              if (suppressedAlias === row.host.host) {
                return;
              }
            }
            toggleHostSelection(row.host);
          }}
          onMouseEnter={() => {
            if (row.connected) {
              setHoveredHostAlias(row.host.host);
            }
          }}
          onMouseLeave={() => {
            if (row.connected) {
              setHoveredHostAlias((prev) => (prev === row.host.host ? null : prev));
            }
          }}
          onDoubleClick={() => {
            void connectToHostInNewPane(row.host);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (activeHost !== row.host.host) {
                setActiveHost(row.host.host);
              }
              void connectToHostInNewPane(row.host);
            }
          }}
          draggable
          onDragStart={(event) => {
            suppressHostClickAliasRef.current = row.host.host;
            setDragPayload(event, { type: "machine", hostAlias: row.host.host });
            setDraggingKind("machine");
            missingDragPayloadLoggedRef.current = false;
          }}
          onDragEnd={() => {
            setDraggingKind(null);
            setDragOverPaneIndex(null);
            missingDragPayloadLoggedRef.current = false;
          }}
        >
          <span className="host-item-main">{row.host.host}</span>
          <span className="host-user-badge">{row.displayUser}</span>
        </div>
        <div className="host-row-actions">
          <button
            className={`host-settings-inline-btn ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`}
            aria-label={`Open host settings for ${row.host.host}`}
            title={`Open host settings for ${row.host.host}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleHostMenu(row.host);
            }}
          >
            ⋮
          </button>
        </div>
      </div>
      <div className={`host-slide-menu ${openHostMenuHostAlias === row.host.host ? "is-open" : ""}`}>
        {openHostMenuHostAlias === row.host.host && (
          <div className="host-slide-content">
            <HostForm host={currentHost} onChange={setCurrentHost} />
            <div className="host-meta-edit">
              <label className="field">
                <span className="field-label">Tags (comma separated)</span>
                <input
                  className="input"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  placeholder="prod, home, lab"
                />
              </label>
              <label className="field checkbox-field">
                <input
                  className="checkbox-input"
                  type="checkbox"
                  checked={activeHostMetadata.favorite}
                  onChange={() => void toggleFavoriteForHost(activeHost)}
                />
                <span className="field-label">Favorite</span>
              </label>
            </div>
            <div className="action-row host-slide-actions">
              <button
                className="btn icon-btn"
                aria-label="Save tags"
                title="Save tags"
                onClick={() => {
                  void saveTagsForActiveHost().catch((e: unknown) => setError(String(e)));
                }}
              >
                #
              </button>
              <button
                className="btn btn-primary icon-btn"
                aria-label="Save settings"
                title="Save settings"
                onClick={onSave}
                disabled={!canSave}
              >
                ✓
              </button>
              <button
                className={`btn btn-danger icon-btn ${
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "btn-danger-confirm"
                    : ""
                }`}
                onClick={() => handleRemoveHostIntent(currentHost.host, "settings")}
                disabled={!currentHost.host || !hosts.some((host) => host.host === currentHost.host)}
                aria-label={
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "Confirm remove host"
                    : "Remove host"
                }
                title={
                  pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings"
                    ? "Confirm remove host"
                    : "Remove host"
                }
              >
                {pendingRemoveConfirm?.hostAlias === currentHost.host && pendingRemoveConfirm.scope === "settings" ? "!" : "×"}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
