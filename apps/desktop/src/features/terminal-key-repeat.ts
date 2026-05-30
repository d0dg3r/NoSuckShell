/** Minimum interval between repeated Enter key sends (avoids duplicate `\r`). */
export const ENTER_REPEAT_MIN_INTERVAL_MS = 45;

/** Keys that must not be throttled on repeat (editing and navigation). */
export const KEY_REPEAT_EXCLUDED_KEYS = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

type KeyEventLike = {
  type: string;
  repeat: boolean;
  key: string;
  code: string;
};

/**
 * Returns true when a generic key-repeat event should be dropped.
 * Editing/navigation keys are never throttled; other repeats use {@link minIntervalMs}.
 */
export function shouldThrottleGenericKeyRepeat(
  event: KeyEventLike,
  lastAtByKey: Map<string, number>,
  now: number,
  minIntervalMs: number,
): boolean {
  if (event.type !== "keydown" || !event.repeat || event.key === "Enter") {
    return false;
  }
  if (KEY_REPEAT_EXCLUDED_KEYS.has(event.key)) {
    return false;
  }
  const keyId = `${event.code}:${event.key}`;
  const lastAt = lastAtByKey.get(keyId) ?? null;
  if (lastAt !== null && now - lastAt < minIntervalMs) {
    return true;
  }
  lastAtByKey.set(keyId, now);
  return false;
}

/** Returns true when a repeated Enter should be dropped. */
export function shouldThrottleEnterRepeat(
  event: KeyEventLike,
  lastManualSendAt: number | null,
  now: number,
  minIntervalMs: number,
): boolean {
  if (event.key !== "Enter" || event.type !== "keydown" || !event.repeat) {
    return false;
  }
  if (lastManualSendAt === null) {
    return false;
  }
  return now - lastManualSendAt < minIntervalMs;
}
