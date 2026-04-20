import { storage } from "./storage";
import { ObjectStorageService } from "./objectStorage";
import { logActivity } from "./activityLogger";
import type { ScanJob } from "@shared/schema";

const POLL_INTERVAL_MS = 750;
const MAX_CONCURRENCY = 3;
const STUCK_RECOVERY_INTERVAL_MS = 60_000;

let running = false;
let activeWorkers = 0;
let pollTimer: NodeJS.Timeout | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;

export function startScanWorker(): void {
  if (running) return;
  running = true;
  console.log(`[ScanWorker] Starting (concurrency=${MAX_CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms)`);

  // Boot-time recovery sweep
  storage
    .recoverStuckScanJobs(300)
    .then((n) => {
      if (n > 0) console.log(`[ScanWorker] Recovered ${n} stuck job(s) on boot`);
    })
    .catch((err) => console.error("[ScanWorker] Boot recovery failed:", err));

  // Periodic recovery for jobs whose worker died after boot
  recoveryTimer = setInterval(() => {
    storage
      .recoverStuckScanJobs(300)
      .then((n) => {
        if (n > 0) console.log(`[ScanWorker] Recovered ${n} stuck job(s)`);
      })
      .catch((err) => console.error("[ScanWorker] Periodic recovery failed:", err));
  }, STUCK_RECOVERY_INTERVAL_MS);

  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopScanWorker(): void {
  running = false;
  if (pollTimer) clearInterval(pollTimer);
  if (recoveryTimer) clearInterval(recoveryTimer);
  pollTimer = null;
  recoveryTimer = null;
}

async function tick(): Promise<void> {
  if (!running) return;
  // Saturate up to MAX_CONCURRENCY workers per tick
  while (activeWorkers < MAX_CONCURRENCY) {
    let job: ScanJob | undefined;
    try {
      job = await storage.claimNextQueuedScanJob();
    } catch (err) {
      console.error("[ScanWorker] Claim failed:", err);
      return;
    }
    if (!job) return;
    activeWorkers++;
    processJob(job).finally(() => {
      activeWorkers--;
    });
  }
}

async function processJob(job: ScanJob): Promise<void> {
  const startedAt = Date.now();
  console.log(`[ScanWorker] Processing job ${job.id} for user ${job.userId}`);

  if (!job.imageData) {
    await storage.failScanJob(job.id, "Image data missing from job (already cleared)");
    return;
  }

  try {
    await storage.updateScanJobProgress(job.id, "Identifying card");

    const { scanCardImage } = await import("./cardImageScannerService");
    const scanResult = await scanCardImage(
      job.imageData,
      job.mimeType || "image/jpeg",
      job.imageDataBack || undefined,
      job.mimeTypeBack || "image/jpeg",
    );

    await storage.updateScanJobProgress(job.id, "Saving result");

    // Upload image to object storage so the scan history row has a permanent URL.
    let uploadedImagePath: string | null = null;
    try {
      let rawBase64 = job.imageData;
      if (rawBase64.startsWith("data:")) {
        rawBase64 = rawBase64.split(",")[1] || rawBase64;
      }
      const imageBuffer = Buffer.from(rawBase64, "base64");
      const objService = new ObjectStorageService();
      uploadedImagePath = await objService.uploadBuffer(
        imageBuffer,
        job.mimeType || "image/jpeg",
        job.userId,
      );
    } catch (uploadErr) {
      console.error("[ScanWorker] Image upload failed (non-fatal):", uploadErr);
    }

    const cardId = scanResult.cardIdentification;
    let scanHistoryId: number | null = null;
    try {
      const historyRecord = await storage.createScanHistory({
        userId: job.userId,
        playerName: cardId?.playerName || null,
        year: cardId?.year ? parseInt(String(cardId.year)) : null,
        setName: cardId?.setName || null,
        variation: cardId?.variation || null,
        grade: (cardId as any)?.grade || null,
        grader: (cardId as any)?.grader || null,
        sport: cardId?.sport || null,
        cardNumber: cardId?.cardNumber || null,
        imagePath: uploadedImagePath,
        imageHash: job.imageHash || null,
        scanConfidence: scanResult.confidence || null,
        marketValue: null,
        action: null,
        scanSource: "card_analysis",
      });
      scanHistoryId = historyRecord.id;
    } catch (historyErr) {
      console.error("[ScanWorker] Failed to save scan history:", historyErr);
    }

    // Build the same fieldConfidence / uncertainFields / parallelSuggestions
    // payload the synchronous endpoint used to return so the client doesn't
    // need to know the request was async.
    const fieldConfidence: Record<string, { confident: boolean; reason?: string }> = {};
    const ci = scanResult.cardIdentification;
    const overallConf = scanResult.confidence;

    fieldConfidence.playerName = {
      confident: !!ci.playerName && ci.playerName !== "Unknown",
      reason: !ci.playerName || ci.playerName === "Unknown" ? "Could not read player name from image" : undefined,
    };
    fieldConfidence.year = {
      confident: ci.year !== null && ci.year !== undefined,
      reason: ci.year == null ? "Year not visible on card" : undefined,
    };
    fieldConfidence.setName = {
      confident: !!ci.setName && ci.setName !== "Unknown",
      reason: !ci.setName || ci.setName === "Unknown" ? "Set name could not be determined" : undefined,
    };
    const variationIsBase = !ci.variation || ci.variation === "Base";
    fieldConfidence.variation = {
      confident: variationIsBase ? overallConf !== "low" : overallConf === "high",
      reason: !ci.variation
        ? "Parallel/variation not identified — may be base"
        : ci.variation === "Base" && overallConf === "low"
        ? "Base identification with low confidence — check if this has a parallel"
        : overallConf !== "high"
        ? "Variation identified but with lower confidence"
        : undefined,
    };
    fieldConfidence.cardNumber = {
      confident: !!ci.cardNumber,
      reason: !ci.cardNumber ? "Card number not visible" : undefined,
    };
    fieldConfidence.grade = {
      confident: scanResult.gradeEstimate.appearsToBe === "graded" ? !!scanResult.gradeEstimate.grade : true,
      reason:
        scanResult.gradeEstimate.appearsToBe === "graded" && !scanResult.gradeEstimate.grade
          ? "Graded card detected but grade not readable"
          : undefined,
    };
    fieldConfidence.grader = {
      confident: scanResult.gradeEstimate.appearsToBe === "graded" ? !!scanResult.gradeEstimate.gradingCompany : true,
      reason:
        scanResult.gradeEstimate.appearsToBe === "graded" && !scanResult.gradeEstimate.gradingCompany
          ? "Grading company not identified"
          : undefined,
    };

    const uncertainFields = Object.entries(fieldConfidence)
      .filter(([, v]) => !v.confident)
      .map(([k]) => k);

    const parallelSuggestions: string[] = [];
    if (!fieldConfidence.variation.confident && ci.setName && ci.setName !== "Unknown") {
      const setLower = ci.setName.toLowerCase();
      if (setLower.includes("prizm")) {
        parallelSuggestions.push(
          "Base", "Silver Prizm", "Red Prizm /299", "Blue Prizm /199", "Green Prizm",
          "Pink Prizm", "Orange Prizm /49", "Gold Prizm /10", "Black Prizm /1",
          "Mojo", "Hyper Prizm", "Disco", "Camo",
        );
      } else if (setLower.includes("chrome") || setLower.includes("finest")) {
        parallelSuggestions.push("Base", "Refractor", "Pink Refractor", "Gold Refractor /50", "Orange Refractor /25", "Red Refractor /5", "Superfractor /1");
      } else if (setLower.includes("select")) {
        parallelSuggestions.push("Base", "Silver", "Concourse", "Premier Level", "Tie-Dye", "Zebra", "Disco", "Gold /10");
      } else if (setLower.includes("donruss")) {
        parallelSuggestions.push("Base", "Rated Rookie", "Press Proof", "Holo", "Elite Series");
      } else if (setLower.includes("optic")) {
        parallelSuggestions.push("Base", "Holo", "Pink", "Blue /49", "Red /99", "Orange /199", "Green /5", "Gold /10", "Black /1");
      } else {
        parallelSuggestions.push("Base", "Refractor", "Holo", "Numbered", "Short Print");
      }
    }

    const payload = {
      success: scanResult.success,
      scan: scanResult,
      scanHistoryId: scanHistoryId ?? undefined,
      fieldConfidence,
      uncertainFields,
      parallelSuggestions,
    };

    await storage.completeScanJob(job.id, payload, scanHistoryId);

    // Side effects (don't fail the job if they error)
    try {
      logActivity("card_scan", {
        userId: job.userId,
        metadata: {
          playerName: scanResult.cardIdentification?.playerName,
          year: scanResult.cardIdentification?.year,
          set: scanResult.cardIdentification?.setName,
          confidence: scanResult.confidence,
          jobId: job.id,
        },
      });
    } catch {}

    console.log(
      `[ScanWorker] Completed job ${job.id} in ${Date.now() - startedAt}ms (player=${
        scanResult.cardIdentification?.playerName ?? "?"
      })`,
    );
  } catch (err: any) {
    console.error(`[ScanWorker] Job ${job.id} failed:`, err);
    const message =
      err?.message || "Card scanning temporarily unavailable. Please try again or enter details manually.";
    try {
      await storage.failScanJob(job.id, message);
    } catch (markErr) {
      console.error(`[ScanWorker] Failed to mark job ${job.id} as failed:`, markErr);
    }
  }
}
