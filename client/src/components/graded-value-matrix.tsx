import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, TrendingUp, DollarSign, Search, Calculator, AlertCircle, Info } from "lucide-react";
import { useState } from "react";

interface GradedValueMatrixProps {
  rawValue: number;
  psa9Price: number | null;
  psa10Price: number | null;
  estimated?: boolean;
  lowPop?: boolean;
  triangulated?: boolean;
  triangulationNotes?: string;
  triangulationSources?: string[];
}

const GRADING_COST = {
  economy: 20,
  regular: 35,
  express: 50,
};

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${Math.round(value)}`;
}

function getGradeRecommendation(rawValue: number, psa9Price: number | null, psa10Price: number | null): {
  verdict: "YES" | "MAYBE" | "NO";
  reason: string;
} {
  const psa10Profit = psa10Price ? psa10Price - rawValue - GRADING_COST.regular : null;
  const psa9Profit = psa9Price ? psa9Price - rawValue - GRADING_COST.regular : null;

  if (psa10Profit && psa10Profit > rawValue * 0.5) {
    return {
      verdict: "YES",
      reason: `PSA 10 could add ~${formatCurrency(psa10Profit)} in value after grading costs`,
    };
  }

  if (psa9Profit && psa9Profit > 0) {
    return {
      verdict: "MAYBE",
      reason: `PSA 9 could add ~${formatCurrency(psa9Profit)} in value, but grading fees eat into the margin`,
    };
  }

  if (psa10Profit && psa10Profit > 0) {
    return {
      verdict: "MAYBE",
      reason: `Only worth grading if it gets a PSA 10 — slim margin at PSA 9`,
    };
  }

  return {
    verdict: "NO",
    reason: "Grading cost would exceed the value increase",
  };
}

const VERDICT_STYLES = {
  YES: {
    bg: "bg-emerald-500/10 border-emerald-500/30",
    badge: "bg-emerald-500 text-white",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  MAYBE: {
    bg: "bg-yellow-500/10 border-yellow-500/30",
    badge: "bg-yellow-500 text-white",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  NO: {
    bg: "bg-red-500/10 border-red-500/30",
    badge: "bg-red-500 text-white",
    text: "text-red-700 dark:text-red-300",
  },
};

export function GradedValueMatrix({ rawValue, psa9Price, psa10Price, estimated, lowPop, triangulated, triangulationNotes, triangulationSources }: GradedValueMatrixProps) {
  const [showSources, setShowSources] = useState(false);
  if (!psa9Price && !psa10Price) return null;
  if (rawValue <= 0) return null;

  // Floor graded values at raw — a graded copy can never be worth less than the
  // ungraded copy of the same card (worst case: it grades poorly, you crack it
  // back out to raw). PSA 10 must also be >= PSA 9.
  const flooredPsa9 = psa9Price !== null ? Math.max(psa9Price, rawValue) : null;

  // If PSA 10 is missing but PSA 9 exists, estimate PSA 10 as ~1.5x PSA 9
  const psa10Estimated = !psa10Price && flooredPsa9 ? Math.round(flooredPsa9 * 1.5) : null;
  const rawPsa10 = psa10Price ?? psa10Estimated;
  const effectivePsa10 = rawPsa10 !== null
    ? Math.max(rawPsa10, flooredPsa9 ?? 0, rawValue)
    : null;
  const isPsa10Estimated = !psa10Price && !!psa10Estimated;
  const psa9Floored = psa9Price !== null && flooredPsa9 !== psa9Price;
  const psa10Floored = psa10Price !== null && effectivePsa10 !== psa10Price;

  const recommendation = getGradeRecommendation(rawValue, flooredPsa9, effectivePsa10);
  const styles = VERDICT_STYLES[recommendation.verdict];

  return (
    <Card className="mt-4" data-testid="graded-value-matrix">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          Should You Grade This Card?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {triangulated && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5" data-testid="banner-triangulated">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 leading-tight">
                  No direct comps exist — these are estimates
                </p>
                <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 leading-snug">
                  Triangulated from comparable parallels of the same player and set. Treat as directional, not precise.
                </p>
                {triangulationNotes && (
                  <p className="text-[10px] text-amber-700/70 dark:text-amber-300/70 leading-snug italic pt-0.5">
                    {triangulationNotes}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center" data-testid="graded-value-table">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Raw</p>
            <p className="text-base font-bold mt-0.5" data-testid="text-raw-value">{formatCurrency(rawValue)}</p>
          </div>
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-medium">PSA 9</p>
            <p className="text-base font-bold mt-0.5 text-blue-700 dark:text-blue-300" data-testid="text-psa9-value">
              {flooredPsa9 ? formatCurrency(flooredPsa9) : "—"}
            </p>
            {flooredPsa9 && (
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">{estimated || psa9Floored ? "est." : "avg"}</p>
            )}
          </div>
          <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-medium">PSA 10</p>
            <p className="text-base font-bold mt-0.5 text-purple-700 dark:text-purple-300" data-testid="text-psa10-value">
              {effectivePsa10 ? formatCurrency(effectivePsa10) : "—"}
            </p>
            {effectivePsa10 && (
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">{(estimated || isPsa10Estimated || psa10Floored) ? "est." : "avg"}</p>
            )}
          </div>
        </div>

        {effectivePsa10 && effectivePsa10 > rawValue && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span>
              PSA 10 is <span className="font-semibold text-foreground">{((effectivePsa10 / rawValue - 1) * 100).toFixed(0)}% more</span> than raw
            </span>
          </div>
        )}

        <div className={`rounded-lg border p-3 ${styles.bg}`} data-testid="grade-recommendation">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`text-xs px-2 py-0 ${styles.badge}`} data-testid="badge-grade-verdict">
              {recommendation.verdict === "YES" ? "Grade It" : recommendation.verdict === "MAYBE" ? "Maybe" : "Skip"}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Grading costs ~${GRADING_COST.regular}
            </span>
          </div>
          <p className={`text-xs ${styles.text}`} data-testid="text-grade-reason">
            {recommendation.reason}
          </p>
        </div>

        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/60 leading-tight">
          {triangulated ? (
            <>
              <Calculator className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Estimates derived from graded sales of comparable parallels in the same player/year/set. Outcome depends on grading result (~${GRADING_COST.regular}/card cost) and varies by condition, timing, and centering. Not guaranteed.</span>
            </>
          ) : lowPop ? (
            <>
              <Calculator className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Low print run card — graded comps for this exact card are extremely rare. Estimates based on comparable parallels from this player. Grading a low-pop card adds authentication value but the premium over raw is modest since scarcity is already priced in. (~${GRADING_COST.regular}/card grading cost).</span>
            </>
          ) : estimated ? (
            <>
              <Calculator className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Graded values estimated using typical raw-to-graded multipliers (no graded sold data found). Based on PSA standard grading (~${GRADING_COST.regular}/card). Actual values vary by card condition, market timing, and grading outcome. Not guaranteed.</span>
            </>
          ) : (
            <>
              <Search className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Graded values based on recent eBay sold listings for PSA 9/10 copies. Based on PSA standard grading (~${GRADING_COST.regular}/card). Actual values vary by card condition, market timing, and grading outcome. Not guaranteed.</span>
            </>
          )}
        </div>

        {triangulated && triangulationSources && triangulationSources.length > 0 && (
          <div className="border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-toggle-triangulation-sources"
            >
              <Info className="h-3 w-3" />
              <span className="underline-offset-2 hover:underline">
                {showSources ? "Hide" : "Show"} comps used for estimate
              </span>
            </button>
            {showSources && (
              <ul className="mt-1.5 space-y-0.5 pl-4" data-testid="list-triangulation-sources">
                {triangulationSources.map((src, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground/80 list-disc leading-snug">
                    {src}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
