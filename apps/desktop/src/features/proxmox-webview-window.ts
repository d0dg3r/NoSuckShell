import { navigateInAppWebviewWindow, openInAppWebviewWindow } from "../tauri-api";
import { isProxmoxConsoleDeepLinkUrl, proxmoxWebUiEntryUrlFromConsoleOrBaseUrl } from "./proxmox-console-urls";

/** Last webview label per Proxmox origin (`https://host:port`) for reuse across VNC/shell opens. */
const labelByProxmoxOrigin: Record<string, string> = {};
/**
 * Origins where the user already completed Proxmox web UI login in this app session (Continue to console,
 * pane flow, or successful reuse). New webviews load the console URL directly instead of the root/login URL.
 */
const sessionReadyByProxmoxOrigin: Record<string, true> = {};

function httpOrigin(url: string): string | null {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

/** Call after the user reaches the console in the web UI (banner Continue, pane “Continue to console”, etc.). */
export function markProxmoxWebUiSessionReadyForOrigin(consoleOrAnyUrl: string): void {
  const o = httpOrigin(consoleOrAnyUrl);
  if (o) {
    sessionReadyByProxmoxOrigin[o] = true;
  }
}

/** Whether this app session already established Proxmox web UI auth for the URL’s origin (e.g. iframe pane). */
export function isProxmoxWebUiSessionReadyForUrl(url: string): boolean {
  const o = httpOrigin(url);
  return o ? sessionReadyByProxmoxOrigin[o] === true : false;
}

export type OpenProxmoxInAppWebviewResult = {
  label: string;
  /** True when the first load should be the root UI (login), not the console deep link. */
  loginFirst: boolean;
  /** True when an existing webview for this origin was focused and navigated. */
  reused: boolean;
};

/**
 * Opens or reuses the in-app webview for a Proxmox cluster: same origin → navigate existing window to the
 * new console URL (session cookies preserved). Otherwise creates a window (root URL first when needed).
 */
export async function openProxmoxInAppWebviewWindow(options: {
  title: string;
  consoleUrl: string;
  allowInsecureTls: boolean;
}): Promise<OpenProxmoxInAppWebviewResult> {
  const { title, consoleUrl, allowInsecureTls } = options;
  const trimmed = consoleUrl.trim();
  const origin = httpOrigin(trimmed);

  if (origin) {
    const existing = labelByProxmoxOrigin[origin];
    if (existing) {
      try {
        await navigateInAppWebviewWindow(existing, trimmed);
        sessionReadyByProxmoxOrigin[origin] = true;
        return { label: existing, loginFirst: false, reused: true };
      } catch {
        delete labelByProxmoxOrigin[origin];
      }
    }
  }

  const consoleDeep = isProxmoxConsoleDeepLinkUrl(trimmed);
  const sessionReady = origin ? sessionReadyByProxmoxOrigin[origin] === true : false;
  const loginFirst = consoleDeep && !sessionReady;
  const openUrl = loginFirst ? proxmoxWebUiEntryUrlFromConsoleOrBaseUrl(trimmed) : trimmed;
  const label = loginFirst
    ? await openInAppWebviewWindow(title, openUrl, allowInsecureTls, trimmed)
    : await openInAppWebviewWindow(title, openUrl, allowInsecureTls);
  if (origin) {
    labelByProxmoxOrigin[origin] = label;
  }
  return { label, loginFirst, reused: false };
}

/** Test-only: clear reuse map between Vitest cases. */
export function __resetProxmoxWebviewReuseForTests(): void {
  for (const k of Object.keys(labelByProxmoxOrigin)) {
    delete labelByProxmoxOrigin[k];
  }
  for (const k of Object.keys(sessionReadyByProxmoxOrigin)) {
    delete sessionReadyByProxmoxOrigin[k];
  }
}

/** Test-only: simulate closed webview while keeping session-ready state. */
export function __forgetWebviewLabelForOriginForTests(origin: string): void {
  delete labelByProxmoxOrigin[origin];
}
