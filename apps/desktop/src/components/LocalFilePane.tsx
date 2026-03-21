import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatFileSize,
  formatLocalPathDisplay,
  isLocalUpDisabled,
  joinLocalPath,
  localParentDir,
  localParentOfHome,
  localPathResolvedForTitle,
} from "../features/file-pane-paths";
import { useSplitPaneFilePaneLabelInset } from "../hooks/useSplitPaneFilePaneLabelInset";
import { getLocalHomeCanonicalPath, listLocalDir } from "../tauri-api";
import type { LocalDirEntry } from "../types";
import { FilePaneToolbar } from "./FilePaneToolbar";

type Props = {
  onBack: () => void;
};

/** Path key for `list_local_dir`: empty = home, relative = under home, leading `/` = absolute. */
export function LocalFilePane({ onBack }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState("");
  const [homeCanon, setHomeCanon] = useState<string | null>(null);
  const [entries, setEntries] = useState<LocalDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getLocalHomeCanonicalPath()
      .then(setHomeCanon)
      .catch(() => setHomeCanon(null));
  }, []);

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

  return (
    <div ref={rootRef} className="file-pane file-pane--local" aria-label="Local file browser">
      <div className="file-pane-toolbar">
        <FilePaneToolbar
          onUp={goUp}
          upDisabled={upDisabled}
          onRefresh={() => void load()}
          onTerminal={onBack}
          onRoot={goRoot}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
