import { useRef, type ReactNode } from "react";
import type { WorkspacePopoverProps } from "./WorkspacePopover";
import { WorkspacePopover } from "./WorkspacePopover";
import type { WorkspaceTabInfo } from "./TerminalWorkspaceDock";

export type WorkspaceCommandBarProps = {
  workspaceTabs: WorkspaceTabInfo[];
  activeWorkspaceId: string;
  onIndicatorClick: () => void;
  popoverOpen: boolean;
  onPopoverClose: () => void;
  fKeyBarSlot?: ReactNode;
} & Omit<WorkspacePopoverProps, "open" | "onClose" | "anchorRef">;

export function WorkspaceCommandBar({
  workspaceTabs,
  activeWorkspaceId,
  onIndicatorClick,
  popoverOpen,
  onPopoverClose,
  fKeyBarSlot,
  ...popoverProps
}: WorkspaceCommandBarProps) {
  const indicatorRef = useRef<HTMLButtonElement>(null);
  const activeWorkspace = workspaceTabs.find((w) => w.id === activeWorkspaceId);
  const displayName = activeWorkspace?.name ?? "Workspace";

  return (
    <div className="workspace-command-bar" style={{ position: "relative" }}>
      <button
        ref={indicatorRef}
        type="button"
        className={`workspace-command-bar-indicator${popoverOpen ? " is-open" : ""}`}
        onClick={onIndicatorClick}
        aria-haspopup="dialog"
        aria-expanded={popoverOpen}
        title="Workspaces and layouts"
      >
        <svg className="workspace-command-bar-icon" viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="workspace-command-bar-name">{displayName}</span>
        <svg className="workspace-command-bar-chevron" viewBox="0 0 10 10" width={8} height={8} aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {fKeyBarSlot ?? null}
      <WorkspacePopover
        open={popoverOpen}
        onClose={onPopoverClose}
        anchorRef={indicatorRef}
        workspaceTabs={workspaceTabs}
        activeWorkspaceId={activeWorkspaceId}
        {...popoverProps}
      />
    </div>
  );
}
