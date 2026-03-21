import type { HostConfig } from "../types";
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
  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenuCapture={(event) => {
        event.preventDefault();
      }}
    >
      {workspaces.map((workspace) => (
        <button
          key={workspace.id}
          type="button"
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
