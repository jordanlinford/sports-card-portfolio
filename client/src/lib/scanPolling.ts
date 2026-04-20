// Client-side helper that turns the async scan-job queue back into a
// promise-style API for the existing scan handlers. The server either:
//   a) returns the full scan result synchronously (14-day image-hash cache), OR
//   b) returns 202 { async: true, jobId, status, progress, usage } and we poll
//      GET /api/cards/scan-jobs/:id until status is "complete" or "failed".

export type ScanProgressUpdate = {
  jobId: string;
  status: "queued" | "processing" | "complete" | "failed";
  progress: string | null;
};

type SubmitOptions = {
  body: unknown;
  signal?: AbortSignal;
  onProgress?: (update: ScanProgressUpdate) => void;
  /**
   * Called as soon as the server accepts the scan and returns a jobId
   * (before any polling). Use this to register the job with
   * ScanJobContext so it survives page navigation.
   */
  onJobStarted?: (jobId: string) => void;
  /** Poll interval in ms. Defaults to 1500. */
  pollIntervalMs?: number;
  /** Overall timeout in ms. Defaults to 180_000 (3 min). */
  overallTimeoutMs?: number;
};

/**
 * Submits a scan request and resolves with the final scan payload. Handles
 * both the synchronous cache-hit path and the async job-queue path.
 *
 * The resolved payload matches what the old synchronous endpoint returned:
 *   { success, scan, scanHistoryId?, fieldConfidence, uncertainFields,
 *     parallelSuggestions, usage? }
 */
export async function submitScanAndWait(opts: SubmitOptions): Promise<any> {
  const {
    body,
    signal,
    onProgress,
    pollIntervalMs = 1500,
    overallTimeoutMs = 180_000,
  } = opts;

  const res = await fetch("/api/cards/scan-identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  const initial = await res.json();

  // Cache-hit / service-unavailable paths: the server returned the final
  // payload directly — nothing to poll.
  if (!initial?.async || !initial?.jobId) {
    return initial;
  }

  const jobId: string = initial.jobId;
  const startedAt = Date.now();

  onProgress?.({
    jobId,
    status: (initial.status as ScanProgressUpdate["status"]) ?? "queued",
    progress: initial.progress ?? null,
  });

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Scan aborted", "AbortError");
    }
    if (Date.now() - startedAt > overallTimeoutMs) {
      throw new Error("Scan timed out while waiting for background job");
    }

    await sleep(pollIntervalMs, signal);

    const pollRes = await fetch(`/api/cards/scan-jobs/${jobId}`, {
      method: "GET",
      credentials: "include",
      signal,
    });

    if (!pollRes.ok) {
      // 404 typically means the job was cleaned up; surface a clean error.
      const text = (await pollRes.text()) || pollRes.statusText;
      throw new Error(`${pollRes.status}: ${text}`);
    }

    const job = await pollRes.json();
    onProgress?.({
      jobId,
      status: job.status,
      progress: job.progress ?? null,
    });

    if (job.status === "complete") {
      const payload = job.result ?? {};
      // Attach usage from the initial 202 response so existing UI can read it.
      if (initial.usage && !payload.usage) {
        payload.usage = initial.usage;
      }
      // scanHistoryId lives on the job record too (some payloads omit it).
      if (job.scanHistoryId != null && payload.scanHistoryId == null) {
        payload.scanHistoryId = job.scanHistoryId;
      }
      return payload;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Scan failed");
    }
    // otherwise: still queued/processing — keep polling.
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Scan aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Scan aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort);
  });
}
