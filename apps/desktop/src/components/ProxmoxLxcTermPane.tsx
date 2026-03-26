import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
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
  tlsTrustedCertPem?: string;
  /** Incrementing nonce from pane toolbar to trigger reconnect. */
  reconnectRequestNonce?: number;
  connectTimeoutMs?: number;
  onError?: (message: string) => void;
};

/**
 * Proxmox pve-xtermjs wire protocol (matches termproxy/src/main.rs + xterm.js/src/main.js):
 *
 * Auth:     After WS open, client sends "{username}:{ticket}\n" as text.
 *           Server replies with binary "OK" (0x4F 0x4B) + optional initial output.
 *
 * Client→Server (text strings):
 *   Data:   "0:{byteLen}:{utf8data}"
 *   Resize: "1:{cols}:{rows}:"
 *   Ping:   "2"
 *
 * Server→Client: raw PTY bytes (binary ArrayBuffer, no prefix).
 */
function attachProxmoxLxcSocket(
  term: Terminal,
  ws: WebSocket,
  apiUser: string,
  vncTicket: string,
): () => void {
  ws.binaryType = "arraybuffer";
  let authenticated = false;

  const onMessage = (ev: MessageEvent<ArrayBuffer | string>) => {
    const raw = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new TextEncoder().encode(ev.data as string);
    if (raw.length === 0) return;

    if (!authenticated) {
      if (raw[0] === 0x4f && raw[1] === 0x4b) {
        authenticated = true;
        if (raw.length > 2) {
          term.write(raw.slice(2));
        }
        term.focus();
      } else {
        ws.close();
      }
      return;
    }

    term.write(raw);
  };

  const enc = new TextEncoder();
  const disposeData = term.onData((data) => {
    if (ws.readyState !== WebSocket.OPEN || !authenticated) return;
    const byteLen = enc.encode(data).length;
    ws.send(`0:${byteLen}:${data}`);
  });

  const disposeResize = term.onResize(({ cols, rows }) => {
    if (ws.readyState !== WebSocket.OPEN || !authenticated) return;
    ws.send(`1:${cols}:${rows}:`);
  });

  const pingInterval = window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("2");
    }
  }, 30_000);

  ws.addEventListener("message", onMessage as (e: MessageEvent) => void);

  ws.send(`${apiUser}:${vncTicket}\n`);

  return () => {
    window.clearInterval(pingInterval);
    disposeData.dispose();
    disposeResize.dispose();
    ws.removeEventListener("message", onMessage as (e: MessageEvent) => void);
  };
}

export function ProxmoxLxcTermPane({
  clusterId,
  node,
  vmid,
  paneTitle,
  allowInsecureTls = false,
  tlsTrustedCertPem,
  reconnectRequestNonce = 0,
  connectTimeoutMs: connectTimeoutMsProp,
  onError,
}: Props) {
  const connectTimeoutMs = connectTimeoutMsProp ?? defaultConnectTimeoutMs(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const proxyIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const root = container?.closest<HTMLElement>(".terminal-root");
    if (!container || !root) {
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
    detachRef.current?.();
    detachRef.current = null;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    const pid = proxyIdRef.current;
    proxyIdRef.current = null;
    if (pid) {
      try {
        await proxmuxWsProxyStop(pid);
      } catch {
        /* ignore */
      }
    }
    try {
      termRef.current?.clear();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }

    const term =
      termRef.current ??
      new Terminal({
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        theme: { background: "#1a1b26", foreground: "#c0caf5" },
      });
    termRef.current = term;
    const fit = fitRef.current ?? new FitAddon();
    fitRef.current = fit;
    if (!term.element) {
      term.loadAddon(fit);
      term.open(el);
      fit.fit();
    }

    let cancelled = false;

    void (async () => {
      setPhase("connecting");
      setStatusMessage("Fetching console ticket…");
      await teardown();
      if (cancelled) {
        return;
      }

      try {
        const raw = (await pluginInvoke(PROXMUX_PLUGIN_ID, "fetchLxcTermProxy", {
          clusterId,
          node,
          guestType: "lxc",
          vmid,
        })) as { ok?: boolean; apiOrigin?: string; apiUser?: string; authCookie?: string; data?: unknown };
        if (cancelled) {
          return;
        }
        if (!raw?.ok || typeof raw.apiOrigin !== "string" || !raw.apiOrigin.trim()) {
          throw new Error("Invalid response from fetchLxcTermProxy.");
        }
        const apiUser = typeof raw.apiUser === "string" && raw.apiUser.trim() ? raw.apiUser.trim() : "root@pam";
        const ticket = parseProxmoxConsoleProxyData(raw.data);
        if (!ticket) {
          throw new Error("LXC termproxy response missing port or ticket.");
        }
        const vncTicket = String(ticket.ticket);
        const wssUrl = buildProxmoxConsoleWebSocketUrl(raw.apiOrigin.trim(), node, vmid, "lxc", ticket);

        const tlsPem = tlsTrustedCertPem?.trim() ?? "";
        const useTlsBridge = allowInsecureTls || tlsPem.length > 0;
        const upstreamInsecureOnly = allowInsecureTls && tlsPem.length === 0;

        let connectUrl = wssUrl;
        if (useTlsBridge) {
          setStatusMessage("Starting local TLS bridge…");
          const proxy = await proxmuxWsProxyStart(wssUrl, upstreamInsecureOnly, tlsPem || null, undefined, raw.authCookie);
          if (cancelled) {
            await proxmuxWsProxyStop(proxy.proxyId).catch(() => {});
            return;
          }
          proxyIdRef.current = proxy.proxyId;
          connectUrl = proxy.localWsUrl;
        }

        if (cancelled) {
          await teardown();
          return;
        }

        const ws = new WebSocket(connectUrl, ["binary"]);
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(() => reject(new Error("Connection timed out.")), connectTimeoutMs);
          ws.addEventListener(
            "open",
            () => {
              window.clearTimeout(t);
              resolve();
            },
            { once: true },
          );
          ws.addEventListener(
            "error",
            () => {
              window.clearTimeout(t);
              reject(new Error("WebSocket connection failed."));
            },
            { once: true },
          );
        });

        if (cancelled) {
          await teardown();
          return;
        }

        detachRef.current = attachProxmoxLxcSocket(term, ws, apiUser, vncTicket);
        fit.fit();
        setPhase("ready");
        setStatusMessage("");
      } catch (e) {
        if (!cancelled) {
          const msg = String(e);
          setPhase("error");
          setStatusMessage(msg);
          onError?.(msg);
        }
      }
    })();

    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      void teardown();
    };
  }, [allowInsecureTls, clusterId, connectTimeoutMs, node, onError, reconnectRequestNonce, teardown, tlsTrustedCertPem, vmid]);

  return (
    <div className="proxmox-console-pane proxmox-console-pane--lxc terminal-root terminal-host" role="region" aria-label={paneTitle}>
      {phase !== "ready" && statusMessage ? (
        <div className="proxmox-console-pane-status muted-copy proxmox-console-pane-status--row" role="status">
          {phase === "connecting" ? <InlineSpinner label="Connecting" className="proxmox-console-pane-status-spinner" /> : null}
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <div ref={containerRef} className="proxmox-console-xterm-wrap" />
    </div>
  );
}
