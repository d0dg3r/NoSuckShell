const listeners = new Map();
export async function listen(event, handler) {
    const set = listeners.get(event) ?? new Set();
    listeners.set(event, set);
    const wrapped = handler;
    set.add(wrapped);
    return async () => {
        set.delete(wrapped);
    };
}
export function emitSessionOutput(payload) {
    const set = listeners.get("session-output");
    if (!set) {
        return;
    }
    for (const handler of set) {
        handler({ payload });
    }
}
