import { copyLocalFile, sftpDownloadFile, sftpUploadFile } from "../tauri-api";
import type { RemoteSshSpec } from "../types";
import type { FileDragPayload } from "./file-pane-dnd";
import { joinRemotePath } from "./file-pane-paths";

export type FileDropTarget =
  | { kind: "local"; pathKey: string }
  | { kind: "remote"; spec: RemoteSshSpec; parentPath: string };

export async function runFilePaneTransfer(source: FileDragPayload, target: FileDropTarget): Promise<string | void> {
  if (source.kind === "local" && target.kind === "local") {
    return copyLocalFile(source.pathKey, source.name, target.pathKey, "");
  }
  if (source.kind === "local" && target.kind === "remote") {
    const remotePath = joinRemotePath(target.parentPath, source.name);
    await sftpUploadFile(target.spec, source.pathKey, source.name, remotePath);
    return;
  }
  if (source.kind === "remote" && target.kind === "local") {
    const remotePath = joinRemotePath(source.parentPath, source.name);
    return sftpDownloadFile(source.spec, remotePath, target.pathKey);
  }
  throw new Error("Remote-to-remote file transfer is not implemented yet.");
}
