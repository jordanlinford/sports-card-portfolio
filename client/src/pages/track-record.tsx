import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Target,
  ShoppingCart,
  Shield,
  Ban,
} from "lucide-react";

type VerdictAccuracyResult = {
  playerName: string;
  sport: string;
  verdict: string;
  priceAtVerdict: number;
  changeAfter30d: number | null;
  changeAfter60d: number | null;
  changeAfter90d: number | null;
  outcome: "CORRECT" | "INCORRECT" | "INCONCLUSIVE";
  outcomeReason: string;
};

type AccuracySummary = {
  totalVerdicts: number;
  correctCount: number;
  incorrectCount: number;
  inconclusiveCount: number;
  accuracyRate: number;
  byVerdict: Record<
    string,
    {
      total: number;
      correct: number;
      incorrect: number;
      inconclusive: number;
      accuracy: number;
    }
  >;
  topCorrectCalls: VerdictAccuracyResult[];
  topIncorrectCalls: VerdictAccuracyResult[];
  generatedAt: string;
};

const VERDICT_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  ACCUMULATE: {
    label: "Accumulate",
    icon: <ShoppingCart className="h-4 w-4" />,
    color: "text-green-700 dark:text-green-400",
  },
  HOLD_CORE: {
    label: "Hold Core",
    icon: <Shield className="h-4 w-4" />,
    color: "text-blue-700 dark:text-blue-400",
  },
  TRADE_THE_HYPE: {
    label: "Trade the Hype",
    icon: <TrendingDown className="h-4 w-4" />,
    color: "text-orange-700 dark:text-orange-400",
  },
  AVOID_NEW_MONEY: {
    label: "Avoid (New Money)",
    icon: <Ban className="h-4 w-4" />,
    color: "text-red-700 dark:text-red-400",
  },
  AVOID_STRUCTURAL: {
    label: "Avoid (Structural)",
    icon: <Ban className="h-4 w-4" />,
    color: "text-red-700 dark:text-red-400",
  },
};

function getVerdictMeta(verdict: string) {
  return (
    VERDICT_META[verdict] ?? {
      label: verdict.replace(/_/g, " "),
      icon: <Target className="h-4 w-4" />,
      color: "text-muted-foreground",
    }
  );
}

function getBestChange(r: VerdictAccuracyResult): number | null {
  return r.changeAfter90d ?? r.changeAfter60d ?? r.changeAfter30d;
}

function formatChange(val: number | null): string {
  if (val === null) return "--";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

function HeroSkeleton() {
  return (
    <div className="text-center space-y-3">
      <Skeleton className="h-16 w-48 mx-auto rounded-lg" />
      <Skeleton className="h-5 w-64 mx-auto rounded" />
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}

function CallsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-6 w-32 rounded" />
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={j} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-24">
      <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">
        We're building our track record.
      </h2>
      <p className="text-muted-foreground">
        Check back soon — verdicts need at least 30 days before they can be
        scored.
      </p>
    </div>
  );
}

function CallRow({ call }: { call: VerdictAccuracyResult }) {
  const meta = getVerdictMeta(typeof call.verdict==="string"?call.verdict:(call.verdict as any)?.verdict??"");
  const change = getBestChange(call);
  const isPositive = change !== null && change >= 0;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{call.playerName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${meta.color}`}
          >
            {meta.icon}
            <span className="ml-0.5">{meta.label}</span>
          </Badge>
          <span className="text-[10px] text-muted-foreground uppercase">
            {call.sport}
          </span>
        </div>
      </div>
      <span
        className={`text-sm font-semibold tabular-nums ${
          isPositive
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {formatChange(change)}
      </span>
    </div>
  );
}

export default function TrackRecordPage() {
  const { data, isLoading } = useQuery<AccuracySummary>({
    queryKey: ["/api/track-record"],
    queryFn: async () => {
      const res = await fetch("/api/track-record");
      if (!res.ok) throw new Error("Failed to fetch track record");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const isEmpty = !isLoading && data && data.totalVerdicts === 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
        {/* Page header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">Verdict Track Record</h1>
          <p className="text-sm text-muted-foreground mt-1">
            How our AI-generated verdicts have performed against real market
            data
          </p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-8">
            <HeroSkeleton />
            <CardsSkeleton />
            <CallsSkeleton />
          </div>
        )}

        {/* Empty state */}
        {isEmpty && <EmptyState />}

        {/* Data loaded */}
        {data && data.totalVerdicts > 0 && (
          <>
            {/* Hero accuracy */}
            <Card className="text-center py-8">
              <CardContent className="space-y-2">
                <p className="text-6xl font-bold tracking-tight">
                  {data.accuracyRate}%
                </p>
                <p className="text-lg text-muted-foreground">
                  Overall Accuracy
                </p>
                <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {data.correctCount} Correct
                  </span>
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" />
                    {data.incorrectCount} Incorrect
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <HelpCircle className="h-4 w-4" />
                    {data.inconclusiveCount} Inconclusive
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {data.totalVerdicts} total verdicts evaluated
                </p>
              </CardContent>
            </Card>

            {/* Per-verdict breakdown */}
            <div>
              <h2 className="text-lg font-semibold mb-4">
                Accuracy by Verdict Type
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(data.byVerdict).map(([verdict, stats]) => {
                  const meta = getVerdictMeta(verdict);
                  return (
                    <Card key={verdict}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className={meta.color}>{meta.icon}</span>
                          {meta.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold">
                            {stats.accuracy}%
                          </span>
                          <span className="text-xs text-muted-foreground">
                            accuracy
                          </span>
                        </div>
                        <Progress
                          value={stats.accuracy}
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs">
                          <span className="text-green-600 dark:text-green-400">
                            {stats.correct} correct
                          </span>
                          <span className="text-red-600 dark:text-red-400">
                            {stats.incorrect} wrong
                          </span>
                          <span className="text-muted-foreground">
                            {stats.inconclusive} tbd
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Top calls */}
            {(data.topCorrectCalls.length > 0 ||
              data.topIncorrectCalls.length > 0) && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Top Calls</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Best calls */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                        <TrendingUp className="h-4 w-4" />
                        Best Calls
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2">
                      {data.topCorrectCalls.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No correct calls yet
                        </p>
                      ) : (
                        data.topCorrectCalls
                          .slice(0, 5)
                          .map((call, i) => (
                            <CallRow key={i} call={call} />
                          ))
                      )}
                    </CardContent>
                  </Card>

                  {/* Worst calls */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                        <TrendingDown className="h-4 w-4" />
                        Worst Calls
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2">
                      {data.topIncorrectCalls.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No incorrect calls yet
                        </p>
                      ) : (
                        data.topIncorrectCalls
                          .slice(0, 5)
                          .map((call, i) => (
                            <CallRow key={i} call={call} />
                          ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="text-center text-xs text-muted-foreground border-t pt-6">
              <p>
                Past performance does not guarantee future results. Verdicts are
                AI-generated analysis, not financial advice.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
