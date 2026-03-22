import { open } from "@tauri-apps/plugin-dialog";
import {
  copyLocalFile,
  createLocalDir,
  listLocalDir,
  sftpCreateDir,
  sftpUploadFile,
} from "../tauri-api";
import type { RemoteSshSpec } from "../types";
import { joinLocalPath, joinRemotePath } from "./file-pane-paths";

function normLocalFsPath(p: string): string {
  const t = p.trim().replace(/\\/g, "/");
  const s = t.replace(/\/+$/, "");
  if (s === "" && t.startsWith("/")) {
    return "/";
  }
  return s;
}

/** Split an absolute path from the OS file dialog into parent directory and file/folder name. */
export function splitLocalPickPath(absolutePath: string): { dir: string; base: string } {
  const n = absolutePath.trim().replace(/\\/g, "/");
  if (!n) {
    return { dir: "", base: "" };
  }
  const idx = n.lastIndexOf("/");
  if (idx === -1) {
    return { dir: ".", base: n };
  }
  if (idx === 0) {
    return { dir: "/", base: n.slice(1) };
  }
  return { dir: n.slice(0, idx), base: n.slice(idx + 1) };
}

function normalizeDialogPaths(picked: string | string[] | null | undefined): string[] {
  if (picked === null || picked === undefined) {
    return [];
  }
  const arr = Array.isArray(picked) ? picked : [picked];
  return arr.map((p) => p.trim()).filter((p) => p.length > 0);
}

async function pickMultipleFiles(): Promise<string[] | null> {
  const picked = await open({
    multiple: true,
    directory: false,
    title: "Choose files to upload",
  });
  const paths = normalizeDialogPaths(picked);
  if (paths.length === 0) {
    return null;
  }
  return paths;
}

async function pickSingleFolder(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: true,
    title: "Choose folder to upload",
  });
  if (picked === null || picked === undefined) {
    return null;
  }
  const path = Array.isArray(picked) ? picked[0] : picked;
  const t = path?.trim();
  return t && t.length > 0 ? t : null;
}

async function uploadLocalTreeToRemote(spec: RemoteSshSpec, localAbsDir: string, remoteDirPath: string): Promise<void> {
  const root = normLocalFsPath(localAbsDir);
  const entries = await listLocalDir(root);
  for (const e of entries) {
    const childLocal = joinLocalPath(root, e.name);
    const childRemote = joinRemotePath(remoteDirPath, e.name);
    if (e.isDir) {
      await sftpCreateDir(spec, remoteDirPath, e.name);
      await uploadLocalTreeToRemote(spec, childLocal, childRemote);
    } else {
      const { dir, base } = splitLocalPickPath(childLocal);
      await sftpUploadFile(spec, dir, base, childRemote);
    }
  }
}

async function importLocalTreeToLocal(localAbsDir: string, destPathKey: string): Promise<void> {
  const root = normLocalFsPath(localAbsDir);
  const entries = await listLocalDir(root);
  for (const e of entries) {
    const childLocal = joinLocalPath(root, e.name);
    if (e.isDir) {
      await createLocalDir(destPathKey, e.name);
      await importLocalTreeToLocal(childLocal, joinLocalPath(destPathKey, e.name));
    } else {
      const { dir, base } = splitLocalPickPath(childLocal);
      await copyLocalFile(dir, base, destPathKey, "");
    }
  }
}

/** Upload selected files into the current remote directory. Returns how many files were uploaded; 0 if cancelled. */
export async function uploadFilesFromDialogToRemote(spec: RemoteSshSpec, remoteParentPath: string): Promise<number> {
  const paths = await pickMultipleFiles();
  if (!paths) {
    return 0;
  }
  let n = 0;
  for (const p of paths) {
    const { dir, base } = splitLocalPickPath(p);
    if (!base) {
      continue;
    }
    await sftpUploadFile(spec, dir, base, joinRemotePath(remoteParentPath, base));
    n += 1;
  }
  return n;
}

/** Upload a selected folder (preserving structure). Returns 1 if a folder was uploaded, 0 if cancelled. */
export async function uploadFolderFromDialogToRemote(spec: RemoteSshSpec, remoteParentPath: string): Promise<number> {
  const folder = await pickSingleFolder();
  if (!folder) {
    return 0;
  }
  const { base: folderName } = splitLocalPickPath(normLocalFsPath(folder));
  if (!folderName) {
    return 0;
  }
  await sftpCreateDir(spec, remoteParentPath, folderName);
  const remoteRoot = joinRemotePath(remoteParentPath, folderName);
  await uploadLocalTreeToRemote(spec, folder, remoteRoot);
  return 1;
}

/** Copy selected files into the current local directory. Returns count; 0 if cancelled. */
export async function importFilesFromDialogToLocal(destPathKey: string): Promise<number> {
  const paths = await pickMultipleFiles();
  if (!paths) {
    return 0;
  }
  let n = 0;
  for (const p of paths) {
    const { dir, base } = splitLocalPickPath(p);
    if (!base) {
      continue;
    }
    await copyLocalFile(dir, base, destPathKey, "");
    n += 1;
  }
  return n;
}

/** Copy a selected folder tree into the current local directory. Returns 1 if done, 0 if cancelled. */
export async function importFolderFromDialogToLocal(destPathKey: string): Promise<number> {
  const folder = await pickSingleFolder();
  if (!folder) {
    return 0;
  }
  const { base: folderName } = splitLocalPickPath(normLocalFsPath(folder));
  if (!folderName) {
    return 0;
  }
  await createLocalDir(destPathKey, folderName);
  await importLocalTreeToLocal(folder, joinLocalPath(destPathKey, folderName));
  return 1;
}
