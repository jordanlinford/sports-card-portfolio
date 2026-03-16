import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, TrendingUp, DollarSign, ArrowRight, Search, Calculator } from "lucide-react";

interface GradedValueMatrixProps {
  rawValue: number;
  psa9Price: number | null;
  psa10Price: number | null;
  estimated?: boolean;
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

export function GradedValueMatrix({ rawValue, psa9Price, psa10Price, estimated }: GradedValueMatrixProps) {
  if (!psa9Price && !psa10Price) return null;
  if (rawValue <= 0) return null;

  // If PSA 10 is missing but PSA 9 exists, estimate PSA 10 as ~1.5x PSA 9
  const psa10Estimated = !psa10Price && psa9Price ? Math.round(psa9Price * 1.5) : null;
  const effectivePsa10 = psa10Price ?? psa10Estimated;
  const isPsa10Estimated = !psa10Price && !!psa10Estimated;

  const recommendation = getGradeRecommendation(rawValue, psa9Price, effectivePsa10);
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
        <div className="grid grid-cols-3 gap-2 text-center" data-testid="graded-value-table">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Raw</p>
            <p className="text-base font-bold mt-0.5" data-testid="text-raw-value">{formatCurrency(rawValue)}</p>
          </div>
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-medium">PSA 9</p>
            <p className="text-base font-bold mt-0.5 text-blue-700 dark:text-blue-300" data-testid="text-psa9-value">
              {psa9Price ? formatCurrency(psa9Price) : "—"}
            </p>
            {psa9Price && (
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">{estimated ? "est." : "avg"}</p>
            )}
          </div>
          <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-medium">PSA 10</p>
            <p className="text-base font-bold mt-0.5 text-purple-700 dark:text-purple-300" data-testid="text-psa10-value">
              {effectivePsa10 ? formatCurrency(effectivePsa10) : "—"}
            </p>
            {effectivePsa10 && (
              <p className="text-[9px] text-muted-foreground/50 mt-0.5">{(estimated || isPsa10Estimated) ? "est." : "avg"}</p>
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
          {estimated ? (
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
      </CardContent>
    </Card>
  );
}
