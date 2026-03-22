import type { RemoteSshSpec } from "../types";

export const FILE_DND_PAYLOAD_MIME = "application/x-nosuckshell-file";

export type FileDragPayload =
  | { kind: "local"; pathKey: string; name: string }
  | { kind: "remote"; spec: RemoteSshSpec; parentPath: string; name: string };

function isRemoteSpec(v: unknown): v is RemoteSshSpec {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as { kind?: string };
  if (o.kind === "saved") {
    const h = (v as { host?: { host?: string } }).host;
    return typeof h?.host === "string";
  }
  if (o.kind === "quick") {
    const r = (v as { request?: { hostName?: string } }).request;
    return typeof r?.hostName === "string";
  }
  return false;
}

export function serializeFileDragPayload(p: FileDragPayload): string {
  return JSON.stringify(p);
}

export function parseFileDragPayload(raw: string): FileDragPayload | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") {
      return null;
    }
    const r = o as Record<string, unknown>;
    if (r.kind === "local" && typeof r.pathKey === "string" && typeof r.name === "string") {
      return { kind: "local", pathKey: r.pathKey, name: r.name };
    }
    if (r.kind === "remote" && typeof r.parentPath === "string" && typeof r.name === "string" && isRemoteSpec(r.spec)) {
      return { kind: "remote", spec: r.spec, parentPath: r.parentPath, name: r.name };
    }
  } catch {
    return null;
  }
  return null;
}
