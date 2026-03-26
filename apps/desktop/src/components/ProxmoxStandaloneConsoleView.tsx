import { Suspense, lazy, useEffect, useState } from "react";
import { InlineSpinner } from "./InlineSpinner";
import { PROXMUX_PLUGIN_ID } from "../features/builtin-plugin-ids";
import type { ProxmoxStandalonePayload } from "../features/proxmox-standalone-payload";
import { connectTimeoutMs } from "../features/connect-timeouts";
import { getAppPreferences, pluginInvoke } from "../tauri-api";

const ProxmoxQemuVncPane = lazy(async () => {
  const m = await import("./ProxmoxQemuVncPane");
  return { default: m.ProxmoxQemuVncPane };
});
const ProxmoxLxcTermPane = lazy(async () => {
  const m = await import("./ProxmoxLxcTermPane");
  return { default: m.ProxmoxLxcTermPane };
});
const ProxmoxNodeTermPane = lazy(async () => {
  const m = await import("./ProxmoxNodeTermPane");
  return { default: m.ProxmoxNodeTermPane };
});

type ClusterTls = {
  allowInsecureTls: boolean;
  tlsTrustedCertPem: string | undefined;
};

async function fetchClusterTls(clusterId: string): Promise<ClusterTls> {
  const raw = await pluginInvoke(PROXMUX_PLUGIN_ID, "listState", {});
  const clusters = (raw as { clusters?: Array<{ id: string; allowInsecureTls?: boolean; tlsTrustedCertPem?: string | null }> })
    .clusters;
  const c = Array.isArray(clusters) ? clusters.find((x) => x.id === clusterId) : undefined;
  const pem = typeof c?.tlsTrustedCertPem === "string" ? c.tlsTrustedCertPem.trim() : "";
  return {
    allowInsecureTls: c?.allowInsecureTls === true,
    tlsTrustedCertPem: pem.length > 0 ? pem : undefined,
  };
}

type Props = {
  payload: ProxmoxStandalonePayload;
};

export function ProxmoxStandaloneConsoleView({ payload }: Props) {
  const [tls, setTls] = useState<ClusterTls | null>(null);
  const [wsConnectTimeoutMs, setWsConnectTimeoutMs] = useState(() => connectTimeoutMs(null));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [t, prefs] = await Promise.all([fetchClusterTls(payload.clusterId), getAppPreferences().catch(() => null)]);
        if (!cancelled) {
          setTls(t);
          if (prefs) {
            setWsConnectTimeoutMs(connectTimeoutMs(prefs));
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload.clusterId]);

  if (error) {
    return (
      <div className="proxmox-standalone-console terminal-root terminal-host" role="alert">
        <p className="error-text">{error}</p>
      </div>
    );
  }
  if (!tls) {
    return (
      <div
        className="proxmox-standalone-console terminal-root terminal-host terminal-suspense-fallback"
        role="status"
        aria-busy="true"
        aria-label="Preparing console"
      >
        <InlineSpinner label="Preparing console" />
        <span className="muted-copy">Preparing console…</span>
      </div>
    );
  }

  const commonTls = {
    allowInsecureTls: tls.allowInsecureTls,
    ...(tls.tlsTrustedCertPem ? { tlsTrustedCertPem: tls.tlsTrustedCertPem } : {}),
  };

  return (
    <div className="proxmox-standalone-console terminal-root terminal-host" role="region" aria-label={payload.paneTitle}>
      <div className="proxmox-standalone-console-chrome">
        <span className="proxmox-standalone-console-title">{payload.paneTitle}</span>
      </div>
      <div className="proxmox-standalone-console-body">
        <Suspense
          fallback={
            <div
              className="terminal-root terminal-host terminal-suspense-fallback"
              role="status"
              aria-busy="true"
              aria-label="Loading console"
            >
              <InlineSpinner label="Loading console" />
              <span className="muted-copy">Loading…</span>
            </div>
          }
        >
          {payload.kind === "qemu-vnc" ? (
            <ProxmoxQemuVncPane
              clusterId={payload.clusterId}
              node={payload.node}
              vmid={payload.vmid}
              paneTitle={payload.paneTitle}
              reconnectRequestNonce={0}
              connectTimeoutMs={wsConnectTimeoutMs}
              {...commonTls}
            />
          ) : payload.kind === "lxc-term" ? (
            <ProxmoxLxcTermPane
              clusterId={payload.clusterId}
              node={payload.node}
              vmid={payload.vmid}
              paneTitle={payload.paneTitle}
              reconnectRequestNonce={0}
              connectTimeoutMs={wsConnectTimeoutMs}
              {...commonTls}
            />
          ) : (
            <ProxmoxNodeTermPane
              clusterId={payload.clusterId}
              node={payload.node}
              paneTitle={payload.paneTitle}
              reconnectRequestNonce={0}
              connectTimeoutMs={wsConnectTimeoutMs}
              {...commonTls}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
