import {
  Suspense,
  lazy,
  useCallback,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ContextActionId, PaneContextSessionKind } from "../features/context-actions";
import type { DragPayload, PaneDropZone } from "../features/pane-dnd";
import type { ContextMenuState, SplitMode } from "../features/session-model";
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO, type SplitAxis, type SplitTreeNode } from "../features/split-tree";
import type { FileExportArchiveFormat } from "./settings/app-settings-types";
import type { HostConfig, RemoteSshSpec } from "../types";
import { InlineSpinner } from "./InlineSpinner";

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

const ProxmoxNodeTermPane = lazy(async () => {
  const m = await import("./ProxmoxNodeTermPane");
  return { default: m.ProxmoxNodeTermPane };
});

const HetznerVncPane = lazy(async () => {
  const m = await import("./HetznerVncPane");
  return { default: m.HetznerVncPane };
});

function paneLazySuspenseFallback(label: string): ReactNode {
  return (
    <div className="terminal-root terminal-host terminal-suspense-fallback" role="status" aria-busy="true" aria-label={label}>
      <InlineSpinner label={label} />
      <span className="muted-copy">Loading…</span>
    </div>
  );
}

export type ProxmoxNativeConsolePanePayload =
  | {
      kind: "qemu-vnc";
      clusterId: string;
      node: string;
      vmid: string;
      paneTitle: string;
      proxmoxBaseUrl: string;
      allowInsecureTls?: boolean;
      tlsTrustedCertPem?: string;
    }
  | {
      kind: "lxc-term";
      clusterId: string;
      node: string;
      vmid: string;
      paneTitle: string;
      proxmoxBaseUrl: string;
      allowInsecureTls?: boolean;
      tlsTrustedCertPem?: string;
    }
  | {
      kind: "node-term";
      clusterId: string;
      node: string;
      paneTitle: string;
      proxmoxBaseUrl: string;
      allowInsecureTls?: boolean;
      tlsTrustedCertPem?: string;
    };

export type HetznerVncPanePayload = {
  projectId: string;
  serverId: string;
  paneTitle: string;
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
  onRemoteFilePanePathChange?: (paneIndex: number, path: string) => void;
  onLocalFilePaneF5Copy?: (paneIndex: number, sourcePath: string, selectedNames: string[]) => void;
  onLocalFilePaneTabSwitch?: (paneIndex: number) => void;
  onRemoteFilePaneF5Copy?: (paneIndex: number, sourcePath: string, selectedNames: string[]) => void;
  onRemoteFilePaneTabSwitch?: (paneIndex: number) => void;
  getFileExportDestPath: () => Promise<string | null>;
  fileExportArchiveFormat: FileExportArchiveFormat;
  onFilePaneTitleChange: (paneIndex: number, payload: { short: string; full: string } | null) => void;
  semanticFileNameColors: boolean;
  /** When false, SFTP/local file browser toolbar and views are disabled (NSS-Commander plugin). */
  fileWorkspacePluginEnabled: boolean;
  /** NSS-Commander: file toolbar icons live in the pane title row; full path moves to the file pane toolbar row. */
  nssCommanderSwapFilePaneToolbarWithPaneLabel?: boolean;
  /** NSS-Commander: hide pane label trailing toolbar (splits, broadcast row actions, close). */
  nssCommanderMinimalPaneChrome?: boolean;
  /** NSS-Commander: both paired file panes exist (enables vertical ops divider). */
  nssCommanderHasTwoFilePanes?: boolean;
  /** NSS-Commander: opt-in to show the classic vertical gutter ops bar. */
  nssCommanderUseClassicGutter?: boolean;
  /** Pixels to leave empty at top of NSS divider so ops align below file column headers. */
  nssCommanderOpsDividerTopInsetPx?: number;
  /** NSS-Commander: vertical file ops between the two horizontal file panes. */
  renderNssCommanderSplitDividerContent?: (leftPaneIndex: number, rightPaneIndex: number) => ReactNode;
  onFilePaneSelectionChange?: (paneIndex: number, selectedNames: Set<string>) => void;
  /** Report distance from split-pane top to table thead (for NSS divider alignment). */
  onFilePaneTableHeadOffsetInSplitPane?: (paneIndex: number, offsetPx: number | null) => void;
  nssCommanderFilePaneReloadAllKey?: number;
  resolveNssCommanderPaneOpRequest?: (
    paneIndex: number,
  ) => {
    requestId: number;
    op: "delete" | "rename" | "mkdir" | "archive" | "newTextFile" | "editTextFile";
    names: string[];
  } | null;
  registerNssCommanderFilePaneToolbarSlot?: (paneIndex: number, el: HTMLElement | null) => void;
  getNssCommanderFilePaneToolbarSlot?: (paneIndex: number) => HTMLElement | null;
  /** When set, pane shows embedded web UI instead of terminal or file browser. */
  webPanePayloadForPane: (paneIndex: number) => { url: string; title: string; allowInsecureTls?: boolean; tlsTrustedCertPem?: string | null } | null;
  /** PROXMUX pane-native QEMU noVNC, LXC terminal, or node shell (ticket + WebSocket), when session kind matches. */
  proxmoxNativeConsoleForPane: (paneIndex: number) => ProxmoxNativeConsolePanePayload | null;
  /** Incrementing nonce used to request a noVNC reconnect for a given pane. */
  proxmoxQemuVncReconnectNonceForPane: (paneIndex: number) => number;
  requestProxmoxQemuVncReconnect: (paneIndex: number) => void;
  openProxmoxQemuVncInAppWindow: (paneIndex: number) => void;
  openProxmoxQemuVncInBrowser: (paneIndex: number) => void;
  proxmoxLxcReconnectNonceForPane: (paneIndex: number) => number;
  requestProxmoxLxcReconnect: (paneIndex: number) => void;
  openProxmoxLxcInAppWindow: (paneIndex: number) => void;
  openProxmoxLxcInBrowser: (paneIndex: number) => void;
  proxmoxNodeTermReconnectNonceForPane: (paneIndex: number) => number;
  requestProxmoxNodeTermReconnect: (paneIndex: number) => void;
  openProxmoxNodeTermInAppWindow: (paneIndex: number) => void;
  openProxmoxNodeTermInBrowser: (paneIndex: number) => void;
  /** Hetzner VNC console pane payload for a given pane index. */
  hetznerVncConsoleForPane: (paneIndex: number) => HetznerVncPanePayload | null;
  hetznerVncReconnectNonceForPane: (paneIndex: number) => number;
  requestHetznerVncReconnect: (paneIndex: number) => void;
  /** WebSocket open wait in browser for Proxmox pane-native consoles (from app preferences). */
  connectTimeoutMs: number;
  /** Surface errors from the web pane (e.g. failed in-app webview window). */
  onWebPaneOpenInAppWindowError?: (message: string) => void;
  /** Proxmox console deep links need login first; same payload as the main-window assist banner. */
  onWebPaneLoginFirstWebviewOpen?: (payload: { label: string; consoleUrl: string }) => void;
  /** When true, leaf pane roots register for scroll-into-view (vertical stack workspace). */
  verticalStackScrollEnabled: boolean;
  registerPaneScrollAnchor: (paneIndex: number, element: HTMLElement | null) => void;
};

/** NSS-Commander file toolbar portal target. Uses a stable ref callback (not inline) to avoid detach/setState loops. */
function NssCommanderPaneTitleFileToolbarHost({
  paneIndex,
  registerSlot,
}: {
  paneIndex: number;
  registerSlot: (paneIndex: number, el: HTMLElement | null) => void;
}) {
  const ref = useCallback(
    (el: HTMLElement | null) => {
      registerSlot(paneIndex, el);
    },
    [paneIndex, registerSlot],
  );
  return (
    <div
      className="split-pane-toolbar-group split-pane-toolbar-group-nav split-pane-label-nss-file-toolbar-host"
      ref={ref}
      aria-label="File browser actions"
    />
  );
}

/** Leading pane kind icon when NSS-Commander hides the full pane toolbar (English a11y strings). */
function NssCommanderPaneKindIcon({
  nssMinimalChrome,
  paneSessionId,
  paneFileView,
  paneCtxKind,
  webPayload,
  proxmoxNative,
}: {
  nssMinimalChrome: boolean;
  paneSessionId: string | null;
  paneFileView: "terminal" | "remote" | "local";
  paneCtxKind: PaneContextSessionKind;
  webPayload: { url: string; title: string } | null;
  proxmoxNative: ProxmoxNativeConsolePanePayload | null;
}): ReactNode {
  if (!nssMinimalChrome) {
    return null;
  }

  type Visual =
    | "empty"
    | "web"
    | "pxVnc"
    | "pxLxc"
    | "pxNode"
    | "remoteFiles"
    | "localFiles"
    | "localTerm"
    | "sshTerm";

  let visual: Visual;
  let aria: string;

  if (!paneSessionId || paneCtxKind === "empty") {
    visual = "empty";
    aria = "Empty pane";
  } else if (webPayload) {
    visual = "web";
    aria = "Web pane";
  } else if (proxmoxNative?.kind === "qemu-vnc") {
    visual = "pxVnc";
    aria = "QEMU graphical console";
  } else if (proxmoxNative?.kind === "lxc-term") {
    visual = "pxLxc";
    aria = "LXC terminal console";
  } else if (proxmoxNative?.kind === "node-term") {
    visual = "pxNode";
    aria = "Proxmox node shell";
  } else if (paneFileView === "remote") {
    visual = "remoteFiles";
    aria = "Remote file browser (SFTP)";
  } else if (paneFileView === "local") {
    visual = "localFiles";
    aria = "Local file browser";
  } else if (paneCtxKind === "local") {
    visual = "localTerm";
    aria = "Local terminal";
  } else if (paneCtxKind === "ssh") {
    visual = "sshTerm";
    aria = "SSH terminal";
  } else if (paneCtxKind === "web") {
    visual = "web";
    aria = "Web pane";
  } else {
    visual = "sshTerm";
    aria = "SSH terminal";
  }

  const sw = 1.85;
  const glyph = (() => {
    switch (visual) {
      case "empty":
        return <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" strokeDasharray="3.2 2.4" />;
      case "web":
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c4 3 4 15 0 18M12 3c-4 3-4 15 0 18" />
          </>
        );
      case "pxVnc":
        return (
          <>
            <rect x="5" y="7" width="14" height="10" rx="1.4" />
            <path d="M9 21h6" />
          </>
        );
      case "pxLxc":
        return (
          <>
            <rect x="6" y="5" width="12" height="14" rx="2" />
            <path d="M9 9h6M9 13h4" />
          </>
        );
      case "pxNode":
        return (
          <>
            <rect x="5" y="5.5" width="14" height="3.5" rx="1" />
            <rect x="5" y="10.2" width="14" height="3.5" rx="1" />
            <rect x="5" y="15" width="14" height="3.5" rx="1" />
            <path d="M15.5 7v.5M15.5 12v.5M15.5 16.8v.5" strokeLinecap="round" />
          </>
        );
      case "remoteFiles":
        return (
          <>
            <path d="M4 9a2 2 0 012-2h4.5l1.8 2H18a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />
            <path d="M13 7l2 2h3" />
          </>
        );
      case "localFiles":
        return <path d="M4 9a2 2 0 012-2h4.5l1.8 2H18a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />;
      case "localTerm":
        return (
          <>
            <rect x="4.5" y="5.5" width="15" height="13" rx="2" />
            <path d="M7.5 15.5h5" />
          </>
        );
      case "sshTerm":
        return (
          <>
            <rect x="4.5" y="5.5" width="15" height="13" rx="2" />
            <path d="M8 11.5l2.5 1.8L8 15M13.5 14H16" />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <span className="split-pane-nss-kind-icon" title={aria} aria-label={aria}>
      <svg className="pane-toolbar-svg split-pane-nss-kind-svg" viewBox="0 0 24 24" aria-hidden="true" strokeWidth={sw}>
        {glyph}
      </svg>
    </span>
  );
}

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
        paneSessionId && b.webPanePayloadForPane(paneIndex) === null && b.proxmoxNativeConsoleForPane(paneIndex) === null && b.hetznerVncConsoleForPane(paneIndex) === null,
      );
      const paneFileView = b.paneFileViewForPane(paneIndex);
      const paneCtxKind = b.paneContextSessionKindForPane(paneIndex);
      const remoteSpec = b.remoteSshSpecForPane(paneIndex);
      const proxmoxNative = paneSessionId ? b.proxmoxNativeConsoleForPane(paneIndex) : null;
      const hetznerVnc = paneSessionId ? b.hetznerVncConsoleForPane(paneIndex) : null;
      const webPayload = paneSessionId ? b.webPanePayloadForPane(paneIndex) : null;
      const hasQemuVncToolbarActions = proxmoxNative?.kind === "qemu-vnc";
      const hasLxcToolbarActions = proxmoxNative?.kind === "lxc-term";
      const hasNodeTermToolbarActions = proxmoxNative?.kind === "node-term";
      const hasHetznerVncToolbarActions = hetznerVnc != null;
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
          ref={(element) => {
            b.registerPaneScrollAnchor(paneIndex, b.verticalStackScrollEnabled ? element : null);
          }}
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
            const nssMinimalChrome = b.nssCommanderMinimalPaneChrome === true;
            b.setActiveDropZone(
              emptyForHostOverlay ? "center" : nssMinimalChrome ? "center" : b.resolvePaneDropZone(event.clientX, event.clientY, bounds),
            );
          }}
          onDragEnterCapture={(event) => {
            event.preventDefault();
            b.setDragOverPaneIndex(paneIndex);
            const bounds = event.currentTarget.getBoundingClientRect();
            b.setActiveDropZonePaneIndex(paneIndex);
            const emptyForHostOverlay = b.draggingKind === "machine" && !paneSessionId;
            const nssMinimalChrome = b.nssCommanderMinimalPaneChrome === true;
            b.setActiveDropZone(
              emptyForHostOverlay ? "center" : nssMinimalChrome ? "center" : b.resolvePaneDropZone(event.clientX, event.clientY, bounds),
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
          {isDropOverlayVisible &&
            b.nssCommanderMinimalPaneChrome === true &&
            !(b.draggingKind === "machine" && !hasPaneSession) && (
            <div className="pane-drop-zones-host-empty" aria-hidden="true">
              <span className="pane-drop-host-empty-label">
                {b.draggingKind === "machine"
                  ? "Replace"
                  : isSelfPaneDrop
                    ? "–"
                    : "Swap"}
              </span>
            </div>
          )}
          {isDropOverlayVisible &&
            b.nssCommanderMinimalPaneChrome !== true &&
            !(b.draggingKind === "machine" && !hasPaneSession) && (
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
            {b.nssCommanderSwapFilePaneToolbarWithPaneLabel === true &&
            paneSessionId &&
            (paneFileView === "local" || paneFileView === "remote") &&
            b.registerNssCommanderFilePaneToolbarSlot ? (
              <>
                <NssCommanderPaneKindIcon
                  nssMinimalChrome={b.nssCommanderMinimalPaneChrome === true}
                  paneSessionId={paneSessionId}
                  paneFileView={paneFileView}
                  paneCtxKind={paneCtxKind}
                  webPayload={webPayload}
                  proxmoxNative={proxmoxNative}
                />
                <NssCommanderPaneTitleFileToolbarHost
                  paneIndex={paneIndex}
                  registerSlot={b.registerNssCommanderFilePaneToolbarSlot}
                />
              </>
            ) : (
              <div className="split-pane-toolbar-group split-pane-toolbar-group-nav">
                <NssCommanderPaneKindIcon
                  nssMinimalChrome={b.nssCommanderMinimalPaneChrome === true}
                  paneSessionId={paneSessionId}
                  paneFileView={paneFileView}
                  paneCtxKind={paneCtxKind}
                  webPayload={webPayload}
                  proxmoxNative={proxmoxNative}
                />
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
            )}
            {b.nssCommanderMinimalPaneChrome !== true ? (
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
                      : "Browse remote files (SFTP) — enable NSS-Commander in Settings → Plugins"
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
                      : "Browse local files — enable NSS-Commander in Settings → Plugins"
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
            {hasQemuVncToolbarActions ? (
              <>
                <div className="split-pane-toolbar-group split-pane-toolbar-group-proxmox-vnc">
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Reconnect noVNC"
                    aria-label={`Reconnect noVNC in pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.requestProxmoxQemuVncReconnect(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M20.4 6.4v4.8h-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open console in app window"
                    aria-label={`Open noVNC console in app window for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxQemuVncInAppWindow(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8.5 10h7M8.5 13h5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open console in browser"
                    aria-label={`Open noVNC console in browser for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxQemuVncInBrowser(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13.2 5.2h5.6v5.6M18.8 5.2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M18.8 13v5.2a.6.6 0 0 1-.6.6H5.8a.6.6 0 0 1-.6-.6V5.8a.6.6 0 0 1 .6-.6H11" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                </div>
                <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
              </>
            ) : null}
            {hasLxcToolbarActions ? (
              <>
                <div className="split-pane-toolbar-group split-pane-toolbar-group-proxmox-vnc">
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Reconnect LXC console"
                    aria-label={`Reconnect LXC console in pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.requestProxmoxLxcReconnect(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M20.4 6.4v4.8h-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open LXC console in app window"
                    aria-label={`Open LXC console in app window for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxLxcInAppWindow(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8.5 10h7M8.5 13h5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open LXC console in browser"
                    aria-label={`Open LXC console in browser for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxLxcInBrowser(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13.2 5.2h5.6v5.6M18.8 5.2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M18.8 13v5.2a.6.6 0 0 1-.6.6H5.8a.6.6 0 0 1-.6-.6V5.8a.6.6 0 0 1 .6-.6H11" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                </div>
                <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
              </>
            ) : null}
            {hasNodeTermToolbarActions ? (
              <>
                <div className="split-pane-toolbar-group split-pane-toolbar-group-proxmox-vnc">
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Reconnect node shell"
                    aria-label={`Reconnect node shell in pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.requestProxmoxNodeTermReconnect(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M20.4 6.4v4.8h-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open node shell in app window"
                    aria-label={`Open node shell in app window for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxNodeTermInAppWindow(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5.2" y="6.2" width="13.6" height="11.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8.5 10h7M8.5 13h5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Open node shell in browser"
                    aria-label={`Open node shell in browser for pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.openProxmoxNodeTermInBrowser(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13.2 5.2h5.6v5.6M18.8 5.2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M18.8 13v5.2a.6.6 0 0 1-.6.6H5.8a.6.6 0 0 1-.6-.6V5.8a.6.6 0 0 1 .6-.6H11" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                </div>
                <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
              </>
            ) : null}
            {hasHetznerVncToolbarActions ? (
              <>
                <div className="split-pane-toolbar-group split-pane-toolbar-group-proxmox-vnc">
                  <button
                    type="button"
                    className="btn action-icon-btn pane-toolbar-btn"
                    title="Reconnect Hetzner VNC"
                    aria-label={`Reconnect Hetzner VNC in pane ${paneIndex + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      b.requestHetznerVncReconnect(paneIndex);
                    }}
                  >
                    <svg className="pane-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M20.4 6.4v4.8h-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                </div>
                <span className="pane-toolbar-separator pane-toolbar-separator--primary" aria-hidden="true" />
              </>
            ) : null}
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
            ) : null}
          </div>
          {(() => {
            const webPayload = paneSessionId ? b.webPanePayloadForPane(paneIndex) : null;
            if (webPayload) {
              return (
                <Suspense fallback={paneLazySuspenseFallback("Loading web pane")}>
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
            const px = proxmoxNative;
            if (px?.kind === "qemu-vnc") {
              return (
                <Suspense fallback={paneLazySuspenseFallback("Loading noVNC")}>
                  <ProxmoxQemuVncPane
                    clusterId={px.clusterId}
                    node={px.node}
                    vmid={px.vmid}
                    paneTitle={px.paneTitle}
                    allowInsecureTls={px.allowInsecureTls === true}
                    tlsTrustedCertPem={px.tlsTrustedCertPem}
                    reconnectRequestNonce={b.proxmoxQemuVncReconnectNonceForPane(paneIndex)}
                    connectTimeoutMs={b.connectTimeoutMs}
                    onError={b.onWebPaneOpenInAppWindowError}
                  />
                </Suspense>
              );
            }
            if (px?.kind === "lxc-term") {
              return (
                <Suspense fallback={paneLazySuspenseFallback("Loading LXC console")}>
                  <ProxmoxLxcTermPane
                    clusterId={px.clusterId}
                    node={px.node}
                    vmid={px.vmid}
                    paneTitle={px.paneTitle}
                    allowInsecureTls={px.allowInsecureTls === true}
                    tlsTrustedCertPem={px.tlsTrustedCertPem}
                    reconnectRequestNonce={b.proxmoxLxcReconnectNonceForPane(paneIndex)}
                    connectTimeoutMs={b.connectTimeoutMs}
                    onError={b.onWebPaneOpenInAppWindowError}
                  />
                </Suspense>
              );
            }
            if (px?.kind === "node-term") {
              return (
                <Suspense fallback={paneLazySuspenseFallback("Loading node shell")}>
                  <ProxmoxNodeTermPane
                    clusterId={px.clusterId}
                    node={px.node}
                    paneTitle={px.paneTitle}
                    allowInsecureTls={px.allowInsecureTls === true}
                    tlsTrustedCertPem={px.tlsTrustedCertPem}
                    reconnectRequestNonce={b.proxmoxNodeTermReconnectNonceForPane(paneIndex)}
                    connectTimeoutMs={b.connectTimeoutMs}
                    onError={b.onWebPaneOpenInAppWindowError}
                  />
                </Suspense>
              );
            }
            if (hetznerVnc) {
              return (
                <Suspense fallback={paneLazySuspenseFallback("Loading Hetzner VNC")}>
                  <HetznerVncPane
                    projectId={hetznerVnc.projectId}
                    serverId={hetznerVnc.serverId}
                    paneTitle={hetznerVnc.paneTitle}
                    reconnectRequestNonce={b.hetznerVncReconnectNonceForPane(paneIndex)}
                    connectTimeoutMs={b.connectTimeoutMs}
                    onError={b.onWebPaneOpenInAppWindowError}
                  />
                </Suspense>
              );
            }
            if (paneSessionId) {
              return paneFileView === "remote" && remoteSpec ? (
                <Suspense fallback={paneLazySuspenseFallback("Loading file browser")}>
                  <RemoteFilePane
                    paneIndex={paneIndex}
                    spec={remoteSpec}
                    onPathChange={b.onRemoteFilePanePathChange ? (path) => b.onRemoteFilePanePathChange!(paneIndex, path) : undefined}
                    getExportDestPath={b.getFileExportDestPath}
                    archiveFormat={b.fileExportArchiveFormat}
                    onBack={() => void b.handleContextAction("pane.toggleRemoteFiles", paneIndex)}
                    onFilePaneTitleChange={b.onFilePaneTitleChange}
                    semanticFileNameColors={b.semanticFileNameColors}
                    nssCommanderSwapFilePaneToolbarWithPaneLabel={b.nssCommanderSwapFilePaneToolbarWithPaneLabel === true}
                    getNssCommanderFilePaneToolbarSlot={b.getNssCommanderFilePaneToolbarSlot}
                    onF5Copy={b.onRemoteFilePaneF5Copy ? (src, names) => b.onRemoteFilePaneF5Copy!(paneIndex, src, names) : undefined}
                    onTabSwitchPane={b.onRemoteFilePaneTabSwitch ? () => b.onRemoteFilePaneTabSwitch!(paneIndex) : undefined}
                    onSelectionChange={b.onFilePaneSelectionChange}
                    nssCommanderReloadAllKey={b.nssCommanderFilePaneReloadAllKey ?? 0}
                    nssCommanderPaneOpRequest={b.resolveNssCommanderPaneOpRequest?.(paneIndex) ?? null}
                    onFilePaneTableHeadOffsetInSplitPane={b.onFilePaneTableHeadOffsetInSplitPane}
                  />
                </Suspense>
              ) : paneFileView === "local" ? (
                <Suspense fallback={paneLazySuspenseFallback("Loading file browser")}>
                  <LocalFilePane
                    paneIndex={paneIndex}
                    onPathChange={(pathKey) => b.onLocalFilePanePathChange(paneIndex, pathKey)}
                    getExportDestPath={b.getFileExportDestPath}
                    archiveFormat={b.fileExportArchiveFormat}
                    onBack={() => void b.handleContextAction("pane.toggleLocalFiles", paneIndex)}
                    onFilePaneTitleChange={b.onFilePaneTitleChange}
                    semanticFileNameColors={b.semanticFileNameColors}
                    nssCommanderSwapFilePaneToolbarWithPaneLabel={b.nssCommanderSwapFilePaneToolbarWithPaneLabel === true}
                    getNssCommanderFilePaneToolbarSlot={b.getNssCommanderFilePaneToolbarSlot}
                    onF5Copy={b.onLocalFilePaneF5Copy ? (src, names) => b.onLocalFilePaneF5Copy!(paneIndex, src, names) : undefined}
                    onTabSwitchPane={b.onLocalFilePaneTabSwitch ? () => b.onLocalFilePaneTabSwitch!(paneIndex) : undefined}
                    onSelectionChange={b.onFilePaneSelectionChange}
                    nssCommanderReloadAllKey={b.nssCommanderFilePaneReloadAllKey ?? 0}
                    nssCommanderPaneOpRequest={b.resolveNssCommanderPaneOpRequest?.(paneIndex) ?? null}
                    onFilePaneTableHeadOffsetInSplitPane={b.onFilePaneTableHeadOffsetInSplitPane}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={paneLazySuspenseFallback("Loading terminal")}>
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
    const leftLeaf = node.first.type === "leaf" ? node.first : null;
    const rightLeaf = node.second.type === "leaf" ? node.second : null;
    const nssOpsDivider =
      b.nssCommanderUseClassicGutter === true &&
      b.nssCommanderMinimalPaneChrome === true &&
      b.nssCommanderHasTwoFilePanes === true &&
      node.axis === "horizontal" &&
      leftLeaf != null &&
      rightLeaf != null &&
      typeof b.renderNssCommanderSplitDividerContent === "function";
    const nssOpsTopInsetPx = Math.max(0, Math.round(b.nssCommanderOpsDividerTopInsetPx ?? 0));

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
          className={`${dividerClass}${nssOpsDivider ? " split-node-divider--nss-commander-ops" : ""}`}
          role="separator"
          aria-orientation={node.axis === "horizontal" ? "vertical" : "horizontal"}
          onPointerDown={nssOpsDivider ? undefined : b.startSplitResize(node.id, node.axis)}
        >
          {nssOpsDivider ? (
            <>
              <div
                className="split-node-divider-nss-top-spacer"
                style={{ height: nssOpsTopInsetPx, flex: `0 0 ${nssOpsTopInsetPx}px` }}
                aria-hidden="true"
              />
              <div
                className="split-node-divider-nss-resize-handle"
                role="presentation"
                title="Drag to resize panes"
                onPointerDown={b.startSplitResize(node.id, node.axis)}
              />
              <div className="split-node-divider-nss-ops-scroll">
                {leftLeaf && rightLeaf
                  ? b.renderNssCommanderSplitDividerContent!(leftLeaf.paneIndex, rightLeaf.paneIndex)
                  : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="split-node-child" style={{ flexBasis: `${secondRatio * 100}%` }}>
          {renderSplitNode(node.second)}
        </div>
      </div>
    );
  };
  return renderSplitNode;
}
