import { useEffect, useRef, useState } from "react";
import { ScanLine, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useScanJobs } from "@/contexts/ScanJobContext";
import { cn } from "@/lib/utils";

const GREEN_FLASH_MS = 4000;

export function ScanStatusIndicator() {
  const { jobs, activeCount, dismissJob, clearCompleted } = useScanJobs();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [showGreenFlash, setShowGreenFlash] = useState(false);
  const prevActiveCountRef = useRef(activeCount);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect "all scans just finished" transition → brief green flash.
  useEffect(() => {
    const prev = prevActiveCountRef.current;
    if (prev > 0 && activeCount === 0 && jobs.length > 0) {
      setShowGreenFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setShowGreenFlash(false), GREEN_FLASH_MS);
    }
    prevActiveCountRef.current = activeCount;
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [activeCount, jobs.length]);

  // Hide the indicator entirely when there's no history at all.
  if (jobs.length === 0) return null;

  const completedJobs = jobs.filter((j) => j.status === "complete");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const doneCount = completedJobs.length + failedJobs.length;

  // Badge text: active wins → else green flash shows a check → else doneCount.
  const showCountBadge = activeCount === 0 && !showGreenFlash && doneCount > 0;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(true)}
        data-testid="button-scan-status"
        aria-label={
          activeCount > 0
            ? `${activeCount} scan${activeCount === 1 ? "" : "s"} in progress`
            : `${doneCount} scan${doneCount === 1 ? "" : "s"} ready`
        }
      >
        <ScanLine className="h-5 w-5" />

        {/* Pulsing orange dot while scans are active */}
        {activeCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5"
            data-testid="scan-indicator-active"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
          </span>
        )}

        {/* Green dot briefly after everything finishes */}
        {activeCount === 0 && showGreenFlash && (
          <span
            className="absolute top-1.5 right-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-green-500"
            data-testid="scan-indicator-flash"
          />
        )}

        {/* Count badge after the flash expires */}
        {showCountBadge && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center"
            data-testid="scan-indicator-count"
          >
            {doneCount > 9 ? "9+" : doneCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col" data-testid="sheet-scan-results">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" />
              Recent scans
            </SheetTitle>
            <SheetDescription>
              {activeCount > 0
                ? `${activeCount} scan${activeCount === 1 ? "" : "s"} still running in the background.`
                : "All scans are up to date."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No scans yet.
              </p>
            ) : (
              [...jobs]
                .sort((a, b) => b.startedAt - a.startedAt)
                .map((job) => (
                  <ScanJobRow
                    key={job.jobId}
                    job={job}
                    onDismiss={() => dismissJob(job.jobId)}
                    onView={() => {
                      setOpen(false);
                      navigate("/scan-history");
                    }}
                  />
                ))
            )}
          </div>

          {doneCount > 0 && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                data-testid="button-clear-completed-scans"
                className="text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear completed
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  navigate("/scan-history");
                }}
                data-testid="button-open-scan-history"
                className="text-xs"
              >
                Full scan history
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ScanJobRow({
  job,
  onDismiss,
  onView,
}: {
  job: ReturnType<typeof useScanJobs>["jobs"][number];
  onDismiss: () => void;
  onView: () => void;
}) {
  const isActive = job.status === "queued" || job.status === "processing";
  const isComplete = job.status === "complete";
  const isFailed = job.status === "failed";

  const title = job.playerName || (isActive ? "Identifying card…" : "Unidentified card");
  const subtitle = isActive
    ? job.progress || (job.status === "queued" ? "Waiting in queue" : "Processing")
    : isComplete
    ? "Ready to view"
    : job.error || "Scan failed";

  const elapsedSec = Math.max(1, Math.floor((Date.now() - job.startedAt) / 1000));
  const elapsedLabel =
    elapsedSec < 60 ? `${elapsedSec}s ago` : `${Math.floor(elapsedSec / 60)}m ago`;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 flex items-start gap-3",
        isFailed && "border-destructive/40",
      )}
      data-testid={`scan-job-row-${job.jobId}`}
    >
      <div className="mt-0.5 shrink-0">
        {isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate" data-testid={`scan-job-title-${job.jobId}`}>
            {title}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0">{elapsedLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        <div className="flex items-center gap-2 mt-2">
          {isComplete && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={onView}
              data-testid={`button-view-scan-${job.jobId}`}
            >
              View
            </Button>
          )}
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={onDismiss}
              data-testid={`button-dismiss-scan-${job.jobId}`}
            >
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
