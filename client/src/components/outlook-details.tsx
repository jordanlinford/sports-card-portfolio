import { useState } from "react";
import { sanitizeCardField } from "@/lib/sanitizeCardField";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  Target,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Trophy,
  MinusCircle,
  ExternalLink,
  Download,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { LiquidityBadge, DivergenceWarning, getDivergenceStatus } from "@/components/liquidity-badge";
import type { LiquidityTier } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type OutlookDisplayData = {
  card: {
    title: string;
    playerName?: string | null;
    sport?: string | null;
    position?: string | null;
    grade?: string | null;
    year?: number | string | null;
    set?: string | null;
    variation?: string | null;
    imagePath?: string | null;
  };
  market: {
    value: number | null;
    min: number | null;
    max: number | null;
    compCount: number | null;
    activeListing?: number | null;
    pricePoints?: Array<{
      date: string;
      price: number;
      source: string;
      url?: string;
    }>;
    modeledEstimate?: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
      referenceComps: Array<{ cardType: string; estimatedValue: number; liquidity: string }>;
      source: "MODEL";
    } | null;
    insufficientData?: boolean;
    insufficientDataReason?: string | null;
    insufficientDataPattern?: string | null;
  };
  signals: {
    trend?: number;
    liquidity?: number;
    volatility?: number;
    sport?: number;
    position?: number;
    cardType?: number;
    demand?: number;
    momentum?: number;
    quality?: number;
    upside: number;
    downsideRisk: number;
    marketFriction: number;
  };
  action: string;
  actionReasons?: string[] | null;
  careerStage?: string;
  confidence: {
    level: string;
    reason?: string | null;
  };
  matchConfidence?: {
    score: number;
    tier: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    matchedComps?: number;
    totalComps?: number;
    samples?: Array<{
      title: string;
      snippet?: string;
      source?: string;
      price?: number;
      matchScore?: number;
      url?: string;
    }>;
  } | null;
  explanation?: {
    short: string;
    long?: string | null;
    bullets?: string[];
  } | null;
  bigMover?: {
    flag: boolean;
    reason?: string | null;
  };
  supply?: {
    supplyGrowth: "stable" | "growing" | "surging";
    supplyNote?: string;
    estimatedPopulation?: number;
  } | null;
  generatedAt?: string;
  isPro?: boolean;
};

const ACTION_STYLES: Record<string, { bg: string; border: string; heroBg: string; icon: typeof TrendingUp; label: string; takeaway: string }> = {
  BUY: { bg: "bg-green-500/20", border: "border-green-500", heroBg: "bg-green-500", icon: TrendingUp, label: "Buy", takeaway: "Good entry point at current prices. Consider adding to your collection." },
  ACCUMULATE: { bg: "bg-emerald-500/20", border: "border-emerald-500", heroBg: "bg-emerald-500", icon: TrendingUp, label: "Accumulate", takeaway: "Strong long-term pick. Build position over time." },
  WATCH: { bg: "bg-yellow-500/20", border: "border-yellow-500", heroBg: "bg-yellow-500", icon: Activity, label: "Watch", takeaway: "Do not buy aggressively. Monitor for volume changes or news." },
  HOLD: { bg: "bg-slate-500/20", border: "border-slate-500", heroBg: "bg-slate-500", icon: Clock, label: "Hold", takeaway: "Keep current position. Not a good time to buy or sell." },
  SELL: { bg: "bg-red-500/20", border: "border-red-500", heroBg: "bg-red-500", icon: TrendingDown, label: "Sell", takeaway: "Consider reducing position. Risk outweighs potential upside." },
  AVOID: { bg: "bg-red-600/20", border: "border-red-600", heroBg: "bg-red-600", icon: ShieldAlert, label: "Avoid", takeaway: "Do not buy. High risk with limited upside potential." },
  LONG_HOLD: { bg: "bg-blue-500/20", border: "border-blue-500", heroBg: "bg-blue-500", icon: Clock, label: "Long Hold", takeaway: "Hold for the long term. Short-term gains unlikely but solid floor." },
  LEGACY_HOLD: { bg: "bg-violet-500/20", border: "border-violet-500", heroBg: "bg-violet-500", icon: Trophy, label: "Legacy Hold", takeaway: "Collector piece. Value driven by legacy appeal, not performance." },
  TRADE_THE_HYPE: { bg: "bg-orange-500/20", border: "border-orange-500", heroBg: "bg-orange-500", icon: Zap, label: "Trade the Hype", takeaway: "Short-term momentum play. Sell into strength." },
  SPECULATIVE_FLYER: { bg: "bg-pink-500/20", border: "border-pink-500", heroBg: "bg-pink-500", icon: Target, label: "Speculative", takeaway: "High risk, high reward. Only with money you can lose." },
  HOLD_CORE: { bg: "bg-indigo-500/20", border: "border-indigo-500", heroBg: "bg-indigo-500", icon: Trophy, label: "Hold Core", takeaway: "Core holding. Anchor of a strong portfolio." },
  AVOID_NEW_MONEY: { bg: "bg-red-600/20", border: "border-red-600", heroBg: "bg-red-600", icon: ShieldAlert, label: "Avoid New Money", takeaway: "Don't add more. Current position okay to hold." },
  LITTLE_VALUE: { bg: "bg-muted", border: "border-muted-foreground/30", heroBg: "bg-muted-foreground", icon: MinusCircle, label: "Low Value", takeaway: "Limited market interest. Unlikely to appreciate significantly." },
  HOLD_ROLE_RISK: { bg: "bg-amber-500/20", border: "border-amber-500", heroBg: "bg-amber-500", icon: Clock, label: "Hold (Role Risk)", takeaway: "Role uncertainty. Hold but monitor closely." },
  HOLD_INJURY_CONTINGENT: { bg: "bg-cyan-500/20", border: "border-cyan-500", heroBg: "bg-cyan-500", icon: Clock, label: "Hold (Injury Hedge)", takeaway: "Backup upside. One injury away from spiking." },
  SPECULATIVE_SUPPRESSED: { bg: "bg-emerald-500/20", border: "border-emerald-500", heroBg: "bg-emerald-500", icon: Target, label: "Speculative Buy", takeaway: "Suppressed value opportunity. Market overcorrected." },
  AVOID_STRUCTURAL: { bg: "bg-red-700/20", border: "border-red-700", heroBg: "bg-red-700", icon: ShieldAlert, label: "Avoid", takeaway: "Structural decline. No path back to relevance." },
};

const CONFIDENCE_STYLES: Record<string, { color: string; icon: typeof CheckCircle }> = {
  HIGH: { color: "text-green-500", icon: CheckCircle },
  MEDIUM: { color: "text-yellow-500", icon: AlertTriangle },
  LOW: { color: "text-red-500", icon: XCircle },
};

function parsePrintRun(...sources: Array<string | null | undefined>): number | null {
  for (const src of sources) {
    if (!src) continue;
    const text = String(src);
    const oneOfOne = /\b1\s*\/\s*1\b/.exec(text);
    if (oneOfOne) return 1;
    const matches = text.match(/\/\s*(\d{1,4})\b/g);
    if (matches && matches.length > 0) {
      const nums = matches
        .map(m => parseInt(m.replace(/[^\d]/g, ""), 10))
        .filter(n => Number.isFinite(n) && n > 0 && n <= 5000);
      if (nums.length > 0) return Math.min(...nums);
    }
    if (/\bsuper\s*fractor\b/i.test(text)) return 1;
  }
  return null;
}

function getLowPrintTakeaway(action: string, baseTakeaway: string, printRun: number | null): string {
  if (printRun === null || printRun > 25) return baseTakeaway;
  switch (action) {
    case "WATCH":
      return "Don't buy aggressively. Watch for player news and any comparable parallel sales.";
    case "MONITOR":
      return "Hold and watch — let player news and any comparable parallel sale guide your next move.";
    case "HOLD_ROLE_RISK":
      return "Role uncertainty. Hold and follow the player's situation closely.";
    default:
      return baseTakeaway;
  }
}

function getLowPrintCaveat(printRun: number | null): string | null {
  if (printRun === null) return null;
  if (printRun === 1) {
    return "1-of-1 — no direct sales history. Estimate is anchored to comparable players, sets, and parallels.";
  }
  if (printRun <= 25) {
    return `Print run /${printRun} — direct sales are scarce. Estimate is anchored to comparable players, sets, and parallels.`;
  }
  return null;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getLiquidityTierFromScore(score: number | undefined): LiquidityTier {
  if (score === undefined || score === null) return "UNCERTAIN";
  if (score >= 9) return "VERY_HIGH";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW"; // Scores 0-3 indicate weak liquidity
}

function getPriceDirection(trendScore: number | undefined): "up" | "down" | "stable" {
  if (trendScore === undefined || trendScore === null) return "stable";
  if (trendScore >= 7) return "up";
  if (trendScore <= 3) return "down";
  return "stable";
}

function SignalBar({ label, value, max = 10, tooltip }: { label: string; value?: number; max?: number; tooltip?: string }) {
  if (value === undefined || value === null) return null;
  const percentage = (value / max) * 100;
  
  const content = (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && <Info className="h-3 w-3 text-muted-foreground/50" />}
        </span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
  
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return content;
}

function CompositeScoreCard({ label, value, icon: Icon, description, helperText, tooltip }: { 
  label: string; 
  value?: number; 
  icon: typeof Target; 
  description: string;
  helperText?: string;
  tooltip?: string;
}) {
  if (value === undefined || value === null) return null;
  
  let colorClass = "text-muted-foreground";
  if (value >= 70) colorClass = "text-green-500";
  else if (value >= 40) colorClass = "text-yellow-500";
  else colorClass = "text-red-500";
  
  const content = (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2 rounded-full ${colorClass} bg-background`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate flex items-center gap-1">
            {label}
            {tooltip && <Info className="h-3 w-3 text-muted-foreground/50" />}
          </span>
          <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
        {helperText && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{helperText}</p>
        )}
      </div>
    </div>
  );
  
  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return content;
}

function getMarketFrictionHelperText(value: number, action?: string): string {
  if (action === "LEGACY_HOLD") {
    return value > 75 
      ? "Thin market—eye appeal drives big spreads." 
      : "Sells slowly—patient pricing works best.";
  }
  if (value <= 25) return "Easy to move—buyers are plentiful.";
  if (value <= 50) return "Usually sellable, but timing matters.";
  if (value <= 75) return "May take a while to sell at a fair price.";
  return "Trades infrequently—expect wide spreads.";
}

interface OutlookDetailsProps {
  data: OutlookDisplayData;
  cardImageUrl?: string | null;
  showDetailedSignals?: boolean;
  compact?: boolean;
  onShowMatchSamples?: () => void;
}

export function OutlookDetails({ 
  data, 
  cardImageUrl, 
  showDetailedSignals = true,
  compact = false,
  onShowMatchSamples,
}: OutlookDetailsProps) {
  const [showFullExplanation, setShowFullExplanation] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleDownloadImage = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/share-image/outlook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: data.card.playerName || "Unknown Player",
          cardTitle: data.card.title,
          sport: data.card.sport,
          position: data.card.position,
          action: data.action,
          fairValue: data.market?.value,
          upsideScore: data.signals?.upside,
          riskScore: data.signals?.downsideRisk,
          confidenceLevel: data.confidence?.level,
          shortExplanation: data.explanation?.short,
          imagePath: cardImageUrl || data.card.imagePath,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to generate image");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const playerSlug = (data.card.playerName || "card").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.download = `${playerSlug}-analysis.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Image downloaded",
        description: "Share it on social media!",
      });
    } catch (error) {
      console.error("Failed to download image:", error);
      toast({
        title: "Download failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const actionStyle = ACTION_STYLES[data.action] || ACTION_STYLES.WATCH;
  const ActionIcon = actionStyle.icon;
  const cardPrintRun = parsePrintRun(data.card.variation, data.card.title, data.card.set);
  const lowPrintCaveat = getLowPrintCaveat(cardPrintRun);
  const verdictTakeaway = getLowPrintTakeaway(data.action, actionStyle.takeaway, cardPrintRun);
  const confidenceStyle = CONFIDENCE_STYLES[data.confidence?.level || "LOW"] || CONFIDENCE_STYLES.LOW;
  const ConfidenceIcon = confidenceStyle.icon;

  const imageUrl = cardImageUrl || data.card.imagePath;

  return (
    <div className="space-y-6">
      {/* Hero Verdict Banner */}
      <div className={`${actionStyle.heroBg} rounded-lg p-4 sm:p-6 ${data.action === 'WATCH' ? 'text-black' : 'text-white'}`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-3">
              <ActionIcon className="h-8 w-8" />
            </div>
            <div>
              <div className="text-sm font-medium opacity-90 uppercase tracking-wide">Investment Verdict</div>
              <div className="text-3xl sm:text-4xl font-bold" data-testid="text-verdict-hero">
                {actionStyle.label}
              </div>
              {cardPrintRun !== null && cardPrintRun <= 25 && (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-xs font-medium" data-testid="badge-hard-to-comp">
                  {cardPrintRun === 1 ? "1-of-1 · Hard to comp" : `/${cardPrintRun} · Hard to comp`}
                </div>
              )}
            </div>
          </div>
          <div className="text-center sm:text-right">
            {data.market?.insufficientData ? (
              <>
                <div className="text-sm opacity-90">No verified sales</div>
                <div className="text-2xl sm:text-3xl font-bold">—</div>
                <div className="text-xs opacity-80 mt-0.5">Too new to price</div>
              </>
            ) : data.market?.value != null && (
              <>
                <div className="text-sm opacity-90">
                  {data.market.compCount === 0
                    ? (data.market.activeListing && data.market.activeListing > 0 ? "Est. from active listings" : "Est. from comparables")
                    : "Fair Value"}
                </div>
                <div className="text-2xl sm:text-3xl font-bold">
                  {data.market.compCount === 0 ? "~" : ""}{formatCurrency(data.market.value)}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/20">
          <p className="text-sm sm:text-base opacity-95">
            {data.market?.insufficientData
              ? "We can't make a confident recommendation without verified sales data. Check eBay sold listings below to assess this card."
              : verdictTakeaway}
          </p>
          {lowPrintCaveat && !data.market?.insufficientData && (
            <p className="mt-1.5 text-xs sm:text-sm opacity-80 italic" data-testid="text-low-print-caveat">
              {lowPrintCaveat}
            </p>
          )}
        </div>
      </div>

      {data.market?.insufficientData && (() => {
        const ebayQuery = [
          data.card.year,
          data.card.playerName || data.card.title,
          sanitizeCardField(data.card.set),
          sanitizeCardField(data.card.variation),
        ].filter(Boolean).join(" ").trim();
        const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(ebayQuery)}&_sacat=0&LH_Sold=1&LH_Complete=1`;
        return (
          <div
            className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4 sm:p-5"
            data-testid="banner-insufficient-data"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-900 dark:text-amber-100">
                  Too new to price reliably
                </div>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {data.market.insufficientDataPattern
                    ? `${data.market.insufficientDataPattern} insert/SSP — `
                    : ""}
                  no verified eBay sold listings exist yet for this exact card.
                  Any estimate would be a guess. Check current sold listings on eBay
                  for the most accurate pricing.
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-3 border-amber-600/50 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  data-testid="link-ebay-sold"
                >
                  <a href={ebayUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Check eBay sold listings
                  </a>
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            {imageUrl && (
              <div className="flex-shrink-0">
                <div className="w-24 h-32 sm:w-28 sm:h-36 rounded-lg overflow-hidden border bg-muted/30">
                  <img 
                    src={imageUrl} 
                    alt={data.card.title} 
                    className="w-full h-full object-contain"
                    data-testid="img-card"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl sm:text-2xl mb-2" data-testid="text-card-title">
                {data.card.title}
              </CardTitle>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-3">
                {data.card.year && <span>{data.card.year}</span>}
                {sanitizeCardField(data.card.set) && <span>{sanitizeCardField(data.card.set)}</span>}
                {sanitizeCardField(data.card.variation) && <span>- {sanitizeCardField(data.card.variation)}</span>}
                {data.card.grade && (
                  <Badge variant="outline" className="text-xs">{data.card.grade}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge 
                  className={`${actionStyle.bg} ${actionStyle.border} border text-foreground gap-1`}
                  data-testid="badge-action"
                >
                  <ActionIcon className="h-3 w-3" />
                  {actionStyle.label}
                </Badge>
                {data.careerStage && data.careerStage !== "UNKNOWN" && (
                  <Badge variant="secondary" className="text-xs" data-testid="badge-career-stage">
                    {data.careerStage}
                  </Badge>
                )}
                {data.bigMover?.flag && (
                  <Badge 
                    className="bg-purple-500/20 border-purple-500 border text-foreground gap-1"
                    data-testid="badge-big-mover"
                  >
                    <Zap className="h-3 w-3" />
                    Big Mover
                  </Badge>
                )}
                {data.supply?.supplyGrowth === "surging" && (
                  <Badge 
                    className="bg-yellow-500/20 border-yellow-500 border text-foreground gap-1"
                    data-testid="badge-supply-alert"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Supply Alert
                  </Badge>
                )}
                <LiquidityBadge 
                  tier={getLiquidityTierFromScore(data.signals.liquidity)} 
                  size="sm"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadImage}
                  disabled={isDownloading}
                  data-testid="button-download-analysis"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Share</span>
                </Button>
                {data.card.playerName && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const sport = (data.card.sport || "football").toLowerCase();
                      navigate(`/player-outlook?player=${encodeURIComponent(data.card.playerName!)}&sport=${encodeURIComponent(sport)}&from=card-analysis`);
                    }}
                    data-testid="button-view-player-market"
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Player Market</span>
                    <span className="ml-1 sm:hidden">Market</span>
                  </Button>
                )}
              </div>
            </div>
            <div className="text-right">
              {data.market?.insufficientData ? (
                <>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    NO VERIFIED SALES
                  </div>
                  <div className="text-3xl font-bold text-muted-foreground" data-testid="text-market-value">—</div>
                  <div className="mt-1 text-xs text-muted-foreground">Too new to price reliably</div>
                </>
              ) : data.market?.value != null ? (
                <>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                    {data.market.compCount === 0
                      ? (data.market.activeListing && data.market.activeListing > 0 ? "EST. FROM ACTIVE LISTINGS" : "EST. FROM COMPARABLES")
                      : "EST. FAIR VALUE"}
                  </div>
                  <div className={`text-3xl font-bold ${data.market.compCount === 0 ? "text-muted-foreground" : ""}`} data-testid="text-market-value">
                    {data.market.compCount === 0 ? "~" : ""}{formatCurrency(data.market.value)}
                  </div>
                  {data.market?.min != null && data.market?.max != null &&
                   data.market.value != null && data.market.min >= data.market.value * 0.1 && (
                    <div className="text-sm text-muted-foreground">
                      Range: {formatCurrency(data.market.min)} - {formatCurrency(data.market.max)}
                    </div>
                  )}
                  {data.market.compCount === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {data.market.activeListing && data.market.activeListing > 0
                        ? `Priced from ${data.market.activeListing} active listing${data.market.activeListing > 1 ? "s" : ""}`
                        : "Est. from market comparables"}
                    </div>
                  )}
                </>
              ) : data.market?.modeledEstimate ? (
                <>
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">Modeled</Badge>
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground" data-testid="text-market-value">
                    ${data.market.modeledEstimate.low} - ${data.market.modeledEstimate.high}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Mid: ${data.market.modeledEstimate.mid}
                  </div>
                </>
              ) : (
                <div className="text-3xl font-bold text-muted-foreground" data-testid="text-market-value">
                  N/A
                </div>
              )}
            </div>
          </div>
          {data.isPro && (cardPrintRun === null || cardPrintRun > 25) && getDivergenceStatus(
            getPriceDirection(data.signals.trend),
            getLiquidityTierFromScore(data.signals.liquidity)
          ) && (
            <div className="pt-4 border-t mt-4">
              <DivergenceWarning 
                priceDirection={getPriceDirection(data.signals.trend)}
                liquidityTier={getLiquidityTierFromScore(data.signals.liquidity)}
              />
            </div>
          )}
          {data.isPro && cardPrintRun !== null && cardPrintRun <= 25 && (
            <div className="pt-4 border-t mt-4">
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-md border bg-muted/40 border-muted-foreground/20 text-muted-foreground"
                data-testid="lowprint-trend-caveat"
              >
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="text-sm">
                  {cardPrintRun === 1
                    ? "Trend signals don't apply to 1-of-1s — value is driven by collector demand, not market activity."
                    : `Trend signals are unreliable on /${cardPrintRun} cards — value is driven by collector demand, not market activity.`}
                </span>
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {data.actionReasons && data.actionReasons.length > 0 && (
        <Card className={`${actionStyle.bg} ${actionStyle.border} border`}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-background">
                <ActionIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{actionStyle.label} Recommendation</h3>
                <p className="text-sm font-medium mb-2">{verdictTakeaway}</p>
                {lowPrintCaveat && (
                  <p className="text-xs text-muted-foreground italic mb-2">{lowPrintCaveat}</p>
                )}
                <ul className="text-sm text-muted-foreground space-y-1">
                  {(data.isPro ? data.actionReasons : data.actionReasons.slice(0, 1)).map((reason, i) => (
                    <li key={i} className="flex items-start gap-2" data-testid={`text-action-reason-${i}`}>
                      <span className="text-foreground mt-0.5">-</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                {!data.isPro && data.actionReasons.length > 1 && (
                  <a
                    href="/upgrade"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    data-testid="link-upgrade-action-reasons"
                  >
                    + {data.actionReasons.length - 1} more reason{data.actionReasons.length - 1 === 1 ? "" : "s"} — Upgrade to Pro
                  </a>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Re-evaluate in 30-60 days or after major news.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceIcon className={`h-5 w-5 ${confidenceStyle.color}`} />
                <span className={`text-sm font-medium ${confidenceStyle.color}`}>
                  {data.confidence?.level}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.bigMover?.flag && data.bigMover?.reason && (
        <Card className="bg-purple-500/10 border-purple-500/50 border">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Zap className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Big Mover Potential</h3>
                <p className="text-sm text-muted-foreground">
                  {data.bigMover.reason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.supply?.supplyGrowth === "surging" && (
        <Card className="bg-yellow-500/10 border-yellow-500/50 border">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-yellow-500/20">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1" data-testid="text-supply-alert-title">Supply Saturation Alert</h3>
                {data.isPro && data.supply.supplyNote ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-supply-note">
                    {data.supply.supplyNote}
                    {data.supply.estimatedPopulation != null && (
                      <span className="block mt-1 text-xs">
                        Estimated PSA pop: {data.supply.estimatedPopulation.toLocaleString()}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Graded supply is growing rapidly. High submission volume may dilute scarcity value.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
        {data.signals && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Market Signals</CardTitle>
              <CardDescription>Computed from real market data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <CompositeScoreCard 
                  label="Upside" 
                  value={data.signals.upside} 
                  icon={TrendingUp} 
                  description="Growth potential"
                  tooltip="How much room the card has to grow in value. Based on player career stage, role stability (starters vs backups), card quality, and market momentum. Players with uncertain roles have dampened upside."
                />
                <CompositeScoreCard 
                  label="Downside" 
                  value={data.signals.downsideRisk} 
                  icon={ShieldAlert} 
                  description="Loss exposure"
                  tooltip="Risk of the card losing value. Considers price volatility, recent trends, and data confidence. Lower = safer investment. High downside means prices could drop."
                />
                <CompositeScoreCard 
                  label="Friction" 
                  value={data.signals.marketFriction} 
                  icon={Clock} 
                  description="Time to sell"
                  helperText={getMarketFrictionHelperText(data.signals.marketFriction, data.action)}
                  tooltip="How easy it is to sell this card at fair value. Low friction = quick sales, many buyers. High friction = may sit on the market or require price cuts to move."
                />
              </div>
              {showDetailedSignals && data.signals.trend != null && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <SignalBar 
                      label="Recent Momentum" 
                      value={data.signals.trend} 
                      tooltip="How prices are trending recently. High = prices rising. Low = prices falling or flat."
                    />
                    <SignalBar 
                      label="Comp Volume" 
                      value={data.signals.liquidity}
                      tooltip="How actively this card trades on eBay. 10 = extremely high volume (hundreds of sales), 5 = moderate, 1 = rarely traded."
                    />
                    <SignalBar 
                      label="Price Volatility" 
                      value={data.signals.volatility}
                      tooltip="How much prices vary between sales. Low = tight, predictable pricing. High = wide price swings."
                    />
                    <SignalBar 
                      label="Card Quality" 
                      value={data.signals.cardType}
                      tooltip="How desirable the card itself is. Factors: brand (Prizm, National Treasures = premium), grade (PSA 10 = highest), rookie status, autograph, serial numbering, and parallels (Gold, Silver, Refractor). Higher = more collectible."
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {data.explanation?.short && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Analysis</CardTitle>
            <CardDescription>AI-generated explanation of the recommendation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-explanation-short">{data.explanation.short}</p>
            
            {data.explanation.bullets && data.explanation.bullets.length > 0 && (
              <ul className="mt-3 space-y-2">
                {data.explanation.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            {data.explanation.long && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullExplanation(!showFullExplanation)}
                  className="mt-3"
                  data-testid="button-toggle-explanation"
                >
                  {showFullExplanation ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show Full Analysis
                    </>
                  )}
                </Button>
                {showFullExplanation && (
                  <div className="mt-3 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground whitespace-pre-wrap">
                    {data.explanation.long}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}


      {data.generatedAt && (
        <div className="text-xs text-muted-foreground text-center">
          Analysis generated {new Date(data.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
