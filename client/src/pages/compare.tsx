import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEnumLabel } from "@/lib/formatEnum";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PlayerAutocomplete } from "@/components/player-autocomplete";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertCircle,
  Crown,
  Loader2,
  Trophy,
  Users,
  CreditCard,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ComparisonPriceTrendChart } from "@/components/price-trend-chart";
import { hasProAccess } from "@shared/schema";
import type { 
  PlayerOutlookResponse, 
  MarketTemperature, 
  PlayerVerdict,
} from "@shared/schema";

interface ComparisonNarrative {
  caseForPlayer1: {
    title: string;
    strategy: string;
    summary: string;
    points: string[];
  };
  caseForPlayer2: {
    title: string;
    strategy: string;
    summary: string;
    points: string[];
  };
  myTake: {
    agreement: boolean;
    winner: string;
    reasoning: string;
    valueInvestorPick: string;
    blueChipPick: string;
    bottomLine: string;
  };
}

const SPORTS = [
  { value: "football", label: "Football (NFL)" },
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
];

const GRADES = [
  { value: "10", label: "PSA 10 / BGS 10" },
  { value: "9.5", label: "BGS 9.5" },
  { value: "9", label: "PSA 9 / BGS 9" },
  { value: "8", label: "PSA 8 / BGS 8" },
  { value: "raw", label: "Raw (Ungraded)" },
];

const CARD_TIERS = [
  { value: "base", label: "Base" },
  { value: "parallel", label: "Parallel (Silver, Holo, etc.)" },
  { value: "numbered", label: "Numbered (/499, /199, /99, etc.)" },
  { value: "auto", label: "Autograph" },
  { value: "rpa", label: "RPA (Rookie Patch Auto)" },
  { value: "1of1", label: "1/1" },
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

function getVerdictIcon(verdict?: PlayerVerdict | null) {
  switch (verdict) {
    case "BUY": return <ShoppingCart className="h-5 w-5" />;
    case "MONITOR": return <Eye className="h-5 w-5" />;
    case "AVOID": return <Ban className="h-5 w-5" />;
    default: return null;
  }
}

function getVerdictColor(verdict?: PlayerVerdict | null) {
  switch (verdict) {
    case "BUY": return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "AVOID": return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVerdictLabel(verdict?: string, postureLabel?: string) {
  if (postureLabel) return postureLabel;
  if (!verdict) return "Unknown";
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

// Verdict scores for comparison - higher = more attractive investment opportunity
// Key insight: TRADE_THE_HYPE (hot momentum, take profits) > HOLD_ROLE_RISK (uncertain role)
// because a player with proven momentum is a better investment than one with uncertain role
const VERDICT_SCORES: Record<string, number> = {
  ACCUMULATE: 100,           // Strong buy - best opportunity
  SPECULATIVE_SUPPRESSED: 85, // Undervalued speculative play
  TRADE_THE_HYPE: 75,        // HOT momentum - valuable but at peak (moved UP from 30)
  SPECULATIVE_FLYER: 70,     // High upside speculative
  HOLD_CORE: 60,             // Established value, stable
  HOLD_INJURY_CONTINGENT: 50, // Uncertain due to injury
  HOLD_ROLE_RISK: 35,        // Uncertain role - risky (moved DOWN from 40)
  AVOID_NEW_MONEY: 10,       // Don't buy new
  AVOID_STRUCTURAL: 5,       // Structural problems
};

// Temperature scores for momentum tiebreaker
const TEMPERATURE_SCORES: Record<string, number> = {
  HOT: 20,
  WARM: 10,
  NEUTRAL: 0,
  COOLING: -10,
};

function getVerdictScore(verdict?: string): number {
  if (!verdict) return 0;
  return VERDICT_SCORES[verdict] ?? 50;
}

function getTemperatureScore(temperature?: string): number {
  if (!temperature) return 0;
  return TEMPERATURE_SCORES[temperature] ?? 0;
}

const TIER_SCORES: Record<string, number> = {
  "1of1": 100,
  "rpa": 90,
  "auto": 75,
  "numbered": 60,
  "parallel": 40,
  "base": 20,
};

const GRADE_SCORES: Record<string, number> = {
  "10": 100,
  "9.5": 90,
  "9": 75,
  "8": 50,
  "raw": 30,
};

const RISK_SCORES: Record<string, number> = { LOW: 20, MEDIUM: 10, HIGH: -5 };
const VOLATILITY_SCORES: Record<string, number> = { LOW: 15, MEDIUM: 5, HIGH: -10 };
const CONFIDENCE_SCORES: Record<string, number> = { HIGH: 15, MEDIUM: 5, MID: 5, LOW: -5 };

function getMarketSignalBonus(outlook: PlayerOutlookResponse): number {
  let bonus = 0;
  const snap = outlook.snapshot;
  const ms = outlook.marketSignals;

  if (ms?.composite) bonus += (ms.composite - 50) * 0.3;
  if (ms?.confidenceScore) bonus += (ms.confidenceScore - 50) * 0.15;
  if (ms?.demandScore) bonus += (ms.demandScore - 50) * 0.1;

  const risk = String(snap?.risk || "").toUpperCase();
  bonus += RISK_SCORES[risk] ?? 0;
  const vol = String(snap?.volatility || "").toUpperCase();
  bonus += VOLATILITY_SCORES[vol] ?? 0;
  const conf = String(snap?.confidence || outlook.investmentCall?.confidence || "").toUpperCase();
  bonus += CONFIDENCE_SCORES[conf] ?? 0;

  return bonus;
}

function comparePlayers(player1: PlayerOutlookResponse | null, player2: PlayerOutlookResponse | null): {
  betterPlayer: "left" | "right" | "equal" | null;
  reason: string;
  investmentType?: { left: string; right: string };
} {
  if (!player1 || !player2) return { betterPlayer: null, reason: "" };
  
  const verdict1 = player1.investmentCall?.verdict;
  const verdict2 = player2.investmentCall?.verdict;
  const temp1 = player1.snapshot?.temperature;
  const temp2 = player2.snapshot?.temperature;
  
  const verdictScore1 = getVerdictScore(verdict1);
  const verdictScore2 = getVerdictScore(verdict2);
  const tempBonus1 = getTemperatureScore(temp1) * 0.5;
  const tempBonus2 = getTemperatureScore(temp2) * 0.5;
  const signalBonus1 = getMarketSignalBonus(player1);
  const signalBonus2 = getMarketSignalBonus(player2);
  
  const compositeScore1 = verdictScore1 + tempBonus1 + signalBonus1;
  const compositeScore2 = verdictScore2 + tempBonus2 + signalBonus2;
  
  const getInvestmentType = (verdict?: string, temp?: string): string => {
    if (verdict === "TRADE_THE_HYPE" || temp === "HOT") return "Momentum Play";
    if (verdict === "ACCUMULATE" || verdict === "SPECULATIVE_SUPPRESSED") return "Value Play";
    if (verdict?.startsWith("HOLD_")) return "Hold Position";
    if (verdict?.startsWith("SPECULATIVE_")) return "Speculative";
    if (verdict?.startsWith("AVOID_")) return "Avoid";
    return "Neutral";
  };
  
  const type1 = getInvestmentType(verdict1, temp1);
  const type2 = getInvestmentType(verdict2, temp2);
  
  const generateReason = (winner: PlayerOutlookResponse, loser: PlayerOutlookResponse, winnerType: string): string => {
    const winnerName = winner.player?.name;
    const loserName = loser.player?.name;
    const winnerVerdict = winner.investmentCall?.verdict;
    const loserVerdict = loser.investmentCall?.verdict;
    const winnerSnap = winner.snapshot;
    const loserSnap = loser.snapshot;
    
    if (winnerVerdict === "TRADE_THE_HYPE" && loserVerdict === "HOLD_ROLE_RISK") {
      return `${winnerName} has proven momentum and market demand, while ${loserName}'s role remains uncertain`;
    }
    if (winnerVerdict === "TRADE_THE_HYPE" && loserVerdict?.includes("SPECULATIVE")) {
      return `${winnerName} has established value at current highs, while ${loserName} is still speculative`;
    }

    if (winnerVerdict === loserVerdict) {
      const winnerRisk = String(winnerSnap?.risk || "").toUpperCase();
      const loserRisk = String(loserSnap?.risk || "").toUpperCase();
      const winnerVol = String(winnerSnap?.volatility || "").toUpperCase();
      const loserVol = String(loserSnap?.volatility || "").toUpperCase();
      
      if ((RISK_SCORES[winnerRisk] ?? 0) > (RISK_SCORES[loserRisk] ?? 0)) {
        return `${winnerName} carries lower risk with a more stable market profile`;
      }
      if ((VOLATILITY_SCORES[winnerVol] ?? 0) > (VOLATILITY_SCORES[loserVol] ?? 0)) {
        return `${winnerName} has lower volatility, making it a safer investment`;
      }
      const winnerMs = winner.marketSignals;
      const loserMs = loser.marketSignals;
      if (winnerMs?.composite && loserMs?.composite && winnerMs.composite > loserMs.composite) {
        return `${winnerName} has a stronger overall market score (${Math.round(winnerMs.composite)} vs ${Math.round(loserMs.composite)})`;
      }
      return `${winnerName} has better market fundamentals overall`;
    }

    if (winnerType === "Value Play") {
      return `${winnerName} offers better value entry point with stronger fundamentals`;
    }
    if (winnerType === "Momentum Play") {
      return `${winnerName} has stronger market momentum and proven demand`;
    }
    return `${winnerName} has a stronger investment outlook`;
  };
  
  const CLOSE_THRESHOLD = 3;
  const diff = compositeScore1 - compositeScore2;
  
  if (Math.abs(diff) < CLOSE_THRESHOLD) {
    return { 
      betterPlayer: "equal", 
      reason: "Both players have similar investment outlooks — consider other factors like personal portfolio fit",
      investmentType: { left: type1, right: type2 }
    };
  } else if (diff > 0) {
    return { 
      betterPlayer: "left", 
      reason: generateReason(player1, player2, type1),
      investmentType: { left: type1, right: type2 }
    };
  } else {
    return { 
      betterPlayer: "right", 
      reason: generateReason(player2, player1, type2),
      investmentType: { left: type1, right: type2 }
    };
  }
}

interface ComparisonPlayer {
  name: string;
  sport: string;
  outlook: PlayerOutlookResponse | null;
  isLoading: boolean;
}

interface ComparisonCard {
  playerName: string;
  sport: string;
  year: string;
  setName: string;
  tier: string;
  grade: string;
  outlook: PlayerOutlookResponse | null;
  isLoading: boolean;
}

interface CardComparisonResult {
  winner: "left" | "right" | "equal";
  reason: string;
  breakdown: {
    playerScore: { left: number; right: number };
    tierScore: { left: number; right: number };
    gradeScore: { left: number; right: number };
    totalScore: { left: number; right: number };
  };
}

function compareCards(
  card1: ComparisonCard,
  card2: ComparisonCard
): CardComparisonResult | null {
  if (!card1.outlook || !card2.outlook) return null;

  const playerScore1 = getVerdictScore(card1.outlook.investmentCall?.verdict);
  const playerScore2 = getVerdictScore(card2.outlook.investmentCall?.verdict);
  
  const tierScore1 = TIER_SCORES[card1.tier] || 30;
  const tierScore2 = TIER_SCORES[card2.tier] || 30;
  
  const gradeScore1 = GRADE_SCORES[card1.grade] || 50;
  const gradeScore2 = GRADE_SCORES[card2.grade] || 50;

  const total1 = (playerScore1 * 0.5) + (tierScore1 * 0.3) + (gradeScore1 * 0.2);
  const total2 = (playerScore2 * 0.5) + (tierScore2 * 0.3) + (gradeScore2 * 0.2);

  let winner: "left" | "right" | "equal";
  let reason: string;

  if (Math.abs(total1 - total2) < 5) {
    winner = "equal";
    reason = "These cards have similar investment potential";
  } else if (total1 > total2) {
    winner = "left";
    const playerBetter = playerScore1 > playerScore2;
    const tierBetter = tierScore1 > tierScore2;
    const gradeBetter = gradeScore1 > gradeScore2;
    
    if (playerBetter && tierBetter) {
      reason = `${card1.playerName}'s card has a stronger player outlook and better card tier`;
    } else if (playerBetter) {
      reason = `${card1.playerName} has a stronger investment outlook`;
    } else if (tierBetter) {
      reason = `The ${card1.tier} tier offers better long-term value`;
    } else if (gradeBetter) {
      reason = `The higher grade provides more investment security`;
    } else {
      reason = `${card1.playerName}'s card scores higher overall`;
    }
  } else {
    winner = "right";
    const playerBetter = playerScore2 > playerScore1;
    const tierBetter = tierScore2 > tierScore1;
    const gradeBetter = gradeScore2 > gradeScore1;
    
    if (playerBetter && tierBetter) {
      reason = `${card2.playerName}'s card has a stronger player outlook and better card tier`;
    } else if (playerBetter) {
      reason = `${card2.playerName} has a stronger investment outlook`;
    } else if (tierBetter) {
      reason = `The ${card2.tier} tier offers better long-term value`;
    } else if (gradeBetter) {
      reason = `The higher grade provides more investment security`;
    } else {
      reason = `${card2.playerName}'s card scores higher overall`;
    }
  }

  return {
    winner,
    reason,
    breakdown: {
      playerScore: { left: playerScore1, right: playerScore2 },
      tierScore: { left: tierScore1, right: tierScore2 },
      gradeScore: { left: gradeScore1, right: gradeScore2 },
      totalScore: { left: Math.round(total1), right: Math.round(total2) },
    },
  };
}

function PlayerComparisonCard({ 
  player, 
  side,
  onSelectPlayer, 
  onSelectSport,
}: { 
  player: ComparisonPlayer;
  side: "left" | "right";
  onSelectPlayer: (name: string) => void;
  onSelectSport: (sport: string) => void;
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
              <span className="ml-1">{formatEnumLabel(outlook.snapshot?.temperature)}</span>
            </Badge>
          </div>
          
          <div>
            <p className="text-sm font-medium">{outlook.player?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {outlook.player?.position} · {outlook.player?.team} · {outlook.player?.stage?.replace(/_/g, " ")}
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

function CardComparisonInput({ 
  card, 
  side,
  onUpdate,
}: { 
  card: ComparisonCard;
  side: "left" | "right";
  onUpdate: (updates: Partial<ComparisonCard>) => void;
}) {
  const outlook = card.outlook;
  const cardDescription = [card.year, card.setName, card.tier, card.grade !== "raw" ? `Grade ${card.grade}` : "Raw"].filter(Boolean).join(" · ");
  
  return (
    <Card className="flex-1">
      <CardHeader className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Sport</Label>
            <Select value={card.sport} onValueChange={(v) => onUpdate({ sport: v, outlook: null })}>
              <SelectTrigger data-testid={`select-card-sport-${side}`}>
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
            <Label>Year</Label>
            <Input 
              placeholder="2020"
              value={card.year}
              onChange={(e) => onUpdate({ year: e.target.value })}
              data-testid={`input-card-year-${side}`}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>Player</Label>
          <PlayerAutocomplete
            value={card.playerName}
            onChange={(name) => onUpdate({ playerName: name, outlook: null })}
            placeholder="Search for a player..."
            data-testid={`input-card-player-${side}`}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Set Name</Label>
          <Input 
            placeholder="Prizm, Select, Optic, etc."
            value={card.setName}
            onChange={(e) => onUpdate({ setName: e.target.value })}
            data-testid={`input-card-set-${side}`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Card Tier</Label>
            <Select value={card.tier} onValueChange={(v) => onUpdate({ tier: v })}>
              <SelectTrigger data-testid={`select-card-tier-${side}`}>
                <SelectValue placeholder="Select tier" />
              </SelectTrigger>
              <SelectContent>
                {CARD_TIERS.map(tier => (
                  <SelectItem key={tier.value} value={tier.value}>
                    {tier.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Grade</Label>
            <Select value={card.grade} onValueChange={(v) => onUpdate({ grade: v })}>
              <SelectTrigger data-testid={`select-card-grade-${side}`}>
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map(grade => (
                  <SelectItem key={grade.value} value={grade.value}>
                    {grade.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
      </CardHeader>
      
      {card.isLoading && (
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      )}
      
      {outlook && !card.isLoading && (
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium">{card.playerName}</p>
            <p className="text-xs text-muted-foreground">{cardDescription}</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${getVerdictColor(outlook.verdict?.action)} gap-1 text-sm px-3 py-1`}>
              {getVerdictIcon(outlook.verdict?.action)}
              {getVerdictLabel(outlook.investmentCall?.verdict, outlook.investmentCall?.postureLabel)}
            </Badge>
            <Badge variant="outline" className={getTemperatureColor(outlook.snapshot?.temperature)}>
              {getTemperatureIcon(outlook.snapshot?.temperature)}
              <span className="ml-1">{formatEnumLabel(outlook.snapshot?.temperature)}</span>
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground capitalize">
            {outlook.player?.position} · {outlook.player?.team} · {outlook.player?.stage?.replace(/_/g, " ")}
          </p>
          
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
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function getCardUpsideScore(card: ComparisonCard): number | null {
  const v = card.outlook?.marketSignals?.composite;
  return typeof v === "number" ? Math.round(v) : null;
}

function getCardRiskScore(card: ComparisonCard): number | null {
  const v = card.outlook?.investmentCall?.scores?.downsideRiskScore;
  return typeof v === "number" ? Math.round(v) : null;
}

function getCardMarketAvg(card: ComparisonCard): number | null {
  const m = card.outlook?.marketMetrics;
  if (typeof m?.medianSoldPrice === "number") return m.medianSoldPrice;
  if (typeof m?.avgSoldPrice === "number") return m.avgSoldPrice;
  return null;
}

function getCardValueScore(card: ComparisonCard): number | null {
  const upside = getCardUpsideScore(card);
  if (upside === null) return null;
  const risk = getCardRiskScore(card);
  return risk !== null ? upside - risk : upside;
}

function CardComparisonSummary({ 
  leftCard, 
  rightCard 
}: { 
  leftCard: ComparisonCard; 
  rightCard: ComparisonCard;
}) {
  const leftValue = getCardValueScore(leftCard);
  const rightValue = getCardValueScore(rightCard);
  let winnerSide: "left" | "right" | "tie" = "tie";
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    if (leftValue > rightValue) winnerSide = "left";
    else if (rightValue > leftValue) winnerSide = "right";
  }
  const winnerName =
    winnerSide === "left" ? leftCard.playerName :
    winnerSide === "right" ? rightCard.playerName : null;

  const renderCardColumn = (side: "left" | "right", card: ComparisonCard) => {
    const isWinner = winnerSide === side;
    const upside = getCardUpsideScore(card);
    const risk = getCardRiskScore(card);
    const marketAvg = getCardMarketAvg(card);
    const setYearGrade = [
      card.year,
      card.setName,
      card.tier ? formatEnumLabel(card.tier) : null,
      card.grade ? (card.grade === "raw" ? "Raw" : `Grade ${card.grade}`) : null,
    ].filter(Boolean).join(" · ");
    const o = card.outlook!;
    return (
      <div
        className={`p-4 rounded-lg border ${
          isWinner
            ? "border-amber-500/50 bg-amber-500/5 ring-2 ring-amber-500/30"
            : "border-border bg-muted/20"
        }`}
        data-testid={`card-comparison-column-${side}`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold truncate" data-testid={`text-card-name-${side}`}>{card.playerName}</p>
          {isWinner && (
            <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1" data-testid={`badge-card-winner-${side}`}>
              <Trophy className="h-3 w-3" />
              Better Value
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3" data-testid={`text-card-set-year-grade-${side}`}>
          {setYearGrade || "—"}
        </p>
        <div className="mb-3">
          <Badge className={`${getVerdictColor(o.verdict?.action)} gap-1`} data-testid={`badge-card-verdict-${side}`}>
            {getVerdictIcon(o.verdict?.action)}
            {getVerdictLabel(o.investmentCall?.verdict, o.investmentCall?.postureLabel)}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Market Avg</p>
            <p className="text-base font-semibold" data-testid={`text-card-market-avg-${side}`}>
              {marketAvg !== null ? `$${marketAvg.toFixed(0)}` : "—"}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Upside</p>
            <p
              className={`text-base font-semibold ${isWinner ? "text-amber-600 dark:text-amber-400" : ""}`}
              data-testid={`text-card-upside-${side}`}
            >
              {upside !== null ? upside : "—"}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Risk</p>
            <p className="text-base font-semibold" data-testid={`text-card-risk-${side}`}>
              {risk !== null ? risk : "—"}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Card Comparison Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20" data-testid="better-card-verdict">
          <div className="flex items-center gap-2 justify-center">
            <Trophy className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-lg">
              {winnerSide === "tie"
                ? "These cards have equal value"
                : `${winnerName}'s card is the better value`}
            </span>
          </div>
          {winnerSide !== "tie" && typeof leftValue === "number" && typeof rightValue === "number" && (
            <p className="text-sm text-muted-foreground text-center mt-1">
              Value score: {Math.max(leftValue, rightValue)} vs {Math.min(leftValue, rightValue)}
              <span className="ml-1 text-xs">(upside − risk)</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderCardColumn("left", leftCard)}
          {renderCardColumn("right", rightCard)}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const isPro = hasProAccess(user);
  const [activeTab, setActiveTab] = useState<string>("players");
  
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

  const [leftCard, setLeftCard] = useState<ComparisonCard>({
    playerName: "",
    sport: "football",
    year: "",
    setName: "",
    tier: "parallel",
    grade: "10",
    outlook: null,
    isLoading: false,
  });

  const [rightCard, setRightCard] = useState<ComparisonCard>({
    playerName: "",
    sport: "football",
    year: "",
    setName: "",
    tier: "parallel",
    grade: "10",
    outlook: null,
    isLoading: false,
  });
  
  const [narrative, setNarrative] = useState<ComparisonNarrative | null>(null);
  const [isLoadingNarrative, setIsLoadingNarrative] = useState(false);

  // Deep-link support: /compare?tab=cards&card1=[cardId]
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const card1Param = params.get("card1");
    if (tabParam === "cards" || tabParam === "players") {
      setActiveTab(tabParam);
    }
    if (card1Param && isAuthenticated) {
      const cardId = parseInt(card1Param, 10);
      if (!Number.isNaN(cardId)) {
        (async () => {
          try {
            const cards = await apiRequest("GET", "/api/cards") as any[];
            const found = Array.isArray(cards) ? cards.find((c: any) => c.id === cardId) : null;
            if (found) {
              setLeftCard(c => ({
                ...c,
                playerName: found.playerName ?? c.playerName,
                sport: found.sport ?? c.sport,
                year: found.year ? String(found.year) : c.year,
                setName: found.setName ?? c.setName,
                tier: found.tier ?? c.tier,
                grade: found.grade ?? c.grade,
              }));
            }
          } catch (err) {
            // Silently ignore — user can still fill in manually
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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

  const analyzeLeftCardMutation = useMutation({
    mutationFn: async () => {
      setLeftCard(c => ({ ...c, isLoading: true }));
      const response = await apiRequest("POST", "/api/player-outlook", {
        playerName: leftCard.playerName,
        sport: leftCard.sport,
      });
      return response;
    },
    onSuccess: (data: PlayerOutlookResponse) => {
      setLeftCard(c => ({ ...c, outlook: data, isLoading: false }));
    },
    onError: (error: Error) => {
      setLeftCard(c => ({ ...c, isLoading: false }));
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to get player outlook",
        variant: "destructive",
      });
    },
  });

  const analyzeRightCardMutation = useMutation({
    mutationFn: async () => {
      setRightCard(c => ({ ...c, isLoading: true }));
      const response = await apiRequest("POST", "/api/player-outlook", {
        playerName: rightCard.playerName,
        sport: rightCard.sport,
      });
      return response;
    },
    onSuccess: (data: PlayerOutlookResponse) => {
      setRightCard(c => ({ ...c, outlook: data, isLoading: false }));
    },
    onError: (error: Error) => {
      setRightCard(c => ({ ...c, isLoading: false }));
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to get player outlook",
        variant: "destructive",
      });
    },
  });
  
  const fetchNarrativeMutation = useMutation({
    mutationFn: async () => {
      setIsLoadingNarrative(true);
      // Calculate algorithmic winner to pass to AI for consistency
      const comparison = comparePlayers(leftPlayer.outlook, rightPlayer.outlook);
      const response = await apiRequest("POST", "/api/compare-players/narrative", {
        player1: {
          name: leftPlayer.name,
          sport: leftPlayer.sport,
          outlook: leftPlayer.outlook,
        },
        player2: {
          name: rightPlayer.name,
          sport: rightPlayer.sport,
          outlook: rightPlayer.outlook,
        },
        algorithmicWinner: comparison.betterPlayer, // Pass to ensure AI aligns with algorithm
      });
      return response as ComparisonNarrative;
    },
    onSuccess: (data: ComparisonNarrative) => {
      setNarrative(data);
      setIsLoadingNarrative(false);
    },
    onError: (error: Error) => {
      setIsLoadingNarrative(false);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to generate comparison narrative",
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto" data-testid="card-login-required">
          <CardHeader>
            <CardTitle>Compare Players & Cards</CardTitle>
            <CardDescription>
              Please log in to compare player and card outlooks side by side.
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
              Player and card comparison is available for Pro subscribers. Upgrade to compare investments side by side.
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
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-compare">Compare Investments</h1>
        <p className="text-muted-foreground">
          Compare players or specific cards side by side to make better investment decisions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
          <TabsTrigger value="players" className="gap-2" data-testid="tab-players">
            <Users className="h-4 w-4" />
            Players
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-2" data-testid="tab-cards">
            <CreditCard className="h-4 w-4" />
            Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players">
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <PlayerComparisonCard
              player={leftPlayer}
              side="left"
              onSelectPlayer={(name) => { setLeftPlayer(p => ({ ...p, name, outlook: null })); setNarrative(null); }}
              onSelectSport={(sport) => { setLeftPlayer(p => ({ ...p, sport, outlook: null })); setNarrative(null); }}
            />
            
            <div className="flex items-center justify-center py-4 md:py-0">
              <div className="bg-muted rounded-full p-3">
                <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            
            <PlayerComparisonCard
              player={rightPlayer}
              side="right"
              onSelectPlayer={(name) => { setRightPlayer(p => ({ ...p, name, outlook: null })); setNarrative(null); }}
              onSelectSport={(sport) => { setRightPlayer(p => ({ ...p, sport, outlook: null })); setNarrative(null); }}
            />
          </div>

          {leftPlayer.name && rightPlayer.name && !leftPlayer.outlook && !rightPlayer.outlook && (
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() => {
                  if (!analyzeLeftMutation.isPending && !leftPlayer.outlook) analyzeLeftMutation.mutate();
                  if (!analyzeRightMutation.isPending && !rightPlayer.outlook) analyzeRightMutation.mutate();
                }}
                disabled={analyzeLeftMutation.isPending || analyzeRightMutation.isPending}
                size="lg"
                className="px-8"
                data-testid="button-compare-players"
              >
                {(analyzeLeftMutation.isPending || analyzeRightMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Comparing...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Compare
                  </>
                )}
              </Button>
            </div>
          )}

          {leftPlayer.outlook && rightPlayer.outlook && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Comparison Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const leftComp = leftPlayer.outlook?.marketSignals?.composite;
                  const rightComp = rightPlayer.outlook?.marketSignals?.composite;
                  let winnerSide: "left" | "right" | "tie" = "tie";
                  if (typeof leftComp === "number" && typeof rightComp === "number") {
                    if (leftComp > rightComp) winnerSide = "left";
                    else if (rightComp > leftComp) winnerSide = "right";
                  }
                  const winnerName =
                    winnerSide === "left" ? leftPlayer.name :
                    winnerSide === "right" ? rightPlayer.name : null;

                  const renderPlayerColumn = (
                    side: "left" | "right",
                    player: ComparisonPlayer,
                  ) => {
                    const o = player.outlook!;
                    const ms = o.marketSignals;
                    const isWinner = winnerSide === side;
                    const composite = typeof ms?.composite === "number" ? Math.round(ms.composite) : null;
                    const phase = o.marketPhase;
                    const summary = o.investmentCall?.oneLineRationale || (o.thesis && o.thesis[0]) || null;
                    const bars: Array<{ label: string; value: number | undefined }> = [
                      { label: "Demand", value: ms?.demandScore },
                      { label: "Momentum", value: ms?.momentumScore },
                      { label: "Hype", value: ms?.hypeScore },
                      { label: "Liquidity", value: ms?.liquidityScore },
                    ];
                    return (
                      <div
                        className={`p-4 rounded-lg border ${
                          isWinner
                            ? "border-amber-500/50 bg-amber-500/5 ring-2 ring-amber-500/30"
                            : "border-border bg-muted/20"
                        }`}
                        data-testid={`comparison-column-${side}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <p className="text-sm font-semibold truncate" data-testid={`text-comparison-name-${side}`}>{player.name}</p>
                          {isWinner && (
                            <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1" data-testid={`badge-winner-${side}`}>
                              <Trophy className="h-3 w-3" />
                              Winner
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <Badge className={`${getVerdictColor(o.verdict?.action)} gap-1`} data-testid={`badge-verdict-${side}`}>
                            {getVerdictIcon(o.verdict?.action)}
                            {getVerdictLabel(o.investmentCall?.verdict, o.investmentCall?.postureLabel)}
                          </Badge>
                          {phase && (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-phase-${side}`}>
                              {formatEnumLabel(phase)}
                            </Badge>
                          )}
                        </div>
                        <div className="mb-4">
                          <p className="text-xs text-muted-foreground">Composite Score</p>
                          <p
                            className={`text-3xl font-bold ${isWinner ? "text-amber-600 dark:text-amber-400" : ""}`}
                            data-testid={`text-composite-${side}`}
                          >
                            {composite !== null ? composite : "—"}
                          </p>
                        </div>
                        <div className="space-y-2 mb-4">
                          {bars.map((b) => {
                            const v = typeof b.value === "number" ? Math.max(0, Math.min(100, Math.round(b.value))) : null;
                            return (
                              <div key={b.label}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">{b.label}</span>
                                  <span className="font-medium" data-testid={`text-${b.label.toLowerCase()}-${side}`}>
                                    {v !== null ? v : "—"}
                                  </span>
                                </div>
                                <Progress value={v ?? 0} className="h-1.5" />
                              </div>
                            );
                          })}
                        </div>
                        {summary && (
                          <p className="text-sm text-muted-foreground" data-testid={`text-summary-${side}`}>
                            {summary}
                          </p>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20" data-testid="better-investment-verdict">
                        <div className="flex items-center gap-2 justify-center">
                          <Trophy className="h-5 w-5 text-amber-500" />
                          <span className="font-semibold text-lg">
                            {winnerSide === "tie"
                              ? "Tie — composite scores are equal"
                              : `${winnerName} wins by composite score`}
                          </span>
                        </div>
                        {winnerSide !== "tie" && typeof leftComp === "number" && typeof rightComp === "number" && (
                          <p className="text-sm text-muted-foreground text-center mt-1">
                            {Math.round(Math.max(leftComp, rightComp))} vs {Math.round(Math.min(leftComp, rightComp))}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderPlayerColumn("left", leftPlayer)}
                        {renderPlayerColumn("right", rightPlayer)}
                      </div>
                    </>
                  );
                })()}

                {!narrative && (
                  <div className="mt-6 text-center">
                    <Button 
                      onClick={() => fetchNarrativeMutation.mutate()}
                      disabled={isLoadingNarrative}
                      variant="outline"
                      className="gap-2"
                      data-testid="button-deep-analysis"
                    >
                      {isLoadingNarrative ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating Deep Analysis...
                        </>
                      ) : (
                        <>
                          <Lightbulb className="h-4 w-4" />
                          Get Deep Analysis
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      AI-powered investment comparison with "The Case For" each player
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {leftPlayer.outlook && rightPlayer.outlook && (
            <div className="mt-6">
              <ComparisonPriceTrendChart
                player1Request={{
                  playerName: leftPlayer.name,
                  sport: leftPlayer.sport,
                }}
                player2Request={{
                  playerName: rightPlayer.name,
                  sport: rightPlayer.sport,
                }}
                player1Name={leftPlayer.name}
                player2Name={rightPlayer.name}
              />
            </div>
          )}

          {narrative && leftPlayer.outlook && rightPlayer.outlook && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Card className="bg-muted/20" data-testid="card-case-player1">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg" data-testid="text-case-title-player1">{narrative.caseForPlayer1.title}</CardTitle>
                      <Badge variant="outline" className="text-xs" data-testid="badge-strategy-player1">
                        {narrative.caseForPlayer1.strategy}
                      </Badge>
                    </div>
                    <CardDescription data-testid="text-case-summary-player1">{narrative.caseForPlayer1.summary}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2" data-testid="list-case-points-player1">
                      {narrative.caseForPlayer1.points.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-muted-foreground font-bold mt-0.5">•</span>
                          <span className="text-muted-foreground">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                
                <Card className="bg-amber-500/5 dark:bg-amber-500/10" data-testid="card-case-player2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg" data-testid="text-case-title-player2">{narrative.caseForPlayer2.title}</CardTitle>
                      <Badge variant="outline" className="text-xs" data-testid="badge-strategy-player2">
                        {narrative.caseForPlayer2.strategy}
                      </Badge>
                    </div>
                    <CardDescription data-testid="text-case-summary-player2">{narrative.caseForPlayer2.summary}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2" data-testid="list-case-points-player2">
                      {narrative.caseForPlayer2.points.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">•</span>
                          <span className="text-muted-foreground">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
              
              <Card className="mt-6 bg-muted/30" data-testid="card-my-take">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5" />
                    My Take
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm" data-testid="text-mytake-reasoning">{narrative.myTake.reasoning}</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-background border" data-testid="card-value-investor-pick">
                      <p className="text-xs text-muted-foreground mb-1">Value Investor Pick</p>
                      <p className="font-medium" data-testid="text-value-investor-pick">{narrative.myTake.valueInvestorPick}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background border" data-testid="card-bluechip-pick">
                      <p className="text-xs text-muted-foreground mb-1">Blue Chip Pick</p>
                      <p className="font-medium" data-testid="text-bluechip-pick">{narrative.myTake.blueChipPick}</p>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-muted/50 border" data-testid="card-bottom-line">
                    <p className="text-sm font-medium text-center" data-testid="text-bottom-line">
                      {narrative.myTake.bottomLine}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="cards">
          <p className="text-xs text-muted-foreground text-center mb-6">
            Compares player outlook (50%) + card tier (30%) + grade (20%) to determine the better investment
          </p>
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <CardComparisonInput
              card={leftCard}
              side="left"
              onUpdate={(updates) => setLeftCard(c => ({ ...c, ...updates }))}
            />
            
            <div className="flex items-center justify-center py-4 md:py-0">
              <div className="bg-muted rounded-full p-3">
                <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            
            <CardComparisonInput
              card={rightCard}
              side="right"
              onUpdate={(updates) => setRightCard(c => ({ ...c, ...updates }))}
            />
          </div>

          {(() => {
            const leftReady = !!leftCard.playerName && !!leftCard.tier && !!leftCard.grade;
            const rightReady = !!rightCard.playerName && !!rightCard.tier && !!rightCard.grade;
            const bothPlayersFilled = !!leftCard.playerName && !!rightCard.playerName;
            const bothOutlooksLoaded = !!leftCard.outlook && !!rightCard.outlook;
            if (!bothPlayersFilled || bothOutlooksLoaded) return null;
            const isPending = analyzeLeftCardMutation.isPending || analyzeRightCardMutation.isPending;
            return (
              <div className="mt-6 flex flex-col items-center gap-2">
                {(!leftReady || !rightReady) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Please select card tier and grade for both cards to compare
                  </p>
                )}
                <Button
                  onClick={() => {
                    if (!analyzeLeftCardMutation.isPending && !leftCard.outlook) analyzeLeftCardMutation.mutate();
                    if (!analyzeRightCardMutation.isPending && !rightCard.outlook) analyzeRightCardMutation.mutate();
                  }}
                  disabled={isPending || !leftReady || !rightReady}
                  size="lg"
                  className="px-8"
                  data-testid="button-compare-cards"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Comparing...
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Compare
                    </>
                  )}
                </Button>
              </div>
            );
          })()}

          {leftCard.outlook && rightCard.outlook && (
            <>
              <CardComparisonSummary leftCard={leftCard} rightCard={rightCard} />
              <div className="mt-6">
                <ComparisonPriceTrendChart
                  player1Request={{
                    playerName: leftCard.playerName,
                    sport: leftCard.sport,
                    year: leftCard.year,
                    setName: leftCard.setName,
                    variation: leftCard.tier,
                    grade: leftCard.grade,
                  }}
                  player2Request={{
                    playerName: rightCard.playerName,
                    sport: rightCard.sport,
                    year: rightCard.year,
                    setName: rightCard.setName,
                    variation: rightCard.tier,
                    grade: rightCard.grade,
                  }}
                  player1Name={leftCard.playerName}
                  player2Name={rightCard.playerName}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center mt-8">
        Not financial advice. Do your own research before acting.
      </p>
    </div>
  );
}
