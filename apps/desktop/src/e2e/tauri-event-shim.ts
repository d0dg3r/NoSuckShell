import type { SessionOutputEvent } from "../types";

type EventPayloadMap = {
  "session-output": SessionOutputEvent;
};

type Handler<T> = (event: { payload: T }) => void;

const listeners = new Map<string, Set<Handler<unknown>>>();

export async function listen<K extends keyof EventPayloadMap>(
  event: K,
  handler: Handler<EventPayloadMap[K]>,
): Promise<() => void> {
  const set = listeners.get(event) ?? new Set();
  listeners.set(event, set);
  const wrapped = handler as Handler<unknown>;
  set.add(wrapped);
  return async () => {
    set.delete(wrapped);
  };
}

export function emitSessionOutput(payload: SessionOutputEvent): void {
  const set = listeners.get("session-output");
  if (!set) {
    return;
  }
  for (const handler of set) {
    handler({ payload });
  }
}
