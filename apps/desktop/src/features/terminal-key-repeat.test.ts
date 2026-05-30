import { describe, expect, it } from "vitest";
import {
  ENTER_REPEAT_MIN_INTERVAL_MS,
  shouldThrottleEnterRepeat,
  shouldThrottleGenericKeyRepeat,
} from "./terminal-key-repeat";

describe("shouldThrottleGenericKeyRepeat", () => {
  it("does not throttle Backspace repeat", () => {
    const map = new Map<string, number>();
    const event = { type: "keydown", repeat: true, key: "Backspace", code: "Backspace" };
    expect(shouldThrottleGenericKeyRepeat(event, map, 100, 45)).toBe(false);
    expect(shouldThrottleGenericKeyRepeat(event, map, 110, 45)).toBe(false);
  });

  it("does not throttle Delete repeat", () => {
    const map = new Map<string, number>();
    const event = { type: "keydown", repeat: true, key: "Delete", code: "Delete" };
    expect(shouldThrottleGenericKeyRepeat(event, map, 100, 45)).toBe(false);
  });

  it("throttles other repeated keys within the interval", () => {
    const map = new Map<string, number>();
    const event = { type: "keydown", repeat: true, key: "a", code: "KeyA" };
    expect(shouldThrottleGenericKeyRepeat(event, map, 100, 45)).toBe(false);
    expect(shouldThrottleGenericKeyRepeat(event, map, 120, 45)).toBe(true);
    expect(shouldThrottleGenericKeyRepeat(event, map, 150, 45)).toBe(false);
  });

  it("ignores non-repeat keydown", () => {
    const map = new Map<string, number>();
    const event = { type: "keydown", repeat: false, key: "a", code: "KeyA" };
    expect(shouldThrottleGenericKeyRepeat(event, map, 100, 45)).toBe(false);
  });
});

describe("shouldThrottleEnterRepeat", () => {
  it("throttles Enter repeat within interval", () => {
    const event = { type: "keydown", repeat: true, key: "Enter", code: "Enter" };
    expect(
      shouldThrottleEnterRepeat(event, 100, 100 + ENTER_REPEAT_MIN_INTERVAL_MS - 1, ENTER_REPEAT_MIN_INTERVAL_MS),
    ).toBe(true);
    expect(
      shouldThrottleEnterRepeat(event, 100, 100 + ENTER_REPEAT_MIN_INTERVAL_MS, ENTER_REPEAT_MIN_INTERVAL_MS),
    ).toBe(false);
  });
});
