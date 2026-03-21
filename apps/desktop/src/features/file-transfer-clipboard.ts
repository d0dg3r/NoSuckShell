import { broadcastFileTransferClipboard } from "../tauri-api";
import type { FileDragPayload } from "./file-pane-dnd";

let clipboard: FileDragPayload | null = null;
const subscribers = new Set<() => void>();

export function getFileTransferClipboard(): FileDragPayload | null {
  return clipboard;
}

export function setFileTransferClipboardFromEvent(payload: FileDragPayload | null): void {
  clipboard = payload;
  subscribers.forEach((fn) => fn());
}

export function subscribeFileTransferClipboard(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export async function copyFileToTransferClipboard(payload: FileDragPayload): Promise<void> {
  clipboard = payload;
  subscribers.forEach((fn) => fn());
  if (import.meta.env.VITE_E2E === "true") {
    return;
  }
  try {
    await broadcastFileTransferClipboard(payload);
  } catch {
    // Not running inside Tauri webview
  }
}
