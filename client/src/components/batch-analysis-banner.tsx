import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { hasProAccess } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, X, CheckCircle } from "lucide-react";
import { useEffect, useRef } from "react";

export interface BatchStatus {
  status: "idle" | "running" | "complete" | "stopped";
  total: number;
  completed: number;
  failed: number;
  results: Array<{ id: number; title: string; action?: string; bigMover?: boolean; error?: string }>;
  startedAt?: number;
}

export function useBatchStatus() {
  const { user, isAuthenticated } = useAuth();
  const isPro = hasProAccess(user);

  return useQuery<BatchStatus>({
    queryKey: ["/api/cards/batch-outlook/status"],
    enabled: isAuthenticated && isPro,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 2000 : false;
    },
    staleTime: 1000,
  });
}

export function BatchAnalysisBanner() {
  const { user, isAuthenticated } = useAuth();
  const isPro = hasProAccess(user);
  const { data: batch } = useBatchStatus();
  const prevStatusRef = useRef<string | undefined>(undefined);

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cards/batch-outlook/stop"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards/batch-outlook/status"] });
    },
  });

  useEffect(() => {
    if (prevStatusRef.current === "running" && batch?.status !== "running") {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
    }
    prevStatusRef.current = batch?.status;
  }, [batch?.status]);

  if (!isAuthenticated || !isPro) return null;
  if (!batch || batch.status === "idle") return null;

  const isRunning = batch.status === "running";
  const isDone = batch.status === "complete" || batch.status === "stopped";
  const pct = batch.total > 0 ? (batch.completed / batch.total) * 100 : 0;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm"
      data-testid="batch-analysis-banner"
    >
      <div className="rounded-xl border border-border bg-card shadow-lg px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            )}
            <span className="text-sm font-medium">
              {isRunning ? "Analyzing Cards..." : batch.status === "stopped" ? "Analysis Stopped" : "Analysis Complete"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isRunning && (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border hover:border-foreground/30 transition-colors"
                data-testid="batch-stop-button"
              >
                Stop
              </button>
            )}
            {isDone && (
              <button
                onClick={() => queryClient.setQueryData(["/api/cards/batch-outlook/status"], { status: "idle", total: 0, completed: 0, failed: 0, results: [] })}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="batch-dismiss-button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{batch.completed} of {batch.total} cards</span>
          {batch.failed > 0 && <span className="text-destructive">{batch.failed} failed</span>}
        </div>

        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {isDone && batch.completed > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {(() => {
              const buys = batch.results.filter(r => r.action === "BUY").length;
              const sells = batch.results.filter(r => r.action === "SELL").length;
              const movers = batch.results.filter(r => r.bigMover).length;
              const parts = [];
              if (buys > 0) parts.push(`${buys} Buy`);
              if (sells > 0) parts.push(`${sells} Sell`);
              if (movers > 0) parts.push(`${movers} Big Mover`);
              return parts.length > 0 ? parts.join(" · ") : "All cards analyzed";
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
