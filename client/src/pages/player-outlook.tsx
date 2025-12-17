import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useSearch } from "wouter";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlayerOutlookResponse, StockTier, MarketTemperature, VolatilityLevel, RiskLevel, PlayerVerdict, BuyerProfile, LiquidityLevel, VerdictModifier, DiscountAnalysis } from "@shared/schema";

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
    case "WATCH": return <Eye className="h-5 w-5" />;
    case "AVOID": return <Ban className="h-5 w-5" />;
    default: return null;
  }
}

function getVerdictColor(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "WATCH": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
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
    case "HIGH": return "Easy to buy/sell";
    case "MEDIUM": return "Moderate liquidity";
    case "LOW": return "Hard to exit";
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
          {player.position && <><span className="text-border">|</span><span>{player.position}</span></>}
          {player.team && <><span className="text-border">|</span><span>{player.team}</span></>}
          <span className="text-border">|</span>
          <span>{player.stage.replace("_", " ")}</span>
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
  const initialSearchDone = useRef(false);

  const playerKey = outlookData?.player?.name 
    ? `${outlookSport.toLowerCase()}:${outlookData.player.name.toLowerCase().trim().replace(/\s+/g, "_")}`
    : null;

  const { data: watchlistStatus, refetch: refetchWatchlistStatus } = useQuery<{ watching: boolean }>({
    queryKey: ["/api/watchlist/check", playerKey],
    queryFn: async () => {
      if (!playerKey) return { watching: false };
      const res = await fetch(`/api/watchlist/check/${encodeURIComponent(playerKey)}`);
      if (!res.ok) throw new Error("Failed to check watchlist");
      return res.json();
    },
    enabled: !!playerKey && !!user,
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!outlookData) throw new Error("No outlook data");
      return await apiRequest("POST", "/api/watchlist", {
        playerName: outlookData.player.name,
        sport: outlookSport,
        currentOutlook: outlookData,
      });
    },
    onSuccess: () => {
      refetchWatchlistStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
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
      if (!playerKey) throw new Error("No player key");
      return await apiRequest("DELETE", `/api/watchlist/${encodeURIComponent(playerKey)}`);
    },
    onSuccess: () => {
      refetchWatchlistStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: "Removed from watchlist",
        description: `${outlookData?.player?.name} has been removed from your watchlist.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove from watchlist",
        variant: "destructive",
      });
    },
  });

  const isWatching = watchlistStatus?.watching ?? false;
  const isWatchlistLoading = addToWatchlistMutation.isPending || removeFromWatchlistMutation.isPending;

  const handleToggleWatchlist = () => {
    if (isWatching) {
      removeFromWatchlistMutation.mutate();
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
    
    if (urlPlayer) {
      setPlayerName(urlPlayer);
      if (urlSport && ["football", "basketball", "baseball", "hockey", "soccer"].includes(urlSport)) {
        setSport(urlSport);
      }
      initialSearchDone.current = true;
      setTimeout(() => {
        outlookMutation.mutate({ 
          playerName: urlPlayer, 
          sport: urlSport || sport 
        });
      }, 100);
    }
  }, [search]);

  const handleSearch = () => {
    if (!playerName.trim()) {
      toast({
        title: "Enter a player name",
        description: "Please enter a player name to analyze.",
        variant: "destructive",
      });
      return;
    }
    outlookMutation.mutate({ playerName: playerName.trim(), sport });
  };

  if (authLoading) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <PlayerOutlookSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h2 className="text-xl font-semibold mb-2">Sign in Required</h2>
            <p className="text-muted-foreground mb-4">Sign in to access Player Outlook analysis.</p>
            <Button asChild>
              <Link href="/api/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 px-4 space-y-6">
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
              <Input
                id="playerName"
                placeholder="Enter player name (e.g., Shedeur Sanders)"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
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

      {outlookData && !outlookMutation.isPending && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <PlayerHeader player={outlookData.player} snapshot={outlookData.snapshot} />
          
          <ThesisCard thesis={outlookData.thesis} />
          
          <MarketRealityCheckCard checks={outlookData.marketRealityCheck} />
          
          <VerdictCard verdict={outlookData.verdict} confidence={outlookData.snapshot.confidence} />
          
          <DiscountAnalysisCard analysis={outlookData.discountAnalysis} />
          
          <ExposureRecommendations exposures={outlookData.exposures} />
          
          <EvidencePanel evidence={outlookData.evidence} cacheStatus={outlookData.cacheStatus} />
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
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
                <Button variant="outline" onClick={() => {
                  setOutlookData(null);
                  outlookMutation.mutate({ playerName: outlookData.player.name, sport });
                }} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Analysis
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground">
            Generated at {new Date(outlookData.generatedAt).toLocaleString()}
            {outlookData.cacheStatus === "stale" && " (updating in background)"}
          </p>
        </div>
      )}

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
  );
}
