import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { hasProAccess } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Lock,
  CheckCircle2,
  XCircle,
  Award,
  BarChart3,
  Sparkles,
} from "lucide-react";

type TopRow = {
  cardTitle: string | null;
  signalType: string;
  pctChange: number | null;
};

type Overall = {
  totalGraded: number;
  hits: number;
  misses: number;
  neutrals: number;
  insufficient: number;
  hitRate: number;
  last90DaysGraded: number;
  last90DaysHitRate: number;
  topHits: TopRow[];
  topMisses: TopRow[];
  totalSignalsIssued: number;
  pendingGradeCount: number;
  windowDays: number;
};

type BreakdownRow = {
  bucket: string;
  total: number;
  hits: number;
  misses: number;
  neutrals: number;
  hitRate: number;
};

type Breakdowns = {
  bySignalType: BreakdownRow[];
  bySport: BreakdownRow[];
  byConfidence: BreakdownRow[];
  byGraded: BreakdownRow[];
};

const MIN_GRADED_FOR_DETAIL = 10;

function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function signalBadge(signalType: string) {
  const t = signalType.toUpperCase().replace("_", " ");
  const isBuy = signalType.toLowerCase().includes("buy");
  const isSell = signalType.toLowerCase().includes("sell");
  return (
    <Badge
      variant="outline"
      className={
        isBuy
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : isSell
          ? "border-violet-500/40 text-violet-700 dark:text-violet-400"
          : "border-amber-500/40 text-amber-700 dark:text-amber-400"
      }
      data-testid={`badge-signal-${signalType.toLowerCase()}`}
    >
      {t}
    </Badge>
  );
}

function pctChangeChip(pct: number | null) {
  if (pct === null || !isFinite(pct)) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const positive = pct >= 0;
  const Icon = pct === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-medium ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {positive ? "+" : ""}
      {(pct * 100).toFixed(1)}%
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  testId,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
  icon?: any;
}) {
  return (
    <Card data-testid={`card-metric-${testId}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1" data-testid={`text-metric-${testId}`}>
              {value}
            </p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          {Icon && <Icon className="h-5 w-5 text-muted-foreground shrink-0" />}
        </div>
      </CardContent>
    </Card>
  );
}

function TopList({
  title,
  rows,
  emptyText,
  variant,
  testId,
}: {
  title: string;
  rows: TopRow[];
  emptyText: string;
  variant: "hit" | "miss";
  testId: string;
}) {
  const Icon = variant === "hit" ? CheckCircle2 : XCircle;
  const accent =
    variant === "hit" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <Card data-testid={`card-${testId}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${accent}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid={`text-${testId}-empty`}>
            {emptyText}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li
                key={`${testId}-${i}`}
                className="flex items-center justify-between gap-3"
                data-testid={`row-${testId}-${i}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-${testId}-title-${i}`}>
                    {r.cardTitle || "Unknown card"}
                  </p>
                  <div className="mt-1">{signalBadge(r.signalType)}</div>
                </div>
                {pctChangeChip(r.pctChange)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  title,
  rows,
  testId,
}: {
  title: string;
  rows: BreakdownRow[];
  testId: string;
}) {
  return (
    <Card data-testid={`card-${testId}`}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={`${testId}-${r.bucket}`} data-testid={`row-${testId}-${r.bucket}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium" data-testid={`text-${testId}-bucket-${r.bucket}`}>
                    {r.bucket}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground" data-testid={`text-${testId}-rate-${r.bucket}`}>
                      {formatPct(r.hitRate)}
                    </span>{" "}
                    · {r.hits}/{r.total}
                  </span>
                </div>
                <Progress value={r.hitRate * 100} className="h-2" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProUpsell() {
  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-pro-upsell">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-primary" />
          Unlock the breakdowns
        </CardTitle>
        <CardDescription>
          Pro members see hit rates broken down by verdict type, sport, confidence band, and graded
          vs raw — so you can see exactly where the engine is sharpest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/upgrade">
          <Button data-testid="button-upgrade-pro">
            <Sparkles className="h-4 w-4 mr-2" />
            Upgrade to Pro
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function TrackRecordPage() {
  const { user, isAuthenticated } = useAuth();
  const isPro = isAuthenticated && hasProAccess(user as any);

  const overallQuery = useQuery<Overall>({
    queryKey: ["/api/track-record"],
  });

  const breakdownsQuery = useQuery<Breakdowns>({
    queryKey: ["/api/track-record/breakdowns"],
    enabled: isPro,
  });

  const overall = overallQuery.data;
  const hasMeaningfulData = (overall?.totalGraded ?? 0) >= MIN_GRADED_FOR_DETAIL;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Award className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="heading-track-record">
            Verdict Track Record
          </h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Every BUY, HOLD, and SELL the engine issues is graded {overall?.windowDays ?? 60} days
          later against real market prices. This page shows how often the calls are actually right.
        </p>
      </div>

      {overallQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : overallQuery.error || !overall ? (
        <Card data-testid="card-error">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Couldn't load the track record right now. Try refreshing in a moment.
            </p>
          </CardContent>
        </Card>
      ) : !hasMeaningfulData ? (
        <Card data-testid="card-empty-state">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Coming soon
            </CardTitle>
            <CardDescription>
              The engine has issued{" "}
              <span className="font-semibold text-foreground" data-testid="text-signals-issued">
                {overall.totalSignalsIssued}
              </span>{" "}
              verdicts so far. The first results grade {overall.windowDays} days after each signal
              is issued — check back soon to see how the calls held up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                label="Verdicts issued"
                value={overall.totalSignalsIssued.toLocaleString()}
                testId="signals-issued"
                icon={BarChart3}
              />
              <MetricCard
                label="Graded so far"
                value={overall.totalGraded.toLocaleString()}
                testId="graded-count"
                icon={CheckCircle2}
              />
              <MetricCard
                label="Awaiting grade"
                value={overall.pendingGradeCount.toLocaleString()}
                testId="pending-count"
                icon={Target}
              />
              <MetricCard
                label="Window"
                value={`${overall.windowDays}d`}
                hint="Outcome lookback"
                testId="window-days"
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              label="Overall hit rate"
              value={formatPct(overall.hitRate)}
              hint={`${overall.hits} of ${overall.totalGraded} graded`}
              testId="overall-hit-rate"
              icon={Target}
            />
            <MetricCard
              label="Last 90 days"
              value={formatPct(overall.last90DaysHitRate)}
              hint={`${overall.last90DaysGraded} graded recently`}
              testId="recent-hit-rate"
              icon={TrendingUp}
            />
            <MetricCard
              label="Verdicts issued"
              value={overall.totalSignalsIssued.toLocaleString()}
              testId="signals-issued"
              icon={BarChart3}
            />
            <MetricCard
              label="Awaiting grade"
              value={overall.pendingGradeCount.toLocaleString()}
              hint={`${overall.windowDays}-day window`}
              testId="pending-count"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <Card data-testid="card-outcome-mix">
              <CardHeader>
                <CardTitle className="text-base">Outcome mix</CardTitle>
                <CardDescription>How {overall.totalGraded} graded verdicts shook out.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">Hits</span>
                    <span data-testid="text-outcome-hits">{overall.hits}</span>
                  </div>
                  <Progress
                    value={overall.totalGraded > 0 ? (overall.hits / overall.totalGraded) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">Misses</span>
                    <span data-testid="text-outcome-misses">{overall.misses}</span>
                  </div>
                  <Progress
                    value={overall.totalGraded > 0 ? (overall.misses / overall.totalGraded) * 100 : 0}
                    className="h-2"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">Neutral</span>
                    <span data-testid="text-outcome-neutrals">{overall.neutrals}</span>
                  </div>
                  <Progress
                    value={
                      overall.totalGraded > 0 ? (overall.neutrals / overall.totalGraded) * 100 : 0
                    }
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            <TopList
              title="Top hits"
              rows={overall.topHits}
              emptyText="No graded hits yet."
              variant="hit"
              testId="top-hits"
            />
            <TopList
              title="Top misses"
              rows={overall.topMisses}
              emptyText="No graded misses yet."
              variant="miss"
              testId="top-misses"
            />
          </div>

          <Separator className="my-8" />

          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold" data-testid="heading-breakdowns">
                Breakdowns
              </h2>
              {!isPro && (
                <Badge variant="outline" className="border-primary/40 text-primary">
                  <Lock className="h-3 w-3 mr-1" />
                  Pro
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Hit rates by verdict type, sport, confidence band, and graded vs raw.
            </p>
          </div>

          {!isPro ? (
            <ProUpsell />
          ) : breakdownsQuery.isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : breakdownsQuery.error || !breakdownsQuery.data ? (
            <Card data-testid="card-breakdowns-error">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive">Couldn't load breakdowns right now.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownTable
                title="By verdict type"
                rows={breakdownsQuery.data.bySignalType}
                testId="breakdown-signal-type"
              />
              <BreakdownTable
                title="By sport"
                rows={breakdownsQuery.data.bySport}
                testId="breakdown-sport"
              />
              <BreakdownTable
                title="By confidence"
                rows={breakdownsQuery.data.byConfidence}
                testId="breakdown-confidence"
              />
              <BreakdownTable
                title="Graded vs raw"
                rows={breakdownsQuery.data.byGraded}
                testId="breakdown-graded"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
