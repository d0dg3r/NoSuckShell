import { navigateInAppWebviewWindow, openInAppWebviewWindow } from "../tauri-api";
import { isProxmoxConsoleDeepLinkUrl, proxmoxWebUiEntryUrlFromConsoleOrBaseUrl } from "./proxmox-console-urls";

/** Last webview label per Proxmox origin (`https://host:port`) for reuse across VNC/shell opens. */
const labelByProxmoxOrigin: Record<string, string> = {};

function httpOrigin(url: string): string | null {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
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
        return { label: existing, loginFirst: false, reused: true };
      } catch {
        delete labelByProxmoxOrigin[origin];
      }
    }
  }

  const consoleDeep = isProxmoxConsoleDeepLinkUrl(trimmed);
  // New aux webviews do not share cookies with the main window iframe. Always load the Proxmox root first
  // for deep links so PVEAuthCookie is set in this webview (reuse path navigates directly).
  const loginFirst = consoleDeep;
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
}

/** Test-only: simulate closed webview for an origin. */
export function __forgetWebviewLabelForOriginForTests(origin: string): void {
  delete labelByProxmoxOrigin[origin];
}
