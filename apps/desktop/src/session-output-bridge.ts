/** Central `session-output` listener; see `subscribeSessionOutput`. In dev, `window.__NOSUCKSHELL_SESSION_OUTPUT_STATS__` counts IPC events vs handler deliveries. */
import { listen } from "@tauri-apps/api/event";
import type { SessionOutputEvent } from "./types";

type Handler = (payload: SessionOutputEvent) => void;
type HostKeyPromptHandler = (payload: SessionOutputEvent) => void;

const handlersBySession = new Map<string, Set<Handler>>();
const hostKeyPromptHandlers = new Set<HostKeyPromptHandler>();
let globalListenerStarted = false;
let globalUnlisten: (() => void) | null = null;

const hasTauriTransformCallback = (): boolean => {
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

type SessionOutputStats = { ipcEvents: number; handlerCalls: number };

function recordStats(ipcEventsDelta: number, handlerCallsDelta: number): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }
  const w = window as Window & { __NOSUCKSHELL_SESSION_OUTPUT_STATS__?: SessionOutputStats };
  w.__NOSUCKSHELL_SESSION_OUTPUT_STATS__ ??= { ipcEvents: 0, handlerCalls: 0 };
  w.__NOSUCKSHELL_SESSION_OUTPUT_STATS__.ipcEvents += ipcEventsDelta;
  w.__NOSUCKSHELL_SESSION_OUTPUT_STATS__.handlerCalls += handlerCallsDelta;
}

function dispatchSessionOutput(payload: SessionOutputEvent): void {
  if (payload.host_key_prompt && hostKeyPromptHandlers.size > 0) {
    for (const handler of hostKeyPromptHandlers) {
      handler(payload);
    }
  }
  const set = handlersBySession.get(payload.session_id);
  if (!set || set.size === 0) {
    return;
  }
  recordStats(1, set.size);
  for (const handler of set) {
    handler(payload);
  }
}

function ensureGlobalListener(): void {
  if (!hasTauriTransformCallback() || globalListenerStarted) {
    return;
  }
  globalListenerStarted = true;
  void listen<SessionOutputEvent>("session-output", (event) => {
    dispatchSessionOutput(event.payload);
  }).then((unlisten) => {
    globalUnlisten = unlisten;
  }).catch(() => {
    globalListenerStarted = false;
  });
}

// Clean up the global listener on Vite HMR to prevent duplicate dispatches
// when the module is re-evaluated during hot reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    globalListenerStarted = false;
    if (globalUnlisten) {
      globalUnlisten();
      globalUnlisten = null;
    }
    handlersBySession.clear();
    hostKeyPromptHandlers.clear();
  });
}

/**
 * Single `listen("session-output")` for the app; dispatches only to handlers for matching `sessionId`.
 */
export function subscribeSessionOutput(sessionId: string, handler: Handler): () => void {
  if (!hasTauriTransformCallback()) {
    return () => {};
  }
  ensureGlobalListener();
  let set = handlersBySession.get(sessionId);
  if (!set) {
    set = new Set();
    handlersBySession.set(sessionId, set);
  }
  set.add(handler);
  return () => {
    const current = handlersBySession.get(sessionId);
    if (!current) {
      return;
    }
    current.delete(handler);
    if (current.size === 0) {
      handlersBySession.delete(sessionId);
    }
  };
}

/** Subscribe to SSH host-key prompts via the shared session-output listener. */
export function subscribeSessionHostKeyPrompt(handler: HostKeyPromptHandler): () => void {
  if (!hasTauriTransformCallback()) {
    return () => {};
  }
  ensureGlobalListener();
  hostKeyPromptHandlers.add(handler);
  return () => {
    hostKeyPromptHandlers.delete(handler);
  };
}

/** @internal Test-only dispatch for E2E and unit tests without Tauri IPC. */
export function dispatchSessionOutputForTest(payload: SessionOutputEvent): void {
  dispatchSessionOutput(payload);
}
