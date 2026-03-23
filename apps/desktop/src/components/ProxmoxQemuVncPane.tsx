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
  proxmoxBaseUrl,
  allowInsecureTls = false,
  onError,
  onOpenInAppWindowError,
  onLoginFirstWebviewOpen,
}: Props) {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<{ disconnect: () => void } | null>(null);
  const proxyIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"connecting" | "connected" | "error" | "disconnected">("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting…");
  const [connectNonce, setConnectNonce] = useState(0);

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

  const deepLinkUrl = buildProxmoxConsoleUrl(proxmoxBaseUrl, { kind: "qemu", node, vmid });

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

        let rfbUrl: string | WebSocket = wssUrl;
        if (allowInsecureTls) {
          setStatusMessage("Starting local TLS bridge…");
          const proxy = await proxmuxWsProxyStart(wssUrl, true, undefined, raw.authCookie);
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
      void teardown();
    };
  }, [allowInsecureTls, clusterId, connectNonce, node, onError, teardown, vmid]);

  const reconnect = useCallback(() => {
    setConnectNonce((n) => n + 1);
  }, []);

  return (
    <div className="proxmox-console-pane proxmox-console-pane--novnc terminal-root terminal-host" role="region" aria-label={paneTitle}>
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
      {phase !== "connected" && statusMessage ? (
        <div className="proxmox-console-pane-status muted-copy" role="status">
          {statusMessage}
        </div>
      ) : null}
      <div ref={screenRef} className="proxmox-console-novnc-screen" />
    </div>
  );
}
