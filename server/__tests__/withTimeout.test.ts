import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, TimeoutError } from "../lib/withTimeout";

// Use fake timers so timeout tests run instantly without real delays.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the underlying value when the promise completes before the deadline", async () => {
    const fast = Promise.resolve(42);
    const result = await withTimeout(fast, 1_000);
    expect(result).toBe(42);
  });

  it("rejects with TimeoutError when the deadline fires first", async () => {
    // A promise that never resolves
    const hang = new Promise<never>(() => {});

    const racePromise = withTimeout(hang, 500);

    // Advance fake timers past the deadline
    vi.advanceTimersByTime(501);

    await expect(racePromise).rejects.toThrow(TimeoutError);
  });

  it("sets .code to \"TIMEOUT\" on the rejection", async () => {
    const hang = new Promise<never>(() => {});
    const racePromise = withTimeout(hang, 100);
    vi.advanceTimersByTime(101);

    try {
      await racePromise;
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).code).toBe("TIMEOUT");
      expect((err as TimeoutError).timeoutMs).toBe(100);
    }
  });

  it("includes the label in the error message when provided", async () => {
    const hang = new Promise<never>(() => {});
    const racePromise = withTimeout(hang, 200, "myOperation");
    vi.advanceTimersByTime(201);

    await expect(racePromise).rejects.toThrow("myOperation timed out after 200ms");
  });

  it("uses a generic message when no label is provided", async () => {
    const hang = new Promise<never>(() => {});
    const racePromise = withTimeout(hang, 300);
    vi.advanceTimersByTime(301);

    await expect(racePromise).rejects.toThrow("Operation timed out after 300ms");
  });

  it("does NOT fire the timeout timer after the promise resolves", async () => {
    // Verifies clearTimeout is called: if not, a dangling timer would reject
    // a later test.
    const fast = Promise.resolve("done");
    const result = await withTimeout(fast, 5_000);
    expect(result).toBe("done");
    // Advance well past the deadline — should not cause any error
    vi.advanceTimersByTime(10_000);
    // If we reach here without an unhandled rejection the timer was cleared.
  });

  it("propagates rejections from the underlying promise unchanged", async () => {
    const boom = Promise.reject(new Error("upstream failure"));
    await expect(withTimeout(boom, 1_000)).rejects.toThrow("upstream failure");
  });
});
