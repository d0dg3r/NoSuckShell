import { Suspense, lazy, type Dispatch, type DragEvent as ReactDragEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import type { ContextActionId, PaneContextSessionKind } from "../features/context-actions";
import type { DragPayload, PaneDropZone } from "../features/pane-dnd";
import type { ContextMenuState, SplitMode } from "../features/session-model";
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO, type SplitAxis, type SplitTreeNode } from "../features/split-tree";
import type { FileExportArchiveFormat } from "./settings/app-settings-types";
import type { HostConfig, RemoteSshSpec } from "../types";

const TerminalPane = lazy(async () => {
  const m = await import("./TerminalPane");
  return { default: m.TerminalPane };
});

const RemoteFilePane = lazy(async () => {
  const m = await import("./RemoteFilePane");
  return { default: m.RemoteFilePane };
});

const LocalFilePane = lazy(async () => {
  const m = await import("./LocalFilePane");
  return { default: m.LocalFilePane };
});

const WebPane = lazy(async () => {
  const m = await import("./WebPane");
  return { default: m.WebPane };
});

const ProxmoxQemuVncPane = lazy(async () => {
  const m = await import("./ProxmoxQemuVncPane");
  return { default: m.ProxmoxQemuVncPane };
});

const ProxmoxLxcTermPane = lazy(async () => {
  const m = await import("./ProxmoxLxcTermPane");
  return { default: m.ProxmoxLxcTermPane };
});

export type ProxmoxNativeConsolePanePayload =
  | {
      kind: "qemu-vnc";
      clusterId: string;
      node: string;
      vmid: string;
      paneTitle: string;
      proxmoxBaseUrl: string;
      allowInsecureTls?: boolean;
    }
  | {
      kind: "lxc-term";
      clusterId: string;
      node: string;
      vmid: string;
      paneTitle: string;
      proxmoxBaseUrl: string;
      allowInsecureTls?: boolean;
    };

export type SplitPaneRendererBridge = {
  splitSlots: Array<string | null>;
  activePaneIndex: number;
  paneOrder: number[];
  resolvePaneLabel: (paneIndex: number) => { display: string; title: string };
  /** When true and pane is in local/remote file view, pane title uses ellipsis for long full paths. */
  showFullPathInFilePaneTitle: boolean;
  highlightedHostPaneIndices: Set<number>;
  hasHighlightedHostTargets: boolean;
  highlightedHostAlias: string | null;
  draggingKind: DragPayload["type"] | null;
  dragOverPaneIndex: number | null;
  activeDropZonePaneIndex: number | null;
  activeDropZone: PaneDropZone | null;
  draggingSessionIdRef: MutableRefObject<string | null>;
  setActivePaneIndex: (n: number) => void;
  setActiveSession: (id: string) => void;
  requestTerminalFocus: (sessionId: string) => void;
  setDragOverPaneIndex: Dispatch<SetStateAction<number | null>>;
  setActiveDropZonePaneIndex: Dispatch<SetStateAction<number | null>>;
  setActiveDropZone: Dispatch<SetStateAction<PaneDropZone | null>>;
  resolveDropEffect: (event: ReactDragEvent) => DataTransfer["dropEffect"];
  resolvePaneDropZone: (
    clientX: number,
    clientY: number,
    bounds: Pick<DOMRect, "left" | "top" | "width" | "height"> | null,
  ) => PaneDropZone;
  handlePaneDrop: (event: ReactDragEvent<HTMLDivElement>, paneIndex: number) => void | Promise<void>;
  setHostContextMenu: Dispatch<SetStateAction<{ x: number; y: number; host: HostConfig } | null>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches App.tsx handler shape
  shouldSplitAsEmpty: (eventLike?: any) => boolean;
  expandedPaneToolbarIndices: Set<number>;
  setExpandedPaneToolbarIndices: Dispatch<SetStateAction<Set<number>>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches App.tsx handler shape
  handleContextAction: (actionId: ContextActionId, paneIndex: number, options?: any) => void | Promise<void>;
  isBroadcastModeEnabled: boolean;
  setBroadcastMode: (enabled: boolean) => void;
  visiblePaneSessionIds: string[];
  /** Panes that accept terminal keyboard broadcast (excludes web iframe panes). */
  broadcastEligibleVisiblePaneSessionIds: string[];
  broadcastTargets: Set<string>;
  terminalFontSize: number;
  terminalFontFamily: string;
  handleTerminalInput: (originSessionId: string, data: string) => void;
  onSessionWorkingDirectoryChange: (sessionId: string, path: string) => void;
  connectLocalShellInPane: (paneIndex: number) => void | Promise<void>;
  logoTransparentSrc: string;
  splitNodeRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  startSplitResize: (splitId: string, axis: SplitAxis) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  setDragPayload: (event: ReactDragEvent, payload: DragPayload) => void;
  setDraggingKind: (kind: DragPayload["type"] | null) => void;
  missingDragPayloadLoggedRef: MutableRefObject<boolean>;
  paneFileViewForPane: (paneIndex: number) => "terminal" | "remote" | "local";
  paneContextSessionKindForPane: (paneIndex: number) => PaneContextSessionKind;
  remoteSshSpecForPane: (paneIndex: number) => RemoteSshSpec | null;
  onLocalFilePanePathChange: (paneIndex: number, pathKey: string) => void;
  getFileExportDestPath: () => Promise<string | null>;
  fileExportArchiveFormat: FileExportArchiveFormat;
  onFilePaneTitleChange: (paneIndex: number, payload: { short: string; full: string } | null) => void;
  semanticFileNameColors: boolean;
  /** When false, SFTP/local file browser toolbar and views are disabled (File workspace plugin). */
  fileWorkspacePluginEnabled: boolean;
  /** When set, pane shows embedded web UI instead of terminal or file browser. */
  webPanePayloadForPane: (paneIndex: number) => { url: string; title: string; allowInsecureTls?: boolean } | null;
  /** PROXMUX pane-native QEMU noVNC or LXC terminal (ticket + WebSocket), when session kind matches. */
  proxmoxNativeConsoleForPane: (paneIndex: number) => ProxmoxNativeConsolePanePayload | null;
  /** Surface errors from the web pane (e.g. failed in-app webview window). */
  onWebPaneOpenInAppWindowError?: (message: string) => void;
  /** Proxmox console deep links need login first; same payload as the main-window assist banner. */
  onWebPaneLoginFirstWebviewOpen?: (payload: { label: string; consoleUrl: string }) => void;
};

export function createSplitPaneRenderer(b: SplitPaneRendererBridge): (node: SplitTreeNode) => ReactNode {
  const renderSplitNode = (node: SplitTreeNode): ReactNode => {
    if (node.type === "leaf") {
      const paneIndex = node.paneIndex;
      const paneSessionId = b.splitSlots[paneIndex] ?? null;
      const paneLabel = b.resolvePaneLabel(paneIndex);
      const isHoverTarget = b.highlightedHostPaneIndices.has(paneIndex);
      const isHoverDimmed = b.hasHighlightedHostTargets && !isHoverTarget;
      const isDropOverlayVisible =
        (b.draggingKind === "machine" || b.draggingKind === "session") &&
        b.dragOverPaneIndex === paneIndex &&
        b.activeDropZonePaneIndex === paneIndex;
      const isSelfPaneDrop =
        b.draggingKind === "session" &&
        b.draggingSessionIdRef.current != null &&
        b.splitSlots.findIndex((s) => s === b.draggingSessionIdRef.current) === paneIndex;
      const hasPaneSession = Boolean(paneSessionId);
      const canClosePane = b.paneOrder.length > 1;
      const isPaneBroadcastTarget = paneSessionId ? b.broadcastTargets.has(paneSessionId) : false;
      const isToolbarExpanded = b.expandedPaneToolbarIndices.has(paneIndex);
      const eligible = b.broadcastEligibleVisiblePaneSessionIds;
      const allVisibleAlreadyTargeted =
        b.isBroadcastModeEnabled &&
        eligible.length > 0 &&
        eligible.every((sessionId) => b.broadcastTargets.has(sessionId));
      const isPaneBroadcastEligible = Boolean(
        paneSessionId && b.webPanePayloadForPane(paneIndex) === null && b.proxmoxNativeConsoleForPane(paneIndex) === null,
      );
      const paneFileView = b.paneFileViewForPane(paneIndex);
      const paneCtxKind = b.paneContextSessionKindForPane(paneIndex);
      const remoteSpec = b.remoteSshSpecForPane(paneIndex);
      const activatePaneAndMaybeFocusTerminal = () => {
        b.setActivePaneIndex(paneIndex);
        if (paneSessionId) {
          b.setActiveSession(paneSessionId);
          b.requestTerminalFocus(paneSessionId);
        }
      };
      return (
        <div
          key={`pane-${paneIndex}`}
          data-pane-index={paneIndex}
          className={`split-pane ${b.activePaneIndex === paneIndex ? "is-focused" : ""} ${
            b.dragOverPaneIndex === paneIndex ? "is-drag-over" : ""
          } ${paneSessionId ? "is-connected" : "is-empty"} ${isHoverTarget ? "is-host-hover-target" : ""} ${
            isHoverDimmed ? "is-host-hover-dimmed" : ""
          } ${b.highlightedHostAlias ? "is-host-hovering" : ""}`}
          draggable={false}
          onClick={activatePaneAndMaybeFocusTerminal}
          onMouseEnter={() => {
            if (b.draggingKind !== null) {
              return;
            }
            if (!paneSessionId || paneFileView !== "terminal") {
              return;
            }
            activatePaneAndMaybeFocusTerminal();
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = b.resolveDropEffect(event);
            const bounds = event.currentTarget.getBoundingClientRect();
            b.setDragOverPaneIndex(paneIndex);
            b.setActiveDropZonePaneIndex(paneIndex);
            const emptyForHostOverlay = b.draggingKind === "machine" && !paneSessionId;
            b.setActiveDropZone(
              emptyForHostOverlay ? "center" : b.resolvePaneDropZone(event.clientX, event.clientY, bounds),
            );
          }}
          onDragEnterCapture={(event) => {
            event.preventDefault();
            b.setDragOverPaneIndex(paneIndex);
            const bounds = event.currentTarget.getBoundingClientRect();
            b.setActiveDropZonePaneIndex(paneIndex);
            const emptyForHostOverlay = b.draggingKind === "machine" && !paneSessionId;
            b.setActiveDropZone(
              emptyForHostOverlay ? "center" : b.resolvePaneDropZone(event.clientX, event.clientY, bounds),
            );
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            b.setDragOverPaneIndex((prev) => (prev === paneIndex ? null : prev));
            b.setActiveDropZonePaneIndex((prev) => (prev === paneIndex ? null : prev));
            b.setActiveDropZone(null);
          }}
          onDropCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void b.handlePaneDrop(event, paneIndex);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            b.setHostContextMenu(null);
            const initialSplitMode: SplitMode = b.shouldSplitAsEmpty(event) ? "empty" : "duplicate";
            b.setContextMenu({
              visible: true,
              x: event.clientX,
              y: event.clientY,
              paneIndex,
              splitMode: initialSplitMode,
            });
          }}
        >
          {isDropOverlayVisible && b.draggingKind === "machine" && !hasPaneSession && (
            <div className="pane-drop-zones pane-drop-zones-host-empty" aria-hidden="true">
              <span className="pane-drop-host-empty-label">Drop to open here</span>
            </div>
          )}
          {isDropOverlayVisible && !(b.draggingKind === "machine" && !hasPaneSession) && (
            <div className="pane-drop-zones" aria-hidden="true">
              <div className={`pane-drop-zone pane-drop-zone-top ${b.activeDropZone === "top" ? "is-active" : ""}`}>Top</div>
              <div className={`pane-drop-zone pane-drop-zone-left ${b.activeDropZone === "left" ? "is-active" : ""}`}>Left</div>
              <div
                className={`pane-drop-zone pane-drop-zone-center ${b.activeDropZone === "center" ? "is-active" : ""}`}
              >
                {b.draggingKind === "machine"
                  ? "Replace"
                  : isSelfPaneDrop
                    ? "–"
                    : "Swap"}
              </div>
              <div className={`pane-drop-zone pane-drop-zone-right ${b.activeDropZone === "right" ? "is-active" : ""}`}>
                Right
              </div>
              <div
                className={`pane-drop-zone pane-drop-zone-bottom ${b.activeDropZone === "bottom" ? "is-active" : ""}`}
              >
                Bottom
              </div>
            </div>
          )}
          <div
            className={`split-pane-label ${b.activePaneIndex === paneIndex ? "is-active" : ""} ${
              isToolbarExpanded ? "is-toolbar-expanded" : ""
            }`}
            draggable={Boolean(paneSessionId)}
            onDragStart={(event) => {
              if (!paneSessionId) {
                return;
              }
              b.draggingSessionIdRef.current = paneSessionId;
              b.setDragPayload(event, { type: "session", sessionId: paneSessionId });
              b.setDraggingKind("session");
              b.missingDragPayloadLoggedRef.current = false;
            }}
            onDragEnd={() => {
              b.draggingSessionIdRef.current = null;
              b.setDraggingKind(null);
              b.setDragOverPaneIndex(null);
              b.setActiveDropZonePaneIndex(null);
              b.setActiveDropZone(null);
              b.missingDragPayloadLoggedRef.current = false;
            }}
          >
            <div className="split-pane-toolbar-group split-pane-toolbar-group-nav">
              <span
                className={`split-pane-label-title ${
                  (paneFileView === "local" || paneFileView === "remote") && b.showFullPathInFilePaneTitle
                    ? "split-pane-label-title--file-full-path"
                    : ""
                }`}
                title={paneLabel.title}
              >
                {paneLabel.display}
              </span>
            </div>
            <div className="split-pane-toolbar-trailing">
            <div className="split-pane-toolbar-expand-slot">
              <button
                type="button"
                className={`btn action-icon-btn pane-toolbar-btn pane-toolbar-expand-toggle ${
                  isToolbarExpanded ? "is-expanded" : ""
                }`}
                title={isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions"}
                aria-label={isToolbarExpanded ? "Collapse toolbar actions" : "Expand toolbar actions"}
                aria-pressed={isToolbarExpanded}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  b.setExpandedPaneToolbarIndices((prev) => {
                    const next = new Set(prev);
                    if (next.has(paneIndex)) {
                      next.delete(paneIndex);
                    } else {
                      next.add(paneIndex);
                    }
                    return next;
                  });
                }}
              >
                <span aria-hidden="true">{isToolbarExpanded ? "▾" : "▸"}</span>
              </button>
              <div className="split-pane-toolbar-group split-pane-toolbar-group-layout">
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane left"
                aria-label={`Split pane ${paneIndex + 1} left`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("layout.split.left", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-vertical split-icon-vertical-normal" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane right"
                aria-label={`Split pane ${paneIndex + 1} right`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("layout.split.right", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-vertical split-icon-vertical-inverse" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane top"
                aria-label={`Split pane ${paneIndex + 1} top`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("layout.split.top", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-horizontal split-icon-horizontal-normal" aria-hidden="true" />
              </button>
              <button
                className="btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-split"
                title="Split pane bottom"
                aria-label={`Split pane ${paneIndex + 1} bottom`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("layout.split.bottom", paneIndex, { eventLike: event });
                }}
              >
                <span className="split-icon split-icon-horizontal split-icon-horizontal-inverse" aria-hidden="true" />
              </button>
              </div>
              <span className="pane-toolbar-separator pane-toolbar-separator--expand-only" aria-hidden="true" />
              <div className="split-pane-toolbar-group split-pane-toolbar-group-broadcast">
              <button
                className={`btn action-icon-btn pane-toolbar-btn ${b.isBroadcastModeEnabled ? "is-broadcast-active" : ""}`}
                title={
                  b.isBroadcastModeEnabled
                    ? "Broadcast enabled — click to turn off"
                    : "Broadcast disabled — click to send keyboard to multiple panes"
                }
                aria-label={
                  b.isBroadcastModeEnabled ? "Turn off broadcast to multiple panes" : "Turn on broadcast to multiple panes"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  b.setBroadcastMode(!b.isBroadcastModeEnabled);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-broadcast" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="2.2" />
                  <path d="M8.6 8.8a4.8 4.8 0 0 0 0 6.4" />
                  <path d="M15.4 8.8a4.8 4.8 0 0 1 0 6.4" />
                  <path d="M6.2 6.3a8.3 8.3 0 0 0 0 11.4" />
                  <path d="M17.8 6.3a8.3 8.3 0 0 1 0 11.4" />
                </svg>
              </button>
              <button
                className={`btn action-icon-btn pane-toolbar-btn ${
                  b.isBroadcastModeEnabled && isPaneBroadcastTarget ? "is-broadcast-active" : ""
                }`}
                title="Toggle pane target"
                aria-label={`Toggle pane ${paneIndex + 1} broadcast target`}
                disabled={!b.isBroadcastModeEnabled || !hasPaneSession || !isPaneBroadcastEligible}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("broadcast.togglePaneTarget", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-target" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="6.4" />
                  <circle cx="12" cy="12" r="2.3" />
                </svg>
              </button>
              <button
                className={`btn action-icon-btn pane-toolbar-btn pane-toolbar-btn-broadcast-all ${
                  allVisibleAlreadyTargeted ? "is-broadcast-active" : ""
                }`}
                title="Target all visible panes"
                aria-label="Target all visible panes"
                disabled={!b.isBroadcastModeEnabled}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("broadcast.selectAllVisible", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-all" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="6.2" cy="12.4" r="2.1" />
                  <circle cx="12" cy="7.1" r="2.1" />
                  <circle cx="17.8" cy="12.4" r="2.1" />
                  <path d="M8 11.1l2.3-2.2M13.7 8.9l2.3 2.2M8.3 13.6h7.4" />
                </svg>
              </button>
              </div>
            </div>
            <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
            <div className="split-pane-toolbar-group split-pane-toolbar-group-files">
              {!hasPaneSession ? (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title="Quick Connect — add a session, then browse files"
                  aria-label="Quick Connect to add a session"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.quickConnect", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 6.5h7l1 1.5h8V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                </button>
              ) : paneCtxKind === "ssh" && paneFileView === "terminal" ? (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title={
                    b.fileWorkspacePluginEnabled
                      ? "Browse remote files (SFTP)"
                      : "Browse remote files (SFTP) — enable File workspace in Settings → Plugins"
                  }
                  aria-label={`Browse remote files in pane ${paneIndex + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.toggleRemoteFiles", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6.5h7l1 1.5h8V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              ) : paneCtxKind === "ssh" && paneFileView === "remote" ? (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title="Back to terminal"
                  aria-label={`Return to terminal in pane ${paneIndex + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.toggleRemoteFiles", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="5" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M7.5 9.5h9M7.5 12h6" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
              ) : paneCtxKind === "local" && paneFileView === "terminal" ? (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title={
                    b.fileWorkspacePluginEnabled
                      ? "Browse local files"
                      : "Browse local files — enable File workspace in Settings → Plugins"
                  }
                  aria-label={`Browse local files in pane ${paneIndex + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.toggleLocalFiles", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4.5l7.5 5.2v9.3a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V9.7L12 4.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              ) : paneCtxKind === "local" && paneFileView === "local" ? (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title="Back to terminal"
                  aria-label={`Return to terminal in pane ${paneIndex + 1}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.toggleLocalFiles", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="5" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M7.5 9.5h9M7.5 12h6" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </button>
              ) : paneCtxKind === "web" ? null : (
                <button
                  type="button"
                  className="btn action-icon-btn pane-toolbar-btn"
                  title="Browse files"
                  aria-label="Browse files"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.handleContextAction("pane.toggleRemoteFiles", paneIndex);
                  }}
                >
                  <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 6.5h7l1 1.5h8V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                </button>
              )}
            </div>
            <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
            <div className="split-pane-toolbar-group split-pane-toolbar-group-close">
              <button
                className="btn action-icon-btn pane-toolbar-btn"
                title="Close session in pane"
                aria-label={`Close session in pane ${paneIndex + 1}`}
                disabled={!hasPaneSession}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("pane.clear", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-close-session" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" />
                  <path d="M9.5 10l5 5M14.5 10l-5 5" />
                </svg>
              </button>
              <button
                className="btn action-icon-btn action-icon-btn-danger pane-toolbar-btn"
                title="Close pane and session"
                aria-label={`Close pane ${paneIndex + 1} and its session`}
                disabled={!canClosePane}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void b.handleContextAction("pane.close", paneIndex);
                }}
              >
                <svg className="pane-toolbar-svg pane-toolbar-svg-close-pane" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.6 7.6l8.8 8.8M16.4 7.6l-8.8 8.8" />
                </svg>
              </button>
            </div>
            </div>
          </div>
          {(() => {
            const webPayload = paneSessionId ? b.webPanePayloadForPane(paneIndex) : null;
            if (webPayload) {
              return (
                <Suspense
                  fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading web pane" />}
                >
                  <WebPane
                    url={webPayload.url}
                    paneTitle={webPayload.title}
                    allowInsecureTls={webPayload.allowInsecureTls === true}
                    onOpenInAppWindowError={b.onWebPaneOpenInAppWindowError}
                    onLoginFirstWebviewOpen={b.onWebPaneLoginFirstWebviewOpen}
                  />
                </Suspense>
              );
            }
            const px = paneSessionId ? b.proxmoxNativeConsoleForPane(paneIndex) : null;
            if (px?.kind === "qemu-vnc") {
              return (
                <Suspense
                  fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading noVNC" />}
                >
                  <ProxmoxQemuVncPane
                    clusterId={px.clusterId}
                    node={px.node}
                    vmid={px.vmid}
                    paneTitle={px.paneTitle}
                    proxmoxBaseUrl={px.proxmoxBaseUrl}
                    allowInsecureTls={px.allowInsecureTls === true}
                    onError={b.onWebPaneOpenInAppWindowError}
                    onOpenInAppWindowError={b.onWebPaneOpenInAppWindowError}
                    onLoginFirstWebviewOpen={b.onWebPaneLoginFirstWebviewOpen}
                  />
                </Suspense>
              );
            }
            if (px?.kind === "lxc-term") {
              return (
                <Suspense
                  fallback={
                    <div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading LXC console" />
                  }
                >
                  <ProxmoxLxcTermPane
                    clusterId={px.clusterId}
                    node={px.node}
                    vmid={px.vmid}
                    paneTitle={px.paneTitle}
                    proxmoxBaseUrl={px.proxmoxBaseUrl}
                    allowInsecureTls={px.allowInsecureTls === true}
                    onError={b.onWebPaneOpenInAppWindowError}
                    onOpenInAppWindowError={b.onWebPaneOpenInAppWindowError}
                    onLoginFirstWebviewOpen={b.onWebPaneLoginFirstWebviewOpen}
                  />
                </Suspense>
              );
            }
            if (paneSessionId) {
              return paneFileView === "remote" && remoteSpec ? (
                <Suspense
                  fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading file browser" />}
                >
                  <RemoteFilePane
                    paneIndex={paneIndex}
                    spec={remoteSpec}
                    getExportDestPath={b.getFileExportDestPath}
                    archiveFormat={b.fileExportArchiveFormat}
                    onBack={() => void b.handleContextAction("pane.toggleRemoteFiles", paneIndex)}
                    onFilePaneTitleChange={b.onFilePaneTitleChange}
                    semanticFileNameColors={b.semanticFileNameColors}
                  />
                </Suspense>
              ) : paneFileView === "local" ? (
                <Suspense
                  fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading file browser" />}
                >
                  <LocalFilePane
                    paneIndex={paneIndex}
                    onPathChange={(pathKey) => b.onLocalFilePanePathChange(paneIndex, pathKey)}
                    getExportDestPath={b.getFileExportDestPath}
                    archiveFormat={b.fileExportArchiveFormat}
                    onBack={() => void b.handleContextAction("pane.toggleLocalFiles", paneIndex)}
                    onFilePaneTitleChange={b.onFilePaneTitleChange}
                    semanticFileNameColors={b.semanticFileNameColors}
                  />
                </Suspense>
              ) : (
                <Suspense
                  fallback={<div className="terminal-root terminal-host" aria-busy="true" aria-label="Loading terminal" />}
                >
                  <TerminalPane
                    sessionId={paneSessionId}
                    onUserInput={b.handleTerminalInput}
                    onSessionWorkingDirectoryChange={b.onSessionWorkingDirectoryChange}
                    fontSize={b.terminalFontSize}
                    fontFamily={b.terminalFontFamily}
                  />
                </Suspense>
              );
            }
            return (
              <div className="empty-pane split-empty-pane">
                <p className="split-empty-pane-copy">One click and we both get what we want</p>
                <button
                  type="button"
                  className="split-empty-pane-logo-btn"
                  title="Open local terminal in this pane"
                  onClick={(event) => {
                    event.stopPropagation();
                    void b.connectLocalShellInPane(paneIndex);
                  }}
                >
                  <img src={b.logoTransparentSrc} alt="Open local terminal in this pane" className="split-empty-pane-image" />
                </button>
                <p className="split-empty-pane-copy split-empty-pane-copy-secondary">
                  Or drop that host right here - I&apos;m waiting
                </p>
              </div>
            );
          })()}
        </div>
      );
    }

    const firstRatio = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, node.ratio));
    const secondRatio = 1 - firstRatio;
    const dividerClass = node.axis === "horizontal" ? "split-node-divider vertical" : "split-node-divider horizontal";

    return (
      <div
        key={node.id}
        className={`split-node split-node-${node.axis}`}
        ref={(element) => {
          b.splitNodeRefs.current[node.id] = element;
        }}
      >
        <div className="split-node-child" style={{ flexBasis: `${firstRatio * 100}%` }}>
          {renderSplitNode(node.first)}
        </div>
        <div
          className={dividerClass}
          role="separator"
          aria-orientation={node.axis === "horizontal" ? "vertical" : "horizontal"}
          onPointerDown={b.startSplitResize(node.id, node.axis)}
        />
        <div className="split-node-child" style={{ flexBasis: `${secondRatio * 100}%` }}>
          {renderSplitNode(node.second)}
        </div>
      </div>
    );
  };
  return renderSplitNode;
}
