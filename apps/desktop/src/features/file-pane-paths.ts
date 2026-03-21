/** Join remote SFTP path segments (POSIX-style). */
export function joinRemotePath(parent: string, name: string): string {
  const n = name.trim();
  if (!n || n === "." || n === "..") {
    return parent.trim() || ".";
  }
  const p = parent.trim();
  if (p === "" || p === ".") {
    return n;
  }
  if (p.endsWith("/")) {
    return `${p}${n}`;
  }
  return `${p}/${n}`;
}

/** Parent directory for a remote path. */
export function remoteParentDir(path: string): string {
  const t = path.trim();
  if (t === "" || t === ".") {
    return ".";
  }
  const absolute = t.startsWith("/");
  const parts = t.split("/").filter((seg) => seg.length > 0);
  parts.pop();
  if (parts.length === 0) {
    return absolute ? "/" : ".";
  }
  const joined = parts.join("/");
  return absolute ? `/${joined}` : joined;
}

/** Join local path segments (home-relative key or absolute POSIX). */
export function joinLocalPath(parent: string, name: string): string {
  const n = name.trim();
  if (!n || n === "." || n === "..") {
    return parent.trim();
  }
  const p = parent.trim();
  if (p.startsWith("/")) {
    if (p.endsWith("/")) {
      return `${p}${n}`;
    }
    return `${p}/${n}`;
  }
  if (!p) {
    return n;
  }
  return `${p}/${n}`;
}

/** Parent directory for a local path key (`""` = home, relative segments, or absolute POSIX). */
export function localParentDir(pathKey: string): string {
  const t = pathKey.trim();
  if (t === "/" || t === "") {
    return t;
  }
  if (t.startsWith("/")) {
    const parts = t.split("/").filter((seg) => seg.length > 0);
    parts.pop();
    if (parts.length === 0) {
      return "/";
    }
    return `/${parts.join("/")}`;
  }
  const parts = t.split("/").filter((seg) => seg.length > 0);
  parts.pop();
  return parts.join("/");
}

/** Parent of the user's home directory (when path key `""` means home). */
export function localParentOfHome(homeCanon: string): string {
  return localParentDir(homeCanon.trim());
}

/** Full path string for tooltips (canonical home + relative key, or absolute key). */
export function localPathResolvedForTitle(homeCanon: string | null, pathKey: string): string {
  const key = pathKey.trim();
  if (!homeCanon) {
    if (key === "") {
      return "~";
    }
    if (key.startsWith("/")) {
      return key;
    }
    return `~/${key}`;
  }
  const hc = homeCanon.replace(/\/$/, "");
  if (key === "") {
    return hc;
  }
  if (key.startsWith("/")) {
    return key;
  }
  return `${hc}/${key}`;
}

/** Path bar label: `~`, `~/…`, or absolute; maps home prefix to `~` when possible. */
export function formatLocalPathDisplay(homeCanon: string | null, pathKey: string): string {
  const key = pathKey.trim();
  if (!homeCanon) {
    if (key === "") {
      return "~";
    }
    if (key.startsWith("/")) {
      return key;
    }
    return `~/${key}`;
  }
  const hc = homeCanon.replace(/\/$/, "");
  if (key === "") {
    return "~";
  }
  if (!key.startsWith("/")) {
    return `~/${key}`;
  }
  if (key === hc) {
    return "~";
  }
  if (key.startsWith(`${hc}/`)) {
    return `~${key.slice(hc.length)}`;
  }
  return key;
}

export function isLocalUpDisabled(pathKey: string, homeCanon: string | null): boolean {
  if (pathKey === "/") {
    return true;
  }
  if (!homeCanon) {
    return pathKey === "" || pathKey === "/";
  }
  if (pathKey === "") {
    return localParentOfHome(homeCanon) === homeCanon;
  }
  return localParentDir(pathKey) === pathKey;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
