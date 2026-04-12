import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown,
  Eye,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Crown,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Search,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Upload,
  Image as ImageIcon,
  Trophy,
  MinusCircle,
  ExternalLink,
  Database,
  Bug,
  Star,
  Info,
  Camera,
  Check,
  GitCompareArrows,
  ArrowLeftRight,
  Layers,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { hasProAccess } from "@shared/schema";
import type { Card as CardType, DisplayCase } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useBatchStatus } from "@/components/batch-analysis-banner";
import { useToast } from "@/hooks/use-toast";
import { OutlookDetails, type OutlookDisplayData } from "@/components/outlook-details";
import { PriceTrendChart } from "@/components/price-trend-chart";
import { GradedValueMatrix } from "@/components/graded-value-matrix";
import { SuccessOverlay } from "@/components/success-animation";

type CaseWithCards = DisplayCase & { cards: CardType[] };
type UsageInfo = { used: number; limit: number | null; remaining: number | null; isPro: boolean };

function getActionIcon(action: string | null) {
  switch (action) {
    case "BUY": return <ShoppingCart className="h-3 w-3" />;
    case "SELL": return <TrendingDown className="h-3 w-3" />;
    case "MONITOR": return <Eye className="h-3 w-3" />;
    case "LONG_HOLD": return <Clock className="h-3 w-3" />;
    case "LEGACY_HOLD": return <Trophy className="h-3 w-3" />;
    case "LITTLE_VALUE": return <MinusCircle className="h-3 w-3" />;
    default: return null;
  }
}

function getActionColor(action: string | null) {
  switch (action) {
    case "BUY": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "SELL": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "LONG_HOLD": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "LEGACY_HOLD": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "LITTLE_VALUE": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getActionLabel(action: string | null): string {
  switch (action) {
    case "BUY": return "BUY";
    case "SELL": return "SELL";
    case "MONITOR": return "MONITOR";
    case "LONG_HOLD": return "LONG HOLD";
    case "LEGACY_HOLD": return "LEGACY HOLD";
    case "LITTLE_VALUE": return "LOW VALUE";
    default: return action ?? "";
  }
}

function OutlookSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-16 w-16 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

type DemandTierDisplay = {
  tier: number;
  label: string;
  sport: string;
  percentile: number;
  triangulationUsed: boolean;
  ceilingApplied: boolean;
};

function DemandTierBadge({ tier }: { tier: DemandTierDisplay }) {
  const tierConfig: Record<number, { color: string; bg: string; label: string; desc: string }> = {
    1: { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", label: "Tier 1", desc: "Elite demand" },
    2: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", label: "Tier 2", desc: "Strong demand" },
    3: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30", label: "Tier 3", desc: "Moderate demand" },
    4: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", label: "Tier 4", desc: "Low demand" },
  };
  const config = tierConfig[tier.tier] || tierConfig[3];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg} text-sm mt-2`} data-testid="demand-tier-badge">
      <span className={`font-semibold ${config.color}`}>{config.label}</span>
      <span className="text-muted-foreground">—</span>
      <span className="text-muted-foreground">
        {config.desc} ({tier.percentile >= 50 
          ? `top ${Math.round(100 - tier.percentile)}% in ${tier.sport}`
          : `${Math.round(tier.percentile)}th percentile in ${tier.sport}`
        })
      </span>
      {tier.ceilingApplied && (
        <span className="text-xs text-muted-foreground italic ml-auto">Price capped</span>
      )}
    </div>
  );
}

// Comps & Confidence Panel Component - simplified to hide technical details
function CompsConfidencePanel({ 
  comps, 
  showDebug = false 
}: { 
  comps: CompsData; 
  showDebug?: boolean;
}) {
  const isLoading = comps.status === "queued" || comps.status === "fetching";
  
  // Use the confidence from the API - it's based on match quality from search results
  const effectiveConfidence = comps.confidence || "LOW";
  
  const getConfidenceStyle = (confidence: string) => {
    switch (confidence) {
      case "HIGH": return { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Strong data coverage" };
      case "MED": return { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", label: "Decent data coverage" };
      case "LOW": 
      default: return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Limited data - treat cautiously" };
    }
  };
  
  const confidenceStyle = getConfidenceStyle(effectiveConfidence);
  
  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="panel-comps-confidence">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Data Confidence</span>
        </div>
        <Badge variant="secondary" className={confidenceStyle.bg} data-testid="badge-confidence">
          <span className={confidenceStyle.color}>{effectiveConfidence}</span>
        </Badge>
      </div>
      
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Gathering market data...</span>
        </div>
      )}

      {!isLoading && comps.soldCount === 0 && (
        <div className="flex gap-2 rounded-md bg-muted/40 border p-2.5 text-xs text-muted-foreground" data-testid="notice-no-exact-comps">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Price estimated from comparable market data — treat as a directional range.
          </span>
        </div>
      )}

      {showDebug && comps.debug && (
        <div className="mt-3 p-2 rounded bg-muted/30 border border-dashed text-xs font-mono space-y-1" data-testid="panel-debug">
          <div className="flex items-center gap-1 text-muted-foreground mb-1">
            <Bug className="h-3 w-3" />
            <span>Debug Info</span>
          </div>
          <div>Query: {comps.debug.canonicalQuery}</div>
          <div>Hash: {comps.queryHash}</div>
          <div>Pages: {comps.debug.pagesScraped} | Found: {comps.debug.itemsFound} | Kept: {comps.debug.itemsKept}</div>
          {comps.debug.lastFetchedAt && (
            <div>Last fetch: {new Date(comps.debug.lastFetchedAt).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}

type CompsData = {
  status: "hit" | "complete" | "queued" | "fetching" | "failed" | "blocked";
  source: "EBAY_SOLD" | "SERPER" | "MIXED";
  soldCount: number;
  confidence: "HIGH" | "MED" | "LOW" | string;
  summary: {
    medianPrice?: number | null;
    meanPrice?: number;
    minPrice?: number;
    maxPrice?: number;
    trendSeries?: Array<{ week: string; medianPrice: number; count: number }>;
    trendSlope?: number;
    volatility?: number;
    liquidity?: number;
    soldCount?: number;
  };
  queryHash: string;
  debug?: {
    canonicalQuery: string;
    pagesScraped: number;
    itemsFound: number;
    itemsKept: number;
    lastFetchedAt: string | null;
  };
  message?: string;
};

type QuickAnalyzeResult = {
  tempCard: { title: string; year?: string; set?: string; variation?: string; grade?: string; grader?: string; imagePath?: string };
  market: { 
    value: number | null; 
    min: number | null; 
    max: number | null; 
    compCount: number;
    pricePoints?: Array<{
      date: string;
      price: number;
      source: string;
      url?: string;
    }> | null;
    modeledEstimate?: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
      referenceComps: Array<{ cardType: string; estimatedValue: number; liquidity: string }>;
      source: "MODEL";
    } | null;
    gradedEstimates?: {
      psa9: number | null;
      psa10: number | null;
      estimated?: boolean;
      lowPop?: boolean;
    } | null;
    isRaw?: boolean;
  };
  signals: { upside: number; downsideRisk: number; marketFriction: number };
  action: string;
  actionReasons: string[] | null;
  explanation: { short: string; long: string | null; bullets?: string[] };
  bigMover: { flag: boolean; reason: string | null };
  supply?: {
    supplyGrowth: "stable" | "growing" | "surging";
    supplyNote?: string;
    estimatedPopulation?: number;
  } | null;
  confidence: { level: string; reason: string | null };
  matchConfidence?: {
    score: number;
    tier: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    matchedComps?: number;
    totalComps?: number;
    samples?: Array<{
      title: string;
      price: number;
      matchScore: number;
      url?: string;
    }>;
  } | null;
  comps?: CompsData;
  priceHistory?: {
    dataPoints: Array<{ month: string; avgPrice: number; salesCount?: number }>;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    notes: string;
    cardDescription: string;
    playerName: string;
    sport: string;
  } | null;
  demandTier?: {
    tier: number;
    label: string;
    demandScore: number;
    careerStage: string;
    sport: string;
    percentile: number;
    isFromCache: boolean;
    triangulationUsed: boolean;
    ceilingApplied: boolean;
    ceilingReason?: string;
  } | null;
  isPro: boolean;
};

// Types for AI price estimate
type ConditionPriceEstimate = {
  condition: string;
  minPrice: number;
  maxPrice: number;
};

type AIPriceEstimate = {
  available: boolean;
  estimates: ConditionPriceEstimate[];
  marketNotes: string;
  confidence: "high" | "medium" | "low";
};

// Type for scan-identify-only result (no pricing, faster)
type FieldConfidenceInfo = { confident: boolean; reason?: string };

type ScanIdentifyResult = {
  success: boolean;
  scan: {
    success: boolean;
    confidence: "high" | "medium" | "low";
    cardIdentification: {
      playerName: string;
      year: number | null;
      setName: string;
      cardNumber: string | null;
      variation: string | null;
      parallel: string | null;
      isRookie: boolean;
      sport: string;
      photoVariation: string | null;
    };
    gradeEstimate: {
      appearsToBe: "graded" | "raw";
      gradingCompany: string | null;
      grade: string | null;
      conditionNotes: string | null;
    };
    marketContext: {
      rarity: string;
      desirability: string;
      collectibilityNotes: string;
    };
    rawAnalysis: string;
    error?: string;
  };
  fieldConfidence?: Record<string, FieldConfidenceInfo>;
  uncertainFields?: string[];
  parallelSuggestions?: string[];
  usage: {
    scansToday: number;
    dailyLimit: number;
    remainingScans: number;
    isPro: boolean;
  };
};

// Types for card scan result (legacy, includes pricing)
type CardScanResult = {
  success: boolean;
  scan: {
    success: boolean;
    confidence: "high" | "medium" | "low";
    cardIdentification: {
      playerName: string;
      year: number | null;
      setName: string;
      cardNumber: string | null;
      variation: string | null;
      parallel: string | null;
      isRookie: boolean;
      sport: string;
      photoVariation: string | null;
    };
    gradeEstimate: {
      appearsToBe: "graded" | "raw";
      gradingCompany: string | null;
      grade: string | null;
      conditionNotes: string | null;
    };
    marketContext: {
      rarity: string;
      desirability: string;
      collectibilityNotes: string;
    };
    rawAnalysis: string;
    error?: string;
  };
  searchQuery: string;
  pricing: {
    available: boolean;
    isFetching: boolean;
    isAIEstimate?: boolean;
    soldCount: number;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    priceRange: string;
    marketAssessment: string;
    recentSales: Array<{
      title: string;
      price: number;
      soldDate: string | null;
      url: string;
    }>;
    aiEstimate?: AIPriceEstimate;
  };
  queryHash: string;
  demandTier?: {
    tier: number;
    label: string;
    demandScore: number;
    careerStage: string;
    sport: string;
    percentile: number;
    triangulationUsed: boolean;
    ceilingApplied: boolean;
  } | null;
  usage: {
    scansToday: number;
    dailyLimit: number;
    remainingScans: number;
    isPro: boolean;
  };
};

// Comparison Verdict Component - shows side-by-side analysis with recommendation
function ComparisonVerdict({ 
  leftCard, 
  rightCard, 
  leftImageUrl, 
  rightImageUrl 
}: { 
  leftCard: QuickAnalyzeResult; 
  rightCard: QuickAnalyzeResult;
  leftImageUrl: string | null;
  rightImageUrl: string | null;
}) {
  const calculateScore = (card: QuickAnalyzeResult): number => {
    const actionScore = 
      card.action === "BUY" ? 100 :
      card.action === "STRONG_BUY" ? 95 :
      card.action === "ACCUMULATE" ? 85 :
      card.action === "LONG_HOLD" ? 75 :
      card.action === "LEGACY_HOLD" ? 70 :
      card.action === "WATCH" ? 45 :
      card.action === "MONITOR" ? 40 :
      card.action === "TRADE_HYPE" ? 30 :
      card.action === "SELL" ? 20 :
      card.action === "LITTLE_VALUE" ? 10 : 50;
    
    const signalScore = (
      (card.signals.upside * 0.5) - 
      (card.signals.downsideRisk * 0.3) - 
      (card.signals.marketFriction * 0.2)
    );
    
    let scarcityBonus = 0;
    const variation = card.tempCard.variation || "";
    const printRunMatch = variation.match(/\/(\d+)/);
    if (printRunMatch) {
      const printRun = parseInt(printRunMatch[1], 10);
      if (printRun <= 1) scarcityBonus = 30;
      else if (printRun <= 5) scarcityBonus = 25;
      else if (printRun <= 10) scarcityBonus = 20;
      else if (printRun <= 25) scarcityBonus = 15;
      else if (printRun <= 50) scarcityBonus = 10;
      else if (printRun <= 99) scarcityBonus = 5;
    }
    
    let gradeBonus = 0;
    const grade = parseFloat(card.tempCard.grade || "0");
    if (grade >= 10) gradeBonus = 15;
    else if (grade >= 9.5) gradeBonus = 12;
    else if (grade >= 9) gradeBonus = 10;
    else if (grade >= 8.5) gradeBonus = 7;
    else if (grade >= 8) gradeBonus = 5;
    
    let stabilityBonus = 0;
    if (card.market.value && card.market.min && card.market.max && card.market.value > 0) {
      const range = card.market.max - card.market.min;
      const rangeRatio = range / card.market.value;
      const hasMeaningfulData = card.market.compCount > 1 || (card.market.min !== card.market.max);
      if (!hasMeaningfulData) {
        stabilityBonus = -3;
      } else if (rangeRatio < 0.3) stabilityBonus = 10;
      else if (rangeRatio < 0.5) stabilityBonus = 5;
      else if (rangeRatio > 1.0) stabilityBonus = -5;
    }
    
    return Math.round(
      (actionScore * 0.5) + 
      (signalScore * 0.5) + 
      scarcityBonus + 
      gradeBonus + 
      stabilityBonus
    );
  };
  
  const leftScore = calculateScore(leftCard);
  const rightScore = calculateScore(rightCard);
  
  const winner = leftScore > rightScore ? "left" : rightScore > leftScore ? "right" : "tie";
  const winnerCard = winner === "left" ? leftCard : winner === "right" ? rightCard : null;
  
  const getVerdictMessage = () => {
    if (winner === "tie") {
      return "Both cards present similar investment opportunities";
    }
    const card = winnerCard!;
    return `${card.tempCard.title} appears to be the stronger investment choice`;
  };

  const renderCardSummary = (card: QuickAnalyzeResult, imageUrl: string | null, isWinner: boolean) => (
    <div className={`flex-1 p-4 rounded-lg border ${isWinner ? "border-green-500/50 bg-green-500/5" : "border-muted"}`}>
      {/* Card Image - prominent display */}
      {imageUrl && (
        <div className="mb-4 flex justify-center">
          <img 
            src={imageUrl} 
            alt={card.tempCard.title}
            className="w-24 h-32 object-contain rounded-lg border shadow-sm"
          />
        </div>
      )}
      
      {/* Card Info */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <h4 className="font-semibold text-center">{card.tempCard.title}</h4>
          {isWinner && winner !== "tie" && (
            <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">
              Better Pick
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {[card.tempCard.year, card.tempCard.set, card.tempCard.variation].filter(Boolean).join(" • ")}
        </p>
        {card.tempCard.grade && (
          <p className="text-sm text-muted-foreground text-center">
            {card.tempCard.grader === "raw" ? "Raw" : `${card.tempCard.grader || ""} ${card.tempCard.grade}`.trim()}
          </p>
        )}
      </div>
      
      {/* Price */}
      {card.market.value && (
        <div className="mb-3">
          <p className="text-2xl font-bold">${card.market.value.toFixed(2)}</p>
          {card.market.min && card.market.max && (
            <p className="text-xs text-muted-foreground">
              Range: ${card.market.min.toFixed(2)} - ${card.market.max.toFixed(2)}
            </p>
          )}
        </div>
      )}
      
      {/* Action Badge */}
      <Badge className={getActionColor(card.action)}>
        {getActionIcon(card.action)}
        <span className="ml-1">{getActionLabel(card.action)}</span>
      </Badge>
      
      {/* Signals */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Upside</span>
          <span className="font-medium text-green-600 dark:text-green-400">{(card.signals.upside / 10).toFixed(1)}/10</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Downside Risk</span>
          <span className="font-medium text-red-600 dark:text-red-400">{(card.signals.downsideRisk / 10).toFixed(1)}/10</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Market Friction</span>
          <span className="font-medium">{(card.signals.marketFriction / 10).toFixed(1)}/10</span>
        </div>
      </div>
      
      {/* Short explanation */}
      <p className="mt-4 text-sm text-muted-foreground">
        {card.explanation.short}
      </p>
    </div>
  );
  
  // Generate explanation for why one card is the better pick
  const getComparisonExplanation = () => {
    if (winner === "tie") {
      return "Both cards have similar investment profiles with comparable action recommendations and market signals.";
    }
    
    const better = winnerCard!;
    const other = winner === "left" ? rightCard : leftCard;
    
    const reasons: string[] = [];
    
    // Compare actions
    const actionRank: Record<string, number> = {
      "BUY": 6, "MONITOR": 5, "LONG_HOLD": 4, "LEGACY_HOLD": 3, "SELL": 2, "LITTLE_VALUE": 1
    };
    
    if (actionRank[better.action] > actionRank[other.action]) {
      reasons.push(`${better.tempCard.title} has a stronger "${getActionLabel(better.action)}" recommendation vs "${getActionLabel(other.action)}"`);
    }
    
    // Compare upside
    if (better.signals.upside > other.signals.upside + 10) {
      reasons.push("higher upside potential");
    }
    
    // Compare downside risk
    if (better.signals.downsideRisk < other.signals.downsideRisk - 10) {
      reasons.push("lower downside risk");
    }
    
    // Compare market friction
    if (better.signals.marketFriction < other.signals.marketFriction - 10) {
      reasons.push("better market liquidity");
    }
    
    if (reasons.length === 0) {
      return `${better.tempCard.title} edges out with slightly better overall investment metrics.`;
    }
    
    if (reasons.length === 1) {
      return reasons[0] + ".";
    }
    
    return reasons[0] + ", with " + reasons.slice(1).join(" and ") + ".";
  };

  return (
    <div className="space-y-6">
      {/* Verdict Banner */}
      <div className={`p-4 rounded-lg ${winner === "tie" ? "bg-blue-500/10 border-blue-500/20" : "bg-green-500/10 border-green-500/20"} border`}>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Investment Recommendation</h3>
        </div>
        <p className="text-sm font-medium">{getVerdictMessage()}</p>
        <p className="text-sm text-muted-foreground mt-1">{getComparisonExplanation()}</p>
      </div>
      
      {/* Side by Side Cards */}
      <div className="flex flex-col md:flex-row gap-4">
        {renderCardSummary(leftCard, leftImageUrl, winner === "left")}
        
        <div className="flex items-center justify-center py-4 md:py-0">
          <div className="bg-muted rounded-full p-3">
            <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        
        {renderCardSummary(rightCard, rightImageUrl, winner === "right")}
      </div>
    </div>
  );
}

type BatchScannedCard = {
  playerName: string;
  imageUrl: string | null;
  year: string | null;
  set: string | null;
  variation: string | null;
  grade: string | null;
  grader: string | null;
  sport: string | null;
  cardNumber: string | null;
  confidence: string | null;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  scanHistoryId?: number;
  fieldConfidence?: Record<string, FieldConfidenceInfo>;
  uncertainFields?: string[];
  parallelSuggestions?: string[];
  isRecovering?: boolean;
  partialData?: {
    playerName?: string;
    year?: string | null;
    set?: string | null;
    variation?: string | null;
    confidence?: string | null;
  };
};

function QuickAnalyzeSection({ canAnalyze, userCases, isPro }: { canAnalyze: boolean; userCases: DisplayCase[]; isPro: boolean }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [inputMode, setInputMode] = useState<"manual" | "scan">("manual");
  const [result, setResult] = useState<QuickAnalyzeResult | null>(null);
  const [trendCorrectedValue, setTrendCorrectedValue] = useState<number | null>(null);
  const handleTrendPriceLoaded = useCallback((trendAvg: number) => {
    const currentValue = result?.market?.value;
    if (currentValue && currentValue > 0 && trendAvg > 0) {
      const ratio = currentValue / trendAvg;
      if (ratio < 0.5 || ratio > 2) {
        setTrendCorrectedValue(trendAvg);
      }
    } else if ((!currentValue || currentValue === 0) && trendAvg > 0) {
      setTrendCorrectedValue(trendAvg);
    }
  }, [result?.market?.value]);
  const [scanResult, setScanResult] = useState<CardScanResult | null>(null);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [set, setSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [variation, setVariation] = useState("");
  const [grade, setGrade] = useState("");
  const [grader, setGrader] = useState("");
  const [sport, setSport] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scanImageUploading, setScanImageUploading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [frontImageData, setFrontImageData] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [backImageData, setBackImageData] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showScanAddDialog, setShowScanAddDialog] = useState(false);
  const [showConfirmedAddDialog, setShowConfirmedAddDialog] = useState(false);
  
  // Confirmation workflow state
  const [scanIdentifyResult, setScanIdentifyResult] = useState<ScanIdentifyResult | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [analysisInvalidated, setAnalysisInvalidated] = useState(false);
  
  // Rotating loading messages
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Searching live market data...",
    "Analyzing player trajectory...",
    "Building your investment outlook..."
  ];
  
  // Success animation state
  const [showAnalysisSuccess, setShowAnalysisSuccess] = useState(false);
  
  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [firstCardResult, setFirstCardResult] = useState<QuickAnalyzeResult | null>(null);
  const [firstCardPreviewUrl, setFirstCardPreviewUrl] = useState<string | null>(null);
  
  // Scan history tracking
  const [currentScanHistoryId, setCurrentScanHistoryId] = useState<number | null>(null);
  
  // Batch scan mode state
  const [batchMode, setBatchMode] = useState(false);
  const [batchScannedCards, setBatchScannedCards] = useState<BatchScannedCard[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(0);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const batchObjectUrlsRef = useRef<string[]>([]);
  const batchCancelledRef = useRef(false);
  const frontFileRef = useRef<File | null>(null);
  const [showBatchAddDialog, setShowBatchAddDialog] = useState(false);
  const [batchAddCaseId, setBatchAddCaseId] = useState<string>("");
  const [batchAdding, setBatchAdding] = useState(false);
  const [, navigateTo] = useLocation();

  const MAX_BATCH_SIZE = 20;

  useEffect(() => {
    return () => {
      batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      batchObjectUrlsRef.current = [];
      batchCancelledRef.current = true;
    };
  }, []);
  
  // Recent searches state
  const RECENT_SEARCHES_KEY = "sports-card-recent-searches";
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addRecentSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    const term = searchTerm.trim();
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== term.toLowerCase());
      const updated = [term, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);
  
  const searchParams = new URLSearchParams(window.location.search);
  const showDebug = searchParams.get("debug") === "1";

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const prefillTitle = sp.get("title");
    if (prefillTitle) {
      setTitle(prefillTitle);
      if (sp.get("year")) setYear(sp.get("year")!);
      if (sp.get("set")) setSet(sp.get("set")!);
      if (sp.get("variation")) setVariation(sp.get("variation")!);
      if (sp.get("grade")) setGrade(sp.get("grade")!);
      if (sp.get("grader")) setGrader(sp.get("grader")!);
      if (sp.get("cardNumber")) setCardNumber(sp.get("cardNumber")!);
      if (sp.get("sport")) setSport(sp.get("sport")!);
      if (sp.get("imagePath")) {
        const path = sp.get("imagePath")!;
        setImagePath(path);
        setPreviewUrl(path);
      }
      if (sp.get("scanHistoryId")) {
        setCurrentScanHistoryId(parseInt(sp.get("scanHistoryId")!));
      }
      setShowForm(true);
      setInputMode("manual");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image under 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = uploadUrlRes;

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
      setImagePath(updateRes.objectPath);
      toast({ title: "Image uploaded", description: "Card image ready" });
    } catch (error) {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const scanId = scanIdentifyResult?.scan?.cardIdentification || scanResult?.scan?.cardIdentification;
      const scanMarket = scanIdentifyResult?.scan?.marketContext || scanResult?.scan?.marketContext;
      const data = await apiRequest("POST", "/api/outlook/quick-analyze", {
        title,
        year: year || undefined,
        set: set || undefined,
        cardNumber: cardNumber || undefined,
        variation: variation || undefined,
        grade: grade || undefined,
        grader: grader || undefined,
        imagePath: imagePath || undefined,
        scanHistoryId: currentScanHistoryId || undefined,
        sport: sport || scanId?.sport || undefined,
        playerName: title || undefined,
        isRookie: scanId?.isRookie || undefined,
        marketDesirability: scanMarket?.desirability || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setTrendCorrectedValue(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      setShowAnalysisSuccess(true);
      addRecentSearch(title);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Rotate loading messages while analyzing
  useEffect(() => {
    if (!analyzeMutation.isPending) {
      setLoadingMessageIndex(0);
      return;
    }
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2500);
    
    return () => clearInterval(interval);
  }, [analyzeMutation.isPending, loadingMessages.length]);

  const addToCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !result) throw new Error("Please select a display case");
      const cardData = {
        title: result.tempCard.title,
        year: result.tempCard.year ? parseInt(result.tempCard.year) : null,
        set: result.tempCard.set || null,
        cardNumber: cardNumber || null,
        variation: result.tempCard.variation || null,
        grade: result.tempCard.grade || null,
        grader: result.tempCard.grader || null,
        imagePath: imagePath || null,
        estimatedValue: result.market.value,
        cardCategory: "sports" as const,
      };
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({ title: "Card added", description: `${result?.tempCard.title} added to your collection` });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for adding scanned card to portfolio
  const addScanToCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !scanResult?.scan?.cardIdentification) {
        throw new Error("Please select a display case");
      }
      
      const card = scanResult.scan.cardIdentification;
      const gradeInfo = scanResult.scan.gradeEstimate;
      
      // Upload the scan preview image if available
      let uploadedImagePath: string | null = null;
      if (scanPreviewUrl && scanPreviewUrl.startsWith("blob:")) {
        // Convert blob URL to file and upload using object storage
        try {
          const response = await fetch(scanPreviewUrl);
          const blob = await response.blob();
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
          
          // Get presigned upload URL
          const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
          const { uploadURL } = uploadUrlRes;
          
          // Upload file to presigned URL
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          
          // Get the object path
          const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
          uploadedImagePath = updateRes.objectPath;
        } catch (uploadError) {
          console.error("Failed to upload scan image:", uploadError);
          toast({ 
            title: "Image upload failed", 
            description: "Card will be added without the photo",
            variant: "destructive"
          });
        }
      }
      
      // Get estimated value - prefer eBay median, fall back to AI estimate midpoint
      let estimatedValue: number | null = null;
      if (scanResult.pricing?.medianPrice && typeof scanResult.pricing.medianPrice === "number" && !isNaN(scanResult.pricing.medianPrice)) {
        estimatedValue = scanResult.pricing.medianPrice;
      } else if (scanResult.pricing?.aiEstimate?.estimates && Array.isArray(scanResult.pricing.aiEstimate.estimates) && scanResult.pricing.aiEstimate.estimates.length > 0) {
        // Use the first valid estimate's midpoint (usually Raw condition)
        for (const est of scanResult.pricing.aiEstimate.estimates) {
          if (est && typeof est === "object" && "minPrice" in est && "maxPrice" in est) {
            const minPrice = typeof est.minPrice === "number" ? est.minPrice : parseFloat(String(est.minPrice));
            const maxPrice = typeof est.maxPrice === "number" ? est.maxPrice : parseFloat(String(est.maxPrice));
            if (!isNaN(minPrice) && !isNaN(maxPrice) && minPrice >= 0 && maxPrice >= minPrice) {
              estimatedValue = Math.round(((minPrice + maxPrice) / 2) * 100) / 100;
              break; // Found a valid estimate
            }
          }
        }
      }
      
      // Parse year safely
      let parsedYear: number | null = null;
      if (typeof card.year === "number" && !isNaN(card.year)) {
        parsedYear = card.year;
      } else if (card.year) {
        const parsed = parseInt(String(card.year));
        if (!isNaN(parsed)) parsedYear = parsed;
      }
      
      const cardData = {
        title: card.playerName || "Unknown Card",
        year: parsedYear,
        set: card.setName || null,
        cardNumber: card.cardNumber || null,
        variation: card.parallel || card.variation || null,
        grade: gradeInfo.grade || null,
        grader: gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : null),
        imagePath: uploadedImagePath,
        estimatedValue: estimatedValue,
        cardCategory: "sports" as const,
      };
      
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      const cardName = scanResult?.scan?.cardIdentification?.playerName || "Card";
      toast({ title: "Card added!", description: `${cardName} added to your collection` });
      setShowScanAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for adding card from new confirmation workflow (uses state variables)
  const addConfirmedCardMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !title.trim()) {
        throw new Error("Please select a display case");
      }
      
      // Parse year safely
      let parsedYear: number | null = null;
      if (year) {
        const parsed = parseInt(year);
        if (!isNaN(parsed)) parsedYear = parsed;
      }
      
      // Estimated value will be set later when user adds actual pricing
      const estimatedValue: number | null = null;
      
      const cardData = {
        title: title,
        year: parsedYear,
        set: set || null,
        cardNumber: cardNumber || null,
        variation: variation || null,
        grade: grade || null,
        grader: grader === "raw" ? null : (grader || null),
        imagePath: imagePath || null, // Already uploaded during confirmation
        estimatedValue: estimatedValue,
        cardCategory: "sports" as const,
      };
      
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({ title: "Card added!", description: `${title} added to your collection` });
      setShowScanAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setTitle("");
    setYear("");
    setSet("");
    setCardNumber("");
    setVariation("");
    setGrade("");
    setGrader("");
    setImagePath(null);
    setPreviewUrl(null);
    setResult(null);
    setTrendCorrectedValue(null);
    setScanResult(null);
    setScanPreviewUrl(null);
    setFrontImageData(null);
    setBackPreviewUrl(null);
    setBackImageData(null);
    setSelectedCaseId("");
    setInputMode("manual");
    setShowScanAddDialog(false);
    // Reset confirmation workflow state
    setScanIdentifyResult(null);
    setIsConfirmed(false);
    setAnalysisInvalidated(false);
    setCurrentScanHistoryId(null);
    // Reset comparison state
    setComparisonMode(false);
    setFirstCardResult(null);
    setFirstCardPreviewUrl(null);
    // Exit batch mode on full reset
    batchCancelledRef.current = true;
    batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    batchObjectUrlsRef.current = [];
    setBatchMode(false);
    setBatchScannedCards([]);
    setBatchProcessing(false);
    setBatchCurrentIndex(0);
  };

  const handleBatchFilesSelected = async (files: FileList) => {
    let fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setBatchMode(true);
    setBatchScannedCards([]);
    setBatchProcessing(false);
    setBatchCurrentIndex(0);

    if (fileArray.length > MAX_BATCH_SIZE) {
      toast({
        title: "Too many files",
        description: `Maximum ${MAX_BATCH_SIZE} cards per batch. Only the first ${MAX_BATCH_SIZE} will be scanned.`,
      });
      fileArray = fileArray.slice(0, MAX_BATCH_SIZE);
    }

    batchCancelledRef.current = false;
    batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    batchObjectUrlsRef.current = [];

    const initialCards: BatchScannedCard[] = fileArray.map((f) => {
      const url = URL.createObjectURL(f);
      batchObjectUrlsRef.current.push(url);
      return {
        playerName: f.name.replace(/\.[^.]+$/, ""),
        imageUrl: url,
        year: null,
        set: null,
        variation: null,
        grade: null,
        grader: null,
        sport: null,
        cardNumber: null,
        confidence: null,
        status: "pending" as const,
      };
    });

    setBatchScannedCards(initialCards);
    setBatchProcessing(true);
    setBatchCurrentIndex(0);
    setShowForm(false);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      if (batchCancelledRef.current) break;

      setBatchCurrentIndex(i);
      setBatchScannedCards(prev => prev.map((c, idx) => idx === i ? { ...c, status: "processing" } : c));

      try {
        const { blob, base64 } = await compressImage(fileArray[i]);
        if (batchCancelledRef.current) break;

        const batchAbort = new AbortController();
        const batchTimeout = setTimeout(() => batchAbort.abort(), 120000);
        const scanRes = await fetch("/api/cards/scan-identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageData: base64 }),
          signal: batchAbort.signal,
        });
        clearTimeout(batchTimeout);

        if (!scanRes.ok) throw new Error("Scan failed");
        const scanData = await scanRes.json();

        if (batchCancelledRef.current) break;

        if (scanData.scan?.success) {
          const card = scanData.scan.cardIdentification;
          const gradeInfo = scanData.scan.gradeEstimate;
          setBatchScannedCards(prev => prev.map((c, idx) => idx === i ? {
            ...c,
            playerName: card.playerName || "Unknown",
            year: card.year ? String(card.year) : null,
            set: card.setName || card.set || null,
            variation: card.parallel || card.variation || null,
            grade: gradeInfo?.grade || null,
            grader: gradeInfo?.gradingCompany || (gradeInfo?.appearsToBe === "raw" ? "raw" : null),
            sport: card.sport || null,
            cardNumber: card.cardNumber || null,
            confidence: scanData.scan.confidence ?? null,
            status: "done",
            scanHistoryId: scanData.scanHistoryId,
            fieldConfidence: scanData.fieldConfidence,
            uncertainFields: scanData.uncertainFields,
            parallelSuggestions: scanData.parallelSuggestions,
          } : c));
          successCount++;
        } else {
          const partialCard = scanData.scan?.cardIdentification;
          setBatchScannedCards(prev => prev.map((c, idx) => idx === i ? {
            ...c,
            status: "failed",
            error: scanData.scan?.error || "Could not identify card",
            scanHistoryId: scanData.scanHistoryId,
            playerName: partialCard?.playerName !== "Unknown" ? (partialCard?.playerName || c.playerName) : c.playerName,
            year: partialCard?.year ? String(partialCard.year) : c.year,
            set: partialCard?.setName !== "Unknown" ? (partialCard?.setName || c.set) : c.set,
            variation: partialCard?.variation || c.variation,
            partialData: partialCard ? {
              playerName: partialCard.playerName !== "Unknown" ? partialCard.playerName : undefined,
              year: partialCard.year ? String(partialCard.year) : null,
              set: partialCard.setName !== "Unknown" ? partialCard.setName : null,
              variation: partialCard.variation || null,
              confidence: scanData.scan?.confidence || null,
            } : undefined,
            fieldConfidence: scanData.fieldConfidence,
            uncertainFields: scanData.uncertainFields,
          } : c));
          failCount++;
        }
      } catch (err: any) {
        if (batchCancelledRef.current) break;
        setBatchScannedCards(prev => prev.map((c, idx) => idx === i ? {
          ...c,
          status: "failed",
          error: err.message || "Scan failed",
        } : c));
        failCount++;
      }
    }

    if (!batchCancelledRef.current) {
      setBatchProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/scan-history'] });
      toast({
        title: "Batch scan complete",
        description: `${successCount} identified${failCount > 0 ? `, ${failCount} failed` : ""}`,
      });
    }
  };

  const [batchSingleAddCard, setBatchSingleAddCard] = useState<BatchScannedCard | null>(null);
  const [batchSingleAddCaseId, setBatchSingleAddCaseId] = useState<string>("");
  const [batchSingleAdding, setBatchSingleAdding] = useState(false);

  const handleBatchDone = () => {
    batchCancelledRef.current = true;
    batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    batchObjectUrlsRef.current = [];
    setBatchMode(false);
    setBatchScannedCards([]);
    setBatchProcessing(false);
    setBatchCurrentIndex(0);
    navigateTo("/scan-history");
  };

  const handleBatchCardAnalyze = (card: BatchScannedCard) => {
    batchCancelledRef.current = true;
    batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    batchObjectUrlsRef.current = [];
    setBatchMode(false);
    setBatchScannedCards([]);
    setBatchProcessing(false);
    setBatchCurrentIndex(0);

    setTitle(card.playerName || "");
    setYear(card.year || "");
    setSet(card.set || "");
    setVariation(card.variation || "");
    setGrade(card.grade || "");
    setGrader(card.grader || "");
    setCardNumber(card.cardNumber || "");
    setSport(card.sport || "");
    setResult(null);
    setShowForm(true);
    setInputMode("manual");
  };

  const handleBatchSingleAdd = async () => {
    if (!batchSingleAddCaseId || !batchSingleAddCard?.scanHistoryId) return;
    setBatchSingleAdding(true);
    try {
      const data = await apiRequest("POST", `/api/display-cases/${batchSingleAddCaseId}/cards/bulk-from-scans`, {
        scanHistoryIds: [batchSingleAddCard.scanHistoryId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      setBatchSingleAddCard(null);
      setBatchSingleAddCaseId("");
      toast({
        title: "Card added!",
        description: `${batchSingleAddCard.playerName} added to your collection`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to add card", variant: "destructive" });
    } finally {
      setBatchSingleAdding(false);
    }
  };

  const handleBatchAddAll = async () => {
    if (!batchAddCaseId) return;

    const successfulCards = batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId);
    if (successfulCards.length === 0) {
      toast({ title: "No cards to add", description: "No successfully scanned cards found", variant: "destructive" });
      return;
    }

    setBatchAdding(true);
    try {
      const scanHistoryIds = successfulCards.map(c => c.scanHistoryId!);
      const data = await apiRequest("POST", `/api/display-cases/${batchAddCaseId}/cards/bulk-from-scans`, { scanHistoryIds });

      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      setShowBatchAddDialog(false);
      setBatchAddCaseId("");

      toast({
        title: "Cards added!",
        description: `${data.successCount} of ${data.totalCount} cards added to your collection`,
      });

      batchCancelledRef.current = true;
      batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      batchObjectUrlsRef.current = [];
      setBatchMode(false);
      setBatchScannedCards([]);
      setBatchProcessing(false);
      setBatchCurrentIndex(0);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to add cards", variant: "destructive" });
    } finally {
      setBatchAdding(false);
    }
  };

  const startBatchMode = () => {
    if (!isPro) {
      toast({
        title: "Pro Feature",
        description: "Batch scanning is available for Pro members. Upgrade to scan multiple cards at once.",
        variant: "destructive",
      });
      return;
    }
    batchFileInputRef.current?.click();
  };

  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({ blob, base64: reader.result as string });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle optional back-of-card image selection (no auto-scan — stored for next scan)
  const handleBackImageSelect = async (file: File) => {
    try {
      const { blob, base64: base64Data } = await compressImage(file, 1200, 0.85);
      const previewDataUrl = URL.createObjectURL(blob);
      setBackPreviewUrl(previewDataUrl);
      setBackImageData(base64Data);
    } catch (err) {
      console.error("Failed to process back image:", err);
    }
  };

  // Store front image without scanning (used by new two-box UI)
  const handleFrontImageSelect = async (file: File) => {
    frontFileRef.current = file;
    setScanResult(null);
    setScanIdentifyResult(null);
    setIsConfirmed(false);
    setResult(null);
    setAnalysisInvalidated(false);
    try {
      const { blob, base64: base64Data } = await compressImage(file, 1200, 0.85);
      const previewDataUrl = URL.createObjectURL(blob);
      setScanPreviewUrl(previewDataUrl);
      setFrontImageData(base64Data);
    } catch (err) {
      console.error("Failed to process front image:", err);
    }
  };

  // Handle photo scan - NEW: Uses scan-identify endpoint (faster, no pricing)
  const scanAbortRef = useRef<AbortController | null>(null);

  const cancelScan = () => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      scanAbortRef.current = null;
    }
    setScanning(false);
  };

  const handlePhotoScan = async (file: File, currentBackImageData?: string | null) => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
    }
    const abortController = new AbortController();
    scanAbortRef.current = abortController;

    setScanning(true);
    setScanResult(null);
    setScanIdentifyResult(null);
    setIsConfirmed(false);
    setResult(null);
    setAnalysisInvalidated(false);
    
    try {
      const { blob, base64: base64Data } = await compressImage(file, 1200, 0.85);
      
      setFrontImageData(base64Data);
      
      const previewDataUrl = URL.createObjectURL(blob);
      setScanPreviewUrl(previewDataUrl);
      
      const effectiveBackData = currentBackImageData !== undefined ? currentBackImageData : backImageData;

      const timeoutId = setTimeout(() => abortController.abort(), 120000);

      const res = await fetch("/api/cards/scan-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageData: base64Data,
          mimeType: "image/jpeg",
          ...(effectiveBackData ? { imageDataBack: effectiveBackData, mimeTypeBack: "image/jpeg" } : {}),
        }),
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      const response = await res.json();
      
      // Handle service unavailable errors
      if (response.serviceUnavailable || response.scanError) {
        toast({
          title: "Scan unavailable",
          description: response.message || "Please try again or enter details manually.",
          variant: "destructive",
        });
        return;
      }
      
      // Store the scan identification result and history ID
      setScanIdentifyResult(response as ScanIdentifyResult);
      if (response.scanHistoryId) {
        setCurrentScanHistoryId(response.scanHistoryId);
      }
      
      // Preserve scan image for display in results
      setPreviewUrl(previewDataUrl);
      
      // Auto-populate form fields from scan result for editing
      if (response.scan?.success) {
        const card = response.scan.cardIdentification;
        const gradeInfo = response.scan.gradeEstimate;
        
        setTitle(card.playerName || "");
        setYear(card.year?.toString() || "");
        setSet(card.setName || "");
        setCardNumber(card.cardNumber || "");
        setVariation(card.parallel || card.variation || "");
        setGrade(gradeInfo.grade || "");
        setGrader(gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : ""));
        setSport(card.sport || "");
        
        toast({
          title: "Card identified!",
          description: "Review the details below and confirm before analysis.",
        });
      } else {
        toast({
          title: "Could not identify card",
          description: response.scan?.error || "Please try a clearer photo or enter details manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast({
          title: "Scan timed out",
          description: "The scan took too long. Please try again — it may be a connection issue.",
          variant: "destructive",
        });
      } else {
        console.error("Error scanning card:", error);
        toast({
          title: "Scan failed",
          description: error instanceof Error ? error.message : "Failed to scan card image",
          variant: "destructive",
        });
      }
    } finally {
      scanAbortRef.current = null;
      setScanning(false);
    }
  };
  
  // Handle field change - invalidates any previous analysis results
  const handleFieldChange = (field: string, value: string) => {
    // Invalidate results when any field changes after confirmation
    if (isConfirmed && result) {
      setAnalysisInvalidated(true);
      setResult(null);
    }
    
    switch (field) {
      case "title": setTitle(value); break;
      case "year": setYear(value); break;
      case "set": setSet(value); break;
      case "cardNumber": setCardNumber(value); break;
      case "variation": setVariation(value); break;
      case "grade": setGrade(value); break;
      case "grader": setGrader(value); break;
    }
  };
  
  // Handle confirmation - also upload the scanned image for later use
  const handleConfirmDetails = async () => {
    if (!title.trim()) {
      toast({
        title: "Player name required",
        description: "Please enter at least the player name to continue.",
        variant: "destructive",
      });
      return;
    }
    
    // Upload scanned image to object storage so it can be used when adding to portfolio
    if (scanPreviewUrl && scanPreviewUrl.startsWith("blob:") && !imagePath) {
      try {
        setScanImageUploading(true);
        const response = await fetch(scanPreviewUrl);
        const blob = await response.blob();
        const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
        
        const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
        const { uploadURL } = uploadUrlRes;
        
        await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        
        const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
        setImagePath(updateRes.objectPath);
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        // Continue without image - it's not critical
      } finally {
        setScanImageUploading(false);
      }
    }
    
    setIsConfirmed(true);
    setAnalysisInvalidated(false);
    toast({
      title: "Details confirmed",
      description: "Get market outlook or add directly to your portfolio.",
    });
  };
  
  // Reset to edit mode (go back to confirmation step)
  const handleEditDetails = () => {
    setIsConfirmed(false);
    setResult(null);
    setAnalysisInvalidated(false);
  };

  // Use scan result to populate manual form and run full analysis
  const useScanForAnalysis = async () => {
    if (!scanResult?.scan?.cardIdentification) return;
    
    const card = scanResult.scan.cardIdentification;
    const gradeInfo = scanResult.scan.gradeEstimate;
    
    setTitle(card.playerName || "");
    setYear(card.year?.toString() || "");
    setSet(card.setName || "");
    setCardNumber(card.cardNumber || "");
    setVariation(card.parallel || card.variation || "");
    setGrade(gradeInfo.grade || "");
    setGrader(gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : ""));
    setSport(card.sport || "");
    
    // Preserve the scanned image for the manual form
    if (scanPreviewUrl) {
      setPreviewUrl(scanPreviewUrl);
      
      // Upload the scanned image to object storage so it persists
      if (scanPreviewUrl.startsWith("blob:")) {
        try {
          setScanImageUploading(true);
          const response = await fetch(scanPreviewUrl);
          const blob = await response.blob();
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
          
          const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
          const { uploadURL } = uploadUrlRes;
          
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          
          const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
          setImagePath(updateRes.objectPath);
        } catch (uploadError) {
          // Continue without image - it's not critical for analysis
          toast({
            title: "Image upload issue",
            description: "Card details saved, but photo may not persist",
            variant: "destructive",
          });
        } finally {
          setScanImageUploading(false);
        }
      }
    }
    
    // Switch to manual mode with pre-filled data
    setInputMode("manual");
    setScanResult(null);
    
    toast({
      title: "Card details loaded",
      description: "Review and adjust the details, then click 'Get Outlook' for full analysis.",
    });
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return "N/A";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Card Analysis</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!batchMode && (
              <>
                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBatchFilesSelected(e.target.files);
                    }
                    e.target.value = "";
                  }}
                  data-testid="input-batch-files"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startBatchMode}
                  data-testid="button-start-batch-scan"
                >
                  {isPro ? (
                    <Layers className="h-4 w-4 mr-2" />
                  ) : (
                    <Crown className="h-4 w-4 mr-2 text-yellow-500" />
                  )}
                  Batch Scan
                </Button>
              </>
            )}
            {batchMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  batchCancelledRef.current = true;
                  batchObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
                  batchObjectUrlsRef.current = [];
                  setBatchMode(false);
                  setBatchScannedCards([]);
                  setBatchProcessing(false);
                  setBatchCurrentIndex(0);
                }}
                data-testid="button-exit-batch"
              >
                <X className="h-4 w-4 mr-2" />
                Exit Batch
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (showForm) {
                    resetForm();
                  } else {
                    setShowForm(true);
                  }
                }}
                data-testid="button-toggle-quick-analyze"
              >
                {showForm ? (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Close
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyze Any Card
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <CardDescription>
          {"Check a card before buying or get an outlook without adding to your collection"}
        </CardDescription>
      </CardHeader>

      {showForm && (
        <CardContent className="space-y-4">
          {/* NEW WORKFLOW: Confirmation screen after scan */}
          {scanIdentifyResult && !isConfirmed ? (
            <div className="space-y-6">
              {/* Header with scanned image and confidence */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">Confirm Card Details</h3>
                    <p className="text-sm text-muted-foreground">Review and edit before analysis</p>
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className={
                    scanIdentifyResult.scan.confidence === "high" ? "bg-green-500/10 text-green-600" :
                    scanIdentifyResult.scan.confidence === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                    "bg-red-500/10 text-red-600"
                  }
                >
                  {scanIdentifyResult.scan.confidence.toUpperCase()} Scan Confidence
                </Badge>
              </div>

              {scanIdentifyResult.uncertainFields && scanIdentifyResult.uncertainFields.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20" data-testid="notice-uncertain-fields">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-amber-600 dark:text-amber-400">Some fields need your review: </span>
                    <span className="text-muted-foreground">
                      {scanIdentifyResult.uncertainFields.map(f => {
                        const labels: Record<string, string> = { playerName: "Player Name", year: "Year", setName: "Set", variation: "Variation", cardNumber: "Card #", grade: "Grade", grader: "Grader" };
                        return labels[f] || f;
                      }).join(", ")}
                    </span>
                  </div>
                </div>
              )}

              {/* Editable fields with confidence indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: "confirm-title", label: "Player Name *", field: "playerName", value: title, stateField: "title", testId: "input-confirm-title" },
                  { id: "confirm-year", label: "Year", field: "year", value: year, stateField: "year", testId: "input-confirm-year" },
                  { id: "confirm-set", label: "Set", field: "setName", value: set, stateField: "set", testId: "input-confirm-set" },
                  { id: "confirm-cardNumber", label: "Card #", field: "cardNumber", value: cardNumber, stateField: "cardNumber", testId: "input-confirm-card-number" },
                ].map(({ id, label, field, value, stateField, testId }) => {
                  const fc = scanIdentifyResult.fieldConfidence?.[field];
                  const isUncertain = fc && !fc.confident;
                  return (
                    <div className="space-y-1" key={id}>
                      <Label htmlFor={id} className="flex items-center gap-1.5">
                        {label}
                        {isUncertain && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        {fc?.confident && <Check className="h-3 w-3 text-green-500" />}
                      </Label>
                      <Input
                        id={id}
                        value={value}
                        onChange={(e) => handleFieldChange(stateField, e.target.value)}
                        className={isUncertain ? "border-amber-500/50 bg-amber-500/5" : fc?.confident ? "opacity-70" : ""}
                        placeholder={isUncertain ? (fc?.reason || "Needs your input") : undefined}
                        data-testid={testId}
                      />
                      {isUncertain && fc?.reason && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{fc.reason}</p>
                      )}
                    </div>
                  );
                })}

                <div className="space-y-1">
                  <Label htmlFor="confirm-variation" className="flex items-center gap-1.5">
                    Variation / Parallel
                    {scanIdentifyResult.fieldConfidence?.variation && !scanIdentifyResult.fieldConfidence.variation.confident && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {scanIdentifyResult.fieldConfidence?.variation?.confident && <Check className="h-3 w-3 text-green-500" />}
                  </Label>
                  <Input
                    id="confirm-variation"
                    value={variation}
                    onChange={(e) => handleFieldChange("variation", e.target.value)}
                    className={scanIdentifyResult.fieldConfidence?.variation && !scanIdentifyResult.fieldConfidence.variation.confident ? "border-amber-500/50 bg-amber-500/5" : ""}
                    placeholder={scanIdentifyResult.fieldConfidence?.variation && !scanIdentifyResult.fieldConfidence.variation.confident ? (scanIdentifyResult.fieldConfidence.variation.reason || "Which parallel?") : undefined}
                    data-testid="input-confirm-variation"
                  />
                  {scanIdentifyResult.fieldConfidence?.variation && !scanIdentifyResult.fieldConfidence.variation.confident && scanIdentifyResult.fieldConfidence.variation.reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{scanIdentifyResult.fieldConfidence.variation.reason}</p>
                  )}
                  {scanIdentifyResult.parallelSuggestions && scanIdentifyResult.parallelSuggestions.length > 0 && scanIdentifyResult.fieldConfidence?.variation && !scanIdentifyResult.fieldConfidence.variation.confident && (
                    <div className="flex flex-wrap gap-1 mt-1" data-testid="parallel-suggestions">
                      {scanIdentifyResult.parallelSuggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleFieldChange("variation", s)}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${variation === s ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                          data-testid={`suggestion-${s.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {scanIdentifyResult.scan?.cardIdentification?.photoVariation && (
                    <div className="flex items-center gap-1.5 mt-1" data-testid="photo-variation-badge">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        📷 {scanIdentifyResult.scan.cardIdentification.photoVariation} variation
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="confirm-grade" className="flex items-center gap-1.5">
                    Grade
                    {scanIdentifyResult.fieldConfidence?.grade && !scanIdentifyResult.fieldConfidence.grade.confident && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {scanIdentifyResult.fieldConfidence?.grade?.confident && <Check className="h-3 w-3 text-green-500" />}
                  </Label>
                  <Input
                    id="confirm-grade"
                    value={grade}
                    onChange={(e) => handleFieldChange("grade", e.target.value)}
                    className={scanIdentifyResult.fieldConfidence?.grade && !scanIdentifyResult.fieldConfidence.grade.confident ? "border-amber-500/50 bg-amber-500/5" : ""}
                    data-testid="input-confirm-grade"
                  />
                  {scanIdentifyResult.fieldConfidence?.grade && !scanIdentifyResult.fieldConfidence.grade.confident && scanIdentifyResult.fieldConfidence.grade.reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{scanIdentifyResult.fieldConfidence.grade.reason}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-grader" className="flex items-center gap-1.5">
                    Grading Company
                    {scanIdentifyResult.fieldConfidence?.grader && !scanIdentifyResult.fieldConfidence.grader.confident && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {scanIdentifyResult.fieldConfidence?.grader?.confident && <Check className="h-3 w-3 text-green-500" />}
                  </Label>
                  <Select value={grader} onValueChange={(val) => handleFieldChange("grader", val)}>
                    <SelectTrigger data-testid="select-confirm-grader">
                      <SelectValue placeholder="Select grader" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PSA">PSA</SelectItem>
                      <SelectItem value="BGS">BGS</SelectItem>
                      <SelectItem value="SGC">SGC</SelectItem>
                      <SelectItem value="CGC">CGC</SelectItem>
                      <SelectItem value="raw">Raw (ungraded)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleConfirmDetails} disabled={!title.trim() || scanImageUploading} data-testid="button-confirm-details">
                  {scanImageUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    "Confirm & Continue"
                  )}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={scanImageUploading} data-testid="button-skip-scan">
                  <X className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
              </div>

              {/* Scan info note */}
              <p className="text-xs text-muted-foreground">
                AI scan is assistive only. Please verify all details before analysis.
              </p>
            </div>
          ) : isConfirmed && !result ? (
            /* Confirmed Card - Ready for Action */
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[year, set, variation, grade ? `${grader === "raw" ? "Raw" : `${grader} ${grade}`}` : null].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleEditDetails} data-testid="button-edit-details">
                  Edit Details
                </Button>
              </div>

              {analysisInvalidated && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm text-yellow-600">Card details were changed. Previous results have been cleared.</span>
                </div>
              )}

              {/* Action Buttons - Full Outlook & Add to Portfolio */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending || !canAnalyze}
                  className="flex-1 sm:flex-none"
                  data-testid="button-run-full-outlook"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span className="min-w-[200px] text-left">{loadingMessages[loadingMessageIndex]}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Get Market Outlook
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmedAddDialog(true)}
                  className="flex-1 sm:flex-none"
                  data-testid="button-add-to-portfolio-confirmed"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Portfolio
                </Button>
              </div>
              
              {!canAnalyze && (
                <p className="text-xs text-muted-foreground text-center">
                  Free limit reached. <Link href="/upgrade" className="text-primary hover:underline">Upgrade to Pro</Link> for market analysis.
                </p>
              )}
              
              <p className="text-sm text-muted-foreground text-center">
                Get AI-powered investment insights or add directly to your collection
              </p>
            </div>
          ) : !result && !scanResult ? (
            <>
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit" data-testid="mode-toggle">
                <Button
                  variant={inputMode === "scan" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setInputMode("scan")}
                  data-testid="button-mode-scan"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Scan Photo
                </Button>
                <Button
                  variant={inputMode === "manual" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setInputMode("manual")}
                  data-testid="button-mode-manual"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Enter Details
                </Button>
              </div>

              {inputMode === "scan" ? (
                /* Photo Scan Mode — two side-by-side image boxes */
                <div className="space-y-4">
                  <div className="relative grid grid-cols-2 gap-3">
                    {scanning && (
                      <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-20 rounded-lg">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mb-1" />
                        <span className="text-xs font-medium">Scanning...</span>
                        <button
                          onClick={cancelScan}
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
                          data-testid="button-cancel-scan"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {/* Front box */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Front</Label>
                      <div className="relative aspect-[3/4] border-2 border-dashed rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                        {scanPreviewUrl ? (
                          <>
                            <img src={scanPreviewUrl} alt="Card front" className="w-full h-full object-contain" />
                            <button
                              onClick={() => { setScanPreviewUrl(null); setFrontImageData(null); frontFileRef.current = null; }}
                              className="absolute top-1 right-1 bg-background/80 rounded-full w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs z-10"
                            >×</button>
                            {/* Replace buttons when image loaded */}
                            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1.5 z-10">
                              <div className="relative">
                                <button className="bg-background/80 rounded px-1.5 py-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Camera className="h-3 w-3" />Camera
                                </button>
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFrontImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-front-camera-replace" />
                              </div>
                              <div className="relative">
                                <button className="bg-background/80 rounded px-1.5 py-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Upload className="h-3 w-3" />Upload
                                </button>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFrontImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-front-upload-replace" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 p-3 w-full">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            <div className="flex gap-2 w-full justify-center">
                              <div className="relative flex-1 max-w-[80px]">
                                <button className="w-full border rounded-md py-1.5 flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors bg-background/50">
                                  <Camera className="h-4 w-4" />
                                  <span>Camera</span>
                                </button>
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFrontImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-front-camera" />
                              </div>
                              <div className="relative flex-1 max-w-[80px]">
                                <button className="w-full border rounded-md py-1.5 flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors bg-background/50">
                                  <Upload className="h-4 w-4" />
                                  <span>Upload</span>
                                </button>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFrontImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-front-upload" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Back box */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Back <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <div className="relative aspect-[3/4] border-2 border-dashed rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                        {backPreviewUrl ? (
                          <>
                            <img src={backPreviewUrl} alt="Card back" className="w-full h-full object-contain" />
                            <button
                              onClick={() => { setBackPreviewUrl(null); setBackImageData(null); }}
                              className="absolute top-1 right-1 bg-background/80 rounded-full w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs z-10"
                            >×</button>
                            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1.5 z-10">
                              <div className="relative">
                                <button className="bg-background/80 rounded px-1.5 py-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Camera className="h-3 w-3" />Camera
                                </button>
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-back-camera-replace" />
                              </div>
                              <div className="relative">
                                <button className="bg-background/80 rounded px-1.5 py-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Upload className="h-3 w-3" />Upload
                                </button>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-back-upload-replace" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 p-3 w-full">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            <div className="flex gap-2 w-full justify-center">
                              <div className="relative flex-1 max-w-[80px]">
                                <button className="w-full border rounded-md py-1.5 flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors bg-background/50">
                                  <Camera className="h-4 w-4" />
                                  <span>Camera</span>
                                </button>
                                <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-back-camera" />
                              </div>
                              <div className="relative flex-1 max-w-[80px]">
                                <button className="w-full border rounded-md py-1.5 flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors bg-background/50">
                                  <Upload className="h-4 w-4" />
                                  <span>Upload</span>
                                </button>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackImageSelect(f); e.target.value = ""; }} disabled={scanning} data-testid="input-scan-back-upload" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Scan button */}
                  <Button
                    className="w-full"
                    disabled={!scanPreviewUrl || scanning}
                    onClick={() => { if (frontFileRef.current) handlePhotoScan(frontFileRef.current); }}
                    data-testid="button-scan-card"
                  >
                    {scanning ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Identifying card...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />{backPreviewUrl ? "Scan Both Sides" : "Scan Card"}</>
                    )}
                  </Button>

                  {!scanPreviewUrl && !scanning && (
                    <p className="text-xs text-muted-foreground text-center">
                      Add a back image to improve accuracy for serial numbers &amp; card numbers
                    </p>
                  )}
                </div>
              ) : (
                /* Manual Entry Mode */
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-shrink-0">
                    <Label className="mb-2 block">Card Image (optional)</Label>
                    <div className="relative w-32 h-44 border-2 border-dashed rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                      {previewUrl ? (
                        <img src={previewUrl} alt="Card preview" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-2">
                          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">Upload image</span>
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        disabled={uploading}
                        data-testid="input-quick-image"
                      />
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Card Title / Player Name *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., LeBron James Rookie"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      data-testid="input-quick-title"
                    />
                    {recentSearches.length > 0 && !title && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-xs text-muted-foreground">Recent:</span>
                        {recentSearches.slice(0, 5).map((search, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="text-xs px-2 py-0.5 rounded-full bg-muted hover-elevate text-muted-foreground"
                            onClick={() => setTitle(search)}
                            data-testid={`chip-recent-search-${idx}`}
                          >
                            {search}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      placeholder="e.g., 2003"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      data-testid="input-quick-year"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="set">Set</Label>
                    <Input
                      id="set"
                      placeholder="e.g., Topps Chrome"
                      value={set}
                      onChange={(e) => setSet(e.target.value)}
                      data-testid="input-quick-set"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card #</Label>
                    <Input
                      id="cardNumber"
                      placeholder="e.g., 23"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      data-testid="input-quick-card-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variation">Variation</Label>
                    <Input
                      id="variation"
                      placeholder="e.g., Refractor"
                      value={variation}
                      onChange={(e) => setVariation(e.target.value)}
                      data-testid="input-quick-variation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade</Label>
                    <Input
                      id="grade"
                      placeholder="e.g., PSA 10"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      data-testid="input-quick-grade"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grader">Grader</Label>
                    <Select value={grader} onValueChange={setGrader}>
                      <SelectTrigger data-testid="select-quick-grader">
                        <SelectValue placeholder="Select grader" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PSA">PSA</SelectItem>
                        <SelectItem value="BGS">BGS</SelectItem>
                        <SelectItem value="SGC">SGC</SelectItem>
                        <SelectItem value="CGC">CGC</SelectItem>
                        <SelectItem value="raw">Raw (ungraded)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => analyzeMutation.mutate()}
                    disabled={!title || analyzeMutation.isPending || !canAnalyze}
                    data-testid="button-quick-analyze"
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        <span className="min-w-[200px] text-left">{loadingMessages[loadingMessageIndex]}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Get Outlook
                      </>
                    )}
                  </Button>
                  {!canAnalyze && (
                    <Link href="/upgrade">
                      <Button variant="outline">
                        <Crown className="h-4 w-4 mr-2" />
                        Upgrade for Analyses
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              )}
            </>
          ) : scanResult ? (
            /* Scan Result Display */
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg" data-testid="text-scan-player">
                      {scanResult.scan.cardIdentification.playerName}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-scan-card-info">
                      {scanResult.scan.cardIdentification.year} {scanResult.scan.cardIdentification.setName}
                      {scanResult.scan.cardIdentification.parallel && ` - ${scanResult.scan.cardIdentification.parallel}`}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className={
                    scanResult.scan.confidence === "high" ? "bg-green-500/10 text-green-600" :
                    scanResult.scan.confidence === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                    "bg-red-500/10 text-red-600"
                  }
                  data-testid="badge-scan-confidence"
                >
                  {scanResult.scan.confidence.toUpperCase()} Confidence
                </Badge>
              </div>

              {/* Card Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Sport</p>
                  <p className="font-medium capitalize">{scanResult.scan.cardIdentification.sport}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Condition</p>
                  <p className="font-medium capitalize">
                    {scanResult.scan.gradeEstimate.appearsToBe === "graded" 
                      ? `${scanResult.scan.gradeEstimate.gradingCompany} ${scanResult.scan.gradeEstimate.grade}`
                      : "Raw"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Rarity</p>
                  <p className="font-medium capitalize">{scanResult.scan.marketContext.rarity}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">
                    {scanResult.scan.cardIdentification.isRookie ? "Rookie Card" : "Card Type"}
                  </p>
                  <p className="font-medium">
                    {scanResult.scan.cardIdentification.isRookie ? "Yes" : "Non-Rookie"}
                  </p>
                </div>
              </div>

              {/* Pricing Section */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold">Market Pricing</h4>
                  {scanResult.pricing.isAIEstimate && (
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Estimate
                    </Badge>
                  )}
                </div>
                
                {scanResult.pricing.available ? (
                  <div className="space-y-3">
                    {/* Show AI condition-based estimates */}
                    {scanResult.pricing.isAIEstimate && scanResult.pricing.aiEstimate?.estimates?.length ? (
                      <div className="space-y-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-muted-foreground text-left">
                              <th className="pb-2 font-medium">Condition</th>
                              <th className="pb-2 font-medium text-right">Estimated Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scanResult.pricing.aiEstimate.estimates.map((est, idx) => (
                              <tr key={idx} className="border-t border-border/50">
                                <td className="py-2">{est.condition}</td>
                                <td className="py-2 text-right font-medium">
                                  ${est.minPrice.toFixed(2)} - ${est.maxPrice.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-sm text-muted-foreground pt-2 border-t">
                          {scanResult.pricing.aiEstimate.marketNotes || scanResult.pricing.marketAssessment}
                        </p>
                      </div>
                    ) : scanResult.pricing.isAIEstimate ? (
                      // AI estimate flag is set but no valid estimates - show fallback message
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">AI pricing estimate unavailable for this card</p>
                        {scanResult.pricing.marketAssessment && (
                          <p className="text-sm text-muted-foreground mt-2">{scanResult.pricing.marketAssessment}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Standard eBay pricing display */}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Price Range</span>
                          <span className="font-semibold text-lg" data-testid="text-scan-price-range">
                            {scanResult.pricing.priceRange}
                          </span>
                        </div>
                        {scanResult.pricing.medianPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Median Price</span>
                            <span className="font-medium">${scanResult.pricing.medianPrice.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Recent Sales</span>
                          <span className="font-medium">{scanResult.pricing.soldCount} sold</span>
                        </div>
                        <p className="text-sm text-muted-foreground pt-2 border-t">
                          {scanResult.pricing.marketAssessment}
                        </p>

                        {scanResult.demandTier && scanResult.demandTier.triangulationUsed && (
                          <DemandTierBadge tier={scanResult.demandTier} />
                        )}
                        
                        {/* Recent Sales List */}
                        {scanResult.pricing.recentSales.length > 0 && (
                          <div className="pt-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Recent Sales:</p>
                            {scanResult.pricing.recentSales.slice(0, 3).map((sale, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="truncate flex-1 mr-2">{sale.title}</span>
                                <span className="font-medium">${sale.price.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    {scanResult.pricing.isFetching ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground">Fetching market data...</span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{scanResult.pricing.marketAssessment || "Unable to determine pricing"}</p>
                    )}
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              {scanResult.scan.rawAnalysis && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">AI Analysis</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {scanResult.scan.rawAnalysis}
                  </p>
                  {scanResult.scan.marketContext.collectibilityNotes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {scanResult.scan.marketContext.collectibilityNotes}
                    </p>
                  )}
                </div>
              )}

              {/* Usage Info */}
              <div className="text-xs text-muted-foreground text-center">
                {scanResult.usage.remainingScans} scans remaining today
                {!scanResult.usage.isPro && " (Free tier)"}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap justify-center">
                {/* Add to Portfolio Dialog */}
                <Dialog open={showScanAddDialog} onOpenChange={setShowScanAddDialog}>
                  <DialogTrigger asChild>
                    <Button disabled={scanImageUploading} data-testid="button-scan-add-to-portfolio">
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Portfolio
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add to Display Case</DialogTitle>
                      <DialogDescription>
                        Choose which display case to add "{scanResult.scan.cardIdentification.playerName}" to.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      {/* Card Preview */}
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        {scanPreviewUrl && (
                          <img 
                            src={scanPreviewUrl} 
                            alt="Card" 
                            className="w-12 h-16 object-contain rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{scanResult.scan.cardIdentification.playerName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {scanResult.scan.cardIdentification.year} {scanResult.scan.cardIdentification.setName}
                          </p>
                          {scanResult.pricing?.medianPrice && (
                            <p className="text-sm text-green-600 font-medium">
                              Est. ${scanResult.pricing.medianPrice.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Select Display Case</Label>
                        <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                          <SelectTrigger data-testid="select-scan-display-case">
                            <SelectValue placeholder="Choose a display case" />
                          </SelectTrigger>
                          <SelectContent>
                            {userCases.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {userCases.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          You don't have any display cases yet. Create one first from your dashboard.
                        </p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowScanAddDialog(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => addScanToCollectionMutation.mutate()}
                          disabled={!selectedCaseId || addScanToCollectionMutation.isPending || scanImageUploading}
                          data-testid="button-confirm-scan-add"
                        >
                          {addScanToCollectionMutation.isPending || scanImageUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {scanImageUploading ? "Uploading..." : "Adding..."}
                            </>
                          ) : (
                            "Add Card"
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Button 
                  variant="outline" 
                  onClick={useScanForAnalysis} 
                  disabled={scanImageUploading}
                  data-testid="button-scan-full-analysis"
                >
                  {scanImageUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Get Full Outlook
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setScanResult(null);
                    setScanPreviewUrl(null);
                  }}
                  data-testid="button-scan-another"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Scan Another
                </Button>
                <Button variant="ghost" onClick={resetForm} data-testid="button-scan-reset">
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            </div>
          ) : result ? (
            <Dialog open={!!result} onOpenChange={(open) => !open && resetForm()}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="pb-4 border-b space-y-3">
                  <div className="flex items-center gap-3">
                    {scanPreviewUrl && (
                      <img 
                        src={scanPreviewUrl} 
                        alt="Scanned card" 
                        className="w-12 h-16 sm:w-16 sm:h-22 object-contain rounded-md border flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <DialogTitle className="text-lg sm:text-xl">Card Analysis Result</DialogTitle>
                      <DialogDescription className="truncate">
                        Market analysis for {result.tempCard.title}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-to-collection">
                          <Plus className="h-4 w-4 mr-1" />
                          Add to Collection
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add to Display Case</DialogTitle>
                          <DialogDescription>
                            Choose which display case to add "{result.tempCard.title}" to.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Select Display Case</Label>
                            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                              <SelectTrigger data-testid="select-display-case">
                                <SelectValue placeholder="Choose a display case" />
                              </SelectTrigger>
                              <SelectContent>
                                {userCases.map((c) => (
                                  <SelectItem key={c.id} value={c.id.toString()}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {userCases.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              You don't have any display cases yet. Create one first from your dashboard.
                            </p>
                          )}
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={() => addToCollectionMutation.mutate()}
                              disabled={!selectedCaseId || addToCollectionMutation.isPending}
                              data-testid="button-confirm-add"
                            >
                              {addToCollectionMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Adding...
                                </>
                              ) : (
                                "Add Card"
                              )}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetForm}
                      data-testid="button-quick-reset"
                    >
                      <Search className="h-4 w-4 mr-1" />
                      Check Another
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Store current result as first card and enter comparison mode
                        setFirstCardResult(result);
                        // Capture whichever image URL is available (could be from scan or manual upload)
                        setFirstCardPreviewUrl(previewUrl || scanPreviewUrl || result.tempCard.imagePath || null);
                        setComparisonMode(true);
                        // Reset all form state for second card entry
                        setTitle("");
                        setYear("");
                        setSet("");
                        setCardNumber("");
                        setVariation("");
                        setGrade("");
                        setGrader("");
                        setImagePath(null);
                        setPreviewUrl(null);
                        setResult(null);
                        setScanIdentifyResult(null);
                        setIsConfirmed(false);
                        setScanResult(null);
                        setScanPreviewUrl(null);
                        setInputMode("manual");
                      }}
                      data-testid="button-compare-card"
                    >
                      <GitCompareArrows className="h-4 w-4 mr-1" />
                      Compare
                    </Button>
                  </div>
                </DialogHeader>
                
                {(!result.tempCard.set || !result.tempCard.variation) && (
                  <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2" data-testid="warning-incomplete-details">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                        Incomplete card details — price may be inaccurate
                      </p>
                      <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80 mt-0.5">
                        Missing {[!result.tempCard.set ? "set" : null, !result.tempCard.variation ? "variation/parallel" : null].filter(Boolean).join(" and ")}. 
                        Go back and add the missing details for a reliable estimate.
                      </p>
                    </div>
                  </div>
                )}

                {result.comps && (
                  <div className="mb-4">
                    <CompsConfidencePanel 
                      comps={result.comps}
                      showDebug={showDebug}
                    />
                  </div>
                )}
                
                <OutlookDetails 
                  data={{
                    card: {
                      title: result.tempCard.title,
                      year: result.tempCard.year,
                      set: result.tempCard.set,
                      variation: result.tempCard.variation,
                      grade: result.tempCard.grade ? `${result.tempCard.grader || ''} ${result.tempCard.grade}`.trim() : null,
                      imagePath: previewUrl || result.tempCard.imagePath,
                    },
                    market: {
                      value: trendCorrectedValue ?? result.market.value,
                      min: trendCorrectedValue ? Math.round(trendCorrectedValue * 0.75) : result.market.min,
                      max: trendCorrectedValue ? Math.round(trendCorrectedValue * 1.35) : result.market.max,
                      compCount: result.matchConfidence?.totalComps ?? result.comps?.soldCount ?? result.market.compCount,
                      modeledEstimate: result.market.modeledEstimate,
                      pricePoints: result.market.pricePoints ?? undefined,
                    },
                    signals: result.signals,
                    action: result.action,
                    actionReasons: result.actionReasons,
                    confidence: result.confidence,
                    matchConfidence: result.matchConfidence,
                    explanation: result.explanation,
                    bigMover: result.bigMover,
                    supply: result.supply,
                    isPro: result.isPro,
                  }}
                  cardImageUrl={previewUrl}
                  showDetailedSignals={result.isPro}
                />

                {result.demandTier && result.demandTier.triangulationUsed && (
                  <DemandTierBadge tier={result.demandTier} />
                )}

                {result.market.isRaw && result.market.gradedEstimates && (result.market.gradedEstimates.psa9 || result.market.gradedEstimates.psa10) && result.market.value && (
                  <GradedValueMatrix
                    rawValue={trendCorrectedValue ?? result.market.value}
                    psa9Price={result.market.gradedEstimates.psa9}
                    psa10Price={result.market.gradedEstimates.psa10}
                    estimated={result.market.gradedEstimates.estimated}
                    lowPop={result.market.gradedEstimates.lowPop}
                  />
                )}

                {result.tempCard.title && (
                  <div className="mt-4">
                    <PriceTrendChart
                      autoLoad={true}
                      preloadedData={result.priceHistory || undefined}
                      subtitle={result.priceHistory?.cardDescription}
                      playerRequest={!result.priceHistory ? {
                        playerName: result.tempCard.title,
                        sport: scanIdentifyResult?.scan?.cardIdentification?.sport || "football",
                        year: result.tempCard.year,
                        setName: result.tempCard.set,
                        variation: result.tempCard.variation,
                        grade: result.tempCard.grade,
                        grader: result.tempCard.grader,
                      } : undefined}
                      onPriceLoaded={handleTrendPriceLoaded}
                    />
                    {trendCorrectedValue && result.market.value && Math.abs(trendCorrectedValue - result.market.value) / result.market.value > 0.3 && (
                      <p className="text-xs text-muted-foreground mt-1.5 px-1">
                        Fair value updated to <span className="font-medium">${trendCorrectedValue.toLocaleString()}</span> based on recent sales data from the price trend.
                      </p>
                    )}
                  </div>
                )}

              </DialogContent>
            </Dialog>
          ) : null}
          
          {/* Comparison View - Shows when comparing two cards */}
          {comparisonMode && firstCardResult && result ? (
            <Dialog open={true} onOpenChange={() => { setComparisonMode(false); resetForm(); }}>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <GitCompareArrows className="h-5 w-5 text-primary" />
                    Card Comparison
                  </DialogTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => { setComparisonMode(false); resetForm(); }}
                      data-testid="button-new-comparison"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      New Analysis
                    </Button>
                  </div>
                </DialogHeader>
                
                {/* Comparison Verdict */}
                <ComparisonVerdict
                  leftCard={firstCardResult}
                  rightCard={result}
                  leftImageUrl={firstCardPreviewUrl}
                  rightImageUrl={previewUrl || scanPreviewUrl || result.tempCard.imagePath || null}
                />
              </DialogContent>
            </Dialog>
          ) : null}
          
          {/* Comparison Mode - Entering second card */}
          {comparisonMode && firstCardResult && !result && !analyzeMutation.isPending ? (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-4">
                <GitCompareArrows className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Comparing to: {firstCardResult.tempCard.title}</h3>
                <Badge variant="secondary" className={getActionColor(firstCardResult.action)}>
                  {getActionLabel(firstCardResult.action)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setComparisonMode(false); setFirstCardResult(null); setFirstCardPreviewUrl(null); }}
                  className="ml-auto"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the second card details below to compare investments
              </p>
            </div>
          ) : null}
          
        </CardContent>
      )}

      {/* Batch Scan Results — rendered outside the single-card form */}
      {batchMode && batchScannedCards.length > 0 && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">
                {batchProcessing 
                  ? `Processing card ${batchCurrentIndex + 1} of ${batchScannedCards.length}...`
                  : `Batch complete — ${batchScannedCards.filter(c => c.status === "done").length} of ${batchScannedCards.length} identified`
                }
              </span>
            </div>
            <div className="flex gap-2">
              {!batchProcessing && batchScannedCards.some(c => c.status === "done" && c.scanHistoryId) && (
                <Button
                  size="sm"
                  onClick={() => setShowBatchAddDialog(true)}
                  data-testid="button-batch-add-all"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add All to Collection
                </Button>
              )}
              {!batchProcessing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchDone}
                  data-testid="button-batch-done"
                >
                  <History className="h-4 w-4 mr-2" />
                  View in Scan History
                </Button>
              )}
              {batchProcessing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    batchCancelledRef.current = true;
                    setBatchProcessing(false);
                    toast({ title: "Batch scan cancelled", description: "Remaining cards were skipped." });
                  }}
                  data-testid="button-batch-cancel"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {batchProcessing && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${((batchCurrentIndex + 1) / batchScannedCards.length) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-2">
            {batchScannedCards.map((card, idx) => (
              <div 
                key={idx} 
                className={`rounded-lg border ${
                  card.status === "processing" ? "border-primary/50 bg-primary/5" :
                  card.status === "failed" ? "border-red-500/30 bg-red-500/5" :
                  card.status === "done" ? "border-border bg-card" :
                  "border-border/50 bg-muted/20 opacity-60"
                }`}
                data-testid={`batch-card-${idx}`}
              >
                <div className="flex items-center gap-3 p-3">
                  {card.imageUrl ? (
                    <img 
                      src={card.imageUrl} 
                      alt={card.playerName} 
                      className="w-12 h-16 object-contain rounded-md border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" data-testid={`batch-card-name-${idx}`}>
                      {card.status === "done" ? card.playerName : card.status === "failed" ? (card.partialData?.playerName || "Scan Failed") : `Card ${idx + 1}`}
                    </p>
                    {card.status === "done" && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[card.year, card.set, card.variation].filter(Boolean).join(" · ")}
                        {card.grade && ` — ${card.grade}`}
                      </p>
                    )}
                    {card.status === "done" && card.uncertainFields && card.uncertainFields.length > 0 && (
                      <p className="text-xs text-amber-500 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        {card.uncertainFields.length} field{card.uncertainFields.length !== 1 ? "s" : ""} need review
                      </p>
                    )}
                    {card.status === "failed" && card.partialData && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[card.partialData.year, card.partialData.set, card.partialData.variation].filter(Boolean).join(" · ") || "Partial data recovered"}
                      </p>
                    )}
                    {card.status === "failed" && !card.partialData && card.error && (
                      <p className="text-xs text-red-500">{card.error}</p>
                    )}
                    {card.status === "processing" && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Identifying...
                      </p>
                    )}
                    {card.status === "pending" && (
                      <p className="text-xs text-muted-foreground">Waiting...</p>
                    )}
                  </div>
                  {card.status === "done" && card.confidence && (
                    <Badge 
                      variant="secondary" 
                      className={`shrink-0 text-xs ${
                        card.confidence === "high" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                        card.confidence === "medium" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                        "bg-red-500/10 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {card.confidence === "high" ? "High" : card.confidence === "medium" ? "Med" : "Low"}
                    </Badge>
                  )}
                  {card.status === "done" && !batchProcessing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {card.uncertainFields && card.uncertainFields.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-amber-600"
                          onClick={() => {
                            setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, isRecovering: !c.isRecovering } : c));
                          }}
                          data-testid={`batch-card-fix-${idx}`}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Fix
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleBatchCardAnalyze(card)}
                        data-testid={`batch-card-analyze-${idx}`}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Analyze
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setBatchSingleAddCard(card)}
                        data-testid={`batch-card-add-${idx}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  )}
                  {card.status === "done" && batchProcessing && (
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                  {card.status === "failed" && !batchProcessing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-amber-600"
                      onClick={() => {
                        setBatchScannedCards(prev => prev.map((c, i) => i === idx ? {
                          ...c,
                          isRecovering: !c.isRecovering,
                          playerName: c.partialData?.playerName || c.playerName,
                          year: c.partialData?.year || c.year,
                          set: c.partialData?.set || c.set,
                          variation: c.partialData?.variation || c.variation,
                        } : c));
                      }}
                      data-testid={`batch-card-recover-${idx}`}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Recover
                    </Button>
                  )}
                  {card.status === "failed" && batchProcessing && (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  {card.status === "processing" && (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  )}
                </div>

                {card.isRecovering && !batchProcessing && (
                  <div className="px-3 pb-3 pt-1 border-t border-dashed space-y-3" data-testid={`batch-card-recovery-${idx}`}>
                    <p className="text-xs text-muted-foreground">Fill in the missing details to recover this card:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          Player Name
                          {card.fieldConfidence?.playerName && !card.fieldConfidence.playerName.confident && <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />}
                        </Label>
                        <Input
                          value={card.playerName || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, playerName: e.target.value } : c))}
                          className={`h-8 text-xs ${card.fieldConfidence?.playerName && !card.fieldConfidence.playerName.confident ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                          placeholder="Player name"
                          data-testid={`batch-recovery-player-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Year</Label>
                        <Input
                          value={card.year || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, year: e.target.value } : c))}
                          className={`h-8 text-xs ${card.fieldConfidence?.year && !card.fieldConfidence.year.confident ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                          placeholder="Year"
                          data-testid={`batch-recovery-year-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Set</Label>
                        <Input
                          value={card.set || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, set: e.target.value } : c))}
                          className={`h-8 text-xs ${card.fieldConfidence?.setName && !card.fieldConfidence.setName.confident ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                          placeholder="Set name"
                          data-testid={`batch-recovery-set-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Variation</Label>
                        <Input
                          value={card.variation || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, variation: e.target.value } : c))}
                          className={`h-8 text-xs ${card.fieldConfidence?.variation && !card.fieldConfidence.variation.confident ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                          placeholder="Variation / Parallel"
                          data-testid={`batch-recovery-variation-${idx}`}
                        />
                        {card.parallelSuggestions && card.parallelSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {card.parallelSuggestions.slice(0, 6).map(s => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, variation: s } : c))}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${card.variation === s ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Grade</Label>
                        <Input
                          value={card.grade || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, grade: e.target.value } : c))}
                          className="h-8 text-xs"
                          placeholder="Grade"
                          data-testid={`batch-recovery-grade-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Card #</Label>
                        <Input
                          value={card.cardNumber || ""}
                          onChange={(e) => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, cardNumber: e.target.value } : c))}
                          className="h-8 text-xs"
                          placeholder="Card number"
                          data-testid={`batch-recovery-cardnumber-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!card.playerName?.trim()}
                        onClick={async () => {
                          if (card.scanHistoryId) {
                            try {
                              await apiRequest("PATCH", `/api/scan-history/${card.scanHistoryId}`, {
                                playerName: card.playerName || undefined,
                                year: card.year || undefined,
                                setName: card.set || undefined,
                                variation: card.variation || undefined,
                                grade: card.grade || undefined,
                                grader: card.grader || undefined,
                                sport: card.sport || undefined,
                                cardNumber: card.cardNumber || undefined,
                                scanConfidence: "medium",
                              });
                            } catch (err) {
                              console.error("Failed to persist recovery:", err);
                            }
                          }
                          setBatchScannedCards(prev => prev.map((c, i) => i === idx ? {
                            ...c,
                            status: "done" as const,
                            isRecovering: false,
                            error: undefined,
                            confidence: "medium",
                          } : c));
                          queryClient.invalidateQueries({ queryKey: ['/api/scan-history'] });
                          toast({ title: "Card recovered", description: `${card.playerName} saved with your corrections.` });
                        }}
                        data-testid={`batch-recovery-save-${idx}`}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setBatchScannedCards(prev => prev.map((c, i) => i === idx ? { ...c, isRecovering: false } : c))}
                        data-testid={`batch-recovery-cancel-${idx}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleBatchCardAnalyze(card)}
                        data-testid={`batch-recovery-analyze-${idx}`}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Analyze Instead
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!batchProcessing && (
            <div className="flex justify-center gap-3 pt-2">
              {batchScannedCards.some(c => c.status === "done" && c.scanHistoryId) && (
                <Button onClick={() => setShowBatchAddDialog(true)} data-testid="button-batch-add-all-bottom">
                  <Plus className="h-4 w-4 mr-2" />
                  Add All to Collection
                </Button>
              )}
              <Button variant="outline" onClick={handleBatchDone} data-testid="button-batch-view-history">
                <History className="h-4 w-4 mr-2" />
                View All in Scan History
              </Button>
            </div>
          )}
        </CardContent>
      )}

      {/* Add to Portfolio Dialog for new confirmation workflow */}
      <Dialog open={showConfirmedAddDialog} onOpenChange={setShowConfirmedAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Display Case</DialogTitle>
            <DialogDescription>
              Choose which display case to add "{title}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Card Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {scanPreviewUrl && (
                <img 
                  src={scanPreviewUrl} 
                  alt="Card" 
                  className="w-12 h-16 object-contain rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{title}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {[year, set, variation].filter(Boolean).join(" • ")}
                </p>
                {grade && grader && (
                  <p className="text-sm text-muted-foreground">
                    {grader === "raw" ? "Raw" : `${grader} ${grade}`}
                  </p>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Select Display Case</Label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger data-testid="select-confirmed-display-case">
                  <SelectValue placeholder="Choose a display case" />
                </SelectTrigger>
                <SelectContent>
                  {userCases.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {userCases.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You don't have any display cases yet. Create one first from your dashboard.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowConfirmedAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addConfirmedCardMutation.mutate()}
                disabled={!selectedCaseId || addConfirmedCardMutation.isPending}
                data-testid="button-confirm-add-confirmed"
              >
                {addConfirmedCardMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Card"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchAddDialog} onOpenChange={setShowBatchAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add All Cards to Collection</DialogTitle>
            <DialogDescription>
              Add {batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId).length} scanned card{batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId).length !== 1 ? "s" : ""} to a display case.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="max-h-48 overflow-y-auto space-y-2">
              {batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId).map((card, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                  {card.imageUrl && (
                    <img src={card.imageUrl} alt="Card" className="w-10 h-14 object-contain rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{card.playerName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[card.year, card.set, card.variation].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Select Display Case</Label>
              <Select value={batchAddCaseId} onValueChange={setBatchAddCaseId}>
                <SelectTrigger data-testid="select-batch-display-case">
                  <SelectValue placeholder="Choose a display case" />
                </SelectTrigger>
                <SelectContent>
                  {userCases.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {userCases.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You don't have any display cases yet. Create one first from your dashboard.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBatchAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBatchAddAll}
                disabled={!batchAddCaseId || batchAdding}
                data-testid="button-confirm-batch-add"
              >
                {batchAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding {batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId).length} Cards...
                  </>
                ) : (
                  `Add ${batchScannedCards.filter(c => c.status === "done" && c.scanHistoryId).length} Cards`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!batchSingleAddCard} onOpenChange={(open) => { if (!open) { setBatchSingleAddCard(null); setBatchSingleAddCaseId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Display Case</DialogTitle>
            <DialogDescription>
              Choose which display case to add "{batchSingleAddCard?.playerName}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {batchSingleAddCard && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                {batchSingleAddCard.imageUrl && (
                  <img src={batchSingleAddCard.imageUrl} alt="Card" className="w-12 h-16 object-contain rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{batchSingleAddCard.playerName}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {[batchSingleAddCard.year, batchSingleAddCard.set, batchSingleAddCard.variation].filter(Boolean).join(" · ")}
                  </p>
                  {batchSingleAddCard.grade && (
                    <p className="text-sm text-muted-foreground">
                      {batchSingleAddCard.grader === "raw" ? "Raw" : `${batchSingleAddCard.grader || ""} ${batchSingleAddCard.grade}`}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Select Display Case</Label>
              <Select value={batchSingleAddCaseId} onValueChange={setBatchSingleAddCaseId}>
                <SelectTrigger data-testid="select-batch-single-display-case">
                  <SelectValue placeholder="Choose a display case" />
                </SelectTrigger>
                <SelectContent>
                  {userCases.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {userCases.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You don't have any display cases yet. Create one first from your dashboard.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setBatchSingleAddCard(null); setBatchSingleAddCaseId(""); }}>
                Cancel
              </Button>
              <Button
                onClick={handleBatchSingleAdd}
                disabled={!batchSingleAddCaseId || batchSingleAdding}
                data-testid="button-confirm-batch-single-add"
              >
                {batchSingleAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Card"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SuccessOverlay
        show={showAnalysisSuccess}
        message="Analysis Complete!"
        onComplete={() => {
          setShowAnalysisSuccess(false);
          if (result) {
            toast({ title: "Analysis complete", description: `Got ${result.action} recommendation for ${title}` });
          }
        }}
      />
    </Card>
  );
}

// Helper to extract player name from card title (usually first part before year/set info)
function extractPlayerName(cardTitle: string): string {
  // Common patterns: "Patrick Mahomes 2023 Panini", "LeBron James Rookie", etc.
  // Try to extract just the player name portion
  const cleaned = cardTitle
    .replace(/\d{4}/g, '') // Remove years
    .replace(/\s+(PSA|BGS|SGC|CGC)\s*\d*/gi, '') // Remove grading
    .replace(/\s+(Rookie|RC|Auto|Autograph|Refractor|Prizm|Mosaic|Chrome|Topps|Panini|Bowman|Select|Optic)/gi, '')
    .replace(/\s+#\d+/g, '') // Remove card numbers
    .trim();
  
  // Return first 2-3 words as likely player name, fallback to cleaned title
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return words.slice(0, 3).join(' ');
  }
  return cleaned || cardTitle;
}

function CardOutlookRow({ card, isPro, showDetails = true, canAnalyze = false, onAnalyze }: { 
  card: CardType; 
  isPro: boolean; 
  showDetails?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Use card's stored player name and sport, fallback to extraction from title
  const playerName = card.playerName || extractPlayerName(card.title);
  const sport = card.sport || 'football'; // Default to football if not specified
  // Player key must match server normalization: all lowercase, no spaces/special chars
  const playerKey = `${sport}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  
  // Check if player is in watchlist
  const { data: watchlistStatus } = useQuery({
    queryKey: ['/api/unified-watchlist/check', { type: 'player', playerKey }],
    queryFn: async () => {
      const res = await fetch(`/api/unified-watchlist/check?type=player&playerKey=${encodeURIComponent(playerKey)}`);
      if (!res.ok) return { watching: false };
      return res.json();
    },
    enabled: card.outlookAction === 'MONITOR' && isPro,
  });

  // Add to watchlist mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/unified-watchlist', {
        itemType: 'player',
        playerKey,
        playerName,
        sport,
        actionAtAdd: card.outlookAction,
        estimatedValueAtAdd: card.estimatedValue,
        source: 'market-outlook',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/unified-watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['/api/unified-watchlist/check', { type: 'player', playerKey }] });
      toast({ title: 'Added to Watchlist', description: `${playerName} added to your watchlist` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/cards/${card.id}/outlook-v2`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      toast({ title: "Analysis started", description: "Running in background — you can navigate away." });
      onAnalyze?.();
      navigate(`/card/${card.id}/outlook`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const hasOutlook = card.outlookAction !== null;
  const isBigMover = card.outlookBigMover === true;
  const isMonitor = card.outlookAction === 'MONITOR';
  const isInWatchlist = watchlistStatus?.watching ?? false;

  const handleRowClick = () => {
    if (hasOutlook && isPro) {
      navigate(`/card/${card.id}/outlook`);
    }
  };

  return (
    <div 
      className={`flex items-center gap-4 p-4 border rounded-lg hover-elevate ${hasOutlook && isPro ? 'cursor-pointer' : ''}`} 
      data-testid={`outlook-row-${card.id}`}
      onClick={handleRowClick}
    >
      <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {card.imagePath ? (
          <img 
            src={card.imagePath.startsWith('/objects/') ? card.imagePath : `/objects/${card.imagePath}`}
            alt={card.title}
            className="h-full w-full object-contain"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const fallback = target.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="h-full w-full flex items-center justify-center text-muted-foreground"
          style={{ display: card.imagePath ? 'none' : 'flex' }}
        >
          <ImageIcon className="h-6 w-6 opacity-30" />
        </div>
        {isBigMover && isPro && (
          <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
            <Zap className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium truncate" data-testid={`text-card-title-${card.id}`}>{card.title}</h3>
          {isBigMover && isPro && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 gap-1">
              <Zap className="h-3 w-3" />
              Big Mover
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {card.year} {card.set} {card.variation ? `- ${card.variation}` : ""} {card.grade ? `(${card.grade})` : ""}
        </p>
        {showDetails && isPro && hasOutlook && card.outlookExplanationShort && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {card.outlookExplanationShort}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {hasOutlook && isPro ? (
          <>
            <Badge variant="outline" className={`gap-1 ${getActionColor(card.outlookAction)}`}>
              {getActionIcon(card.outlookAction)}
              {getActionLabel(card.outlookAction)}
            </Badge>
            {showDetails && card.outlookUpsideScore !== null && (
              <div className="text-xs text-muted-foreground hidden sm:block">
                <span className="text-green-600 dark:text-green-400">{card.outlookUpsideScore}</span>
                /
                <span className="text-red-600 dark:text-red-400">{card.outlookRiskScore}</span>
              </div>
            )}
            {isMonitor && !isInWatchlist && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                onClick={(e) => {
                  e.stopPropagation();
                  addToWatchlistMutation.mutate();
                }}
                disabled={addToWatchlistMutation.isPending}
                data-testid={`button-add-watchlist-${card.id}`}
              >
                {addToWatchlistMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Star className="h-3 w-3" />
                    <span className="hidden sm:inline">Watch</span>
                  </>
                )}
              </Button>
            )}
            {isMonitor && isInWatchlist && (
              <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                <Star className="h-3 w-3 fill-current" />
                Watching
              </Badge>
            )}
          </>
        ) : hasOutlook && !isPro ? (
          <Badge variant="secondary" className="gap-1">
            <Crown className="h-3 w-3" />
            Pro to view
          </Badge>
        ) : canAnalyze ? (
          <Button 
            size="sm" 
            variant="outline"
            onClick={(e) => { e.stopPropagation(); generateMutation.mutate(); }}
            disabled={generateMutation.isPending}
            data-testid={`button-generate-outlook-${card.id}`}
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Analyze
              </>
            )}
          </Button>
        ) : (
          <Link href="/upgrade">
            <Badge variant="secondary" className="gap-1 cursor-pointer">
              <Crown className="h-3 w-3" />
              Upgrade
            </Badge>
          </Link>
        )}
        
        {hasOutlook && isPro && (
          <Link href={`/card/${card.id}/outlook`}>
            <Button size="icon" variant="ghost" data-testid={`button-view-outlook-${card.id}`}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function OutlookOverviewPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isPro = hasProAccess(user);

  const { data: cases, isLoading } = useQuery<CaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated,
  });

  const { data: usage } = useQuery<UsageInfo>({
    queryKey: ["/api/user/outlook-usage"],
    enabled: isAuthenticated,
  });

  const { data: batchStatus } = useBatchStatus();
  const batchIsRunning = batchStatus?.status === "running";

  const startBatchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cards/batch-outlook"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards/batch-outlook/status"] });
    },
    onError: (err: any) => {
      console.warn("[BatchAnalysis] Failed to start:", err.message);
    },
  });

  const canAnalyze = isPro || (usage?.remaining != null && usage.remaining > 0);

  const allCards = cases?.flatMap(c => c.cards) || [];
  const cardsWithOutlook = allCards.filter(c => c.outlookAction !== null);
  const bigMovers = allCards.filter(c => c.outlookBigMover === true);
  const cardsWithoutOutlook = allCards.filter(c => c.outlookAction === null);

  const buyCards = cardsWithOutlook.filter(c => c.outlookAction === "BUY");
  const sellCards = cardsWithOutlook.filter(c => c.outlookAction === "SELL");
  const monitorCards = cardsWithOutlook.filter(c => c.outlookAction === "MONITOR");
  const holdCards = cardsWithOutlook.filter(c => c.outlookAction === "LONG_HOLD");

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view Market Outlook</h2>
        <p className="text-muted-foreground mb-6">Get AI-powered buy/sell recommendations for your card collection.</p>
        <a href="/api/login">
          <Button data-testid="button-signin">Sign In</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Market Outlook</h1>
          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30" data-testid="badge-scope-collection">Your Collection</Badge>
        </div>
        <p className="text-muted-foreground">
          Buy, sell, and hold recommendations based on AI analysis of cards <span className="font-medium">you own</span>. For market-wide signals across all collectors, see{" "}
          <Link href="/alpha" className="text-primary hover:underline">Daily Alpha</Link>.
        </p>
        <div className="mt-4">
          <Link href="/player-outlook">
            <Button variant="outline" className="gap-2" data-testid="link-player-outlook">
              <TrendingUp className="h-4 w-4" />
              Try Player Outlook
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {!isPro && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div className="flex items-center gap-3">
              {usage?.remaining != null && usage.remaining > 0 ? (
                <Sparkles className="h-6 w-6 text-primary" />
              ) : (
                <Crown className="h-6 w-6 text-primary" />
              )}
              <div>
                {usage?.remaining != null && usage.remaining > 0 ? (
                  <>
                    <p className="font-medium">
                      {usage.remaining} free {usage.remaining === 1 ? "analysis" : "analyses"} remaining this month
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and full insights.
                    </p>
                  </>
                ) : usage?.remaining === 0 ? (
                  <>
                    <p className="font-medium">You've used all free analyses this month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses and full access to Market Outlook.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Get 3 free analyses per month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and detailed insights.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Link href="/upgrade">
              <Button data-testid="button-upgrade">Upgrade to Pro</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <QuickAnalyzeSection 
        canAnalyze={isPro || (usage?.remaining != null && usage.remaining > 0)} 
        userCases={cases?.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt, updatedAt: c.updatedAt, userId: c.userId, description: c.description, isPublic: c.isPublic, theme: c.theme, layout: c.layout, showCardCount: c.showCardCount, showTotalValue: c.showTotalValue, viewCount: c.viewCount })) || []}
        isPro={isPro}
      />

      {isLoading ? (
        <OutlookSkeleton />
      ) : (
        <>
          {/* Portfolio Summary with contextual insights */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cards</CardDescription>
                <CardTitle className="text-2xl" data-testid="text-total-cards">{allCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {cardsWithoutOutlook.length > 0 
                    ? `${cardsWithoutOutlook.length} awaiting analysis`
                    : "All cards analyzed"
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Analyzed</CardDescription>
                <CardTitle className="text-2xl text-primary" data-testid="text-analyzed-cards">{cardsWithOutlook.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {allCards.length > 0 
                    ? `${Math.round((cardsWithOutlook.length / allCards.length) * 100)}% coverage`
                    : "Add cards to analyze"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={bigMovers.length > 0 ? "border-purple-500/30 bg-purple-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-purple-500" />
                  Big Movers
                </CardDescription>
                <CardTitle className="text-2xl text-purple-600 dark:text-purple-400" data-testid="text-big-movers">{bigMovers.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {bigMovers.length > 0 
                    ? "High upside, moderate risk"
                    : "None detected yet"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={buyCards.length > 0 ? "border-green-500/30 bg-green-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-green-500" />
                  Buy
                </CardDescription>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400" data-testid="text-buy-cards">{buyCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {buyCards.length > 0 
                    ? "Good entry points identified"
                    : "No clear buys right now"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={sellCards.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Sell
                </CardDescription>
                <CardTitle className="text-2xl text-red-600 dark:text-red-400" data-testid="text-sell-cards">{sellCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {sellCards.length > 0 
                    ? "Consider taking profits"
                    : "Nothing to exit now"
                  }
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Context line when few cards analyzed */}
          {cardsWithOutlook.length < 3 && allCards.length > 0 && (
            <div className="mb-6 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Analyze more cards to see patterns. With only {cardsWithOutlook.length} analyzed, it's too early for portfolio-level insights.
            </div>
          )}

          {bigMovers.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-purple-500" />
                <h2 className="text-xl font-semibold">Big Movers</h2>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                  {bigMovers.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards with asymmetric upside potential - high reward with moderate risk.
              </p>
              <div className="space-y-2">
                {bigMovers.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {buyCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="h-5 w-5 text-green-500" />
                <h2 className="text-xl font-semibold">Buy Recommendations</h2>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                  {buyCards.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards in your collection where individual analysis suggests buying more. Based on each card's market data, not broader market trends.
              </p>
              <div className="space-y-2">
                {buyCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {sellCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="text-xl font-semibold">Sell Recommendations</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                  {sellCards.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards in your collection where individual analysis suggests considering an exit. Based on each card's market data and player outlook.
              </p>
              <div className="space-y-2">
                {sellCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {holdCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" />
                <h2 className="text-xl font-semibold">Long Hold</h2>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  {holdCards.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards in your collection with stable long-term value. These players have established careers worth holding onto.
              </p>
              <div className="space-y-2">
                {holdCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {monitorCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">Monitor List</h2>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                  {monitorCards.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                AI suggests monitoring these players. Add them to your personal watchlist to track outlook changes.
              </p>
              <div className="space-y-2">
                {monitorCards.map((card: CardType) => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {cardsWithoutOutlook.length > 0 && isPro && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Pending Analysis</h2>
                  <Badge variant="secondary">
                    {cardsWithoutOutlook.length}
                  </Badge>
                </div>
                <Button
                  onClick={() => startBatchMutation.mutate()}
                  disabled={batchIsRunning || startBatchMutation.isPending}
                  size="sm"
                  data-testid="button-analyze-all"
                >
                  {batchIsRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      Analyze All ({cardsWithoutOutlook.length})
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {batchIsRunning
                  ? "Analysis is running in the background — you can navigate away and it will continue."
                  : `These cards haven't been analyzed yet. Use "Analyze All" to run analysis on every card, or click individual cards below.`}
              </p>
              <div className="space-y-2">
                {cardsWithoutOutlook.slice(0, 10).map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
                {cardsWithoutOutlook.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    And {cardsWithoutOutlook.length - 10} more cards...
                  </p>
                )}
              </div>
            </div>
          )}

          {allCards.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add some cards to your display cases to get AI-powered outlook analysis.
                </p>
                <Link href="/cases/new">
                  <Button>Create Display Case</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
