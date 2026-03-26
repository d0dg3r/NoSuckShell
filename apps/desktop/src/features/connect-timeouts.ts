import type { AppPreferences } from "../types";

export const DEFAULT_CONNECT_TIMEOUT_SECS = 3;
export const DEFAULT_HTTP_REQUEST_TIMEOUT_SECS = 30;

export const MIN_CONNECT_TIMEOUT_SECS = 1;
export const MAX_CONNECT_TIMEOUT_SECS = 120;
export const MIN_HTTP_REQUEST_TIMEOUT_SECS = 5;
export const MAX_HTTP_REQUEST_TIMEOUT_SECS = 600;

export const defaultAppPreferences = (): AppPreferences => ({
  connectTimeoutSecs: DEFAULT_CONNECT_TIMEOUT_SECS,
  httpRequestTimeoutSecs: DEFAULT_HTTP_REQUEST_TIMEOUT_SECS,
  nssCommanderUseClassicGutter: false,
});

export function connectTimeoutMs(prefs: AppPreferences | null | undefined): number {
  const s = prefs?.connectTimeoutSecs;
  if (typeof s !== "number" || !Number.isFinite(s)) {
    return DEFAULT_CONNECT_TIMEOUT_SECS * 1000;
  }
  const clamped = Math.min(MAX_CONNECT_TIMEOUT_SECS, Math.max(MIN_CONNECT_TIMEOUT_SECS, Math.round(s)));
  return clamped * 1000;
}

export function clampAppPreferencesInput(p: AppPreferences): AppPreferences {
  return {
    connectTimeoutSecs: Math.min(
      MAX_CONNECT_TIMEOUT_SECS,
      Math.max(MIN_CONNECT_TIMEOUT_SECS, Math.round(p.connectTimeoutSecs)),
    ),
    httpRequestTimeoutSecs: Math.min(
      MAX_HTTP_REQUEST_TIMEOUT_SECS,
      Math.max(MIN_HTTP_REQUEST_TIMEOUT_SECS, Math.round(p.httpRequestTimeoutSecs)),
    ),
    nssCommanderUseClassicGutter: Boolean(p.nssCommanderUseClassicGutter),
  };
}
