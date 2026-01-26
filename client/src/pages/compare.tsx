import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PlayerAutocomplete } from "@/components/player-autocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeftRight,
  Flame,
  Thermometer,
  Snowflake,
  Minus,
  ShoppingCart,
  Eye,
  Ban,
  Target,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Crown,
  Loader2,
  Trophy,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { 
  PlayerOutlookResponse, 
  MarketTemperature, 
  PlayerVerdict 
} from "@shared/schema";

const SPORTS = [
  { value: "football", label: "Football (NFL)" },
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
];

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
    case "BUY": return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "AVOID": return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVerdictLabel(verdict?: string, postureLabel?: string) {
  // Prefer the friendly postureLabel from the API
  if (postureLabel) return postureLabel;
  if (!verdict) return "Unknown";
  // Fallback for legacy data
  switch (verdict) {
    case "ACCUMULATE": return "Buy";
    case "HOLD_CORE": return "Hold";
    case "HOLD_ROLE_RISK": return "Hold (Uncertain Role)";
    case "HOLD_INJURY_CONTINGENT": return "Hold (Injury Watch)";
    case "TRADE_THE_HYPE": return "Sell Into Hype";
    case "AVOID_NEW_MONEY": return "Avoid";
    case "AVOID_STRUCTURAL": return "Avoid (Declining)";
    case "SPECULATIVE_FLYER": return "Risky Buy";
    case "SPECULATIVE_SUPPRESSED": return "Buy (Undervalued)";
    default: return verdict.replace(/_/g, " ");
  }
}

// Scoring system for investment verdicts - higher = better investment
const VERDICT_SCORES: Record<string, number> = {
  ACCUMULATE: 100,
  SPECULATIVE_SUPPRESSED: 85,
  SPECULATIVE_FLYER: 70,
  HOLD_CORE: 60,
  HOLD_INJURY_CONTINGENT: 50,
  HOLD_ROLE_RISK: 40,
  TRADE_THE_HYPE: 30,
  AVOID_NEW_MONEY: 10,
  AVOID_STRUCTURAL: 5,
};

function getVerdictScore(verdict?: string): number {
  if (!verdict) return 0;
  return VERDICT_SCORES[verdict] ?? 50;
}

function comparePlayers(player1: PlayerOutlookResponse | null, player2: PlayerOutlookResponse | null): {
  betterPlayer: "left" | "right" | "equal" | null;
  reason: string;
} {
  if (!player1 || !player2) return { betterPlayer: null, reason: "" };
  
  const score1 = getVerdictScore(player1.investmentCall?.verdict);
  const score2 = getVerdictScore(player2.investmentCall?.verdict);
  
  if (score1 > score2) {
    return { betterPlayer: "left", reason: `${player1.player?.name} has a stronger investment outlook` };
  } else if (score2 > score1) {
    return { betterPlayer: "right", reason: `${player2.player?.name} has a stronger investment outlook` };
  }
  return { betterPlayer: "equal", reason: "Both players have similar investment outlooks" };
}

interface ComparisonPlayer {
  name: string;
  sport: string;
  outlook: PlayerOutlookResponse | null;
  isLoading: boolean;
}

function PlayerComparisonCard({ 
  player, 
  side,
  onSelectPlayer, 
  onSelectSport,
  onAnalyze,
  isAnalyzing 
}: { 
  player: ComparisonPlayer;
  side: "left" | "right";
  onSelectPlayer: (name: string) => void;
  onSelectSport: (sport: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  const outlook = player.outlook;
  
  return (
    <Card className="flex-1">
      <CardHeader className="space-y-4">
        <div className="space-y-2">
          <Label>Sport</Label>
          <Select value={player.sport} onValueChange={onSelectSport}>
            <SelectTrigger data-testid={`select-sport-${side}`}>
              <SelectValue placeholder="Select sport" />
            </SelectTrigger>
            <SelectContent>
              {SPORTS.map(sport => (
                <SelectItem key={sport.value} value={sport.value}>
                  {sport.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Player</Label>
          <PlayerAutocomplete
            value={player.name}
            onChange={onSelectPlayer}
            placeholder="Search for a player..."
            data-testid={`input-player-${side}`}
          />
        </div>
        {player.name && !outlook && (
          <Button 
            onClick={onAnalyze} 
            disabled={isAnalyzing || !player.name}
            className="w-full"
            data-testid={`button-analyze-${side}`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Get Outlook"
            )}
          </Button>
        )}
      </CardHeader>
      
      {player.isLoading && (
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      )}
      
      {outlook && !player.isLoading && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${getVerdictColor(outlook.verdict?.action)} gap-1 text-sm px-3 py-1`}>
              {getVerdictIcon(outlook.verdict?.action)}
              {getVerdictLabel(outlook.investmentCall?.verdict, outlook.investmentCall?.postureLabel)}
            </Badge>
            <Badge variant="outline" className={getTemperatureColor(outlook.snapshot?.temperature)}>
              {getTemperatureIcon(outlook.snapshot?.temperature)}
              <span className="ml-1">{outlook.snapshot?.temperature}</span>
            </Badge>
          </div>
          
          <div>
            <p className="text-sm font-medium">{outlook.player?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {outlook.player?.position} • {outlook.player?.team} • {outlook.player?.stage?.replace(/_/g, " ")}
            </p>
          </div>
          
          {outlook.investmentCall?.oneLineRationale && (
            <p className="text-sm text-muted-foreground">
              {outlook.investmentCall.oneLineRationale}
            </p>
          )}
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                <span>Volatility</span>
              </div>
              <p className="text-sm font-medium">{outlook.snapshot?.volatility}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                <span>Risk</span>
              </div>
              <p className="text-sm font-medium">{outlook.snapshot?.risk}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Target className="h-3 w-3" />
                <span>Horizon</span>
              </div>
              <p className="text-sm font-medium">{outlook.snapshot?.horizon}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Crown className="h-3 w-3" />
                <span>Confidence</span>
              </div>
              <p className="text-sm font-medium">{outlook.snapshot?.confidence || outlook.investmentCall?.confidence}</p>
            </div>
          </div>
          
          {outlook.thesis && outlook.thesis.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Key Points</p>
              <ul className="text-sm space-y-1">
                {outlook.thesis.slice(0, 3).map((point, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function ComparePage() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const isPro = user?.subscriptionStatus === "PRO";
  
  const [leftPlayer, setLeftPlayer] = useState<ComparisonPlayer>({
    name: "",
    sport: "football",
    outlook: null,
    isLoading: false,
  });
  
  const [rightPlayer, setRightPlayer] = useState<ComparisonPlayer>({
    name: "",
    sport: "football",
    outlook: null,
    isLoading: false,
  });

  const analyzeLeftMutation = useMutation({
    mutationFn: async () => {
      setLeftPlayer(p => ({ ...p, isLoading: true }));
      const response = await apiRequest("POST", "/api/player-outlook", {
        playerName: leftPlayer.name,
        sport: leftPlayer.sport,
      });
      return response;
    },
    onSuccess: (data: PlayerOutlookResponse) => {
      setLeftPlayer(p => ({ ...p, outlook: data, isLoading: false }));
    },
    onError: (error: Error) => {
      setLeftPlayer(p => ({ ...p, isLoading: false }));
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to get player outlook",
        variant: "destructive",
      });
    },
  });

  const analyzeRightMutation = useMutation({
    mutationFn: async () => {
      setRightPlayer(p => ({ ...p, isLoading: true }));
      const response = await apiRequest("POST", "/api/player-outlook", {
        playerName: rightPlayer.name,
        sport: rightPlayer.sport,
      });
      return response;
    },
    onSuccess: (data: PlayerOutlookResponse) => {
      setRightPlayer(p => ({ ...p, outlook: data, isLoading: false }));
    },
    onError: (error: Error) => {
      setRightPlayer(p => ({ ...p, isLoading: false }));
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to get player outlook",
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto" data-testid="card-login-required">
          <CardHeader>
            <CardTitle>Compare Players</CardTitle>
            <CardDescription>
              Please log in to compare player outlooks side by side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" data-testid="button-go-home">
              <a href="/">Go to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto" data-testid="card-pro-required">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Pro Feature
            </CardTitle>
            <CardDescription>
              Player comparison is available for Pro subscribers. Upgrade to compare players side by side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" data-testid="button-upgrade">
              <a href="/upgrade">Upgrade to Pro</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-compare">Compare Players</h1>
        <p className="text-muted-foreground">
          Compare two players side by side to make better investment decisions
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        <PlayerComparisonCard
          player={leftPlayer}
          side="left"
          onSelectPlayer={(name) => setLeftPlayer(p => ({ ...p, name, outlook: null }))}
          onSelectSport={(sport) => setLeftPlayer(p => ({ ...p, sport, outlook: null }))}
          onAnalyze={() => analyzeLeftMutation.mutate()}
          isAnalyzing={analyzeLeftMutation.isPending}
        />
        
        <div className="flex items-center justify-center py-4 md:py-0">
          <div className="bg-muted rounded-full p-3">
            <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        
        <PlayerComparisonCard
          player={rightPlayer}
          side="right"
          onSelectPlayer={(name) => setRightPlayer(p => ({ ...p, name, outlook: null }))}
          onSelectSport={(sport) => setRightPlayer(p => ({ ...p, sport, outlook: null }))}
          onAnalyze={() => analyzeRightMutation.mutate()}
          isAnalyzing={analyzeRightMutation.isPending}
        />
      </div>

      {leftPlayer.outlook && rightPlayer.outlook && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Comparison Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Better Investment Verdict */}
            {(() => {
              const comparison = comparePlayers(leftPlayer.outlook, rightPlayer.outlook);
              if (!comparison.betterPlayer) return null;
              
              const winnerName = comparison.betterPlayer === "left" 
                ? leftPlayer.name 
                : comparison.betterPlayer === "right" 
                  ? rightPlayer.name 
                  : null;
              
              return (
                <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20" data-testid="better-investment-verdict">
                  <div className="flex items-center gap-2 justify-center">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold text-lg">
                      {comparison.betterPlayer === "equal" 
                        ? "Tie" 
                        : `${winnerName} is the better investment`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mt-1">
                    {comparison.reason}
                  </p>
                </div>
              );
            })()}
            
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium">{leftPlayer.name}</p>
                <Badge className={getVerdictColor(leftPlayer.outlook.verdict?.action)}>
                  {getVerdictLabel(leftPlayer.outlook.investmentCall?.verdict, leftPlayer.outlook.investmentCall?.postureLabel)}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">vs</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{rightPlayer.name}</p>
                <Badge className={getVerdictColor(rightPlayer.outlook.verdict?.action)}>
                  {getVerdictLabel(rightPlayer.outlook.investmentCall?.verdict, rightPlayer.outlook.investmentCall?.postureLabel)}
                </Badge>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <Badge variant="outline" className={getTemperatureColor(leftPlayer.outlook.snapshot?.temperature)}>
                  {leftPlayer.outlook.snapshot?.temperature}
                </Badge>
              </div>
              <div className="text-center text-muted-foreground">Temperature</div>
              <div className="text-center">
                <Badge variant="outline" className={getTemperatureColor(rightPlayer.outlook.snapshot?.temperature)}>
                  {rightPlayer.outlook.snapshot?.temperature}
                </Badge>
              </div>
              
              <div className="text-center">{leftPlayer.outlook.snapshot?.volatility}</div>
              <div className="text-center text-muted-foreground">Volatility</div>
              <div className="text-center">{rightPlayer.outlook.snapshot?.volatility}</div>
              
              <div className="text-center">{leftPlayer.outlook.snapshot?.risk}</div>
              <div className="text-center text-muted-foreground">Risk</div>
              <div className="text-center">{rightPlayer.outlook.snapshot?.risk}</div>
              
              <div className="text-center">{leftPlayer.outlook.snapshot?.horizon}</div>
              <div className="text-center text-muted-foreground">Horizon</div>
              <div className="text-center">{rightPlayer.outlook.snapshot?.horizon}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center mt-8">
        Not financial advice. Do your own research before acting.
      </p>
    </div>
  );
}
