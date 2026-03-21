import { open } from "@tauri-apps/plugin-dialog";
import type { FileExportDestMode } from "../components/settings/app-settings-types";

/** Resolves destination path key or absolute path for exports. Returns `null` if the user cancels the folder dialog. */
export async function resolveFileExportDestPath(
  mode: FileExportDestMode,
  fixedPathKey: string,
): Promise<string | null> {
  if (mode === "ask") {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Export destination folder",
    });
    if (picked === null || picked === undefined) {
      return null;
    }
    return Array.isArray(picked) ? (picked[0] ?? null) : picked;
  }
  return fixedPathKey;
}
