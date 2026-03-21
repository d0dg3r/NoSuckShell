import { useEffect, type MutableRefObject } from "react";
import type { HostMetadataStore } from "../types";
import type { SessionTab } from "../features/session-model";

export function useAppRefSync(params: {
  sessionsRef: MutableRefObject<SessionTab[]>;
  sessions: SessionTab[];
  metadataStoreRef: MutableRefObject<HostMetadataStore>;
  metadataStore: HostMetadataStore;
  quickConnectAutoTrustRef: MutableRefObject<boolean>;
  quickConnectAutoTrust: boolean;
}): void {
  const { sessionsRef, sessions, metadataStoreRef, metadataStore, quickConnectAutoTrustRef, quickConnectAutoTrust } = params;
  useEffect(() => {
    sessionsRef.current = sessions;
    metadataStoreRef.current = metadataStore;
    quickConnectAutoTrustRef.current = quickConnectAutoTrust;
  }, [sessions, metadataStore, quickConnectAutoTrust, sessionsRef, metadataStoreRef, quickConnectAutoTrustRef]);
}
