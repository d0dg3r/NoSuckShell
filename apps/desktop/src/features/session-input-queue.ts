/** Per-session PTY input queue with single-char coalescing and a short micro-batch window. */

export const SESSION_INPUT_MICRO_BATCH_MS = 6;

export type InputQueueEntry = {
  data: string;
  coalescible: boolean;
  resolves: Array<() => void>;
  rejects: Array<(reason?: unknown) => void>;
};

const isSingleChar = (data: string): boolean => data.length === 1;

export function canCoalesceInputEntry(lastEntry: InputQueueEntry | undefined, data: string): boolean {
  return Boolean(lastEntry?.coalescible && isSingleChar(data));
}

export function enqueueSessionInputEntry(
  queue: InputQueueEntry[],
  data: string,
  resolve: () => void,
  reject: (reason?: unknown) => void,
): InputQueueEntry[] {
  const next = [...queue];
  const lastEntry = next[next.length - 1];
  if (canCoalesceInputEntry(lastEntry, data)) {
    lastEntry.data += data;
    lastEntry.resolves.push(resolve);
    lastEntry.rejects.push(reject);
    return next;
  }
  next.push({
    data,
    coalescible: isSingleChar(data),
    resolves: [resolve],
    rejects: [reject],
  });
  return next;
}

export type SessionInputQueueState = {
  queuesBySession: Map<string, InputQueueEntry[]>;
  drainingSessions: Set<string>;
  scheduledDrainTimers: Map<string, ReturnType<typeof setTimeout>>;
};

export function createSessionInputQueueState(): SessionInputQueueState {
  return {
    queuesBySession: new Map(),
    drainingSessions: new Set(),
    scheduledDrainTimers: new Map(),
  };
}

export function scheduleSessionInputDrain(
  state: SessionInputQueueState,
  sessionId: string,
  drain: (sessionId: string) => void,
  microBatchMs: number = SESSION_INPUT_MICRO_BATCH_MS,
): void {
  if (state.drainingSessions.has(sessionId) || state.scheduledDrainTimers.has(sessionId)) {
    return;
  }
  const timer = setTimeout(() => {
    state.scheduledDrainTimers.delete(sessionId);
    drain(sessionId);
  }, microBatchMs);
  state.scheduledDrainTimers.set(sessionId, timer);
}

export async function drainSessionInputQueueOnce(
  state: SessionInputQueueState,
  sessionId: string,
  send: (sessionId: string, data: string) => Promise<void>,
): Promise<boolean> {
  const queue = state.queuesBySession.get(sessionId) ?? [];
  const entry = queue.shift();
  if (!entry) {
    state.queuesBySession.set(sessionId, queue);
    return false;
  }
  state.queuesBySession.set(sessionId, queue);
  try {
    await send(sessionId, entry.data);
    for (const resolver of entry.resolves) {
      resolver();
    }
  } catch (error) {
    for (const rejecter of entry.rejects) {
      rejecter(error);
    }
  }
  return true;
}
