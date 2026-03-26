import { useCallback, useEffect, useMemo, useState } from "react";
import { openExternalUrl } from "../tauri-api";
import {
  isProxmoxConsoleDeepLinkUrl,
  proxmoxWebUiEntryUrlFromConsoleOrBaseUrl,
} from "../features/proxmox-console-urls";
import { openProxmoxInAppWebviewWindow } from "../features/proxmox-webview-window";

type Props = {
  url: string;
  paneTitle: string;
  /** When true, matches PROXMUX "Allow insecure TLS" for the in-app webview window (Linux/BSD). */
  allowInsecureTls?: boolean;
  tlsTrustedCertPem?: string | null;
  onOpenInAppWindowError?: (message: string) => void;
  /** Shown after opening the login URL in a separate webview (Proxmox console deep links). */
  onLoginFirstWebviewOpen?: (payload: { label: string; consoleUrl: string }) => void;
};

export function WebPane({
  url,
  paneTitle,
  allowInsecureTls = false,
  tlsTrustedCertPem,
  onOpenInAppWindowError,
  onLoginFirstWebviewOpen,
}: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const [copyHint, setCopyHint] = useState("");
  const isConsoleDeepLink = useMemo(() => isProxmoxConsoleDeepLinkUrl(url), [url]);
  const entryUrl = useMemo(() => proxmoxWebUiEntryUrlFromConsoleOrBaseUrl(url), [url]);
  const [iframePhase, setIframePhase] = useState<"login" | "console">(() =>
    isConsoleDeepLink ? "login" : "console",
  );
  // Each new console deep link must hit the cluster root first (cookie/session), then the user opens the console.
  useEffect(() => {
    setIframePhase(isConsoleDeepLink ? "login" : "console");
  }, [url, isConsoleDeepLink]);
  const iframeSrc = isConsoleDeepLink && iframePhase === "login" ? entryUrl : url;

  const reload = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const openInBrowser = useCallback(() => {
    void openExternalUrl(url).catch(() => {
      /* App surfaces errors elsewhere if needed */
    });
  }, [url]);

  const openInAppWindow = useCallback(() => {
    void openProxmoxInAppWebviewWindow({
      title: paneTitle,
      consoleUrl: url,
      allowInsecureTls,
      tlsTrustedCertPem,
    })
      .then((result) => {
        if (result.loginFirst && !result.reused) {
          onLoginFirstWebviewOpen?.({ label: result.label, consoleUrl: url });
        }
      })
      .catch((e) => {
        onOpenInAppWindowError?.(String(e));
      });
  }, [paneTitle, url, allowInsecureTls, onOpenInAppWindowError, onLoginFirstWebviewOpen]);

  const copyUrl = useCallback(() => {
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopyHint("Copied");
        window.setTimeout(() => setCopyHint(""), 2000);
      },
      () => setCopyHint("Copy failed"),
    );
  }, [url]);

  return (
    <div className="web-pane-root terminal-root terminal-host" role="region" aria-label={paneTitle}>
      <div className="web-pane-toolbar">
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={reload}>
          Reload
        </button>
        {isConsoleDeepLink && iframePhase === "login" ? (
          <button
            type="button"
            className="btn btn-primary web-pane-toolbar-btn"
            onClick={() => {
              setIframePhase("console");
            }}
          >
            Load console in pane
          </button>
        ) : null}
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={openInBrowser}>
          Open in browser
        </button>
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={openInAppWindow}>
          Open in app window
        </button>
        <button type="button" className="btn btn-settings-tool web-pane-toolbar-btn" onClick={copyUrl}>
          Copy URL
        </button>
        {copyHint ? <span className="web-pane-toolbar-hint muted-copy">{copyHint}</span> : null}
      </div>
      <iframe
        key={iframeKey}
        className="web-pane-iframe"
        title={paneTitle}
        src={iframeSrc}
        data-console-deep-link={isConsoleDeepLink ? "true" : "false"}
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
