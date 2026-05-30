import { describe, expect, it } from "vitest";
import {
  canCoalesceInputEntry,
  createSessionInputQueueState,
  drainSessionInputQueueOnce,
  enqueueSessionInputEntry,
  type InputQueueEntry,
} from "./session-input-queue";

describe("session input coalescing", () => {
  it("merges consecutive single-character entries regardless of character", () => {
    let queue: InputQueueEntry[] = [];
    queue = enqueueSessionInputEntry(queue, "h", () => {}, () => {});
    queue = enqueueSessionInputEntry(queue, "i", () => {}, () => {});
    expect(queue).toHaveLength(1);
    expect(queue[0].data).toBe("hi");
  });

  it("does not merge after a multi-character entry", () => {
    let queue: InputQueueEntry[] = [];
    queue = enqueueSessionInputEntry(queue, "yes\n", () => {}, () => {});
    queue = enqueueSessionInputEntry(queue, "a", () => {}, () => {});
    expect(queue).toHaveLength(2);
    expect(canCoalesceInputEntry(queue[0], "b")).toBe(false);
  });

  it("continues coalescing singles after an initial single", () => {
    let queue: InputQueueEntry[] = [];
    queue = enqueueSessionInputEntry(queue, "a", () => {}, () => {});
    queue = enqueueSessionInputEntry(queue, "b", () => {}, () => {});
    queue = enqueueSessionInputEntry(queue, "c", () => {}, () => {});
    expect(queue[0].data).toBe("abc");
  });
});

describe("drainSessionInputQueueOnce", () => {
  it("invokes send with queued data and resolves promises", async () => {
    const state = createSessionInputQueueState();
    state.queuesBySession.set(
      "s1",
      [{ data: "hello", coalescible: false, resolves: [], rejects: [] }],
    );
    let sent: string | null = null;
    const hadEntry = await drainSessionInputQueueOnce(state, "s1", async (_id, data) => {
      sent = data;
    });
    expect(hadEntry).toBe(true);
    expect(sent).toBe("hello");
    expect(state.queuesBySession.get("s1")).toEqual([]);
  });
});
