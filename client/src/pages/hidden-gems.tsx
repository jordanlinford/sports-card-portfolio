import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { 
  TrendingUp,
  Minus,
  Flame,
  Thermometer,
  Snowflake,
  ShoppingCart,
  Eye as EyeIcon,
  Ban,
  Target,
  Layers,
  Zap,
  Crown,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  Filter,
  Gem,
  RefreshCw,
  Database,
} from "lucide-react";
import type { PlayerVerdict, StockTier, MarketTemperature, HiddenGem } from "@shared/schema";
import { PageShareButton } from "@/components/page-share-button";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface GemCandidate {
  playerName: string;
  sport: string;
  position?: string | null;
  team?: string | null;
  verdict: string; // Now stores actual verdict: ACCUMULATE, HOLD_CORE, etc.
  modifier: string;
  temperature: MarketTemperature;
  tier: string;
  thesis: string;
  riskLevel: RiskLevel;
  whyDiscounted: string[];
  repricingCatalysts: string[];
  trapRisks: string[];
}

function getVerdictIcon(verdict: string) {
  switch (verdict) {
    // Positive verdicts
    case "ACCUMULATE": return <TrendingUp className="h-4 w-4" />;
    case "HOLD_CORE": return <Target className="h-4 w-4" />;
    case "SPECULATIVE_FLYER": return <Zap className="h-4 w-4" />;
    case "SPECULATIVE_SUPPRESSED": return <Zap className="h-4 w-4" />;
    // Hold verdicts (neutral)
    case "HOLD_ROLE_RISK": return <EyeIcon className="h-4 w-4" />;
    case "HOLD_INJURY_CONTINGENT": return <EyeIcon className="h-4 w-4" />;
    // Avoid verdicts
    case "TRADE_THE_HYPE": 
    case "AVOID_NEW_MONEY": 
    case "AVOID_STRUCTURAL":
    case "AVOID": return <Ban className="h-4 w-4" />;
    // Legacy verdicts
    case "BUY": return <ShoppingCart className="h-4 w-4" />;
    case "MONITOR": return <EyeIcon className="h-4 w-4" />;
    default: return <EyeIcon className="h-4 w-4" />;
  }
}

function getVerdictColor(verdict: string) {
  switch (verdict) {
    // Positive verdicts - green
    case "ACCUMULATE": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "SPECULATIVE_SUPPRESSED": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    // Hold verdicts - blue
    case "HOLD_CORE": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "HOLD_ROLE_RISK": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "HOLD_INJURY_CONTINGENT": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    // Speculative - amber
    case "SPECULATIVE_FLYER": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    // Avoid verdicts - red
    case "TRADE_THE_HYPE": 
    case "AVOID_NEW_MONEY":
    case "AVOID_STRUCTURAL":
    case "AVOID": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    // Legacy verdicts
    case "BUY": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "MONITOR": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}

function getVerdictLabel(verdict: string): string {
  switch (verdict) {
    case "ACCUMULATE": return "ACCUMULATE";
    case "HOLD_CORE": return "HOLD CORE";
    case "SPECULATIVE_FLYER": return "SPECULATIVE";
    case "TRADE_THE_HYPE": return "TRADE HYPE";
    case "AVOID_NEW_MONEY": return "AVOID";
    case "HOLD_ROLE_RISK": return "HOLD (ROLE)";
    case "HOLD_INJURY_CONTINGENT": return "HOLD (INJURY)";
    case "SPECULATIVE_SUPPRESSED": return "BUY LOW";
    case "AVOID_STRUCTURAL": return "AVOID";
    default: return verdict;
  }
}

function getTemperatureIcon(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-3 w-3" />;
    case "WARM": return <Thermometer className="h-3 w-3" />;
    case "NEUTRAL": return <Minus className="h-3 w-3" />;
    case "COOLING": return <Snowflake className="h-3 w-3" />;
    default: return null;
  }
}

function getTemperatureColor(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return "text-red-600 dark:text-red-400";
    case "WARM": return "text-orange-600 dark:text-orange-400";
    case "NEUTRAL": return "text-gray-600 dark:text-gray-400";
    case "COOLING": return "text-blue-600 dark:text-blue-400";
    default: return "";
  }
}

function getTierIcon(tier: string) {
  switch (tier) {
    case "PREMIUM": return <Crown className="h-3 w-3" />;
    case "CORE": return <Target className="h-3 w-3" />;
    case "GROWTH": return <TrendingUp className="h-3 w-3" />;
    case "SPECULATIVE": return <Zap className="h-3 w-3" />;
    case "CAUTION": return <Ban className="h-3 w-3" />;
    default: return <Layers className="h-3 w-3" />;
  }
}

function getTierColor(tier: string) {
  switch (tier) {
    case "PREMIUM": return "text-purple-600 dark:text-purple-400";
    case "CORE": return "text-blue-600 dark:text-blue-400";
    case "GROWTH": return "text-emerald-600 dark:text-emerald-400";
    case "SPECULATIVE": return "text-amber-600 dark:text-amber-400";
    case "CAUTION": return "text-red-600 dark:text-red-400";
    default: return "text-gray-600 dark:text-gray-400";
  }
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case "LOW": return "text-emerald-600 dark:text-emerald-400";
    case "MEDIUM": return "text-amber-600 dark:text-amber-400";
    case "HIGH": return "text-red-600 dark:text-red-400";
    default: return "";
  }
}

function getRiskLabel(risk: RiskLevel) {
  switch (risk) {
    case "LOW": return "Lower Risk";
    case "MEDIUM": return "Moderate Risk";
    case "HIGH": return "Higher Risk";
    default: return risk;
  }
}

function GemCard({ gem }: { gem: GemCandidate }) {
  return (
    <Card className="h-full flex flex-col" data-testid={`card-gem-${gem.playerName.replace(/\s+/g, '-').toLowerCase()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg">{gem.playerName}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span className="capitalize">{gem.sport}</span>
              {gem.position && <span>- {gem.position}</span>}
              {gem.team && <span className="text-xs">({gem.team})</span>}
            </CardDescription>
          </div>
          <Badge className={`${getVerdictColor(gem.verdict)} flex items-center gap-1`}>
            {getVerdictIcon(gem.verdict)}
            {getVerdictLabel(gem.verdict)}
          </Badge>
        </div>
        
        <p className="text-sm mt-3 text-foreground">{gem.thesis}</p>
        
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="outline" className={`${getTemperatureColor(gem.temperature)} flex items-center gap-1 text-xs`}>
            {getTemperatureIcon(gem.temperature)}
            {gem.temperature}
          </Badge>
          <Badge variant="outline" className={`${getTierColor(gem.tier)} flex items-center gap-1 text-xs`}>
            {getTierIcon(gem.tier)}
            {gem.tier}
          </Badge>
          <Badge variant="outline" className={`${getRiskColor(gem.riskLevel)} flex items-center gap-1 text-xs`}>
            <AlertTriangle className="h-3 w-3" />
            {getRiskLabel(gem.riskLevel)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {gem.modifier}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 flex-1 flex flex-col">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            {isAvoidVerdict(gem.verdict) ? "Why Overpriced" : "Why Discounted"}
          </h4>
          <ul className="space-y-1">
            {gem.whyDiscounted.slice(0, 2).map((reason, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className={`${isAvoidVerdict(gem.verdict) ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"} mt-0.5`}>-</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            {isAvoidVerdict(gem.verdict) ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {isAvoidVerdict(gem.verdict) ? "Downward Catalyst" : "Repricing Catalyst"}
          </h4>
          <p className="text-sm text-foreground">{gem.repricingCatalysts[0]}</p>
        </div>
        
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            {isAvoidVerdict(gem.verdict) ? <TrendingUp className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {isAvoidVerdict(gem.verdict) ? "Bull Case (Contrary)" : "Trap Risk"}
          </h4>
          <p className="text-sm text-foreground">{gem.trapRisks[0]}</p>
        </div>
        
        <div className="mt-auto pt-4">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/player-outlook?player=${encodeURIComponent(gem.playerName)}&sport=${gem.sport}`}>
              View Full Analysis
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function mapHiddenGemToCandidate(gem: HiddenGem): GemCandidate {
  return {
    playerName: gem.playerName,
    sport: gem.sport,
    position: gem.position,
    team: gem.team,
    verdict: gem.verdict, // Now stores actual verdict
    modifier: gem.modifier || "Value",
    temperature: gem.temperature as MarketTemperature,
    tier: gem.tier,
    thesis: gem.thesis,
    riskLevel: gem.riskLevel as RiskLevel,
    whyDiscounted: gem.whyDiscounted || [],
    repricingCatalysts: gem.repricingCatalysts || [],
    trapRisks: gem.trapRisks || [],
  };
}

// Helper to categorize verdicts for filtering
function isPositiveVerdict(verdict: string): boolean {
  return ["ACCUMULATE", "HOLD_CORE", "SPECULATIVE_SUPPRESSED", "BUY"].includes(verdict);
}

function isHoldVerdict(verdict: string): boolean {
  return ["HOLD_ROLE_RISK", "HOLD_INJURY_CONTINGENT", "SPECULATIVE_FLYER", "MONITOR"].includes(verdict);
}

function isAvoidVerdict(verdict: string): boolean {
  return ["AVOID_NEW_MONEY", "TRADE_THE_HYPE", "AVOID_STRUCTURAL", "AVOID"].includes(verdict);
}

export default function HiddenGemsPage() {
  const { isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const [sport, setSport] = useState("all");
  const [temperatureFilter, setTemperatureFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("buy-watch");
  
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });
  
  const isAdmin = adminCheck?.isAdmin || false;
  
  const { data: gemsData, isLoading: gemsLoading } = useQuery<{
    gems: HiddenGem[];
    stats: {
      totalActive: number;
      bySport: Record<string, number>;
      lastRefresh: string | null;
      batchId: string | null;
    };
    isFallback?: boolean;
  }>({
    queryKey: ["/api/hidden-gems"],
  });
  
  const [refreshProgress, setRefreshProgress] = useState<{
    status: string;
    progress: string;
    sportsDone: number;
    sportsTotal: number;
    gemsFound: number;
    gemsCreated: number;
  } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/hidden-gems/refresh-status");
        const status = await res.json();
        setRefreshProgress(status);

        if (status.status === "completed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast({
            title: "Hidden Gems Refreshed",
            description: `Generated ${status.gemsCreated} fresh gems across all sports.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/hidden-gems"] });
          setTimeout(() => setRefreshProgress(null), 3000);
        } else if (status.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast({
            title: "Refresh Failed",
            description: status.error || "Something went wrong during AI discovery.",
            variant: "destructive",
          });
          setTimeout(() => setRefreshProgress(null), 3000);
        }
      } catch {
      }
    }, 2000);
  };

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/hidden-gems/refresh");
    },
    onSuccess: () => {
      setRefreshProgress({
        status: "running",
        progress: "Starting AI discovery...",
        sportsDone: 0,
        sportsTotal: 4,
        gemsFound: 0,
        gemsCreated: 0,
      });
      startPolling();
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to start refresh",
        variant: "destructive",
      });
    },
  });
  
  const seedMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/hidden-gems/seed?count=50");
    },
    onSuccess: (data) => {
      toast({
        title: "Seeding Started",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Seeding Failed",
        description: error.message || "Failed to start seeding",
        variant: "destructive",
      });
    },
  });
  
  const allGems: GemCandidate[] = gemsData?.gems?.map(mapHiddenGemToCandidate) || [];
  const lastRefresh = gemsData?.stats?.lastRefresh;
  const isFallback = gemsData?.isFallback || false;
  
  const filteredGems = allGems.filter(gem => {
    if (sport !== "all" && gem.sport.toUpperCase() !== sport.toUpperCase()) return false;
    
    if (temperatureFilter === "non-hot" && gem.temperature === "HOT") return false;
    if (temperatureFilter === "cooling-only" && gem.temperature !== "COOLING") return false;
    if (temperatureFilter === "hot-only" && gem.temperature !== "HOT") return false;
    
    // Filter by verdict category (positive verdicts = ACCUMULATE, HOLD_CORE, etc.)
    if (verdictFilter === "buy-only" && !isPositiveVerdict(gem.verdict)) return false;
    if (verdictFilter === "buy-watch" && isAvoidVerdict(gem.verdict)) return false;
    if (verdictFilter === "avoid-only" && !isAvoidVerdict(gem.verdict)) return false;
    
    return true;
  });
  
  if (gemsLoading) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Gem className="h-8 w-8 text-emerald-500" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {isFallback ? "Featured Players" : "Hidden Gems"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  data-testid="button-seed-players"
                >
                  <Database className={`h-4 w-4 mr-2 ${seedMutation.isPending ? "animate-pulse" : ""}`} />
                  {seedMutation.isPending ? "Seeding..." : "Seed Players"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending || refreshProgress?.status === "running"}
                  data-testid="button-refresh-gems"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${(refreshMutation.isPending || refreshProgress?.status === "running") ? "animate-spin" : ""}`} />
                  {refreshProgress?.status === "running" ? "Refreshing..." : "Refresh Gems"}
                </Button>
              </>
            )}
            <PageShareButton pageSlug="hidden-gems" />
          </div>
        </div>
        {refreshProgress?.status === "running" && (
          <div className="flex items-center gap-3 mt-3 p-3 rounded-md bg-muted/50 border" data-testid="refresh-progress">
            <RefreshCw className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" data-testid="text-refresh-progress">{refreshProgress.progress}</p>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-500" 
                    style={{ width: `${(refreshProgress.sportsDone / refreshProgress.sportsTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {refreshProgress.sportsDone}/{refreshProgress.sportsTotal} sports
                  {refreshProgress.gemsFound > 0 && ` | ${refreshProgress.gemsFound} found`}
                </span>
              </div>
            </div>
          </div>
        )}
        {refreshProgress?.status === "completed" && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-md bg-green-500/10 border border-green-500/20" data-testid="refresh-complete">
            <Gem className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-700 dark:text-green-400">{refreshProgress.progress}</p>
          </div>
        )}
        {refreshProgress?.status === "failed" && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="refresh-failed">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{(refreshProgress as any).error || "Refresh failed"}</p>
          </div>
        )}
        <p className="text-muted-foreground max-w-2xl">
          {isFallback 
            ? "Curated players across all sports who represent compelling value opportunities. Analyze any player to unlock AI-generated insights."
            : "AI-identified players who might be underpriced relative to their talent. Each card explains why they're discounted, what would trigger repricing, and what trap risks to watch for."
          }
        </p>
        {lastRefresh && !isFallback && (
          <p className="text-xs text-muted-foreground mt-2">
            Last AI refresh: {new Date(lastRefresh).toLocaleDateString('en-US', { 
              month: 'long',
              day: 'numeric',
              year: 'numeric' 
            })}
          </p>
        )}
      </div>
      
      <Card className="mb-8" data-testid="card-filters">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sport-filter">Sport</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger id="sport-filter" data-testid="select-sport">
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  <SelectItem value="NFL">NFL (Football)</SelectItem>
                  <SelectItem value="NBA">NBA (Basketball)</SelectItem>
                  <SelectItem value="MLB">MLB (Baseball)</SelectItem>
                  <SelectItem value="NHL">NHL (Hockey)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="temperature-filter">Temperature</Label>
              <Select value={temperatureFilter} onValueChange={setTemperatureFilter}>
                <SelectTrigger id="temperature-filter" data-testid="select-temperature">
                  <SelectValue placeholder="All Temperatures" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Temperatures</SelectItem>
                  <SelectItem value="hot-only">HOT Only (Momentum Plays)</SelectItem>
                  <SelectItem value="non-hot">Exclude HOT (Value Plays)</SelectItem>
                  <SelectItem value="cooling-only">COOLING Only (Legacy Plays)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="verdict-filter">Verdict</Label>
              <Select value={verdictFilter} onValueChange={setVerdictFilter}>
                <SelectTrigger id="verdict-filter" data-testid="select-verdict">
                  <SelectValue placeholder="Positive Only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verdicts</SelectItem>
                  <SelectItem value="buy-only">Positive Only (Accumulate, Hold Core)</SelectItem>
                  <SelectItem value="buy-watch">Positive + Speculative</SelectItem>
                  <SelectItem value="avoid-only">Avoid Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {filteredGems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              No players match your filters
            </h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filter settings to see more candidates.
            </p>
            <Button variant="outline" onClick={() => {
              setSport("all");
              setTemperatureFilter("all");
              setVerdictFilter("buy-watch");
            }} data-testid="button-reset-filters">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Showing {filteredGems.length} {isFallback ? "featured player" : "AI-identified hidden gem"}{filteredGems.length !== 1 ? "s" : ""} across {new Set(filteredGems.map(g => g.sport)).size} sport{new Set(filteredGems.map(g => g.sport)).size !== 1 ? "s" : ""}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-gems">
            {filteredGems.map((gem) => (
              <GemCard key={`${gem.sport}-${gem.playerName}`} gem={gem} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
