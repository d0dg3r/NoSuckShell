/**
 * In-browser event bus for `e2e` / screenshot builds (replaces `@tauri-apps/api/event`).
 */
const target = new EventTarget();

export type ListenHandler<T> = (event: { payload: T }) => void;

export async function listen<T>(channel: string, handler: ListenHandler<T>): Promise<() => void> {
  const wrapped = (ev: Event) => {
    const ce = ev as CustomEvent<T>;
    handler({ payload: ce.detail });
  };
  target.addEventListener(channel, wrapped as EventListener);
  return async () => {
    target.removeEventListener(channel, wrapped as EventListener);
  };
}

export function emitTauriEvent<T>(channel: string, detail: T): void {
  target.dispatchEvent(new CustomEvent(channel, { detail }));
}
