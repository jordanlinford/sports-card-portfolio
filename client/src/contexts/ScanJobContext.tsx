import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";

const STORAGE_KEY = "scan-jobs-active-v1";
const POLL_INTERVAL_MS = 2000;

export type TrackedScanJob = {
  jobId: string;
  startedAt: number;
  status: "pending" | "processing" | "complete" | "error";
  progress: string | null;
  playerName?: string | null;
  scanHistoryId?: number | null;
  error?: string | null;
};

type ScanJobContextValue = {
  jobs: TrackedScanJob[];
  activeCount: number;
  trackJob: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
  clearCompleted: () => void;
};

const ScanJobContext = createContext<ScanJobContextValue | null>(null);

function loadFromStorage(): TrackedScanJob[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((j) => j && typeof j.jobId === "string");
  } catch {
    return [];
  }
}

function saveToStorage(jobs: TrackedScanJob[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // ignore quota errors
  }
}

export function ScanJobProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<TrackedScanJob[]>(() => loadFromStorage());
  const jobsRef = useRef(jobs);

  useEffect(() => {
    jobsRef.current = jobs;
    saveToStorage(jobs);
  }, [jobs]);

  // Clear tracked jobs on sign-out so a next user doesn't see someone else's.
  useEffect(() => {
    if (!isAuthenticated) {
      setJobs([]);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, [isAuthenticated]);

  const trackJob = useCallback((jobId: string) => {
    setJobs((prev) => {
      if (prev.some((j) => j.jobId === jobId)) return prev;
      return [
        ...prev,
        {
          jobId,
          startedAt: Date.now(),
          status: "pending",
          progress: null,
        },
      ];
    });
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "pending" || j.status === "processing"));
  }, []);

  // Single background poller for all tracked jobs that haven't settled yet.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (jobs.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      const active = jobsRef.current.filter(
        (j) => j.status === "pending" || j.status === "processing",
      );
      if (active.length === 0) return;

      await Promise.all(
        active.map(async (job) => {
          try {
            const res = await fetch(`/api/cards/scan-jobs/${job.jobId}`, {
              credentials: "include",
            });
            if (!res.ok) {
              // A 404 likely means the job was cleaned up; drop it quietly.
              if (res.status === 404) {
                if (!cancelled) dismissJob(job.jobId);
              }
              return;
            }
            const data = await res.json();
            if (cancelled) return;

            setJobs((prev) =>
              prev.map((j) => {
                if (j.jobId !== job.jobId) return j;
                const playerName =
                  data.result?.scan?.cardIdentification?.playerName ?? j.playerName ?? null;
                return {
                  ...j,
                  status: data.status,
                  progress: data.progress ?? null,
                  playerName,
                  scanHistoryId: data.scanHistoryId ?? j.scanHistoryId ?? null,
                  error: data.error ?? null,
                };
              }),
            );

            // Fire a toast exactly once per terminal transition.
            if (data.status === "complete" && job.status !== "complete") {
              const player =
                data.result?.scan?.cardIdentification?.playerName || "Your card";
              const historyId = data.scanHistoryId ?? data.result?.scanHistoryId;
              const viewHref = historyId
                ? `/scan-history?open=${historyId}`
                : "/scan-history";
              toast({
                title: `Scan for ${player} is ready`,
                description: "Tap to view the result.",
                action: (
                  <button
                    onClick={() => navigate(viewHref)}
                    className="text-sm font-medium underline underline-offset-2"
                    data-testid={`button-view-scan-${job.jobId}`}
                  >
                    View
                  </button>
                ) as any,
              });
              // Nudge any queries that care about scan history.
              queryClient.invalidateQueries({ queryKey: ["/api/scan-history"] });
            } else if (data.status === "error" && job.status !== "error") {
              toast({
                title: "Scan failed",
                description: data.error || "Try again or enter the card manually.",
                variant: "destructive",
              });
            }
          } catch (err) {
            // Network errors are transient — just try again next tick.
            console.warn("[ScanJobContext] Poll failed for", job.jobId, err);
          }
        }),
      );
    };

    // Fire one immediately so a page reload picks up finished jobs quickly,
    // then continue on interval.
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // We only want to (re)start polling when the set of tracked job IDs
    // changes, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, jobs.map((j) => j.jobId).join(",")]);

  const value = useMemo<ScanJobContextValue>(
    () => ({
      jobs,
      activeCount: jobs.filter((j) => j.status === "pending" || j.status === "processing").length,
      trackJob,
      dismissJob,
      clearCompleted,
    }),
    [jobs, trackJob, dismissJob, clearCompleted],
  );

  return <ScanJobContext.Provider value={value}>{children}</ScanJobContext.Provider>;
}

export function useScanJobs(): ScanJobContextValue {
  const ctx = useContext(ScanJobContext);
  if (!ctx) {
    throw new Error("useScanJobs must be used inside <ScanJobProvider>");
  }
  return ctx;
}
