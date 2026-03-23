import type { Dispatch, DragEvent as ReactDragEvent, MutableRefObject, SetStateAction } from "react";
import type { HostRowViewModel } from "../features/view-profile-filters";
import type { ContextMenuState } from "../features/session-model";
import type { DragPayload } from "../features/pane-dnd";
import type { HostBinding, HostConfig, HostMetadata, SshKeyObject, StrictHostKeyPolicy, UserObject } from "../types";
import { HostForm } from "./HostForm";
import { HostMetadataFields } from "./HostMetadataFields";

export type HostListRowProps = {
  row: HostRowViewModel;
  activeHost: string;
  openHostMenuHostAlias: string;
  currentHost: HostConfig;
  setCurrentHost: Dispatch<SetStateAction<HostConfig>>;
  storeKeys: SshKeyObject[];
  storeUsers: UserObject[];
  sidebarHostBindingDraft: HostBinding;
  setSidebarHostBindingDraft: Dispatch<SetStateAction<HostBinding>>;
  hosts: HostConfig[];
  hostMetadataByHost: Record<string, HostMetadata | undefined>;
  tagDraft: string;
  setTagDraft: Dispatch<SetStateAction<string>>;
  hostKeyPolicyDraft: StrictHostKeyPolicy;
  setHostKeyPolicyDraft: Dispatch<SetStateAction<StrictHostKeyPolicy>>;
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
  toggleJumpHostForHost: (hostAlias: string) => void | Promise<void>;
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

/** Props shared by every row; pass with `row` into {@link HostListRow}. */
export type HostListRowBridgeProps = Omit<HostListRowProps, "row">;

export function HostListRow({
  row,
  activeHost,
  openHostMenuHostAlias,
  currentHost,
  setCurrentHost,
  storeKeys,
  storeUsers,
  sidebarHostBindingDraft,
  setSidebarHostBindingDraft,
  hosts,
  hostMetadataByHost,
  tagDraft,
  setTagDraft,
  hostKeyPolicyDraft,
  setHostKeyPolicyDraft,
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
  toggleJumpHostForHost,
  toggleHostSelection: _toggleHostSelection,
  connectToHostInNewPane,
  setDragPayload,
  setDraggingKind,
  missingDragPayloadLoggedRef,
  toggleHostMenu,
  onSave,
  saveTagsForActiveHost,
  handleRemoveHostIntent,
}: HostListRowProps) {
  const menuOpen = openHostMenuHostAlias === row.host.host;
  const statusLabel = row.connected ? "connected" : "disconnected";
  const metaUser = row.displayUser.trim() || "—";
  const alias = row.host.host.trim();
  const hostName = row.host.hostName.trim();
  const showHostName = hostName.length > 0 && hostName !== alias;
  const metaLine = [metaUser, ...(showHostName ? [hostName] : []), `port ${row.host.port}`, statusLabel].join(" · ");

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
        className={`host-sidebar-row-wrap${menuOpen ? " host-sidebar-row-wrap--expanded" : ""}${
          activeHost === row.host.host ? " host-sidebar-row-wrap--selected" : ""
        }`}
        data-host-power={row.connected ? "up" : "down"}
        data-host-favorite={row.metadata.favorite ? "true" : "false"}
      >
        <div className="proxmux-sidebar-item-shell">
          <button
            type="button"
            className={`proxmux-sidebar-favorite-btn${row.metadata.favorite ? " is-active" : ""}`}
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
            aria-expanded={menuOpen}
            className={`host-item host-sidebar-row-main proxmux-sidebar-row proxmux-sidebar-row--guest${menuOpen ? " is-expanded" : ""}`}
            onClick={() => {
              if (suppressHostClickAliasRef.current) {
                const suppressedAlias = suppressHostClickAliasRef.current;
                suppressHostClickAliasRef.current = null;
                if (suppressedAlias === row.host.host) {
                  return;
                }
              }
              toggleHostMenu(row.host);
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
            <span className="proxmux-sidebar-row-main">{row.host.host}</span>
            <span className="proxmux-sidebar-row-meta">
              <span className="proxmux-sidebar-row-chevron" aria-hidden="true">
                {menuOpen ? "▾" : "▸"}
              </span>
              {metaLine}
            </span>
          </div>
          <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`proxmux-action-btn host-sidebar-overflow-btn${menuOpen ? " is-open" : ""}`}
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
        <div className={`host-slide-menu proxmux-guest-slide${menuOpen ? " is-open" : ""}`}>
        {openHostMenuHostAlias === row.host.host && (
          <div className="host-slide-content">
            <HostForm
              host={currentHost}
              onChange={setCurrentHost}
              storeKeys={storeKeys}
              hostBinding={sidebarHostBindingDraft}
              onHostBindingChange={setSidebarHostBindingDraft}
              storeUsers={storeUsers}
              sshHosts={hosts}
              hostAliasForJumpExclude={currentHost.host}
              hostMetadataByHost={hostMetadataByHost}
              copyDensity="compact"
            />
            <HostMetadataFields
              hostAlias={row.host.host}
              metadata={row.metadata}
              tagDraft={tagDraft}
              setTagDraft={setTagDraft}
              hostKeyPolicyDraft={hostKeyPolicyDraft}
              setHostKeyPolicyDraft={setHostKeyPolicyDraft}
              toggleFavoriteForHost={toggleFavoriteForHost}
              toggleJumpHostForHost={toggleJumpHostForHost}
              copyDensity="compact"
            />
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
    </div>
  );
}
