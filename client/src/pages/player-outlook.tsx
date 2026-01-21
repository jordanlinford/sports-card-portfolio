import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { PlayerAutocomplete } from "@/components/player-autocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSearch } from "wouter";
import { 
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Thermometer,
  Snowflake,
  Activity,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Eye,
  Ban,
  Target,
  Layers,
  Zap,
  DollarSign,
  Users,
  ArrowRight,
  Crown,
  RefreshCw,
  Loader2,
  BarChart3,
  BookOpen,
  ExternalLink,
  Star,
  StarOff,
  Sparkles,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShareSnapshotButton } from "@/components/share-snapshot-button";
import { InvestmentCallCard } from "@/components/investment-call-card";
import { AdvisorSnapshot } from "@/components/outlook/AdvisorSnapshot";
import { OutlookAccordions } from "@/components/outlook/OutlookAccordions";
import { transformToAdvisorOutlook, applyVerdictGuardrails } from "@/lib/transformToAdvisorOutlook";
import type { PlayerOutlookResponse, StockTier, MarketTemperature, VolatilityLevel, RiskLevel, PlayerVerdict, BuyerProfile, LiquidityLevel, VerdictModifier, DiscountAnalysis, InvestmentCall, PeakTimingAssessment, TieredRecommendations, TeamContext, AdvisorOutlook } from "@shared/schema";

function getTemperatureIcon(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-4 w-4" />;
    case "WARM": return <Thermometer className="h-4 w-4" />;
    case "NEUTRAL": return <Minus className="h-4 w-4" />;
    case "COOLING": return <Snowflake className="h-4 w-4" />;
    default: return null;
  }
}

function getTemperatureColor(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WARM": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "NEUTRAL": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "COOLING": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVolatilityColor(vol: VolatilityLevel) {
  switch (vol) {
    case "HIGH": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "MEDIUM": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "LOW": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case "HIGH": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "MEDIUM": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "LOW": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVerdictIcon(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return <ShoppingCart className="h-5 w-5" />;
    case "MONITOR": return <Eye className="h-5 w-5" />;
    case "AVOID": return <Ban className="h-5 w-5" />;
    default: return null;
  }
}

function getVerdictColor(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "AVOID": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getTierIcon(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return <Crown className="h-4 w-4" />;
    case "GROWTH": return <TrendingUp className="h-4 w-4" />;
    case "CORE": return <Target className="h-4 w-4" />;
    case "COMMON": return <Layers className="h-4 w-4" />;
    case "SPECULATIVE": return <Zap className="h-4 w-4" />;
    default: return null;
  }
}

function getTierColor(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "GROWTH": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "CORE": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "COMMON": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "SPECULATIVE": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getLiquidityLabel(liq: LiquidityLevel) {
  switch (liq) {
    case "HIGH": return "High volume (likely higher)";
    case "MEDIUM": return "Moderate liquidity";
    case "LOW": return "Lower activity in sample";
    default: return "";
  }
}

function getBuyerProfileLabel(profile: BuyerProfile) {
  switch (profile) {
    case "FLIPPER": return "Best for: Quick flips";
    case "COLLECTOR": return "Best for: Collectors";
    case "INVESTOR": return "Best for: Long-term investors";
    case "BUDGET": return "Best for: Budget collectors";
    default: return "";
  }
}

function getModifierColor(modifier: VerdictModifier) {
  switch (modifier) {
    case "Speculative": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "Momentum": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "Value": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "Long-Term": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "Late Cycle": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function PlayerOutlookSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function PlayerHeader({ player, snapshot }: { player: PlayerOutlookResponse["player"]; snapshot: PlayerOutlookResponse["snapshot"] }) {
  const { data: imageData } = useQuery({
    queryKey: ["/api/player-image", player.name, player.sport],
    queryFn: async () => {
      const res = await fetch(`/api/player-image?name=${encodeURIComponent(player.name)}&sport=${encodeURIComponent(player.sport)}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const initials = player.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4" data-testid="player-header">
      <Avatar className="h-16 w-16 border-2 border-primary/20">
        {imageData?.imageUrl && (
          <AvatarImage src={imageData.imageUrl} alt={player.name} />
        )}
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-xl font-bold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <h1 className="text-2xl font-bold" data-testid="text-player-name">{player.name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
          <span>{player.sport.toUpperCase()}</span>
          {player.position && player.position.toUpperCase() !== "UNKNOWN" && (
            <><span className="text-border">|</span><span>{player.position}</span></>
          )}
          {player.team && player.team.toUpperCase() !== "UNKNOWN" && (
            <><span className="text-border">|</span><span>{player.team}</span></>
          )}
          {player.stage && player.stage.toUpperCase() !== "UNKNOWN" && (
            <><span className="text-border">|</span><span>{player.stage.replace("_", " ")}</span></>
          )}
          {player.inferred && (
            <Badge variant="outline" className="text-xs">Inferred</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className={`${getTemperatureColor(snapshot.temperature)} gap-1`} data-testid="badge-temperature">
          {getTemperatureIcon(snapshot.temperature)}
          {snapshot.temperature}
        </Badge>
        <Badge className={`${getVolatilityColor(snapshot.volatility)} gap-1`} data-testid="badge-volatility">
          <Activity className="h-3 w-3" />
          {snapshot.volatility} Vol
        </Badge>
        <Badge className={`${getRiskColor(snapshot.risk)} gap-1`} data-testid="badge-risk">
          <AlertTriangle className="h-3 w-3" />
          {snapshot.risk} Risk
        </Badge>
        <Badge variant="outline" className="gap-1" data-testid="badge-horizon">
          <Clock className="h-3 w-3" />
          {snapshot.horizon} Term
        </Badge>
      </div>
    </div>
  );
}

function ThesisCard({ thesis }: { thesis: string[] }) {
  return (
    <Card data-testid="card-thesis">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Player Stock Thesis
        </CardTitle>
        <CardDescription>Why this player is positioned the way they are</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {thesis.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-primary mt-1">
                {i === thesis.length - 1 && bullet.toLowerCase().includes("risk") ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
              <span className="text-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function VerdictCard({ verdict, confidence }: { verdict: PlayerOutlookResponse["verdict"]; confidence: string }) {
  return (
    <Card className={`border-2 ${getVerdictColor(verdict.action)}`} data-testid="card-verdict">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            Investment Verdict
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {confidence} Conviction (Thesis Confidence)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`p-3 rounded-lg ${getVerdictColor(verdict.action)}`}>
            {getVerdictIcon(verdict.action)}
          </div>
          <span className="text-3xl font-bold" data-testid="text-verdict-action">{verdict.action}</span>
          {verdict.modifier && (
            <Badge className={`${getModifierColor(verdict.modifier)} text-sm`} data-testid="badge-verdict-modifier">
              {verdict.modifier}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-verdict-summary">{verdict.summary}</p>
        {verdict.whatMustBeTrue && verdict.whatMustBeTrue.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">What must be true:</p>
            <ul className="space-y-1">
              {verdict.whatMustBeTrue.map((condition, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {condition}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeakTimingCard({ peakTiming, teamContext }: { peakTiming?: PeakTimingAssessment; teamContext?: TeamContext }) {
  if (!peakTiming) return null;
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "PRE_PEAK": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30";
      case "AT_PEAK": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
      case "POST_PEAK": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PRE_PEAK": return <TrendingUp className="h-4 w-4" />;
      case "AT_PEAK": return <Flame className="h-4 w-4" />;
      case "POST_PEAK": return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PRE_PEAK": return "Pre-Peak (Still Rising)";
      case "AT_PEAK": return "At Peak (Maximum Visibility)";
      case "POST_PEAK": return "Post-Peak (May Be Declining)";
      default: return "Unknown";
    }
  };
  
  return (
    <Card className="border-2 border-primary/20" data-testid="card-peak-timing">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Peak Timing Assessment
          </CardTitle>
          <Badge className={getStatusColor(peakTiming.peakStatus)} data-testid="badge-peak-status">
            {getStatusIcon(peakTiming.peakStatus)}
            <span className="ml-1">{getStatusLabel(peakTiming.peakStatus)}</span>
          </Badge>
        </div>
        <CardDescription>When is the right time to buy or sell?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">{peakTiming.peakReason}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">Short-Term (3-6 months)</p>
            <p className="text-sm text-foreground">{peakTiming.shortTermOutlook}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">Long-Term (1-2 years)</p>
            <p className="text-sm text-foreground">{peakTiming.longTermOutlook}</p>
          </div>
        </div>
        
        {teamContext && teamContext.playoffOutlook !== "UNKNOWN" && (
          <div className="pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Team Context</p>
            <div className="flex flex-wrap gap-2">
              {teamContext.playoffOutlook !== "UNKNOWN" && (
                <Badge variant="outline" className="text-xs">
                  Playoff: {teamContext.playoffOutlook}
                </Badge>
              )}
              {teamContext.teamMomentum !== "UNKNOWN" && (
                <Badge variant="outline" className="text-xs">
                  Team: {teamContext.teamMomentum}
                </Badge>
              )}
              {teamContext.narrativeStrength !== "UNKNOWN" && (
                <Badge variant="outline" className="text-xs">
                  Narrative: {teamContext.narrativeStrength}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TieredRecommendationsCard({ recommendations }: { recommendations?: TieredRecommendations }) {
  if (!recommendations) return null;
  
  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
      case "HOLD": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      case "SELL": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };
  
  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case "BUY": return <ShoppingCart className="h-4 w-4" />;
      case "HOLD": return <Eye className="h-4 w-4" />;
      case "SELL": return <ArrowRight className="h-4 w-4" />;
      default: return null;
    }
  };
  
  const allTiers = [
    { key: "baseCards", label: "Base Cards", description: "Common base cards ($1-5)", data: recommendations.baseCards },
    { key: "midTierParallels", label: "Mid-Tier Parallels", description: "Numbered parallels, inserts ($10-100)", data: recommendations.midTierParallels },
    { key: "premiumGraded", label: "Premium Graded", description: "PSA 10 rookies, low serial autos ($100+)", data: recommendations.premiumGraded },
  ];
  
  const validTiers = allTiers.filter((tier): tier is { key: string; label: string; description: string; data: { verdict: "SELL" | "HOLD" | "BUY"; reasoning: string } } => 
    tier.data != null && tier.data.verdict != null
  );
  
  if (validTiers.length === 0) return null;
  
  return (
    <Card data-testid="card-tiered-recommendations">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Tiered Card Strategy
        </CardTitle>
        <CardDescription>Different advice for different card types</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {validTiers.map((tier) => (
          <div 
            key={tier.key} 
            className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3"
            data-testid={`tier-${tier.key}`}
          >
            <div className="flex items-center gap-3 flex-1">
              <Badge className={`${getVerdictColor(tier.data.verdict)} min-w-[60px] justify-center`}>
                {getVerdictIcon(tier.data.verdict)}
                <span className="ml-1">{tier.data.verdict}</span>
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-medium">{tier.label}</p>
                <p className="text-xs text-muted-foreground">{tier.description}</p>
              </div>
            </div>
            <p className="text-sm text-foreground sm:max-w-[50%] sm:text-right">{tier.data.reasoning}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MarketRealityCheckCard({ checks }: { checks: string[] }) {
  if (!checks || checks.length === 0) return null;
  
  return (
    <Card className="border-dashed border-yellow-500/30 bg-yellow-500/5" data-testid="card-market-reality-check">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          Market Reality Check
        </CardTitle>
        <CardDescription>Uncomfortable truths you should consider</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {checks.map((check, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-yellow-600 dark:text-yellow-400 mt-1">
                <Minus className="h-4 w-4" />
              </span>
              <span className="text-foreground">{check}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DiscountAnalysisCard({ analysis }: { analysis?: DiscountAnalysis }) {
  const [isOpen, setIsOpen] = useState(true);
  
  if (!analysis || (!analysis.whyDiscounted?.length && !analysis.repricingCatalysts?.length && !analysis.trapRisks?.length)) {
    return null;
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-emerald-500/30 bg-emerald-500/5" data-testid="card-discount-analysis">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Hidden Gem Analysis
              </CardTitle>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            <CardDescription>Why this player might be underpriced and what could change</CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {analysis.whyDiscounted && analysis.whyDiscounted.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Why Discounted</h4>
                <ul className="space-y-2">
                  {analysis.whyDiscounted.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-600 dark:text-emerald-400 mt-1">
                        <DollarSign className="h-4 w-4" />
                      </span>
                      <span className="text-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysis.repricingCatalysts && analysis.repricingCatalysts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Repricing Catalysts</h4>
                <ul className="space-y-2">
                  {analysis.repricingCatalysts.map((catalyst, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-blue-600 dark:text-blue-400 mt-1">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                      <span className="text-foreground">{catalyst}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysis.trapRisks && analysis.trapRisks.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Trap Risks</h4>
                <ul className="space-y-2">
                  {analysis.trapRisks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-600 dark:text-red-400 mt-1">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <span className="text-foreground">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function ExposureRecommendations({ exposures }: { exposures: PlayerOutlookResponse["exposures"] }) {
  return (
    <Card data-testid="card-exposures">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Card Exposure Recommendations
        </CardTitle>
        <CardDescription>Stock tiers ranked by fit for this player</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {exposures.map((exp, i) => (
          <div key={i} className="p-4 rounded-lg border hover-elevate" data-testid={`exposure-${exp.tier.toLowerCase()}`}>
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${getTierColor(exp.tier)} gap-1`}>
                  {getTierIcon(exp.tier)}
                  {exp.tier}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <DollarSign className="h-3 w-3 mr-1" />
                  {exp.liquidity} Liquidity
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {getBuyerProfileLabel(exp.buyerProfile)}
              </span>
            </div>
            <p className="text-sm text-foreground mb-2">{exp.why}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {exp.cardTargets.map((target, j) => (
                <Badge key={j} variant="secondary" className="text-xs font-normal">
                  {target}
                </Badge>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {exp.riskNote}
              </p>
              {exp.timingGuidance && (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1" data-testid={`timing-${exp.tier.toLowerCase()}`}>
                  <Clock className="h-3 w-3" />
                  <span className="font-medium">Best Entry:</span> {exp.timingGuidance}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EvidencePanel({ evidence, cacheStatus }: { evidence: PlayerOutlookResponse["evidence"]; cacheStatus?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card data-testid="card-evidence">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Supporting Evidence
              </CardTitle>
              <div className="flex items-center gap-2">
                {cacheStatus && (
                  <Badge variant="outline" className="text-xs">
                    {cacheStatus === "fresh" ? "Live" : cacheStatus === "stale" ? "Updating..." : "New"}
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
            <CardDescription>Click to expand data sources and notes</CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {evidence.compsSummary?.available && evidence.compsSummary.median && (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Price Estimate</p>
                  {evidence.compsSummary.source === "modeled" && (
                    <Badge variant="secondary" className="text-xs">
                      Modeled Estimate
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-foreground">
                    ${evidence.compsSummary.low?.toFixed(0) || evidence.compsSummary.median.toFixed(0)} - ${evidence.compsSummary.high?.toFixed(0) || evidence.compsSummary.median.toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">
                    Mid: ${evidence.compsSummary.median.toFixed(0)}
                  </span>
                  {evidence.compsSummary.soldCount && (
                    <span className="text-muted-foreground">{evidence.compsSummary.soldCount} recent sales</span>
                  )}
                </div>
                {evidence.compsSummary.source === "modeled" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Based on player profile, position, and market conditions. Not live market data.
                  </p>
                )}
              </div>
            )}
            {evidence.referenceComps && evidence.referenceComps.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Reference Cards</p>
                <div className="space-y-2">
                  {evidence.referenceComps.map((comp, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                      <span className="text-muted-foreground">{comp.cardType}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">~${comp.estimatedValue}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {comp.liquidity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {evidence.notes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Analysis Notes</p>
                <ul className="space-y-1">
                  {evidence.notes.map((note, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evidence.newsSnippets && evidence.newsSnippets.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Recent News Context</p>
                <ul className="space-y-2">
                  {evidence.newsSnippets.map((snippet, i) => (
                    <li key={i} className="text-sm text-muted-foreground p-2 rounded bg-muted/30">
                      "{snippet}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evidence.lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(evidence.lastUpdated).toLocaleString()}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function PlayerOutlookPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [playerName, setPlayerName] = useState("");
  const [sport, setSport] = useState("football");
  const [outlookData, setOutlookData] = useState<PlayerOutlookResponse | null>(null);
  const [outlookSport, setOutlookSport] = useState<string>("football");
  const [showSignupDialog, setShowSignupDialog] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedPlayerName, setSharedPlayerName] = useState<string | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const initialSearchDone = useRef(false);

  const playerKey = outlookData?.player?.name 
    ? `${outlookSport.toLowerCase()}:${outlookData.player.name.toLowerCase().trim().replace(/\s+/g, "_")}`
    : null;

  // Cache watchlist item ID locally for immediate access after adding
  const [cachedWatchlistItemId, setCachedWatchlistItemId] = useState<number | null>(null);

  // Use unified watchlist API for player watchlist
  const { data: watchlistStatus, refetch: refetchWatchlistStatus } = useQuery<{ watching: boolean; item?: { id: number } }>({
    queryKey: ["/api/unified-watchlist/check", { type: "player", playerKey }],
    queryFn: async () => {
      if (!playerKey) return { watching: false };
      const res = await fetch(`/api/unified-watchlist/check?type=player&playerKey=${encodeURIComponent(playerKey)}`);
      if (!res.ok) return { watching: false };
      return res.json();
    },
    enabled: !!playerKey && !!user,
  });

  // Update cached ID when query returns
  useEffect(() => {
    if (watchlistStatus?.item?.id) {
      setCachedWatchlistItemId(watchlistStatus.item.id);
    } else if (!watchlistStatus?.watching) {
      setCachedWatchlistItemId(null);
    }
  }, [watchlistStatus]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!outlookData || !playerKey) throw new Error("No outlook data");
      return await apiRequest("POST", "/api/unified-watchlist", {
        itemType: "player",
        playerKey,
        playerName: outlookData.player.name,
        sport: outlookSport,
        verdictAtAdd: outlookData.investmentCall?.verdict || outlookData.verdict?.modifier,
        actionAtAdd: outlookData.verdict?.action,
        temperatureAtAdd: outlookData.snapshot?.temperature,
        source: "player-outlook",
      });
    },
    onSuccess: (data: any) => {
      // Cache the returned ID immediately for instant removal availability
      if (data?.id) {
        setCachedWatchlistItemId(data.id);
      }
      refetchWatchlistStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/unified-watchlist"] });
      toast({
        title: "Added to watchlist",
        description: `${outlookData?.player?.name} is now on your watchlist.`,
      });
    },
    onError: (error: any) => {
      if (error?.message?.includes("already")) {
        refetchWatchlistStatus();
      } else {
        toast({
          title: "Error",
          description: error?.message || "Failed to add to watchlist",
          variant: "destructive",
        });
      }
    },
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async () => {
      // Use cached ID first, then fall back to query data
      const watchlistId = cachedWatchlistItemId || watchlistStatus?.item?.id;
      if (!watchlistId) {
        throw new Error("Unable to remove - please refresh the page");
      }
      return await apiRequest("DELETE", `/api/unified-watchlist/${watchlistId}`);
    },
    onSuccess: () => {
      setCachedWatchlistItemId(null);
      refetchWatchlistStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/unified-watchlist"] });
      toast({
        title: "Removed from watchlist",
        description: `${outlookData?.player?.name} has been removed from your watchlist.`,
      });
    },
    onError: (error: any) => {
      refetchWatchlistStatus();
      toast({
        title: "Error",
        description: error?.message || "Failed to remove from watchlist",
        variant: "destructive",
      });
    },
  });

  const isWatching = watchlistStatus?.watching ?? false;
  const watchlistItemId = cachedWatchlistItemId || watchlistStatus?.item?.id;
  const isWatchlistLoading = addToWatchlistMutation.isPending || removeFromWatchlistMutation.isPending;

  const handleToggleWatchlist = () => {
    if (isWatching && watchlistItemId) {
      removeFromWatchlistMutation.mutate();
    } else if (isWatching && !watchlistItemId) {
      // Status says watching but no ID available - this shouldn't happen with caching
      refetchWatchlistStatus();
      toast({
        title: "Syncing...",
        description: "Please try again in a moment.",
      });
    } else {
      addToWatchlistMutation.mutate();
    }
  };

  const outlookMutation = useMutation({
    mutationFn: async (data: { playerName: string; sport: string }) => {
      const result = await apiRequest("POST", "/api/player-outlook", data);
      return { data: result, sport: data.sport };
    },
    onSuccess: ({ data, sport: usedSport }) => {
      setOutlookData(data);
      setOutlookSport(usedSport);
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to get player outlook";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (initialSearchDone.current) return;
    const params = new URLSearchParams(search);
    const urlPlayer = params.get("player");
    const urlSport = params.get("sport");
    const isShared = params.get("shared") === "true";
    
    if (urlPlayer) {
      setPlayerName(urlPlayer);
      if (urlSport && ["football", "basketball", "baseball", "hockey", "soccer"].includes(urlSport)) {
        setSport(urlSport);
      }
      initialSearchDone.current = true;
      
      // If this is a shared link AND user is not logged in, fetch from public cache endpoint
      if (isShared && !user) {
        setIsSharedView(true);
        setSharedPlayerName(urlPlayer);
        setIsLoadingShared(true);
        
        // Convert player name to slug for API call
        const playerSlug = urlPlayer.toLowerCase().replace(/\s+/g, "-");
        const sportParam = urlSport || sport;
        
        fetch(`/api/player-outlook/shared/${playerSlug}?sport=${sportParam}`)
          .then(res => {
            if (!res.ok) {
              throw new Error("No cached analysis available");
            }
            return res.json();
          })
          .then(data => {
            setOutlookData(data);
            setOutlookSport(sportParam);
          })
          .catch(err => {
            console.log("No cached data for shared player, prompting signup");
            // No cached data - show signup prompt
            setShowSignupDialog(true);
          })
          .finally(() => {
            setIsLoadingShared(false);
          });
      } else {
        // User is logged in or not a shared link - use normal mutation
        setTimeout(() => {
          outlookMutation.mutate({ 
            playerName: urlPlayer, 
            sport: urlSport || sport 
          });
        }, 100);
      }
    }
  }, [search, user]);

  const handleSearch = () => {
    if (!playerName.trim()) {
      toast({
        title: "Enter a player name",
        description: "Please enter a player name to analyze.",
        variant: "destructive",
      });
      return;
    }
    // If user is not logged in, show signup dialog instead of running analysis
    if (!user) {
      setShowSignupDialog(true);
      return;
    }
    // Reset shared view state when user searches
    setIsSharedView(false);
    setSharedPlayerName(null);
    outlookMutation.mutate({ playerName: playerName.trim(), sport });
  };

  if (authLoading || isLoadingShared) {
    return (
      <div className="container max-w-6xl py-8 px-4">
        <PlayerOutlookSkeleton />
      </div>
    );
  }

  return (
    <>
      {/* Signup prompt dialog for unauthenticated users */}
      <Dialog open={showSignupDialog} onOpenChange={setShowSignupDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {isSharedView && outlookData ? "Want to Analyze More Players?" : "Unlock Player Analysis"}
            </DialogTitle>
            <DialogDescription>
              {isSharedView && outlookData 
                ? "Create a free account to analyze any player and get personalized investment verdicts."
                : "Create a free account to get AI-powered investment verdicts for any player. See who to buy, hold, or avoid."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Investment Verdicts</p>
                  <p className="text-xs text-muted-foreground">Get buy/hold/avoid recommendations</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Market Intelligence</p>
                  <p className="text-xs text-muted-foreground">See market temperature and risk levels</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Star className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">3 Free Analyses/Month</p>
                  <p className="text-xs text-muted-foreground">Analyze players before you buy cards</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowSignupDialog(false)} data-testid="button-cancel-signup">
              Maybe Later
            </Button>
            <a href="/api/login" className="w-full sm:w-auto">
              <Button className="w-full" data-testid="button-signup-free">
                Create Free Account
              </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    <div className="container max-w-6xl py-8 px-4 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Player Outlook</h1>
        <p className="text-muted-foreground">
          Analyze any player as a stock. Get investment verdicts and card exposure recommendations.
        </p>
      </div>

      <Card data-testid="card-search">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="playerName" className="sr-only">Player Name</Label>
              <PlayerAutocomplete
                id="playerName"
                placeholder="Enter player name (e.g., Shedeur Sanders)"
                value={playerName}
                onChange={setPlayerName}
                onSelect={(player) => {
                  setPlayerName(player.name);
                  if (player.sport) {
                    setSport(player.sport.toLowerCase());
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                data-testid="input-player-name"
              />
            </div>
            <div className="w-full sm:w-40">
              <Label htmlFor="sport" className="sr-only">Sport</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger id="sport" data-testid="select-sport">
                  <SelectValue placeholder="Sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="baseball">Baseball</SelectItem>
                  <SelectItem value="hockey">Hockey</SelectItem>
                  <SelectItem value="soccer">Soccer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleSearch} 
              disabled={outlookMutation.isPending}
              data-testid="button-search"
            >
              {outlookMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {outlookMutation.isPending && <PlayerOutlookSkeleton />}

      {outlookData && !outlookMutation.isPending && (() => {
        const advisorOutlook = applyVerdictGuardrails(transformToAdvisorOutlook(outlookData));
        return (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Shared view banner for unauthenticated users */}
          {isSharedView && !user && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">You're viewing a shared analysis</p>
                      <p className="text-sm text-muted-foreground">Sign up free to analyze any player and track your collection</p>
                    </div>
                  </div>
                  <a href="/api/login">
                    <Button size="sm" data-testid="button-signup-banner">
                      Create Free Account
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
          
          <PlayerHeader player={outlookData.player} snapshot={outlookData.snapshot} />
          
          <AdvisorSnapshot 
            advisor={advisorOutlook} 
            playerName={outlookData.player.name} 
          />

          <OutlookAccordions 
            advisor={advisorOutlook} 
            outlook={outlookData} 
          />
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                {/* Show full actions for authenticated users */}
                {user && (
                  <>
                    <Button 
                      variant={isWatching ? "secondary" : "default"}
                      onClick={handleToggleWatchlist}
                      disabled={isWatchlistLoading}
                      data-testid="button-toggle-watchlist"
                    >
                      {isWatchlistLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : isWatching ? (
                        <StarOff className="h-4 w-4 mr-2" />
                      ) : (
                        <Star className="h-4 w-4 mr-2" />
                      )}
                      {isWatching ? "Remove from Watchlist" : "Add to Watchlist"}
                    </Button>
                    <ShareSnapshotButton
                      snapshotType="player_outlook"
                      title={`${outlookData.player.name} Outlook`}
                      snapshotData={{
                        playerName: outlookData.player.name,
                        sport: outlookData.player.sport,
                        position: outlookData.player.position,
                        team: outlookData.player.team,
                        stage: outlookData.player.stage,
                        outlook: outlookData.investmentCall?.verdict || outlookData.verdict.action,
                        modifier: outlookData.verdict.modifier,
                        summary: outlookData.investmentCall?.oneLineRationale || outlookData.verdict.summary,
                        thesis: outlookData.thesis,
                        marketRealityCheck: outlookData.marketRealityCheck,
                        temperature: outlookData.snapshot.temperature,
                        volatility: outlookData.snapshot.volatility,
                        risk: outlookData.snapshot.risk,
                        confidence: outlookData.snapshot.confidence,
                        exposures: outlookData.exposures.map(exp => ({
                          tier: exp.tier,
                          cardTargets: exp.cardTargets,
                          why: exp.why,
                        })),
                        investmentCall: outlookData.investmentCall,
                        generatedAt: outlookData.generatedAt,
                      }}
                    />
                    <Button variant="outline" onClick={() => {
                      setOutlookData(null);
                      outlookMutation.mutate({ playerName: outlookData.player.name, sport });
                    }} data-testid="button-refresh">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Analysis
                    </Button>
                  </>
                )}
                
                {/* Always show eBay link */}
                <Button variant="outline" asChild>
                  <a 
                    href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(outlookData.player.name + " card")}&_sacat=0&LH_Sold=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-search-ebay"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Search eBay Sold
                  </a>
                </Button>
                
                {/* Show signup CTA for unauthenticated users */}
                {!user && (
                  <a href="/api/login">
                    <Button data-testid="button-signup-actions">
                      <Star className="h-4 w-4 mr-2" />
                      Sign Up to Save & Track
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground">
            Generated at {new Date(outlookData.generatedAt).toLocaleString()}
            {outlookData.cacheStatus === "stale" && " (updating in background)"}
          </p>
        </div>
        );
      })()}

      {!outlookData && !outlookMutation.isPending && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Player = Stock, Cards = Exposure</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Enter a player name above to get an investment thesis, market temperature, 
              and recommended card types to buy (Premium, Growth, Core, Common, or Speculative).
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setPlayerName("Shedeur Sanders"); setSport("football"); }}
              >
                Shedeur Sanders
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setPlayerName("Caleb Williams"); setSport("football"); }}
              >
                Caleb Williams
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setPlayerName("Victor Wembanyama"); setSport("basketball"); }}
              >
                Victor Wembanyama
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
