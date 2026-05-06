/**
 * withTimeout — races a promise against a deadline.
 *
 * If the promise resolves before `ms` milliseconds the resolved value is
 * returned normally.  If the deadline fires first the returned promise
 * rejects with a `TimeoutError` whose `.code` is `"TIMEOUT"` so callers
 * can distinguish a timeout from a real Gemini error without string-matching
 * the message.
 *
 * The underlying promise is NOT cancelled (JS has no cancellation primitive);
 * it will still run to completion in the background.  Callers that need
 * cancellation should pass an AbortSignal separately to the underlying API.
 */

export class TimeoutError extends Error {
  readonly code = "TIMEOUT" as const;
  readonly timeoutMs: number;

  constructor(ms: number, label?: string) {
    super(
      label
        ? `${label} timed out after ${ms}ms`
        : `Operation timed out after ${ms}ms`,
    );
    this.name = "TimeoutError";
    this.timeoutMs = ms;
  }
}

/**
 * @param promise  The work to race.
 * @param ms       Deadline in milliseconds.
 * @param label    Optional human-readable label included in the error message.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new TimeoutError(ms, label));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timerId);
  });
}
