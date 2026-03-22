import type { FileExportArchiveFormat } from "../components/settings/app-settings-types";
import {
  copyLocalFile,
  localExportPathsArchive,
  sftpDownloadFile,
  sftpExportPathsArchive,
} from "../tauri-api";
import type { RemoteSshSpec } from "../types";
import { fileExportArchiveFormatToApi } from "./app-preferences";
import { joinRemotePath } from "./file-pane-paths";

export function exportNeedsArchive(
  names: string[],
  entries: Array<{ name: string; isDir: boolean }>,
): boolean {
  if (names.length !== 1) {
    return true;
  }
  const row = entries.find((e) => e.name === names[0]);
  return Boolean(row?.isDir);
}

export async function runRemoteFilePaneExport(args: {
  spec: RemoteSshSpec;
  parentPath: string;
  names: string[];
  entries: Array<{ name: string; isDir: boolean }>;
  destPathKeyOrAbs: string;
  archiveFormat: FileExportArchiveFormat;
}): Promise<string> {
  const fmt = fileExportArchiveFormatToApi(args.archiveFormat);
  if (exportNeedsArchive(args.names, args.entries)) {
    return sftpExportPathsArchive(
      args.spec,
      args.parentPath,
      args.names,
      fmt,
      args.destPathKeyOrAbs,
      null,
    );
  }
  const only = args.names[0]!;
  const remotePath = joinRemotePath(args.parentPath, only);
  return sftpDownloadFile(args.spec, remotePath, args.destPathKeyOrAbs);
}

export async function runLocalFilePaneExport(args: {
  parentPathKey: string;
  names: string[];
  entries: Array<{ name: string; isDir: boolean }>;
  destPathKeyOrAbs: string;
  archiveFormat: FileExportArchiveFormat;
}): Promise<string> {
  const fmt = fileExportArchiveFormatToApi(args.archiveFormat);
  if (exportNeedsArchive(args.names, args.entries)) {
    return localExportPathsArchive(
      args.parentPathKey,
      args.names,
      fmt,
      args.destPathKeyOrAbs,
      null,
    );
  }
  const only = args.names[0]!;
  return copyLocalFile(args.parentPathKey, only, args.destPathKeyOrAbs, only);
}
