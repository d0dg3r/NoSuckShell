import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { sendInput } from "../tauri-api";
import { hasTauriTransformCallback } from "../features/tauri-runtime";
import type { SessionTab, TrustPromptRequest } from "../features/session-model";
import type { HostMetadataStore, SessionOutputEvent } from "../types";
import { subscribeSessionHostKeyPrompt } from "../session-output-bridge";

export function useSessionOutputTrustListener(params: {
  sessionsRef: MutableRefObject<SessionTab[]>;
  quickConnectAutoTrustRef: MutableRefObject<boolean>;
  metadataStoreRef: MutableRefObject<HostMetadataStore>;
  setError: Dispatch<SetStateAction<string>>;
  setTrustPromptQueue: Dispatch<SetStateAction<TrustPromptRequest[]>>;
}): void {
  const { sessionsRef, quickConnectAutoTrustRef, metadataStoreRef, setError, setTrustPromptQueue } = params;

  useEffect(() => {
    if (!hasTauriTransformCallback()) {
      return;
    }
    const handleHostKeyPrompt = (payload: SessionOutputEvent) => {
      if (!payload.host_key_prompt) {
        return;
      }
      const sessionId = payload.session_id;
      const session = sessionsRef.current.find((entry) => entry.id === sessionId) ?? null;
      if (session?.kind === "sshQuick" && quickConnectAutoTrustRef.current) {
        void sendInput(sessionId, "yes\n").catch((sendError: unknown) => setError(String(sendError)));
        return;
      }
      const trustHostAlias = session?.kind === "sshSaved" ? session.hostAlias : "";
      if (trustHostAlias) {
        const metadata = metadataStoreRef.current.hosts[trustHostAlias] ?? null;
        if (metadata?.trustHostDefault) {
          void sendInput(sessionId, "yes\n").catch((sendError: unknown) => setError(String(sendError)));
          return;
        }
      }
      const promptHostLabel =
        session?.kind === "sshSaved"
          ? session.hostAlias
          : session?.kind === "sshQuick"
            ? session.label
            : session?.kind === "local"
              ? "local-shell"
              : session?.kind === "web"
                ? session.label
                : "unknown";
      setTrustPromptQueue((prev) => {
        if (prev.some((entry) => entry.sessionId === sessionId)) {
          return prev;
        }
        return [...prev, { sessionId, hostLabel: promptHostLabel }];
      });
    };

    return subscribeSessionHostKeyPrompt(handleHostKeyPrompt);
  }, [metadataStoreRef, quickConnectAutoTrustRef, sessionsRef, setError, setTrustPromptQueue]);
}
