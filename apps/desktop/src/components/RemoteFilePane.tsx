import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FILE_DND_PAYLOAD_MIME,
  type FileDragPayload,
  parseFileDragPayload,
  serializeFileDragPayload,
} from "../features/file-pane-dnd";
import { runRemoteFilePaneExport } from "../features/file-pane-export";
import {
  joinRemotePath,
  remoteFolderTitleShort,
  remoteParentDir,
  remotePathFullDisplay,
  formatFileSize,
} from "../features/file-pane-paths";
import {
  uploadFilesFromDialogToRemote,
  uploadFolderFromDialogToRemote,
} from "../features/file-pane-upload-from-dialog";
import { runFilePaneTransfer, type FileDropTarget } from "../features/file-pane-transfer";
import { copyFileToTransferClipboard, getFileTransferClipboard } from "../features/file-transfer-clipboard";
import { filePanePermCell } from "../features/file-pane-perm-cell";
import { useFilePaneTableResize } from "../hooks/useFilePaneTableResize";
import { useSplitPaneFilePaneLabelInset } from "../hooks/useSplitPaneFilePaneLabelInset";
import {
  sftpCreateDir,
  sftpDeleteEntry,
  sftpListRemoteDir,
  sftpRenameEntry,
} from "../tauri-api";
import type { RemoteSshSpec, SftpDirEntry } from "../types";
import type { FileExportArchiveFormat } from "./settings/app-settings-types";
import type { FilePaneContextMenuAction } from "./FilePaneContextMenu";
import { FilePaneContextMenu } from "./FilePaneContextMenu";
import { FilePaneDoubleDeleteDialog, FilePaneTextPrompt } from "./FilePaneDialogs";
import { FilePaneTableHead } from "./FilePaneTableHead";
import { FilePaneToolbar } from "./FilePaneToolbar";

type Props = {
  paneIndex: number;
  spec: RemoteSshSpec;
  onBack: () => void;
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

export function RemoteFilePane({
  paneIndex,
  spec,
  onBack,
  getExportDestPath,
  archiveFormat,
  onFilePaneTitleChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<SftpDirEntry[]>([]);
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
  }, [path, spec]);

  useEffect(() => {
    const full = remotePathFullDisplay(path);
    onFilePaneTitleChange(paneIndex, { short: remoteFolderTitleShort(path), full });
    return () => onFilePaneTitleChange(paneIndex, null);
  }, [paneIndex, path, onFilePaneTitleChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastOk(null);
    try {
      const list = await sftpListRemoteDir(spec, path);
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [spec, path]);

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
    useFilePaneTableResize("remote", 300, autoFitSamples);

  const openDir = (name: string) => {
    setPath((p) => joinRemotePath(p, name));
  };

  const goUp = () => {
    setPath((p) => remoteParentDir(p));
  };

  const goRoot = () => {
    setPath("/");
  };

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
      const saved = await runRemoteFilePaneExport({
        spec,
        parentPath: path,
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

  const dropTarget: FileDropTarget = { kind: "remote", spec, parentPath: path };

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
      const n = await uploadFilesFromDialogToRemote(spec, path);
      if (n > 0) {
        setLastOk(n === 1 ? "Uploaded one file." : `Uploaded ${n} files.`);
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
      const n = await uploadFolderFromDialogToRemote(spec, path);
      if (n > 0) {
        setLastOk("Folder uploaded.");
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
    const p: FileDragPayload = { kind: "remote", spec, parentPath: path, name: activeName };
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

  const exportSelectedOrder = () =>
    entries.filter((e) => selectedNames.has(e.name)).map((e) => e.name);

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

  const pathTitle = remotePathFullDisplay(path);
  const selectedRow = activeName ? entries.find((e) => e.name === activeName) : undefined;
  const upDisabled = path === "." || path === "/" || path === "";
  const exportSelectionDisabled = selectedNames.size === 0 || exportBusy !== null;

  return (
    <div
      ref={rootRef}
      className="file-pane file-pane--remote"
      aria-label="Remote SFTP file browser"
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
        <span className="file-pane-path" title={pathTitle}>
          {path}
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
              variant="remote"
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
              {entries.map((row, index) => (
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
                          const payload: FileDragPayload = {
                            kind: "remote",
                            spec,
                            parentPath: path,
                            name: row.name,
                          };
                          event.dataTransfer.setData(FILE_DND_PAYLOAD_MIME, serializeFileDragPayload(payload));
                          event.dataTransfer.setData("text/plain", serializeFileDragPayload(payload));
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        {row.name}
                      </span>
                    )}
                  </td>
                  <td className="file-pane-td-perm" title={row.modeDisplay || undefined}>
                    {row.modeDisplay?.trim() ? row.modeDisplay : "—"}
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
              ))}
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
          showOpenInOs={false}
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
            await sftpCreateDir(spec, path, name);
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
            await sftpRenameEntry(spec, path, from, newName);
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
            await sftpDeleteEntry(spec, path, d.name);
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
