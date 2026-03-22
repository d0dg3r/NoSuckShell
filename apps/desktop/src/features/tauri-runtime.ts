export const hasTauriTransformCallback = (): boolean => {
  if (import.meta.env.VITE_E2E === "true") {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: { transformCallback?: unknown } })
    .__TAURI_INTERNALS__;
  return typeof tauriInternals?.transformCallback === "function";
};
