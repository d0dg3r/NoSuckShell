import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HETZNER_PLUGIN_ID } from "../features/builtin-plugin-ids";
import { connectTimeoutMs as defaultConnectTimeoutMs } from "../features/connect-timeouts";
import { pluginInvoke } from "../tauri-api";
import { InlineSpinner } from "./InlineSpinner";
import type { HetznerConsoleResponse } from "../types";

type Props = {
  projectId: string;
  serverId: string;
  paneTitle: string;
  reconnectRequestNonce?: number;
  connectTimeoutMs?: number;
  onError?: (message: string) => void;
};

type NovncRfbInstance = {
  scaleViewport: boolean;
  resizeSession: boolean;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  disconnect(): void;
};

function resolveNovncRfbConstructor(mod: unknown): new (target: HTMLElement, url: string | WebSocket) => NovncRfbInstance {
  const root = mod as { default?: unknown };
  let candidate: unknown = root.default;
  if (typeof candidate !== "function" && candidate != null && typeof candidate === "object" && "default" in candidate) {
    candidate = (candidate as { default: unknown }).default;
  }
  if (typeof candidate !== "function") {
    throw new Error("noVNC RFB constructor export not found.");
  }
  return candidate as new (target: HTMLElement, url: string | WebSocket) => NovncRfbInstance;
}

export function HetznerVncPane({
  projectId,
  serverId,
  paneTitle,
  reconnectRequestNonce = 0,
  connectTimeoutMs: connectTimeoutMsProp,
  onError,
}: Props) {
  const connectTimeoutMs = connectTimeoutMsProp ?? defaultConnectTimeoutMs(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<{ disconnect: () => void } | null>(null);
  const rfbConnectWatchdogRef = useRef<number | null>(null);
  const passwordRef = useRef<string>("");
  const [phase, setPhase] = useState<"connecting" | "connected" | "error" | "disconnected">("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");

  useLayoutEffect(() => {
    const screen = screenRef.current;
    const root = screen?.closest<HTMLElement>(".terminal-root");
    if (!screen || !root) return;

    const applyTopInset = () => {
      const pane = root.closest(".split-pane") as HTMLElement | null;
      const label = pane?.querySelector(".split-pane-label") as HTMLElement | null;
      if (!pane || !label) {
        root.style.removeProperty("--pane-terminal-top-inset");
        return;
      }
      const paneTop = pane.getBoundingClientRect().top;
      const labelBottom = label.getBoundingClientRect().bottom;
      const requiredTopInset = Math.ceil(Math.max(0, labelBottom - paneTop) + 2);
      root.style.setProperty("--pane-terminal-top-inset", `${requiredTopInset}px`);
    };

    applyTopInset();
    const pane = root.closest(".split-pane");
    const label = pane?.querySelector(".split-pane-label") as HTMLElement | null;
    if (!label) {
      return () => {
        root.style.removeProperty("--pane-terminal-top-inset");
      };
    }
    const ro = new ResizeObserver(() => applyTopInset());
    ro.observe(label);
    window.addEventListener("resize", applyTopInset);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", applyTopInset);
      root.style.removeProperty("--pane-terminal-top-inset");
    };
  }, [paneTitle]);

  const teardown = useCallback(() => {
    try {
      rfbRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    rfbRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const screen = screenRef.current;

    if (!screen) {
      return undefined;
    }

    void (async () => {
      setPhase("connecting");
      setStatusMessage("Requesting console ticket…");
      teardown();
      if (cancelled) return;

      try {
        const raw = await pluginInvoke(HETZNER_PLUGIN_ID, "requestConsole", {
          projectId,
          serverId,
        }) as HetznerConsoleResponse;
        if (cancelled) return;
        if (!raw?.wssUrl) {
          throw new Error("Hetzner API did not return a console WebSocket URL.");
        }

        passwordRef.current = raw.password ?? "";
        const rfbUrl = raw.wssUrl;
        setStatusMessage("Establishing VNC session…");

        const mod = await import("@novnc/novnc/lib/rfb.js");
        const RfbCtor = resolveNovncRfbConstructor(mod);
        if (cancelled || !screenRef.current) {
          teardown();
          return;
        }

        screenRef.current.innerHTML = "";
        const rfb = new RfbCtor(screenRef.current, rfbUrl);
        rfb.scaleViewport = true;
        rfb.resizeSession = true;
        rfbRef.current = rfb;

        const onConnect = () => {
          if (rfbConnectWatchdogRef.current != null) {
            window.clearTimeout(rfbConnectWatchdogRef.current);
            rfbConnectWatchdogRef.current = null;
          }
          if (!cancelled) {
            setPhase("connected");
            setStatusMessage("");
          }
        };
        const onDisconnect = () => {
          if (!cancelled) {
            setPhase("disconnected");
            setStatusMessage("Disconnected.");
          }
        };
        const onSecurityFailure = (ev: Event) => {
          const detail = (ev as CustomEvent<{ reason?: string }>).detail;
          const reason = detail?.reason ?? "Security handshake failed.";
          if (!cancelled) {
            setPhase("error");
            setStatusMessage(reason);
            onError?.(reason);
          }
        };
        const onCredentialsRequired = () => {
          try {
            const client = rfb as unknown as { sendCredentials?: (creds: { username?: string; password?: string; target?: string }) => void };
            client.sendCredentials?.({ password: passwordRef.current });
            if (!cancelled) {
              setStatusMessage("Authenticating VNC session…");
            }
          } catch {
            // let noVNC surface the failure via events
          }
        };

        rfb.addEventListener("connect", onConnect);
        rfb.addEventListener("disconnect", onDisconnect);
        rfb.addEventListener("securityfailure", onSecurityFailure);
        rfb.addEventListener("credentialsrequired", onCredentialsRequired);

        if (rfbConnectWatchdogRef.current != null) {
          window.clearTimeout(rfbConnectWatchdogRef.current);
        }
        rfbConnectWatchdogRef.current = window.setTimeout(() => {
          rfbConnectWatchdogRef.current = null;
          if (cancelled) return;
          try {
            rfb.disconnect();
          } catch {
            /* ignore */
          }
          setPhase("error");
          setStatusMessage("Connection timed out.");
          onError?.("Connection timed out.");
        }, connectTimeoutMs);
      } catch (e) {
        if (!cancelled) {
          const msg = String(e);
          setPhase("error");
          setStatusMessage(msg);
          onError?.(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rfbConnectWatchdogRef.current != null) {
        window.clearTimeout(rfbConnectWatchdogRef.current);
        rfbConnectWatchdogRef.current = null;
      }
      teardown();
    };
  }, [projectId, serverId, connectTimeoutMs, onError, reconnectRequestNonce, teardown]);

  return (
    <div className="proxmox-console-pane proxmox-console-pane--novnc terminal-root terminal-host" role="region" aria-label={paneTitle}>
      {phase !== "connected" && statusMessage ? (
        <div className="proxmox-console-pane-status muted-copy proxmox-console-pane-status--row" role="status">
          {phase === "connecting" ? <InlineSpinner label="Connecting" className="proxmox-console-pane-status-spinner" /> : null}
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <div ref={screenRef} className="proxmox-console-novnc-screen" />
    </div>
  );
}
