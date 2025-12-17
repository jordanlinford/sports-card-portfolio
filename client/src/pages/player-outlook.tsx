import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlayerOutlookResponse, StockTier, MarketTemperature, VolatilityLevel, RiskLevel, PlayerVerdict, BuyerProfile, LiquidityLevel } from "@shared/schema";

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
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4" data-testid="player-header">
      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border">
        <span className="text-2xl font-bold text-primary">
          {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </span>
      </div>
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
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            Investment Verdict
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {confidence} Confidence
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${getVerdictColor(verdict.action)}`}>
            {getVerdictIcon(verdict.action)}
          </div>
          <span className="text-3xl font-bold" data-testid="text-verdict-action">{verdict.action}</span>
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
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
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
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {exp.riskNote}
            </p>
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
                <p className="text-sm font-medium mb-1">Comparable Sales</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Median: ${evidence.compsSummary.median.toFixed(2)}</span>
                  {evidence.compsSummary.soldCount && (
                    <span>{evidence.compsSummary.soldCount} recent sales</span>
                  )}
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
  const [playerName, setPlayerName] = useState("");
  const [sport, setSport] = useState("football");
  const [outlookData, setOutlookData] = useState<PlayerOutlookResponse | null>(null);

  const outlookMutation = useMutation({
    mutationFn: async (data: { playerName: string; sport: string }) => {
      const response = await apiRequest("POST", "/api/player-outlook", data);
      return response.json();
    },
    onSuccess: (data) => {
      setOutlookData(data);
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
          
          <VerdictCard verdict={outlookData.verdict} confidence={outlookData.snapshot.confidence} />
          
          <ExposureRecommendations exposures={outlookData.exposures} />
          
          <EvidencePanel evidence={outlookData.evidence} cacheStatus={outlookData.cacheStatus} />
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
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
