import { useCallback, useEffect, useRef, useState } from "react";
import { joinRemotePath, remoteParentDir, formatFileSize } from "../features/file-pane-paths";
import { useSplitPaneFilePaneLabelInset } from "../hooks/useSplitPaneFilePaneLabelInset";
import { sftpDownloadFile, sftpListRemoteDir } from "../tauri-api";
import type { RemoteSshSpec, SftpDirEntry } from "../types";
import { FilePaneToolbar } from "./FilePaneToolbar";

type Props = {
  spec: RemoteSshSpec;
  onBack: () => void;
};

export function RemoteFilePane({ spec, onBack }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<SftpDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

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

  const openDir = (name: string) => {
    setPath((p) => joinRemotePath(p, name));
  };

  const goUp = () => {
    setPath((p) => remoteParentDir(p));
  };

  const goRoot = () => {
    setPath("/");
  };

  const upDisabled = remoteParentDir(path) === path;

  const downloadFile = async (name: string) => {
    const remotePath = joinRemotePath(path, name);
    setDownloadBusy(name);
    setError(null);
    setLastOk(null);
    try {
      const saved = await sftpDownloadFile(spec, remotePath, "Downloads");
      setLastOk(`Saved to ${saved}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloadBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="file-pane file-pane--remote" aria-label="Remote SFTP file browser">
      <div className="file-pane-toolbar">
        <FilePaneToolbar
          onUp={goUp}
          upDisabled={upDisabled}
          onRefresh={() => void load()}
          onTerminal={onBack}
          onRoot={goRoot}
        />
        <span className="file-pane-path" title={path}>
          {path}
        </span>
      </div>
      {error ? (
        <div className="file-pane-banner file-pane-banner--error" role="alert">
          {error}
        </div>
      ) : null}
      {lastOk ? <div className="file-pane-banner file-pane-banner--ok">{lastOk}</div> : null}
      {loading ? (
        <div className="file-pane-loading">Loading…</div>
      ) : (
        <div className="file-pane-table-wrap">
          <table className="file-pane-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th> </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.name}>
                  <td>
                    {row.isDir ? (
                      <button type="button" className="file-pane-link" onClick={() => openDir(row.name)}>
                        {row.name}/
                      </button>
                    ) : (
                      <span className="file-pane-filename">{row.name}</span>
                    )}
                  </td>
                  <td>{row.isDir ? "—" : formatFileSize(row.size)}</td>
                  <td>
                    {row.mtime != null && row.mtime > 0 ? new Date(row.mtime * 1000).toLocaleString() : "—"}
                  </td>
                  <td>
                    {!row.isDir ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={downloadBusy === row.name}
                        onClick={() => void downloadFile(row.name)}
                      >
                        {downloadBusy === row.name ? "…" : "To Downloads"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
