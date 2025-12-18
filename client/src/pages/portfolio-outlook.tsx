import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCw, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Target,
  Lightbulb,
  ArrowRight,
  Shield,
  Zap,
  BarChart3,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Info
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PortfolioSnapshot, PortfolioExposures, RiskSignal, RecommendedAction } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShareSnapshotButton } from "@/components/share-snapshot-button";

function formatTimestamp(date: Date | string | null | undefined): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ConfidenceBadge({ score, cardCount }: { score?: number | null; cardCount?: number | null }) {
  const isLowConfidence = (score && score < 50) || (cardCount && cardCount < 5);
  const isThinData = cardCount && cardCount < 10;
  
  if (!isLowConfidence && !isThinData) return null;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700">
          <Info className="h-3 w-3" />
          {isThinData ? "Limited data" : "Low confidence"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-sm max-w-[200px]">
          {isThinData 
            ? `Analysis based on only ${cardCount} cards. Add more cards for better insights.`
            : "Market data is limited. Recommendations may be less accurate."
          }
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ExposureBar({ label, value, color = "primary" }: { label: string; value: number; color?: string }) {
  const percentage = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full bg-${color} rounded-full transition-all`}
          style={{ width: `${percentage}%`, backgroundColor: `hsl(var(--${color}))` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{percentage}%</span>
    </div>
  );
}

function RiskSignalCard({ signal }: { signal: RiskSignal }) {
  const severityColors = {
    low: "bg-green-500/10 text-green-700 dark:text-green-400",
    med: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    high: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
        signal.severity === "high" ? "text-red-500" : 
        signal.severity === "med" ? "text-yellow-500" : "text-green-500"
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{signal.label}</span>
          <Badge variant="secondary" className={severityColors[signal.severity]}>
            {signal.severity === "high" ? "High" : signal.severity === "med" ? "Medium" : "Low"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{signal.explanation}</p>
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: RecommendedAction }) {
  const targetRoutes: Record<string, string> = {
    portfolio: "/",
    nextBuys: "/portfolio/next-buys",
    watchlist: "/watchlist",
    marketOutlook: "/outlook",
  };

  return (
    <Link href={targetRoutes[action.target] || "/"}>
      <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{action.label}</span>
          <p className="text-xs text-muted-foreground">{action.why}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

export default function PortfolioOutlookPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery<{ hasSnapshot: boolean; snapshot?: PortfolioSnapshot }>({
    queryKey: ["/api/portfolio/outlook"],
  });

  const generateMutation = useMutation({
    mutationFn: async (refresh: boolean) => {
      const result = await apiRequest(
        "POST", 
        `/api/portfolio/outlook/generate${refresh ? "?refresh=true" : ""}`
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/outlook"] });
      setIsRefreshing(false);
    },
    onError: () => {
      setIsRefreshing(false);
    },
  });

  const handleGenerate = (refresh: boolean = false) => {
    setIsRefreshing(true);
    generateMutation.mutate(refresh);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">Failed to load portfolio outlook</h3>
            <p className="text-muted-foreground mb-4">There was an error loading your portfolio analysis.</p>
            <Button onClick={() => handleGenerate(true)}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const snapshot = data?.snapshot;
  const hasSnapshot = data?.hasSnapshot;

  if (!hasSnapshot || !snapshot) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Portfolio Outlook</h1>
          <p className="text-muted-foreground">AI-powered snapshot of your card collection</p>
        </div>
        
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-medium mb-2">No outlook generated yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Generate your first portfolio outlook to see AI-powered insights about your collection's exposures, risks, and opportunities.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button 
                size="lg" 
                onClick={() => handleGenerate(false)}
                disabled={generateMutation.isPending}
                data-testid="button-generate-outlook"
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Outlook
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Link href="/cases/new">
                  <Button variant="outline" size="lg" data-testid="button-add-cards">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Cards
                  </Button>
                </Link>
                <Link href="/outlook">
                  <Button variant="ghost" size="lg" data-testid="button-quick-check">
                    <Search className="h-4 w-4 mr-2" />
                    Quick Check
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exposures = snapshot.exposures as PortfolioExposures | null;
  const riskSignals = (snapshot.riskSignals as RiskSignal[] | null) || [];
  const opportunities = (snapshot.opportunities as string[] | null) || [];
  const watchouts = (snapshot.watchouts as string[] | null) || [];
  const actions = (snapshot.recommendedNextActions as RecommendedAction[] | null) || [];

  const stanceColors: Record<string, string> = {
    "Speculative Growth": "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    "Balanced": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    "Value": "bg-green-500/10 text-green-700 dark:text-green-400",
    "Legacy": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    "Aggressive Speculation": "bg-red-500/10 text-red-700 dark:text-red-400",
    "No Portfolio": "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Portfolio Outlook</h1>
          <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Last generated: {formatTimestamp(snapshot.asOfDate)}</span>
            <ConfidenceBadge score={snapshot.confidenceScore} cardCount={snapshot.cardCount} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShareSnapshotButton
            snapshotType="portfolio_outlook"
            title="Portfolio Outlook"
            snapshotData={{
              overallStance: snapshot.overallStance,
              overallHealth: {
                grade: snapshot.overallStance,
                summary: snapshot.summaryShort,
              },
              portfolioValue: snapshot.portfolioValueEstimate,
              cardCount: snapshot.cardCount,
              primaryDriver: snapshot.primaryDriver,
              confidenceScore: snapshot.confidenceScore,
              riskSignals: riskSignals,
              opportunities: opportunities,
              watchouts: watchouts,
              recommendations: actions.map(a => a.label),
              exposures: exposures,
              asOfDate: snapshot.asOfDate,
            }}
          />
          <Button 
            variant="outline" 
            onClick={() => handleGenerate(true)}
            disabled={isRefreshing || generateMutation.isPending}
            data-testid="button-refresh-outlook"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Analysis
          </Button>
        </div>
      </div>

      <Card data-testid="card-verdict">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <Badge className={stanceColors[snapshot.overallStance || "Balanced"]}>
                  {snapshot.overallStance}
                </Badge>
                {snapshot.confidenceScore && (
                  <span className="text-sm text-muted-foreground">
                    {snapshot.confidenceScore}% confidence
                  </span>
                )}
              </div>
              <p className="text-lg font-medium mb-2">{snapshot.primaryDriver}</p>
              <p className="text-muted-foreground">{snapshot.summaryShort}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold">
                ${snapshot.portfolioValueEstimate?.toLocaleString() || "0"}
              </div>
              <div className="text-sm text-muted-foreground">
                {snapshot.cardCount || 0} cards
              </div>
            </div>
          </div>
          
          {snapshot.summaryLong && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground whitespace-pre-line">{snapshot.summaryLong}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-exposures">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Exposures
            </CardTitle>
            <CardDescription>How your portfolio is allocated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {exposures && (
              <>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">By Position</h4>
                  {Object.entries(exposures.byPosition || {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([pos, val]) => (
                      <ExposureBar key={pos} label={pos} value={val as number} color="primary" />
                    ))}
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">By Career Stage</h4>
                  {Object.entries(exposures.byCareerStage || {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 4)
                    .map(([stage, val]) => (
                      <ExposureBar key={stage} label={stage} value={val as number} color="accent" />
                    ))}
                </div>

                {exposures.topPlayersConcentration && exposures.topPlayersConcentration.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Top Players</h4>
                    {exposures.topPlayersConcentration.slice(0, 3).map((p) => (
                      <ExposureBar key={p.player} label={p.player} value={p.pct} color="secondary" />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-risks">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Risk Signals
            </CardTitle>
            <CardDescription>Concentration and exposure risks</CardDescription>
          </CardHeader>
          <CardContent>
            {riskSignals.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="text-muted-foreground">No major risk signals detected</p>
              </div>
            ) : (
              <div className="space-y-3">
                {riskSignals.map((signal, i) => (
                  <RiskSignalCard key={i} signal={signal} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-opportunities">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <p className="text-muted-foreground text-sm">No opportunities identified</p>
            ) : (
              <ul className="space-y-2">
                {opportunities.map((opp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{opp}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-watchouts">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Watchouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {watchouts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No watchouts identified</p>
            ) : (
              <ul className="space-y-2">
                {watchouts.map((wo, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Target className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    <span>{wo}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {actions.length > 0 && (
        <Card data-testid="card-actions">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Recommended Next Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {actions.map((action, i) => (
                <ActionCard key={i} action={action} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Not financial advice.
      </p>
    </div>
  );
}
