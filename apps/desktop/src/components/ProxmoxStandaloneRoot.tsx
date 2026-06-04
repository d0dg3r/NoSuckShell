import { Suspense, lazy, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ProxmoxStandalonePayload } from "../features/proxmox-standalone-payload";
import { takeProxmoxStandalonePayload } from "../tauri-api";
import { ProxmoxStandaloneConsoleView } from "./ProxmoxStandaloneConsoleView";

/**
 * App is the heaviest module in the bundle. Lazy-loading it lets the WebView
 * paint the lightweight boot shell first, so the main window becomes responsive
 * to pointer events while App parses and mounts in the background.
 */
const App = lazy(async () => {
  const m = await import("../App");
  return { default: m.App };
});

/** Survives React StrictMode double-mount: second mount must not lose the one-time IPC payload. */
const standalonePayloadCache = new Map<string, ProxmoxStandalonePayload>();
const standalonePayloadInflight = new Map<string, Promise<ProxmoxStandalonePayload | null>>();

/**
 * Proxmox standalone webview windows are created with a `px-<uuid>` label
 * (see `open_proxmox_native_console_window` in `main.rs`). All other labels
 * (`main`, `aux`, `web-*`) belong to the regular App shell.
 */
function isProxmoxStandaloneLabel(label: string): boolean {
  return label.startsWith("px-");
}

function readWindowLabelSafe(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    // Browser preview / E2E without Tauri internals: behave like the main window.
    return "main";
  }
}

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

/**
 * Reveal a window that the Tauri config kept hidden until first paint.
 * Tolerates browser preview / E2E (no Tauri internals): `getCurrentWindow()` throws,
 * the catch swallows it, and the regular browser-window stays visible.
 */
function revealCurrentWindowAfterFirstPaint(): () => void {
  let cancelled = false;
  let raf2Handle: number | null = null;
  const showOnce = () => {
    if (cancelled) return;
    try {
      void getCurrentWindow().show();
    } catch {
      // Not running under Tauri (browser preview / E2E) — nothing to do.
    }
  };
  // Two animation frames give the browser a chance to commit the first paint
  // before the OS shows the window, so the user never sees a frozen blank frame.
  const raf1Handle = window.requestAnimationFrame(() => {
    raf2Handle = window.requestAnimationFrame(showOnce);
  });
  // Safety net: if anything stalls (e.g. main thread busy past the rAFs), force-show
  // the window so the user is never stuck with a permanently hidden process.
  const safetyHandle = window.setTimeout(showOnce, 3000);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1Handle);
    if (raf2Handle != null) {
      window.cancelAnimationFrame(raf2Handle);
    }
    window.clearTimeout(safetyHandle);
  };
}

export function ProxmoxStandaloneRoot() {
  const [label] = useState<string>(readWindowLabelSafe);
  const isStandaloneCandidate = isProxmoxStandaloneLabel(label);
  const [mode, setMode] = useState<"loading" | "main" | "standalone">(
    isStandaloneCandidate ? "loading" : "main",
  );
  const [payload, setPayload] = useState<ProxmoxStandalonePayload | null>(null);

  useEffect(() => {
    return revealCurrentWindowAfterFirstPaint();
  }, []);

  useEffect(() => {
    if (!isStandaloneCandidate) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cached = standalonePayloadCache.get(label);
        if (cached) {
          if (!cancelled) {
            setPayload(cached);
            setMode("standalone");
          }
          return;
        }
        const parsed = await loadStandalonePayloadOnce(label);
        if (cancelled) {
          return;
        }
        if (parsed) {
          setPayload(parsed);
          setMode("standalone");
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
  }, [isStandaloneCandidate, label]);

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
  return (
    <Suspense
      fallback={
        <div className="app-boot-shell" role="status" aria-busy="true" aria-label="Loading NoSuckShell">
          <p className="muted-copy">Loading NoSuckShell…</p>
        </div>
      }
    >
      <App />
    </Suspense>
  );
}
