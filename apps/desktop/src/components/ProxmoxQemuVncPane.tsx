import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROXMUX_PLUGIN_ID } from "../features/builtin-plugin-ids";
import { buildProxmoxConsoleWebSocketUrl, parseProxmoxConsoleProxyData } from "../features/proxmox-console-ws";
import { connectTimeoutMs as defaultConnectTimeoutMs } from "../features/connect-timeouts";
import { pluginInvoke, proxmuxWsProxyStart, proxmuxWsProxyStop } from "../tauri-api";
import { InlineSpinner } from "./InlineSpinner";

type Props = {
  clusterId: string;
  node: string;
  vmid: string;
  paneTitle: string;
  allowInsecureTls?: boolean;
  /** Incrementing nonce from pane toolbar to trigger reconnect. */
  reconnectRequestNonce?: number;
  /** PEM of the upstream cert (local WS bridge); if non-empty, TLS certificate verification is skipped entirely (same effect as allowInsecureTls). The PEM is not used as a trust anchor. */
  tlsTrustedCertPem?: string;
  connectTimeoutMs?: number;
  onError?: (message: string) => void;
};

/** noVNC ESM interop: default export may be RFB or a nested `{ default: RFB }`. */
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

export function ProxmoxQemuVncPane({
  clusterId,
  node,
  vmid,
  paneTitle,
  allowInsecureTls = false,
  reconnectRequestNonce = 0,
  tlsTrustedCertPem,
  connectTimeoutMs: connectTimeoutMsProp,
  onError,
}: Props) {
  const connectTimeoutMs = connectTimeoutMsProp ?? defaultConnectTimeoutMs(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<{ disconnect: () => void } | null>(null);
  const rfbConnectWatchdogRef = useRef<number | null>(null);
  const proxyIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"connecting" | "connected" | "error" | "disconnected">("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");

  useLayoutEffect(() => {
    const screen = screenRef.current;
    const root = screen?.closest<HTMLElement>(".terminal-root");
    if (!screen || !root) {
      return;
    }

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

  const teardown = useCallback(async () => {
    try {
      rfbRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    rfbRef.current = null;
    const pid = proxyIdRef.current;
    proxyIdRef.current = null;
    if (pid) {
      try {
        await proxmuxWsProxyStop(pid);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const screen = screenRef.current;
    if (!screen) {
      return undefined;
    }

    void (async () => {
      setPhase("connecting");
      setStatusMessage("Fetching console ticket…");
      await teardown();
      if (cancelled) {
        return;
      }

      try {
        const raw = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchQemuVncProxy", {
          clusterId,
          node,
          guestType: "qemu",
          vmid,
        })) as { ok?: boolean; apiOrigin?: string; authCookie?: string; data?: unknown };
        if (cancelled) {
          return;
        }
        if (!raw?.ok || typeof raw.apiOrigin !== "string" || !raw.apiOrigin.trim()) {
          throw new Error("Invalid response from fetchQemuVncProxy.");
        }
        const ticket = parseProxmoxConsoleProxyData(raw.data);
        if (!ticket) {
          throw new Error("VNC proxy response missing port or ticket.");
        }
        const wssUrl = buildProxmoxConsoleWebSocketUrl(raw.apiOrigin.trim(), node, vmid, "qemu", ticket);

        const tlsPem = tlsTrustedCertPem?.trim() ?? "";
        const useTlsBridge = allowInsecureTls || tlsPem.length > 0;
        const upstreamInsecureOnly = allowInsecureTls && tlsPem.length === 0;

        let rfbUrl: string | WebSocket = wssUrl;
        if (useTlsBridge) {
          setStatusMessage("Starting local TLS bridge…");
          const proxy = await proxmuxWsProxyStart(wssUrl, upstreamInsecureOnly, tlsPem || null, undefined, raw.authCookie);
          if (cancelled) {
            await proxmuxWsProxyStop(proxy.proxyId).catch(() => {});
            return;
          }
          proxyIdRef.current = proxy.proxyId;
          rfbUrl = proxy.localWsUrl;
        }
        setStatusMessage("Establishing VNC session…");

        const mod = await import("@novnc/novnc/lib/rfb.js");
        const RfbCtor = resolveNovncRfbConstructor(mod);
        if (cancelled || !screenRef.current) {
          await teardown();
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
        const onDisconnect = (ev: Event) => {
          void ev;
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
            client.sendCredentials?.({ password: String(ticket.ticket) });
            if (!cancelled) {
              setStatusMessage("Authenticating VNC session…");
            }
          } catch {
            // ignore and let noVNC surface failure via events
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
          if (cancelled) {
            return;
          }
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
      void teardown();
    };
  }, [allowInsecureTls, clusterId, connectTimeoutMs, node, onError, reconnectRequestNonce, teardown, tlsTrustedCertPem, vmid]);

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
