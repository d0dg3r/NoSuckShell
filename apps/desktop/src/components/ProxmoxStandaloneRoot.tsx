import { useEffect, useState } from "react";
import { App } from "../App";
import type { ProxmoxStandalonePayload } from "../features/proxmox-standalone-payload";
import { takeProxmoxStandalonePayload } from "../tauri-api";
import { ProxmoxStandaloneConsoleView } from "./ProxmoxStandaloneConsoleView";

/** Survives React StrictMode double-mount: second mount must not lose the one-time IPC payload. */
const standalonePayloadCache = new Map<string, ProxmoxStandalonePayload>();
const standalonePayloadInflight = new Map<string, Promise<ProxmoxStandalonePayload | null>>();

async function loadStandalonePayloadOnce(label: string): Promise<ProxmoxStandalonePayload | null> {
  const cached = standalonePayloadCache.get(label);
  if (cached) {
    return cached;
  }
  const existing = standalonePayloadInflight.get(label);
  if (existing) {
    return existing;
  }
  const p = (async () => {
    const raw = await takeProxmoxStandalonePayload(label);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ProxmoxStandalonePayload;
    standalonePayloadCache.set(label, parsed);
    return parsed;
  })();
  standalonePayloadInflight.set(label, p);
  try {
    return await p;
  } finally {
    standalonePayloadInflight.delete(label);
  }
}

export function ProxmoxStandaloneRoot() {
  const [mode, setMode] = useState<"loading" | "main" | "standalone">("loading");
  const [payload, setPayload] = useState<ProxmoxStandalonePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const label = getCurrentWindow().label;
        const cached = standalonePayloadCache.get(label);
        if (cached) {
          if (!cancelled) {
            setPayload(cached);
            setMode("standalone");
          }
          return;
        }
        const parsed = await loadStandalonePayloadOnce(label);
        if (parsed) {
          if (cancelled) {
            return;
          }
          setPayload(parsed);
          setMode("standalone");
          return;
        }
        if (cancelled) {
          return;
        }
        setMode("main");
      } catch {
        if (!cancelled) {
          setMode("main");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "loading") {
    return (
      <div className="proxmox-standalone-boot terminal-root terminal-host" role="status" aria-busy="true">
        <p className="muted-copy">Loading console…</p>
      </div>
    );
  }
  if (mode === "standalone" && payload) {
    return <ProxmoxStandaloneConsoleView payload={payload} />;
  }
  return <App />;
}
