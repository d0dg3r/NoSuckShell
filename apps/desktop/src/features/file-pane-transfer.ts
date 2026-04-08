import {
  copyLocalFile,
  createLocalDir,
  deleteLocalEntry,
  listLocalDir,
  sftpCreateDir,
  sftpDeleteEntry,
  sftpDownloadFile,
  sftpListRemoteDir,
  sftpUploadFile,
} from "../tauri-api";
import type { RemoteSshSpec } from "../types";
import type { FileDragPayload } from "./file-pane-dnd";
import { joinLocalPath, joinRemotePath } from "./file-pane-paths";
import { filePaneRowOpensAsDirectory } from "./file-pane-table-columns";

export type FileDropTarget =
  | { kind: "local"; pathKey: string }
  | { kind: "remote"; spec: RemoteSshSpec; parentPath: string };

export type FilePaneTransferOptions = {
  /** Remove an existing destination entry with the same name before copying (overwrite). */
  removeDestIfExists?: boolean;
  /** When set, backend emits `nss_sftp_transfer_progress` and honors pause/cancel for this id. */
  transferId?: string | null;
  /** When this returns true, stop the transfer (NSS-Commander cancel between IPC calls). */
  transferCancelled?: () => boolean;
};

function throwIfTransferCancelled(opts?: FilePaneTransferOptions): void {
  if (opts?.transferCancelled?.()) {
    throw new Error("Transfer canceled.");
  }
}

async function localEntryIsDir(parentPathKey: string, name: string): Promise<boolean> {
  const entries = await listLocalDir(parentPathKey);
  const row = entries.find((e) => e.name === name);
  return row ? filePaneRowOpensAsDirectory(row) : false;
}

async function remoteEntryIsDir(spec: RemoteSshSpec, parentPath: string, name: string): Promise<boolean> {
  const entries = await sftpListRemoteDir(spec, parentPath);
  const row = entries.find((e) => e.name === name);
  return row ? filePaneRowOpensAsDirectory(row) : false;
}

export async function removeTransferDestinationEntry(target: FileDropTarget, name: string): Promise<void> {
  if (target.kind === "local") {
    await deleteLocalEntry(target.pathKey, name);
    return;
  }
  await sftpDeleteEntry(target.spec, target.parentPath, name);
}

async function copyLocalTreeInto(sourceDirKey: string, destParentKey: string, opts?: FilePaneTransferOptions): Promise<void> {
  throwIfTransferCancelled(opts);
  const transferId = opts?.transferId ?? null;
  const entries = await listLocalDir(sourceDirKey);
  for (const e of entries) {
    throwIfTransferCancelled(opts);
    if (filePaneRowOpensAsDirectory(e)) {
      await createLocalDir(destParentKey, e.name);
      await copyLocalTreeInto(joinLocalPath(sourceDirKey, e.name), joinLocalPath(destParentKey, e.name), opts);
    } else {
      await copyLocalFile(sourceDirKey, e.name, destParentKey, "", transferId);
    }
  }
}

async function copyLocalDirToLocal(sourcePathKey: string, dirName: string, destPathKey: string, opts?: FilePaneTransferOptions): Promise<void> {
  throwIfTransferCancelled(opts);
  await createLocalDir(destPathKey, dirName);
  await copyLocalTreeInto(joinLocalPath(sourcePathKey, dirName), joinLocalPath(destPathKey, dirName), opts);
}

async function copyLocalTreeToRemote(
  spec: RemoteSshSpec,
  localDirKey: string,
  remoteParentPath: string,
  opts?: FilePaneTransferOptions,
): Promise<void> {
  throwIfTransferCancelled(opts);
  const transferId = opts?.transferId ?? null;
  const entries = await listLocalDir(localDirKey);
  for (const e of entries) {
    throwIfTransferCancelled(opts);
    if (filePaneRowOpensAsDirectory(e)) {
      await sftpCreateDir(spec, remoteParentPath, e.name);
      await copyLocalTreeToRemote(
        spec,
        joinLocalPath(localDirKey, e.name),
        joinRemotePath(remoteParentPath, e.name),
        opts,
      );
    } else {
      await sftpUploadFile(spec, localDirKey, e.name, joinRemotePath(remoteParentPath, e.name), transferId);
    }
  }
}

async function copyLocalDirToRemote(
  spec: RemoteSshSpec,
  sourcePathKey: string,
  dirName: string,
  remoteParentPath: string,
  opts?: FilePaneTransferOptions,
): Promise<void> {
  throwIfTransferCancelled(opts);
  await sftpCreateDir(spec, remoteParentPath, dirName);
  await copyLocalTreeToRemote(spec, joinLocalPath(sourcePathKey, dirName), joinRemotePath(remoteParentPath, dirName), opts);
}

async function copyRemoteTreeToLocal(
  spec: RemoteSshSpec,
  remoteDirPath: string,
  destLocalParentKey: string,
  opts?: FilePaneTransferOptions,
): Promise<void> {
  throwIfTransferCancelled(opts);
  const transferId = opts?.transferId ?? null;
  const entries = await sftpListRemoteDir(spec, remoteDirPath);
  for (const e of entries) {
    throwIfTransferCancelled(opts);
    const childRemote = joinRemotePath(remoteDirPath, e.name);
    if (filePaneRowOpensAsDirectory(e)) {
      await createLocalDir(destLocalParentKey, e.name);
      await copyRemoteTreeToLocal(spec, childRemote, joinLocalPath(destLocalParentKey, e.name), opts);
    } else {
      await sftpDownloadFile(spec, childRemote, destLocalParentKey, transferId);
    }
  }
}

async function copyRemoteDirToLocal(
  spec: RemoteSshSpec,
  sourceParentPath: string,
  dirName: string,
  destPathKey: string,
  opts?: FilePaneTransferOptions,
): Promise<void> {
  throwIfTransferCancelled(opts);
  await createLocalDir(destPathKey, dirName);
  await copyRemoteTreeToLocal(spec, joinRemotePath(sourceParentPath, dirName), joinLocalPath(destPathKey, dirName), opts);
}

export async function runFilePaneTransfer(
  source: FileDragPayload,
  target: FileDropTarget,
  opts?: FilePaneTransferOptions,
): Promise<string | void> {
  const removeFirst = opts?.removeDestIfExists === true;
  const transferId = opts?.transferId ?? null;
  throwIfTransferCancelled(opts);

  if (source.kind === "local" && target.kind === "local") {
    if (await localEntryIsDir(source.pathKey, source.name)) {
      throwIfTransferCancelled(opts);
      if (removeFirst) {
        await removeTransferDestinationEntry(target, source.name);
      }
      await copyLocalDirToLocal(source.pathKey, source.name, target.pathKey, opts);
      return;
    }
    throwIfTransferCancelled(opts);
    return copyLocalFile(source.pathKey, source.name, target.pathKey, "", transferId);
  }
  if (source.kind === "local" && target.kind === "remote") {
    if (await localEntryIsDir(source.pathKey, source.name)) {
      throwIfTransferCancelled(opts);
      if (removeFirst) {
        await removeTransferDestinationEntry(target, source.name);
      }
      await copyLocalDirToRemote(target.spec, source.pathKey, source.name, target.parentPath, opts);
      return;
    }
    throwIfTransferCancelled(opts);
    const remotePath = joinRemotePath(target.parentPath, source.name);
    await sftpUploadFile(target.spec, source.pathKey, source.name, remotePath, transferId);
    return;
  }
  if (source.kind === "remote" && target.kind === "local") {
    if (await remoteEntryIsDir(source.spec, source.parentPath, source.name)) {
      throwIfTransferCancelled(opts);
      if (removeFirst) {
        await removeTransferDestinationEntry(target, source.name);
      }
      await copyRemoteDirToLocal(source.spec, source.parentPath, source.name, target.pathKey, opts);
      return;
    }
    throwIfTransferCancelled(opts);
    const remotePath = joinRemotePath(source.parentPath, source.name);
    return sftpDownloadFile(source.spec, remotePath, target.pathKey, transferId);
  }
  throw new Error("Remote-to-remote file transfer is not implemented yet.");
}
