import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isRateLimited } from "./rateLimit";

// isRateLimited keeps state in a module-level Map, not per-instance -- every
// test uses its own unique key so runs never interfere with each other,
// rather than relying on test execution order or module reset.
function uniqueKey() {
  return `test:${Math.random().toString(36).slice(2)}`;
}

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first `max` calls within the window", () => {
    const key = uniqueKey();
    expect(isRateLimited(key, 3, 1000)).toBe(false);
    expect(isRateLimited(key, 3, 1000)).toBe(false);
    expect(isRateLimited(key, 3, 1000)).toBe(false);
  });

  it("blocks the (max + 1)th call within the window", () => {
    const key = uniqueKey();
    isRateLimited(key, 3, 1000);
    isRateLimited(key, 3, 1000);
    isRateLimited(key, 3, 1000);
    expect(isRateLimited(key, 3, 1000)).toBe(true);
  });

  it("allows a call again once the window has fully elapsed", () => {
    const key = uniqueKey();
    expect(isRateLimited(key, 1, 1000)).toBe(false);
    expect(isRateLimited(key, 1, 1000)).toBe(true); // still within window

    vi.advanceTimersByTime(1001);

    expect(isRateLimited(key, 1, 1000)).toBe(false);
  });

  it("treats different keys independently", () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    expect(isRateLimited(keyA, 1, 1000)).toBe(false);
    expect(isRateLimited(keyA, 1, 1000)).toBe(true);
    // keyB has never been called -- must not be affected by keyA's state
    expect(isRateLimited(keyB, 1, 1000)).toBe(false);
  });

  it("max=0 blocks immediately", () => {
    const key = uniqueKey();
    expect(isRateLimited(key, 0, 1000)).toBe(true);
  });
});
