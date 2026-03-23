import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROXMUX_PLUGIN_ID } from "../features/builtin-plugin-ids";
import { buildProxmoxConsoleUrl } from "../features/proxmox-console-urls";
import { buildProxmoxConsoleWebSocketUrl, parseProxmoxConsoleProxyData } from "../features/proxmox-console-ws";
import { openProxmoxInAppWebviewWindow } from "../features/proxmox-webview-window";
import { openExternalUrl, pluginInvoke, proxmuxWsProxyStart, proxmuxWsProxyStop } from "../tauri-api";

type Props = {
  clusterId: string;
  node: string;
  vmid: string;
  paneTitle: string;
  proxmoxBaseUrl: string;
  allowInsecureTls?: boolean;
  onError?: (message: string) => void;
  onOpenInAppWindowError?: (message: string) => void;
  onLoginFirstWebviewOpen?: (payload: { label: string; consoleUrl: string }) => void;
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
  proxmoxBaseUrl,
  allowInsecureTls = false,
  onError,
  onOpenInAppWindowError,
  onLoginFirstWebviewOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const proxyIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [connectNonce, setConnectNonce] = useState(0);

  const deepLinkUrl = buildProxmoxConsoleUrl(proxmoxBaseUrl, { kind: "lxc", node, vmid });

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

  const openInAppWindow = useCallback(() => {
    void openProxmoxInAppWebviewWindow({ title: paneTitle, consoleUrl: deepLinkUrl, allowInsecureTls })
      .then((result) => {
        if (result.loginFirst && !result.reused) {
          onLoginFirstWebviewOpen?.({ label: result.label, consoleUrl: deepLinkUrl });
        }
      })
      .catch((e) => {
        onOpenInAppWindowError?.(String(e));
      });
  }, [allowInsecureTls, deepLinkUrl, onLoginFirstWebviewOpen, onOpenInAppWindowError, paneTitle]);

  const openInBrowser = useCallback(() => {
    void openExternalUrl(deepLinkUrl).catch(() => {});
  }, [deepLinkUrl]);

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
        })) as { ok?: boolean; apiOrigin?: string; apiUser?: string; authHeader?: string; data?: unknown };
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

        let connectUrl = wssUrl;
        if (allowInsecureTls) {
          setStatusMessage("Starting local TLS bridge…");
          const proxy = await proxmuxWsProxyStart(wssUrl, true, raw.authHeader);
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
          const t = window.setTimeout(() => reject(new Error("WebSocket open timed out.")), 30000);
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
  }, [allowInsecureTls, clusterId, connectNonce, node, onError, teardown, vmid]);

  const reconnect = useCallback(() => {
    setConnectNonce((n) => n + 1);
  }, []);

  return (
    <div className="proxmox-console-pane proxmox-console-pane--lxc terminal-root terminal-host" role="region" aria-label={paneTitle}>
      <div className="web-pane-toolbar proxmox-console-toolbar">
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={reconnect}>
          Reconnect
        </button>
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={openInAppWindow}>
          Open in app window
        </button>
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={openInBrowser}>
          Open in browser
        </button>
      </div>
      {phase !== "ready" && statusMessage ? (
        <div className="proxmox-console-pane-status muted-copy" role="status">
          {statusMessage}
        </div>
      ) : null}
      <div ref={containerRef} className="proxmox-console-xterm-wrap" />
    </div>
  );
}
