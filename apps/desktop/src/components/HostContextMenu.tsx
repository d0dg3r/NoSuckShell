import type { HostConfig } from "../types";
import { useClampedContextMenuPosition } from "../hooks/useClampedContextMenuPosition";
import type { WorkspaceTabLite } from "./PaneContextMenu";

export type HostContextMenuProps = {
  x: number;
  y: number;
  host: HostConfig;
  workspaces: WorkspaceTabLite[];
  onConnectInWorkspace: (host: HostConfig, workspaceId: string) => void;
  onEditHost: (host: HostConfig) => void;
  onClose: () => void;
};

export function HostContextMenu({
  x,
  y,
  host,
  workspaces,
  onConnectInWorkspace,
  onEditHost,
  onClose,
}: HostContextMenuProps) {
  const { menuRef, style: menuStyle } = useClampedContextMenuPosition(true, x, y, [host.host, workspaces.length]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={menuStyle}
      role="menu"
      onContextMenuCapture={(event) => {
        event.preventDefault();
      }}
    >
      {workspaces.map((workspace) => (
        <button
          key={workspace.id}
          type="button"
          role="menuitem"
          className="context-menu-item"
          onClick={() => {
            void onConnectInWorkspace(host, workspace.id);
            onClose();
          }}
        >
          Connect in {workspace.name}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className="context-menu-item separator-above"
        onClick={() => {
          onEditHost(host);
          onClose();
        }}
      >
        Edit host
      </button>
    </div>
  );
}
