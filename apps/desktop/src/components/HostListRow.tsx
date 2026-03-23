import type { Dispatch, DragEvent as ReactDragEvent, MutableRefObject, SetStateAction } from "react";
import type { HostRowViewModel } from "../features/view-profile-filters";
import type { ContextMenuState } from "../features/session-model";
import type { DragPayload } from "../features/pane-dnd";
import type { HostConfig } from "../types";

export type HostListRowProps = {
  row: HostRowViewModel;
  activeHost: string;
  suppressHostClickAliasRef: MutableRefObject<string | null>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState>>;
  setHostContextMenu: Dispatch<SetStateAction<{ x: number; y: number; host: HostConfig } | null>>;
  setHoveredHostAlias: Dispatch<SetStateAction<string | null>>;
  setActiveHost: Dispatch<SetStateAction<string>>;
  setDragOverPaneIndex: Dispatch<SetStateAction<number | null>>;
  toggleFavoriteForHost: (hostAlias: string) => void | Promise<void>;
  connectToHostInNewPane: (host: HostConfig) => void | Promise<void>;
  setDragPayload: (event: ReactDragEvent, payload: DragPayload) => void;
  setDraggingKind: (kind: DragPayload["type"] | null) => void;
  missingDragPayloadLoggedRef: MutableRefObject<boolean>;
  onEditHost: (host: HostConfig) => void;
};

/** Props shared by every row; pass with `row` into {@link HostListRow}. */
export type HostListRowBridgeProps = Omit<HostListRowProps, "row">;

export function HostListRow({
  row,
  activeHost,
  suppressHostClickAliasRef,
  setContextMenu,
  setHostContextMenu,
  setHoveredHostAlias,
  setActiveHost,
  setDragOverPaneIndex,
  toggleFavoriteForHost,
  connectToHostInNewPane,
  setDragPayload,
  setDraggingKind,
  missingDragPayloadLoggedRef,
  onEditHost,
}: HostListRowProps) {
  const metaUser = row.displayUser.trim() || "—";
  const alias = row.host.host.trim();
  const hostName = row.host.hostName.trim();
  const showHostName = hostName.length > 0 && hostName !== alias;
  const metaLine = [metaUser, ...(showHostName ? [hostName] : []), `port ${row.host.port}`].join(" · ");

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
        className={`host-sidebar-row-wrap${
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
            className="host-item host-sidebar-row-main proxmux-sidebar-row proxmux-sidebar-row--guest"
            onClick={() => {
              if (suppressHostClickAliasRef.current) {
                const suppressedAlias = suppressHostClickAliasRef.current;
                suppressHostClickAliasRef.current = null;
                if (suppressedAlias === row.host.host) {
                  return;
                }
              }
              setActiveHost(row.host.host);
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
            <span className="proxmux-sidebar-row-meta">{metaLine}</span>
          </div>
          <div className="proxmux-sidebar-actions" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="proxmux-action-btn host-sidebar-overflow-btn"
              aria-label={`Open host settings for ${row.host.host}`}
              title={`Open host settings for ${row.host.host}`}
              onClick={(event) => {
                event.stopPropagation();
                onEditHost(row.host);
              }}
            >
              ⋮
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
