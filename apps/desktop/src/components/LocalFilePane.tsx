import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatFileSize,
  formatLocalPathDisplay,
  isLocalUpDisabled,
  joinLocalPath,
  localFolderTitleShort,
  localParentDir,
  localParentOfHome,
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
import { runFilePaneTransfer, type FileDropTarget } from "../features/file-pane-transfer";
import { copyFileToTransferClipboard, getFileTransferClipboard } from "../features/file-transfer-clipboard";
import { filePanePermCell } from "../features/file-pane-perm-cell";
import { useFilePaneTableResize } from "../hooks/useFilePaneTableResize";
import { useSplitPaneFilePaneLabelInset } from "../hooks/useSplitPaneFilePaneLabelInset";
import {
  createLocalDir,
  deleteLocalEntry,
  getLocalHomeCanonicalPath,
  listLocalDir,
  openLocalEntryInOs,
  renameLocalEntry,
} from "../tauri-api";
import type { LocalDirEntry } from "../types";
import type { FileExportArchiveFormat } from "./settings/app-settings-types";
import type { FilePaneContextMenuAction } from "./FilePaneContextMenu";
import { FilePaneContextMenu } from "./FilePaneContextMenu";
import { FilePaneDoubleDeleteDialog, FilePaneTextPrompt } from "./FilePaneDialogs";
import { FilePaneTableHead } from "./FilePaneTableHead";
import { FilePaneToolbar } from "./FilePaneToolbar";

type Props = {
  paneIndex: number;
  onBack: () => void;
  onPathChange: (pathKey: string) => void;
  getExportDestPath: () => Promise<string | null>;
  archiveFormat: FileExportArchiveFormat;
  onFilePaneTitleChange: (paneIndex: number, payload: { short: string; full: string } | null) => void;
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
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
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
  const [promptKind, setPromptKind] = useState<null | "mkdir" | "rename">(null);
  const [deleteFlow, setDeleteFlow] = useState<null | { name: string; isDir: boolean; step: 1 | 2 }>(null);

  useEffect(() => {
    setSelectedNames(new Set());
    setActiveName(null);
    setLastRangeIndex(null);
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

  useEffect(() => {
    void load();
  }, [load]);

  useSplitPaneFilePaneLabelInset(rootRef, path, loading, entries.length);

  const autoFitSamples = useMemo(
    () => ({
      name: entries.map((e) => (e.isDir ? `${e.name}/` : e.name)),
      size: entries.map((e) => (e.isDir ? "—" : formatFileSize(e.size))),
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
    }),
    [entries],
  );

  const { tableWrapRef, widths, tailCols, onGripPointerDown, onGripDoubleClick, fitAllColumns } =
    useFilePaneTableResize("local", 300, autoFitSamples);

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

  const label = formatLocalPathDisplay(homeCanon, path);
  const titlePath = localPathResolvedForTitle(homeCanon, path);
  const upDisabled = isLocalUpDisabled(path, homeCanon);

  const exportNames = async (names: string[]) => {
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
  };

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
  };

  const selectedRow = activeName ? entries.find((e) => e.name === activeName) : undefined;
  const exportSelectedOrder = () =>
    entries.filter((e) => selectedNames.has(e.name)).map((e) => e.name);
  const exportSelectionDisabled = selectedNames.size === 0 || exportBusy !== null;

  return (
    <div
      ref={rootRef}
      className="file-pane file-pane--local"
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
        <FilePaneToolbar
          onUp={goUp}
          upDisabled={upDisabled}
          onRefresh={() => void load()}
          onFitColumns={fitAllColumns}
          fitColumnsDisabled={loading}
          onTerminal={onBack}
          onRoot={goRoot}
          onNewFolder={startNewFolder}
          onDelete={startDelete}
          deleteDisabled={!activeName}
          onUploadFiles={() => void handleUploadFiles()}
          uploadFilesDisabled={uploadTransferDisabled}
          onUploadFolder={() => void handleUploadFolder()}
          uploadFolderDisabled={uploadTransferDisabled}
          onExportSelection={() => void exportNames(exportSelectedOrder())}
          exportSelectionDisabled={exportSelectionDisabled}
        />
        <span className="file-pane-path" title={titlePath}>
          {label}
        </span>
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
        <div className="file-pane-loading">Loading…</div>
      ) : (
        <div className="file-pane-table-wrap" ref={tableWrapRef}>
          <table className="file-pane-table">
            <FilePaneTableHead
              variant="local"
              nameWidth={widths.name}
              sizeWidth={widths.size}
              permWidth={widths.perm}
              userWidth={widths.user}
              groupWidth={widths.group}
              modifiedColWidth={tailCols.modified}
              actionsColWidth={tailCols.actions}
              onGripPointerDown={onGripPointerDown}
              onGripDoubleClick={onGripDoubleClick}
            />
            <tbody>
              {entries.map((row, index) => {
                const permCell = filePanePermCell(widths.perm, row);
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
                        className="file-pane-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDir(row.name);
                        }}
                      >
                        {row.name}/
                      </button>
                    ) : (
                      <span
                        className="file-pane-filename"
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
                  <td>{row.isDir ? "—" : formatFileSize(row.size)}</td>
                  <td className="file-pane-td-perm" title={permCell.title}>
                    {permCell.text}
                  </td>
                  <td className="file-pane-td-owner" title={row.userDisplay || undefined}>
                    {row.userDisplay?.trim() ? row.userDisplay : "—"}
                  </td>
                  <td className="file-pane-td-owner" title={row.groupDisplay || undefined}>
                    {row.groupDisplay?.trim() ? row.groupDisplay : "—"}
                  </td>
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
            setError(String(e));
          }
        }}
      />
    </div>
  );
}
