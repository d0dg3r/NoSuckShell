export type TerminalOutputBatcher = {
  enqueue: (chunk: string) => void;
  enqueueHostKeyNotice: () => void;
  flush: () => void;
  dispose: () => void;
};

/** Coalesce PTY output chunks and flush to xterm once per animation frame. */
export function createTerminalOutputBatcher(
  write: (combined: string) => void,
  writeHostKeyNotice: () => void,
): TerminalOutputBatcher {
  let pending = "";
  let hostKeyNoticePending = false;
  let rafId: number | null = null;

  const flushNow = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (pending.length > 0) {
      const combined = pending;
      pending = "";
      write(combined);
    }
    if (hostKeyNoticePending) {
      hostKeyNoticePending = false;
      writeHostKeyNotice();
    }
  };

  const scheduleFlush = (): void => {
    if (rafId !== null) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      flushNow();
    });
  };

  return {
    enqueue(chunk: string) {
      if (chunk.length === 0) {
        return;
      }
      pending += chunk;
      scheduleFlush();
    },
    enqueueHostKeyNotice() {
      hostKeyNoticePending = true;
      scheduleFlush();
    },
    flush: flushNow,
    dispose() {
      flushNow();
    },
  };
}
