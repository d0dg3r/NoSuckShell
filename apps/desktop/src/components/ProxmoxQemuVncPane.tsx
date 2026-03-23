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
        })) as { ok?: boolean; apiOrigin?: string; authHeader?: string; data?: unknown };
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
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H2',location:'ProxmoxQemuVncPane.tsx:110',message:'proxy start called',data:{wssUrl:wssUrl.slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          const proxy = await proxmuxWsProxyStart(wssUrl, true, raw.authHeader);
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H5',location:'ProxmoxQemuVncPane.tsx:113',message:'proxy start result',data:{proxyId:proxy.proxyId,localWsUrl:proxy.localWsUrl},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (cancelled) {
            await proxmuxWsProxyStop(proxy.proxyId).catch(() => {});
            return;
          }
          proxyIdRef.current = proxy.proxyId;
          rfbUrl = proxy.localWsUrl;
        }
        setStatusMessage("Establishing VNC session…");

        // #region agent log
        fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H3',location:'ProxmoxQemuVncPane.tsx:125',message:'rfb url final',data:{rfbUrl:String(rfbUrl).slice(0,150),allowInsecureTls},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const mod = await import("@novnc/novnc/lib/rfb.js");
        const rfbMaybeCtor =
          typeof mod.default === "function"
            ? mod.default
            : typeof (mod.default as { default?: unknown })?.default === "function"
              ? ((mod.default as { default: unknown }).default as typeof mod.default)
              : null;
        if (rfbMaybeCtor == null) {
          throw new Error("noVNC RFB constructor export not found.");
        }
        if (cancelled || !screenRef.current) {
          await teardown();
          return;
        }

        screenRef.current.innerHTML = "";
        // #region agent log
        fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H9',location:'ProxmoxQemuVncPane.tsx:146',message:'creating noVNC RFB instance',data:{},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const rfb = new rfbMaybeCtor(screenRef.current, rfbUrl);
        rfb.scaleViewport = true;
        rfb.resizeSession = true;
        rfbRef.current = rfb;
        // #region agent log
        fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H9',location:'ProxmoxQemuVncPane.tsx:151',message:'noVNC RFB instance created',data:{},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const onConnect = () => {
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H4',location:'ProxmoxQemuVncPane.tsx:onConnect',message:'rfb connected OK',data:{},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (!cancelled) {
            setPhase("connected");
            setStatusMessage("");
          }
        };
        const onDisconnect = (ev: Event) => {
          // #region agent log
          const detail = (ev as CustomEvent<{ clean?: boolean; reason?: string }>).detail;
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H1',location:'ProxmoxQemuVncPane.tsx:onDisconnect',message:'rfb disconnected',data:{clean:detail?.clean,reason:detail?.reason},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (!cancelled) {
            setPhase("disconnected");
            setStatusMessage("Disconnected.");
          }
        };
        const onSecurityFailure = (ev: Event) => {
          const detail = (ev as CustomEvent<{ reason?: string }>).detail;
          const reason = detail?.reason ?? "Security handshake failed.";
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H4',location:'ProxmoxQemuVncPane.tsx:onSecurityFailure',message:'rfb security failure',data:{reason},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (!cancelled) {
            setPhase("error");
            setStatusMessage(reason);
            onError?.(reason);
          }
        };
        const onCredentialsRequired = () => {
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H9',location:'ProxmoxQemuVncPane.tsx:onCredentialsRequired',message:'rfb credentials required',data:{},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          try {
            const client = rfb as unknown as { sendCredentials?: (creds: { username?: string; password?: string; target?: string }) => void };
            client.sendCredentials?.({ password: String(ticket.ticket) });
            // #region agent log
            fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H11',location:'ProxmoxQemuVncPane.tsx:onCredentialsRequired',message:'rfb credentials sent',data:{hasPassword:Boolean(ticket.ticket)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (!cancelled) {
              setStatusMessage("Authenticating VNC session…");
            }
          } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H11',location:'ProxmoxQemuVncPane.tsx:onCredentialsRequired',message:'rfb credentials send failed',data:{error:String(e)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
          }
        };
        const onDesktopName = (ev: Event) => {
          const detail = (ev as CustomEvent<{ name?: string }>).detail;
          // #region agent log
          fetch('http://127.0.0.1:7291/ingest/699ba312-3910-42fe-8ae6-1ba147b8af4c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fb87e7'},body:JSON.stringify({sessionId:'fb87e7',runId:'vnc-debug',hypothesisId:'H10',location:'ProxmoxQemuVncPane.tsx:onDesktopName',message:'rfb desktop name event',data:{name:detail?.name},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        };

        rfb.addEventListener("connect", onConnect);
        rfb.addEventListener("disconnect", onDisconnect);
        rfb.addEventListener("securityfailure", onSecurityFailure);
        rfb.addEventListener("credentialsrequired", onCredentialsRequired);
        rfb.addEventListener("desktopname", onDesktopName);
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
