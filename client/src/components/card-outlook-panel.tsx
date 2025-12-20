import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MinusCircle,
  DollarSign,
  Calendar,
  Clock,
  Info,
  Sun,
  Trophy
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Card as CardType } from "@shared/schema";
import { ShareSnapshotButton } from "@/components/share-snapshot-button";

function safeCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return `$${Math.round(value)}`;
}

interface CardOutlookPanelProps {
  card: CardType;
  isPro?: boolean;
  canEdit?: boolean;
}

interface PriceTargets {
  strongBuyBelow: number | null;
  buyBelow: number | null;
  fairValue: number | null;
  sellAbove: number | null;
  strongSellAbove: number | null;
}

interface ConfidenceBreakdown {
  salesDataConfidence: number;
  priceStabilityConfidence: number;
  playerStatusConfidence: number;
  overallConfidence: number;
  factors: string[];
}

interface SeasonalContext {
  currentMultiplier: number;
  isInSeason: boolean;
  isPlayoffSeason: boolean;
}

interface OutlookData {
  cardId: number;
  playerName: string | null;
  sport: string | null;
  position: string | null;
  action: "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LITTLE_VALUE" | "LEGACY_HOLD";
  upsideScore: number;
  riskScore: number;
  confidenceScore: number;
  projectedOutlook?: {
    bearCaseChangePct: number;
    baseCaseChangePct: number;
    bullCaseChangePct: number;
  };
  factors?: {
    cardTypeScore: number;
    positionScore: number;
    legacyScore: number;
    liquidityScore: number;
    volatilityScore: number;
    hypeScore: number;
    seasonalMultiplier?: number;
    franchiseMultiplier?: number;
    setPrestigeTier?: string;
  };
  explanation?: {
    short: string;
    long: string;
  } | null;
  generatedAt?: string | null;
  cached: boolean;
  // NEW: Enhanced data
  priceTargets?: PriceTargets;
  confidenceBreakdown?: ConfidenceBreakdown;
  seasonalContext?: SeasonalContext;
}

type OutlookAction = "BUY" | "MONITOR" | "SELL" | "LONG_HOLD" | "LITTLE_VALUE" | "LEGACY_HOLD";

function getMarketFrictionFromLiquidity(liquidityScore?: number): number {
  if (liquidityScore === undefined || liquidityScore === null) return 50;
  return Math.round((1 - liquidityScore) * 100);
}

function getMarketFrictionLabel(friction: number): string {
  if (friction <= 25) return "Low";
  if (friction <= 50) return "Medium";
  if (friction <= 75) return "High";
  return "Very High";
}

function getMarketFrictionHelperText(friction: number, action?: string): string {
  if (action === "LEGACY_HOLD") {
    return friction > 75 
      ? "Thin market—eye appeal drives big spreads." 
      : "Sells slowly—patient pricing works best.";
  }
  if (friction <= 25) return "Easy to move—buyers are plentiful.";
  if (friction <= 50) return "Usually sellable, but timing matters.";
  if (friction <= 75) return "May take a while to sell at a fair price.";
  return "Trades infrequently—expect wide spreads.";
}

function getActionColor(action: OutlookAction): string {
  switch (action) {
    case "BUY":
      return "bg-green-600 text-white";
    case "SELL":
      return "bg-red-600 text-white";
    case "MONITOR":
      return "bg-amber-500 text-white";
    case "LONG_HOLD":
      return "bg-blue-600 text-white";
    case "LEGACY_HOLD":
      return "bg-indigo-600 text-white";
    case "LITTLE_VALUE":
      return "bg-slate-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getActionIcon(action: OutlookAction) {
  switch (action) {
    case "BUY":
      return <ArrowUpRight className="h-4 w-4" />;
    case "SELL":
      return <ArrowDownRight className="h-4 w-4" />;
    case "MONITOR":
      return <Minus className="h-4 w-4" />;
    case "LONG_HOLD":
      return <Clock className="h-4 w-4" />;
    case "LEGACY_HOLD":
      return <Trophy className="h-4 w-4" />;
    case "LITTLE_VALUE":
      return <MinusCircle className="h-4 w-4" />;
    default:
      return <Minus className="h-4 w-4" />;
  }
}

function getActionLabel(action: OutlookAction): string {
  switch (action) {
    case "BUY":
      return "BUY";
    case "SELL":
      return "SELL";
    case "MONITOR":
      return "WATCH";
    case "LONG_HOLD":
      return "HOLD";
    case "LEGACY_HOLD":
      return "LEGACY HOLD";
    case "LITTLE_VALUE":
      return "LOW VALUE";
    default:
      return action;
  }
}

function getStateDescription(action: OutlookAction): string {
  switch (action) {
    case "BUY":
      return "Market signals suggest this is a good entry point.";
    case "SELL":
      return "Recent price action suggests taking profits.";
    case "MONITOR":
      return "Mixed signals - watch for clearer direction.";
    case "LONG_HOLD":
      return "Stable asset for long-term holding.";
    case "LEGACY_HOLD":
      return "Collector piece with established value.";
    case "LITTLE_VALUE":
      return "Limited collector interest at current levels.";
    default:
      return "";
  }
}

function getTimeContext(generatedAt: string | null | undefined, action: OutlookAction): string {
  if (!generatedAt) return "Reflects recent market behavior.";
  
  const generated = new Date(generatedAt);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - generated.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSince <= 7) {
    return "Reflects current market behavior over the last 30-60 days.";
  } else if (daysSince <= 30) {
    return `Analysis from ${daysSince} days ago - consider refreshing.`;
  } else {
    return "Analysis may be outdated - refresh recommended.";
  }
}

function getConditionalTriggers(action: OutlookAction, sport?: string | null): string[] {
  const triggers: string[] = [];
  const isSportWithPlayoffs = sport === "football" || sport === "basketball" || sport === "baseball" || sport === "hockey";
  
  switch (action) {
    case "BUY":
      triggers.push("Price rises above fair value range");
      triggers.push("Negative news or injury concerns");
      if (isSportWithPlayoffs) {
        triggers.push("Playoff performance (could accelerate or invalidate)");
      } else {
        triggers.push("Significant increase in available supply");
      }
      break;
    case "SELL":
      triggers.push("Price drops back to fair value");
      if (isSportWithPlayoffs) {
        triggers.push("Playoff run or championship win");
      } else {
        triggers.push("Major award or renewed interest");
      }
      triggers.push("Market sentiment shift");
      break;
    case "MONITOR":
      triggers.push("Sustained weekly sales above recent average");
      if (isSportWithPlayoffs) {
        triggers.push("Playoff performance or postseason run");
      } else {
        triggers.push("Narrative shift (breakout, award)");
      }
      triggers.push("Price stabilizes with clear direction");
      break;
    case "LONG_HOLD":
      triggers.push("Career milestone or Hall of Fame election");
      if (isSportWithPlayoffs) {
        triggers.push("Championship win or legacy moment");
      } else {
        triggers.push("Significant market repricing");
      }
      triggers.push("Anniversary or special event");
      break;
    case "LEGACY_HOLD":
      triggers.push("Market repricing event");
      triggers.push("Documentary or renewed cultural interest");
      break;
    case "LITTLE_VALUE":
      triggers.push("Career breakout or major award");
      triggers.push("Scarcity discovery");
      break;
  }
  
  return triggers.slice(0, 3);
}

function getScoreColor(score: number, inverted = false): string {
  const effectiveScore = inverted ? 100 - score : score;
  if (effectiveScore >= 70) return "text-green-600";
  if (effectiveScore >= 40) return "text-amber-500";
  return "text-red-500";
}

function getUpsideLabel(score: number): string {
  if (score >= 70) return "High";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Limited";
  return "Minimal";
}

function getRiskLabel(score: number): string {
  if (score >= 60) return "Elevated";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Low-Moderate";
  return "Low";
}

function getConfidenceLabel(score: number): string {
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  if (score >= 35) return "Low-Medium";
  return "Low";
}

function getProgressColor(score: number, inverted = false): string {
  const effectiveScore = inverted ? 100 - score : score;
  if (effectiveScore >= 70) return "bg-green-600";
  if (effectiveScore >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export function CardOutlookPanel({ card, isPro = false, canEdit = false }: CardOutlookPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const { data: outlook, isLoading, refetch } = useQuery<OutlookData>({
    queryKey: ["/api/cards", card.id, "outlook"],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${card.id}/outlook`);
      if (!res.ok) throw new Error("Failed to fetch outlook");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const generateOutlookMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/cards/${card.id}/outlook`, { timeHorizonMonths: 12 });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "outlook"] });
      toast({
        title: "Outlook Generated",
        description: `Analysis complete: ${data.action} recommendation with ${data.confidenceScore}% confidence.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate outlook",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading outlook...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!outlook) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-medium">Card Outlook AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Get investment-style insights: BUY, WATCH, or SELL recommendations with upside and risk scores.
            </p>
            {isPro && canEdit ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => generateOutlookMutation.mutate()}
                disabled={generateOutlookMutation.isPending}
                data-testid="button-generate-outlook"
              >
                {generateOutlookMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generateOutlookMutation.isPending ? "Analyzing..." : "Generate Outlook"}
              </Button>
            ) : !isPro ? (
              <div className="text-sm text-amber-600">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Pro feature - Upgrade to unlock AI insights
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30 overflow-visible">
      <CardContent className="p-4 space-y-4">
        {/* STATE-BASED HEADLINE: Verdict first */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${getActionColor(outlook.action)} gap-1 text-sm px-3 py-1`} data-testid="badge-outlook-action">
                {getActionIcon(outlook.action)}
                {getActionLabel(outlook.action)}
              </Badge>
              {card.cardCategory && card.cardCategory !== "sports" && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {card.cardCategory === "tcg" ? "TCG" : "Non-Sport"}
                </Badge>
              )}
              <ShareSnapshotButton
                snapshotType="card_outlook"
                title={`${card.title} - Card Outlook`}
                snapshotData={{
                  cardTitle: card.title,
                  playerName: outlook.playerName || card.playerName,
                  sport: outlook.sport || card.sport,
                  position: outlook.position || card.position,
                  action: outlook.action,
                  upsideScore: outlook.upsideScore,
                  riskScore: outlook.riskScore,
                  confidenceScore: outlook.confidenceScore,
                  explanation: outlook.explanation,
                  priceTargets: outlook.priceTargets,
                  projectedOutlook: outlook.projectedOutlook,
                  factors: outlook.factors,
                  generatedAt: outlook.generatedAt,
                }}
                cardId={card.id}
                size="icon"
                variant="ghost"
              />
            </div>
            <p className="text-sm font-medium" data-testid="text-state-description">
              {getStateDescription(outlook.action)}
            </p>
            {outlook.explanation?.short && (
              <p className="text-sm text-muted-foreground" data-testid="text-explanation-short">
                {outlook.explanation.short}
              </p>
            )}
          </div>
        </div>

        {/* TIME CONTEXT LINE */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span data-testid="text-time-context">{getTimeContext(outlook.generatedAt, outlook.action)}</span>
        </div>

        {/* SUPPORTING EVIDENCE: Scores as secondary */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto text-xs text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              View supporting signals
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Target className="h-3 w-3" />
                  <span>Upside</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-medium ${getScoreColor(outlook.upsideScore)}`} data-testid="text-upside-score">
                    {getUpsideLabel(outlook.upsideScore)}
                  </span>
                </div>
                <Progress value={outlook.upsideScore} className="h-1" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>Risk</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-medium ${getScoreColor(outlook.riskScore, true)}`} data-testid="text-risk-score">
                    {getRiskLabel(outlook.riskScore)}
                  </span>
                </div>
                <Progress value={outlook.riskScore} className="h-1" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Gauge className="h-3 w-3" />
                  <span>Confidence</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-medium ${getScoreColor(outlook.confidenceScore)}`} data-testid="text-confidence-score">
                    {getConfidenceLabel(outlook.confidenceScore)}
                  </span>
                </div>
                <Progress value={outlook.confidenceScore} className="h-1" />
              </div>

              {outlook.factors?.liquidityScore !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>Liquidity</span>
                  </div>
                  <div className={`text-sm font-medium ${getScoreColor(getMarketFrictionFromLiquidity(outlook.factors.liquidityScore), true)}`} data-testid="text-friction-score">
                    {getMarketFrictionLabel(getMarketFrictionFromLiquidity(outlook.factors.liquidityScore))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight">
                    {getMarketFrictionHelperText(getMarketFrictionFromLiquidity(outlook.factors.liquidityScore), outlook.action)}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* CONDITIONAL TRIGGERS: What would change this? */}
        <div className="space-y-2 border-l-2 border-muted pl-3">
          <div className="text-xs font-medium text-muted-foreground">What Would Change This?</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {getConditionalTriggers(outlook.action, outlook.sport).map((trigger, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-primary mt-0.5">-</span>
                <span>{trigger}</span>
              </li>
            ))}
          </ul>
        </div>

        {outlook.projectedOutlook && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">12-Month Price Outlook</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-md bg-red-500/10">
                  <div className="text-xs text-muted-foreground">Bear Case</div>
                  <div className="font-medium text-red-600" data-testid="text-bear-case">
                    {outlook.projectedOutlook.bearCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.bearCaseChangePct}%
                  </div>
                </div>
                <div className="p-2 rounded-md bg-amber-500/10">
                  <div className="text-xs text-muted-foreground">Base Case</div>
                  <div className="font-medium text-amber-600" data-testid="text-base-case">
                    {outlook.projectedOutlook.baseCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.baseCaseChangePct}%
                  </div>
                </div>
                <div className="p-2 rounded-md bg-green-500/10">
                  <div className="text-xs text-muted-foreground">Bull Case</div>
                  <div className="font-medium text-green-600" data-testid="text-bull-case">
                    {outlook.projectedOutlook.bullCaseChangePct > 0 ? '+' : ''}{outlook.projectedOutlook.bullCaseChangePct}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {outlook.priceTargets && outlook.priceTargets.fairValue && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                <span>Price Targets</span>
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-xs">
                <div className="p-1.5 rounded-md bg-green-600/20 dark:bg-green-600/10">
                  <div className="text-muted-foreground text-[10px]">Strong Buy</div>
                  <div className="font-semibold text-green-600" data-testid="text-strong-buy">
                    {safeCurrency(outlook.priceTargets.strongBuyBelow)}
                  </div>
                </div>
                <div className="p-1.5 rounded-md bg-green-500/10">
                  <div className="text-muted-foreground text-[10px]">Buy</div>
                  <div className="font-semibold text-green-500" data-testid="text-buy-below">
                    {safeCurrency(outlook.priceTargets.buyBelow)}
                  </div>
                </div>
                <div className="p-1.5 rounded-md bg-muted">
                  <div className="text-muted-foreground text-[10px]">Fair Value</div>
                  <div className="font-semibold" data-testid="text-fair-value">
                    {safeCurrency(outlook.priceTargets.fairValue)}
                  </div>
                </div>
                <div className="p-1.5 rounded-md bg-amber-500/10">
                  <div className="text-muted-foreground text-[10px]">Sell</div>
                  <div className="font-semibold text-amber-500" data-testid="text-sell-above">
                    {safeCurrency(outlook.priceTargets.sellAbove)}
                  </div>
                </div>
                <div className="p-1.5 rounded-md bg-red-500/10">
                  <div className="text-muted-foreground text-[10px]">Strong Sell</div>
                  <div className="font-semibold text-red-500" data-testid="text-strong-sell">
                    {safeCurrency(outlook.priceTargets.strongSellAbove)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {outlook.seasonalContext && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>Market Timing</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {outlook.seasonalContext.isPlayoffSeason && (
                  <Badge variant="outline" className="gap-1 text-xs bg-amber-500/10 border-amber-500/30 text-amber-600">
                    <Trophy className="h-3 w-3" />
                    Playoff Season
                  </Badge>
                )}
                {outlook.seasonalContext.isInSeason && !outlook.seasonalContext.isPlayoffSeason && (
                  <Badge variant="outline" className="gap-1 text-xs bg-green-500/10 border-green-500/30 text-green-600">
                    <Sun className="h-3 w-3" />
                    In Season
                  </Badge>
                )}
                {!outlook.seasonalContext.isInSeason && !outlook.seasonalContext.isPlayoffSeason && (
                  <Badge variant="outline" className="gap-1 text-xs bg-muted border-muted-foreground/30">
                    Off Season
                  </Badge>
                )}
                {outlook.seasonalContext.currentMultiplier !== 1 && (
                  <span className="text-xs text-muted-foreground">
                    ({outlook.seasonalContext.currentMultiplier > 1 ? '+' : ''}{((outlook.seasonalContext.currentMultiplier - 1) * 100).toFixed(0)}% seasonal factor)
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {outlook.confidenceBreakdown && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                Why this confidence level?
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="text-muted-foreground">Sales Data</div>
                  <Progress value={outlook.confidenceBreakdown.salesDataConfidence} className="h-1" />
                  <div className="font-medium">{outlook.confidenceBreakdown.salesDataConfidence}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Price Stability</div>
                  <Progress value={outlook.confidenceBreakdown.priceStabilityConfidence} className="h-1" />
                  <div className="font-medium">{outlook.confidenceBreakdown.priceStabilityConfidence}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">
                    {card.cardCategory === "tcg" || card.cardCategory === "non_sport" ? "Character/IP" : "Player Status"}
                  </div>
                  <Progress value={outlook.confidenceBreakdown.playerStatusConfidence} className="h-1" />
                  <div className="font-medium">{outlook.confidenceBreakdown.playerStatusConfidence}%</div>
                </div>
              </div>
              {outlook.confidenceBreakdown.factors.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {outlook.confidenceBreakdown.factors.map((factor, i) => (
                    <li key={i}>{factor}</li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Extended explanation moved to collapsible if available */}
        {outlook.explanation?.long && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto text-muted-foreground">
                {showDetails ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Less details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Full analysis
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-sm text-muted-foreground" data-testid="text-explanation-long">
                {outlook.explanation.long}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {isPro && canEdit && (!card.cardCategory || card.cardCategory === "sports") && (
          <>
            <Separator />
            <div className="space-y-2">
              {card.legacyTier && (
                <p className="text-xs text-muted-foreground">
                  Career Stage: <span className="font-medium text-foreground">{card.legacyTier.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground/70"> (edit card to change)</span>
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 w-full"
                onClick={() => generateOutlookMutation.mutate()}
                disabled={generateOutlookMutation.isPending}
                data-testid="button-refresh-outlook"
              >
                {generateOutlookMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {generateOutlookMutation.isPending ? "Analyzing..." : "Refresh Outlook"}
              </Button>
            </div>
          </>
        )}

        {isPro && canEdit && (card.cardCategory === "tcg" || card.cardCategory === "non_sport") && (
          <>
            <Separator />
            <div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 w-full"
                onClick={() => generateOutlookMutation.mutate()}
                disabled={generateOutlookMutation.isPending}
                data-testid="button-refresh-outlook-tcg"
              >
                {generateOutlookMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {generateOutlookMutation.isPending ? "Analyzing..." : "Refresh Outlook"}
              </Button>
            </div>
          </>
        )}

        {/* Single consolidated disclaimer */}
        <p className="text-[10px] text-muted-foreground/50 text-center pt-2" data-testid="text-outlook-disclaimer">
          Not financial advice. Do your own research before acting.
        </p>
      </CardContent>
    </Card>
  );
}
