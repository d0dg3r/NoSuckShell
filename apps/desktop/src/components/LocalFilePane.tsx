import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatFileSize,
  isLocalUpDisabled,
  joinLocalPath,
  localFolderTitleShort,
  localParentDir,
  localParentOfHome,
  localPathBreadcrumbSegments,
  localPathResolvedForTitle,
} from "../features/file-pane-paths";
import {
  FILE_DND_PAYLOAD_MIME,
  type FileDragPayload,
  parseFileDragPayload,
  serializeFileDragPayload,
} from "../features/file-pane-dnd";
import { runLocalFilePaneExport } from "../features/file-pane-export";
import {
  importFilesFromDialogToLocal,
  importFolderFromDialogToLocal,
} from "../features/file-pane-upload-from-dialog";
import { monacoLanguageFromFileName } from "../features/file-pane-editor-language";
import { runFilePaneTransfer, type FileDropTarget } from "../features/file-pane-transfer";
import { copyFileToTransferClipboard, getFileTransferClipboard } from "../features/file-transfer-clipboard";
import { filePaneNameKind, filePaneNameKindClassName } from "../features/file-pane-name-kind";
import { filePanePermCell } from "../features/file-pane-perm-cell";
import { InlineSpinner } from "./InlineSpinner";
import { useFilePaneTableResize } from "../hooks/useFilePaneTableResize";
import { useSplitPaneFilePaneLabelInset } from "../hooks/useSplitPaneFilePaneLabelInset";
import {
  createLocalDir,
  createLocalTextFile,
  deleteLocalEntry,
  deleteLocalEntryWithMode,
  type DeleteEntryMode,
  type DeleteTreeResult,
  getLocalHomeCanonicalPath,
  listLocalDir,
  openLocalEntryInOs,
  readLocalTextFile,
  renameLocalEntry,
  writeLocalTextFile,
} from "../tauri-api";
import type { LocalDirEntry } from "../types";
import type { FileExportArchiveFormat } from "./settings/app-settings-types";
import type { FilePaneContextMenuAction } from "./FilePaneContextMenu";
import { FilePaneContextMenu } from "./FilePaneContextMenu";
import { FilePaneConfirmDialog, FilePaneDoubleDeleteDialog, FilePaneTextPrompt } from "./FilePaneDialogs";
import { FilePaneTableHead } from "./FilePaneTableHead";
import { FilePaneToolbar } from "./FilePaneToolbar";
import { FilePanePathBreadcrumbs } from "./FilePanePathBreadcrumbs";

const FilePaneTextEditor = lazy(async () => {
  const m = await import("./FilePaneTextEditor");
  return { default: m.FilePaneTextEditor };
});

type TextEditorSession = {
  fileName: string;
  initialContent: string;
  isNewFile: boolean;
};

type Props = {
  paneIndex: number;
  onBack: () => void;
  onPathChange: (pathKey: string) => void;
  getExportDestPath: () => Promise<string | null>;
  archiveFormat: FileExportArchiveFormat;
  onFilePaneTitleChange: (paneIndex: number, payload: { short: string; full: string } | null) => void;
  semanticFileNameColors: boolean;
  /** F5 in the pane triggers a copy of selected files to the paired pane. */
  onF5Copy?: (sourcePath: string, selectedNames: string[]) => void;
  /** Tab in an NSS-Commander workspace moves focus to the other file pane. */
  onTabSwitchPane?: () => void;
  /** NSS-Commander: icons portaled into pane title row; full path in this toolbar row. */
  nssCommanderSwapFilePaneToolbarWithPaneLabel?: boolean;
  getNssCommanderFilePaneToolbarSlot?: (paneIndex: number) => HTMLElement | null;
  /** Report selection to the host (vertical ops bar). */
  onSelectionChange?: (paneIndex: number, selectedNames: Set<string>) => void;
  /** Incrementing key: all file panes reload when it changes. */
  nssCommanderReloadAllKey?: number;
  /** One-shot op from the vertical ops bar for this pane. */
  nssCommanderPaneOpRequest?: {
    requestId: number;
    op: "delete" | "rename" | "mkdir" | "archive" | "newTextFile" | "editTextFile";
    names: string[];
  } | null;
  /** NSS-Commander: distance from split-pane top to table header row (for center ops strip alignment). */
  onFilePaneTableHeadOffsetInSplitPane?: (paneIndex: number, offsetPx: number | null) => void;
};

function SaveRowIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14" strokeLinecap="round" />
    </svg>
  );
}

/** Path key for `list_local_dir`: empty = home, relative = under home, leading `/` = absolute. */
export function LocalFilePane({
  paneIndex,
  onBack,
  onPathChange,
  getExportDestPath,
  archiveFormat,
  onFilePaneTitleChange,
  semanticFileNameColors,
  onF5Copy,
  onTabSwitchPane,
  nssCommanderSwapFilePaneToolbarWithPaneLabel = false,
  getNssCommanderFilePaneToolbarSlot,
  onSelectionChange,
  nssCommanderReloadAllKey = 0,
  nssCommanderPaneOpRequest,
  onFilePaneTableHeadOffsetInSplitPane,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastNssPaneOpRequestIdRef = useRef(0);
  const [path, setPath] = useState("");
  const [homeCanon, setHomeCanon] = useState<string | null>(null);
  const [entries, setEntries] = useState<LocalDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set());
  const [lastRangeIndex, setLastRangeIndex] = useState<number | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [promptKind, setPromptKind] = useState<null | "mkdir" | "rename" | "newFile">(null);
  const [deleteFlow, setDeleteFlow] = useState<null | { name: string; isDir: boolean; step: 1 | 2 }>(null);
  const [bulkDeletePendingNames, setBulkDeletePendingNames] = useState<string[] | null>(null);
  const [deleteRecovery, setDeleteRecovery] = useState<null | { names: string[]; firstError: string }>(null);
  const [textEditorSession, setTextEditorSession] = useState<TextEditorSession | null>(null);

  useEffect(() => {
    setSelectedNames(new Set());
    setActiveName(null);
    setLastRangeIndex(null);
    setBulkDeletePendingNames(null);
    setDeleteRecovery(null);
  }, [path]);

  useEffect(() => {
    void getLocalHomeCanonicalPath()
      .then(setHomeCanon)
      .catch(() => setHomeCanon(null));
  }, []);

  useEffect(() => {
    onPathChange(path);
  }, [path, onPathChange]);

  useEffect(() => {
    onSelectionChange?.(paneIndex, selectedNames);
  }, [onSelectionChange, paneIndex, selectedNames]);

  useEffect(() => {
    const full = localPathResolvedForTitle(homeCanon, path);
    onFilePaneTitleChange(paneIndex, { short: localFolderTitleShort(path), full });
    return () => onFilePaneTitleChange(paneIndex, null);
  }, [paneIndex, path, homeCanon, onFilePaneTitleChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLocalDir(path);
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  const openEditorForExistingFile = useCallback(
    async (name: string) => {
      const row = entries.find((e) => e.name === name);
      if (!row || row.isDir) {
        return;
      }
      setCtxMenu(null);
      setError(null);
      try {
        const text = await readLocalTextFile(path, name);
        setTextEditorSession({ fileName: name, initialContent: text, isNewFile: false });
      } catch (e) {
        setError(String(e));
      }
    },
    [entries, path],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const isPermissionDeleteError = (error: unknown): boolean => {
    const msg = String(error).toLowerCase();
    return msg.includes("permission denied") || msg.includes("eacces") || msg.includes("operation not permitted");
  };

  const summarizeDeleteModeFailures = (outcomes: DeleteTreeResult[]): string | null => {
    const failures = outcomes.flatMap((o) => o.failures);
    if (failures.length === 0) {
      return null;
    }
    const preview = failures
      .slice(0, 3)
      .map((f) => `${f.path}: ${f.message}`)
      .join(" | ");
    const extra = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
    return `Some entries could not be deleted: ${preview}${extra}`;
  };

  const runDeleteModeAcrossNames = async (
    names: string[],
    mode: DeleteEntryMode,
  ): Promise<{ ok: boolean; message?: string }> => {
    const outcomes: DeleteTreeResult[] = [];
    for (const name of names) {
      try {
        outcomes.push(await deleteLocalEntryWithMode(path, name, mode));
      } catch (e) {
        return { ok: false, message: String(e) };
      }
    }
    const summary = summarizeDeleteModeFailures(outcomes);
    return summary ? { ok: false, message: summary } : { ok: true };
  };

  useSplitPaneFilePaneLabelInset(rootRef, path, loading, entries.length);

  const autoFitSamples = useMemo(
    () => ({
      name: entries.map((e) => (e.isDir ? `${e.name}/` : e.name)),
      perm: entries.map((e) => {
        const r = e.modeDisplay?.trim();
        const o = e.modeOctal?.trim();
        if (r && o) {
          return r.length >= o.length ? r : o;
        }
        return r || o || "—";
      }),
      user: entries.map((e) => (e.userDisplay?.trim() ? e.userDisplay : "—")),
      group: entries.map((e) => (e.groupDisplay?.trim() ? e.groupDisplay : "—")),
      size: entries.map((e) => (e.isDir ? "—" : formatFileSize(e.size))),
    }),
    [entries],
  );

  const userColumnSamples = useMemo(
    () => entries.map((e) => (e.userDisplay?.trim() ? e.userDisplay : "—")),
    [entries],
  );
  const groupColumnSamples = useMemo(
    () => entries.map((e) => (e.groupDisplay?.trim() ? e.groupDisplay : "—")),
    [entries],
  );

  const { tableWrapRef, widths, tailCols, onGripPointerDown, onGripDoubleClick, applyOptimalColumnWidths } =
    useFilePaneTableResize("local", 140, autoFitSamples, userColumnSamples, groupColumnSamples);

  useLayoutEffect(() => {
    if (nssCommanderSwapFilePaneToolbarWithPaneLabel !== true || !onFilePaneTableHeadOffsetInSplitPane) {
      return;
    }
    const measure = () => {
      const paneRoot = rootRef.current?.closest("[data-pane-index]") as HTMLElement | null;
      const thead = tableWrapRef.current?.querySelector("thead");
      if (!paneRoot || !thead) {
        onFilePaneTableHeadOffsetInSplitPane(paneIndex, null);
        return;
      }
      const paneRect = paneRoot.getBoundingClientRect();
      const thRect = thead.getBoundingClientRect();
      onFilePaneTableHeadOffsetInSplitPane(paneIndex, Math.round(thRect.top - paneRect.top));
    };
    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    if (rootRef.current) {
      ro.observe(rootRef.current);
    }
    if (tableWrapRef.current) {
      ro.observe(tableWrapRef.current);
    }
    const paneRoot = rootRef.current?.closest("[data-pane-index]");
    if (paneRoot) {
      ro.observe(paneRoot);
    }
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
      onFilePaneTableHeadOffsetInSplitPane(paneIndex, null);
    };
  }, [
    nssCommanderSwapFilePaneToolbarWithPaneLabel,
    onFilePaneTableHeadOffsetInSplitPane,
    paneIndex,
    loading,
    error,
    lastOk,
    transferBusy,
    entries.length,
    path,
  ]);

  const openDir = (name: string) => {
    setPath((p) => joinLocalPath(p, name));
  };

  const goUp = () => {
    if (path === "") {
      if (!homeCanon) {
        return;
      }
      setPath(localParentOfHome(homeCanon));
      return;
    }
    setPath((p) => localParentDir(p));
  };

  const goRoot = () => {
    setPath("/");
  };

  const titlePath = localPathResolvedForTitle(homeCanon, path);
  const upDisabled = isLocalUpDisabled(path, homeCanon);

  const exportNames = useCallback(
    async (names: string[]) => {
      if (names.length === 0) {
        return;
      }
      setExportBusy(names.length === 1 ? names[0]! : "__multi__");
      setError(null);
      setLastOk(null);
      try {
        const dest = await getExportDestPath();
        if (dest === null) {
          return;
        }
        const saved = await runLocalFilePaneExport({
          parentPathKey: path,
          names,
          entries,
          destPathKeyOrAbs: dest,
          archiveFormat,
        });
        setLastOk(`Saved to ${saved}`);
      } catch (e) {
        setError(String(e));
      } finally {
        setExportBusy(null);
      }
    },
    [archiveFormat, entries, getExportDestPath, path],
  );

  useEffect(() => {
    if (nssCommanderReloadAllKey > 0) {
      void load();
    }
  }, [nssCommanderReloadAllKey, load]);

  useEffect(() => {
    const req = nssCommanderPaneOpRequest;
    if (!req || (req.op !== "mkdir" && req.op !== "newTextFile" && req.names.length === 0)) {
      return;
    }
    if (req.requestId === lastNssPaneOpRequestIdRef.current) {
      return;
    }
    lastNssPaneOpRequestIdRef.current = req.requestId;
    if (req.op === "mkdir") {
      setPromptKind("mkdir");
      return;
    }
    if (req.op === "newTextFile") {
      setPromptKind("newFile");
      return;
    }
    if (req.op === "editTextFile") {
      if (req.names.length !== 1) {
        return;
      }
      void openEditorForExistingFile(req.names[0]!);
      return;
    }
    if (req.op === "rename") {
      if (req.names.length !== 1) {
        return;
      }
      const name = req.names[0]!;
      setActiveName(name);
      setSelectedNames(new Set([name]));
      setPromptKind("rename");
      return;
    }
    if (req.op === "delete") {
      if (req.names.length === 1) {
        const name = req.names[0]!;
        const row = entries.find((e) => e.name === name);
        if (row) {
          setDeleteFlow({ name, isDir: row.isDir, step: 1 });
        }
        return;
      }
      setBulkDeletePendingNames(req.names);
      return;
    }
    if (req.op === "archive") {
      void exportNames(req.names);
    }
  }, [nssCommanderPaneOpRequest, path, entries, exportNames, load, openEditorForExistingFile]);

  const handleRowClick = (name: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastRangeIndex !== null) {
      const lo = Math.min(index, lastRangeIndex);
      const hi = Math.max(index, lastRangeIndex);
      const next = new Set(selectedNames);
      for (let i = lo; i <= hi; i++) {
        const row = entries[i];
        if (row) {
          next.add(row.name);
        }
      }
      setSelectedNames(next);
      setActiveName(name);
      setLastRangeIndex(index);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedNames((prev) => {
        const n = new Set(prev);
        if (n.has(name)) {
          n.delete(name);
        } else {
          n.add(name);
        }
        return n;
      });
      setActiveName(name);
      setLastRangeIndex(index);
      return;
    }
    setSelectedNames(new Set([name]));
    setActiveName(name);
    setLastRangeIndex(index);
  };

  const handleDirectoryActivate = (name: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      handleRowClick(name, index, event);
      return;
    }
    // Total-Commander-like flow: first click selects, second click enters.
    if (activeName === name && selectedNames.size === 1 && selectedNames.has(name)) {
      openDir(name);
      return;
    }
    handleRowClick(name, index, event);
  };

  const dropTarget: FileDropTarget = { kind: "local", pathKey: path };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData(FILE_DND_PAYLOAD_MIME);
    const payload = raw ? parseFileDragPayload(raw) : null;
    if (!payload) {
      return;
    }
    setTransferBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await runFilePaneTransfer(payload, dropTarget);
      setLastOk(typeof result === "string" ? `Saved: ${result}` : "Transfer complete.");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setTransferBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    const payload = getFileTransferClipboard();
    if (!payload) {
      return;
    }
    setTransferBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await runFilePaneTransfer(payload, dropTarget);
      setLastOk(typeof result === "string" ? `Saved: ${result}` : "Transfer complete.");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setTransferBusy(false);
    }
  };

  const uploadTransferDisabled = exportBusy !== null || transferBusy;

  const handleUploadFiles = async () => {
    setTransferBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const n = await importFilesFromDialogToLocal(path);
      if (n > 0) {
        setLastOk(n === 1 ? "Copied one file." : `Copied ${n} files.`);
        await load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTransferBusy(false);
    }
  };

  const handleUploadFolder = async () => {
    setTransferBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const n = await importFolderFromDialogToLocal(path);
      if (n > 0) {
        setLastOk("Folder copied.");
        await load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setTransferBusy(false);
    }
  };

  const copySelectionToClipboard = async () => {
    if (!activeName) {
      return;
    }
    const row = entries.find((e) => e.name === activeName);
    if (!row || row.isDir) {
      return;
    }
    const p: FileDragPayload = { kind: "local", pathKey: path, name: activeName };
    await copyFileToTransferClipboard(p);
    setLastOk(`Copied “${activeName}” (paste in another file pane)`);
  };

  const startNewFolder = () => {
    setCtxMenu(null);
    setPromptKind("mkdir");
  };

  const startNewFile = () => {
    setCtxMenu(null);
    setPromptKind("newFile");
  };

  const startRename = () => {
    if (!activeName) {
      return;
    }
    setCtxMenu(null);
    setPromptKind("rename");
  };

  const startDelete = () => {
    if (!activeName) {
      return;
    }
    const row = entries.find((e) => e.name === activeName);
    if (!row) {
      return;
    }
    setCtxMenu(null);
    setDeleteFlow({ name: activeName, isDir: row.isDir, step: 1 });
  };

  const openSelectionInOs = () => {
    if (!activeName) {
      return;
    }
    setCtxMenu(null);
    setError(null);
    void openLocalEntryInOs(path, activeName).catch((e) => setError(String(e)));
  };

  const handleContextAction = (action: FilePaneContextMenuAction) => {
    setCtxMenu(null);
    switch (action) {
      case "newFolder":
        startNewFolder();
        break;
      case "newFile":
        startNewFile();
        break;
      case "refresh":
        void load();
        break;
      case "paste":
        void pasteFromClipboard();
        break;
      case "copy":
        void copySelectionToClipboard();
        break;
      case "rename":
        startRename();
        break;
      case "delete":
        startDelete();
        break;
      case "openInOs":
        openSelectionInOs();
        break;
      default:
        break;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "c" && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault();
      void copySelectionToClipboard();
    }
    if (event.key === "v" && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      event.preventDefault();
      void pasteFromClipboard();
    }
    if (event.key === "F5" && onF5Copy && selectedNames.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      onF5Copy(path, Array.from(selectedNames));
    }
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && onTabSwitchPane) {
      event.preventDefault();
      event.stopPropagation();
      onTabSwitchPane();
    }
  };

  const selectedRow = activeName ? entries.find((e) => e.name === activeName) : undefined;
  const soleSelectedFile =
    selectedNames.size === 1 ? entries.find((e) => selectedNames.has(e.name) && !e.isDir) : undefined;
  const editFileDisabled = !soleSelectedFile;
  const exportSelectedOrder = () =>
    entries.filter((e) => selectedNames.has(e.name)).map((e) => e.name);
  const exportSelectionDisabled = selectedNames.size === 0 || exportBusy !== null;

  const nssCmd = nssCommanderSwapFilePaneToolbarWithPaneLabel === true;
  const nssToolbarSlot = nssCmd ? getNssCommanderFilePaneToolbarSlot?.(paneIndex) ?? null : null;

  const filePaneToolbar = (
    <FilePaneToolbar
      onUp={goUp}
      upDisabled={upDisabled}
      onRefresh={() => void load()}
      onTerminal={onBack}
      onRoot={goRoot}
      onNewFolder={startNewFolder}
      onNewFile={startNewFile}
      onEditFile={() => soleSelectedFile && void openEditorForExistingFile(soleSelectedFile.name)}
      editFileDisabled={editFileDisabled}
      onDelete={startDelete}
      deleteDisabled={!activeName}
      onUploadFiles={() => void handleUploadFiles()}
      uploadFilesDisabled={uploadTransferDisabled}
      onUploadFolder={() => void handleUploadFolder()}
      uploadFolderDisabled={uploadTransferDisabled}
      onExportSelection={() => void exportNames(exportSelectedOrder())}
      exportSelectionDisabled={exportSelectionDisabled}
      showBackToTerminalButton={!nssCmd}
    />
  );

  return (
    <div
      ref={rootRef}
      className={`file-pane file-pane--local${semanticFileNameColors ? " file-pane--semantic-name-colors" : ""}`}
      aria-label="Local file browser"
      tabIndex={-1}
      onMouseDown={() => rootRef.current?.focus()}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="file-pane-toolbar">
        {nssCmd && nssToolbarSlot ? createPortal(filePaneToolbar, nssToolbarSlot) : null}
        <div className="file-pane-toolbar-main">
          {nssCmd ? (
            <>
              {nssCmd && !nssToolbarSlot ? filePaneToolbar : null}
              <FilePanePathBreadcrumbs
                className="file-pane-path--nss-commander-full"
                fullTitle={titlePath}
                segments={localPathBreadcrumbSegments(path)}
                onNavigate={setPath}
              />
            </>
          ) : (
            <>
              {filePaneToolbar}
              <FilePanePathBreadcrumbs
                fullTitle={titlePath}
                segments={localPathBreadcrumbSegments(path)}
                onNavigate={setPath}
              />
            </>
          )}
        </div>
        {selectedNames.size > 0 ? (
          <span className="file-pane-selection-count" aria-live="polite">
            {selectedNames.size} selected
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="file-pane-banner file-pane-banner--error" role="alert">
          {error}
        </div>
      ) : null}
      {lastOk ? <div className="file-pane-banner file-pane-banner--ok">{lastOk}</div> : null}
      {transferBusy ? (
        <div className="file-pane-banner" role="status">
          Transferring…
        </div>
      ) : null}
      {loading ? (
        <div className="file-pane-loading">
          <InlineSpinner label="Loading directory" />
          <span>Loading…</span>
        </div>
      ) : (
        <div className="file-pane-table-wrap" ref={tableWrapRef}>
          <table className="file-pane-table">
            <FilePaneTableHead
              variant="local"
              nameWidth={widths.name}
              permWidth={widths.perm}
              userWidth={widths.user}
              groupWidth={widths.group}
              sizeWidth={widths.size}
              modifiedColWidth={tailCols.modified}
              actionsColWidth={tailCols.actions}
              onGripPointerDown={onGripPointerDown}
              onGripDoubleClick={onGripDoubleClick}
              onOptimalColumnWidths={applyOptimalColumnWidths}
              optimalWidthsDisabled={loading}
            />
            <tbody>
              {entries.map((row, index) => {
                const permCell = filePanePermCell(widths.perm, row);
                const nameKind = semanticFileNameColors ? filePaneNameKind(row) : "default";
                const nameKindClass = semanticFileNameColors ? filePaneNameKindClassName(nameKind) : "";
                return (
                <tr
                  key={row.name}
                  className={selectedNames.has(row.name) ? "is-selected" : undefined}
                  onClick={(e) => handleRowClick(row.name, index, e)}
                >
                  <td>
                    {row.isDir ? (
                      <button
                        type="button"
                        className={nameKindClass ? `file-pane-link ${nameKindClass}` : "file-pane-link"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectoryActivate(row.name, index, e);
                        }}
                      >
                        {row.name}/
                      </button>
                    ) : (
                      <span
                        className={nameKindClass ? `file-pane-filename ${nameKindClass}` : "file-pane-filename"}
                        draggable
                        onDragStart={(event) => {
                          const payload: FileDragPayload = { kind: "local", pathKey: path, name: row.name };
                          event.dataTransfer.setData(FILE_DND_PAYLOAD_MIME, serializeFileDragPayload(payload));
                          event.dataTransfer.setData("text/plain", serializeFileDragPayload(payload));
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        {row.name}
                      </span>
                    )}
                  </td>
                  <td className="file-pane-td-perm" title={permCell.title}>
                    {permCell.text}
                  </td>
                  <td className="file-pane-td-owner" title={row.userDisplay || undefined}>
                    {row.userDisplay?.trim() ? row.userDisplay : "—"}
                  </td>
                  <td className="file-pane-td-owner" title={row.groupDisplay || undefined}>
                    {row.groupDisplay?.trim() ? row.groupDisplay : "—"}
                  </td>
                  <td>{row.isDir ? "—" : formatFileSize(row.size)}</td>
                  <td>
                    {row.mtime != null && row.mtime > 0 ? new Date(row.mtime * 1000).toLocaleString() : "—"}
                  </td>
                  <td className="file-pane-td-actions">
                    <button
                      type="button"
                      className="btn file-pane-save-icon-btn"
                      title="Export"
                      aria-label={`Export ${row.name}`}
                      disabled={exportBusy !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void exportNames([row.name]);
                      }}
                    >
                      {exportBusy === row.name ? "…" : <SaveRowIcon />}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ctxMenu ? (
        <FilePaneContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          selectedName={activeName}
          selectedIsDir={Boolean(selectedRow?.isDir)}
          canPaste={getFileTransferClipboard() !== null}
          showOpenInOs
          onDismiss={() => setCtxMenu(null)}
          onAction={handleContextAction}
        />
      ) : null}

      <FilePaneTextPrompt
        open={promptKind === "mkdir"}
        title="New folder name"
        confirmLabel="Create"
        onCancel={() => setPromptKind(null)}
        onConfirm={async (name) => {
          setPromptKind(null);
          setError(null);
          try {
            await createLocalDir(path, name);
            await load();
          } catch (e) {
            setError(String(e));
          }
        }}
      />
      <FilePaneTextPrompt
        open={promptKind === "newFile"}
        title="New file name"
        confirmLabel="Create"
        onCancel={() => setPromptKind(null)}
        onConfirm={(name) => {
          const t = name.trim();
          if (!t) {
            return;
          }
          setPromptKind(null);
          setTextEditorSession({ fileName: t, initialContent: "", isNewFile: true });
        }}
      />
      <FilePaneTextPrompt
        open={promptKind === "rename"}
        title="Rename to"
        initialValue={activeName ?? ""}
        confirmLabel="Rename"
        onCancel={() => setPromptKind(null)}
        onConfirm={async (newName) => {
          if (!activeName) {
            setPromptKind(null);
            return;
          }
          const from = activeName;
          setPromptKind(null);
          setError(null);
          try {
            await renameLocalEntry(path, from, newName);
            setSelectedNames((prev) => {
              const n = new Set(prev);
              n.delete(from);
              n.add(newName);
              return n;
            });
            setActiveName(newName);
            await load();
          } catch (e) {
            setError(String(e));
          }
        }}
      />

      <FilePaneConfirmDialog
        open={bulkDeletePendingNames !== null && bulkDeletePendingNames.length > 0}
        title="Delete selected items?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmDanger
        onCancel={() => setBulkDeletePendingNames(null)}
        onConfirm={() => {
          const names = bulkDeletePendingNames;
          setBulkDeletePendingNames(null);
          if (!names || names.length === 0) {
            return;
          }
          void (async () => {
            setError(null);
            try {
              for (let i = 0; i < names.length; i += 1) {
                const name = names[i]!;
                try {
                  await deleteLocalEntry(path, name);
                } catch (e) {
                  if (isPermissionDeleteError(e)) {
                    setDeleteRecovery({
                      names: names.slice(i),
                      firstError: String(e),
                    });
                    await load();
                    return;
                  }
                  throw e;
                }
              }
              setSelectedNames(new Set());
              setActiveName(null);
              await load();
            } catch (e) {
              setError(String(e));
            }
          })();
        }}
      >
        <p>
          Permanently delete <strong>{bulkDeletePendingNames?.length ?? 0}</strong> selected items? This cannot be
          undone. Folders are removed together with their contents.
        </p>
      </FilePaneConfirmDialog>

      <FilePaneConfirmDialog
        open={deleteRecovery !== null && deleteRecovery.names.length > 0}
        title="Delete blocked by permissions"
        confirmLabel="Delete all I can"
        alternateLabel="Make writable + retry"
        cancelLabel="Cancel"
        confirmDanger
        onCancel={() => setDeleteRecovery(null)}
        onAlternate={() => {
          const recovery = deleteRecovery;
          setDeleteRecovery(null);
          if (!recovery || recovery.names.length === 0) {
            return;
          }
          void (async () => {
            setError(null);
            const result = await runDeleteModeAcrossNames(recovery.names, "chmodOwnerWritableThenStrict");
            setSelectedNames(new Set());
            setActiveName(null);
            await load();
            if (result.ok) {
              setLastOk("Delete completed after adjusting owner permissions.");
            } else {
              setError(result.message ?? "Delete failed after permission adjustment.");
            }
          })();
        }}
        onConfirm={() => {
          const recovery = deleteRecovery;
          setDeleteRecovery(null);
          if (!recovery || recovery.names.length === 0) {
            return;
          }
          void (async () => {
            setError(null);
            const result = await runDeleteModeAcrossNames(recovery.names, "bestEffort");
            setSelectedNames(new Set());
            setActiveName(null);
            await load();
            if (result.ok) {
              setLastOk("Deleted all removable entries.");
            } else {
              setError(result.message ?? "Some entries could not be deleted.");
            }
          })();
        }}
      >
        <p>
          No permission to delete one or more items.
          <br />
          <strong>Delete all I can</strong>: remove everything possible and leave blocked entries.
          <br />
          <strong>Make writable + retry</strong>: set owner write/read permissions first, then retry strict delete.
        </p>
        <p>{deleteRecovery?.firstError ?? ""}</p>
      </FilePaneConfirmDialog>

      <FilePaneDoubleDeleteDialog
        open={deleteFlow !== null}
        targetLabel={deleteFlow?.name ?? ""}
        isDir={deleteFlow?.isDir ?? false}
        step={deleteFlow?.step ?? 1}
        onCancel={() => setDeleteFlow(null)}
        onAdvance={() => setDeleteFlow((d) => (d && d.step === 1 ? { ...d, step: 2 } : d))}
        onFinalConfirm={async () => {
          const d = deleteFlow;
          setDeleteFlow(null);
          if (!d) {
            return;
          }
          setError(null);
          try {
            await deleteLocalEntry(path, d.name);
            setSelectedNames((prev) => {
              const n = new Set(prev);
              n.delete(d.name);
              return n;
            });
            setActiveName((cur) => (cur === d.name ? null : cur));
            await load();
          } catch (e) {
            if (isPermissionDeleteError(e)) {
              setDeleteRecovery({ names: [d.name], firstError: String(e) });
              await load();
            } else {
              setError(String(e));
            }
          }
        }}
      />

      {textEditorSession ? (
        <Suspense
          fallback={
            <div className="file-pane-text-editor" role="status">
              <div className="file-pane-text-editor-toolbar">
                <span className="file-pane-text-editor-title">Loading editor…</span>
              </div>
            </div>
          }
        >
          <FilePaneTextEditor
            fileName={textEditorSession.fileName}
            initialContent={textEditorSession.initialContent}
            isNewFile={textEditorSession.isNewFile}
            monacoLanguage={monacoLanguageFromFileName(textEditorSession.fileName)}
            onSave={async (content) => {
              if (textEditorSession.isNewFile) {
                await createLocalTextFile(path, textEditorSession.fileName, content);
              } else {
                await writeLocalTextFile(path, textEditorSession.fileName, content);
              }
              await load();
            }}
            onClose={() => setTextEditorSession(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
