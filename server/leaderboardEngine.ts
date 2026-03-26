import { db } from "./db";
import { playerOutlookCache } from "@shared/schema";
import type { PlayerOutlookResponse, MarketSignals, MarketPhase, InvestmentVerdict } from "@shared/schema";
import { isNotNull } from "drizzle-orm";
import { computeMarketSignals, classifyMarketPhase } from "./marketScoringEngine";
import type { MarketScoringInput } from "./marketScoringEngine";

export type LeaderboardType = "best" | "hype" | "emerging";

export type LeaderboardEntry = {
  rank: number;
  playerName: string;
  sport: string;
  score: number;
  phase: string;
  verdict: string;
  verdictLabel: string;
  keySignal: string;
  trend7d: string;
  avgPrice: string;
  confidence: string;
  marketQuality: number;
  slug?: string;
  percentile?: string;
};

type CachedLeaderboard = {
  entries: LeaderboardEntry[];
  generatedAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const leaderboardCache = new Map<string, CachedLeaderboard>();

function computeBestMarketScore(signals: MarketSignals): number {
  return (
    (signals.composite * 0.5) +
    (signals.momentumScore * 0.2) +
    (signals.demandScore * 0.2) +
    (signals.confidenceScore * 0.1)
  );
}

function computeHypeScore(signals: MarketSignals): number {
  const volumeTrend = signals.derivedMetrics?.volumeTrend ?? 1;
  return (
    (signals.hypeScore * 0.5) +
    (signals.momentumScore * 0.3) -
    (volumeTrend * 20)
  );
}

function computeOpportunityScore(signals: MarketSignals, phase: string): number {
  const volumeTrend = signals.derivedMetrics?.volumeTrend ?? 1;
  const lowHypeBonus = (100 - signals.hypeScore) * 0.2;
  const earlyPhaseBonus = (phase === "ACCUMULATION" || phase === "BREAKOUT") ? 15 : 0;
  return (
    (signals.demandScore * 0.3) +
    (volumeTrend * 30) +
    lowHypeBonus +
    earlyPhaseBonus
  );
}

function getKeySignal(signals: MarketSignals, type: LeaderboardType): string {
  const contribs = signals.contributions;
  if (!contribs) return "";

  const scored = [
    { name: "Demand", value: contribs.demand },
    { name: "Momentum", value: contribs.momentum },
    { name: "Liquidity", value: contribs.liquidity },
    { name: "Supply", value: contribs.supply },
    { name: "Anti-Hype", value: contribs.antiHype },
    { name: "Volatility", value: contribs.volatility },
  ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  if (type === "hype") {
    if (signals.hypeScore > 70) return `Hype ${signals.hypeScore}`;
    if (signals.momentumScore > 65) return `Momentum spike +${signals.momentumScore}`;
    return `${scored[0].name} ${scored[0].value > 0 ? "+" : ""}${scored[0].value.toFixed(0)}`;
  }

  if (type === "emerging") {
    const derived = signals.derivedMetrics;
    if (derived && derived.volumeTrend > 1.2) return "Volume rising";
    if (signals.demandScore > 60 && signals.hypeScore < 40) return "Demand + low hype";
    if (derived && derived.supplyRatio < 2) return "Supply tightening";
  }

  return `${scored[0].name} ${scored[0].value > 0 ? "+" : ""}${scored[0].value.toFixed(0)}`;
}

function mapVerdict(verdict: InvestmentVerdict): { verdict: string; label: string } {
  switch (verdict) {
    case "ACCUMULATE": return { verdict: "BUY", label: "Accumulate on dips" };
    case "HOLD_CORE": return { verdict: "HOLD_CORE", label: "Hold, don't chase" };
    case "TRADE_THE_HYPE": return { verdict: "TRADE_THE_HYPE", label: "Take profits now" };
    case "AVOID_NEW_MONEY": return { verdict: "AVOID", label: "Avoid new positions" };
    case "SPECULATIVE_FLYER": return { verdict: "SPECULATIVE", label: "Small spec bet" };
    case "HOLD_ROLE_RISK": return { verdict: "HOLD", label: "Hold, monitor role" };
    case "AVOID_STRUCTURAL": return { verdict: "AVOID", label: "Structural decline" };
    default: return { verdict: "HOLD", label: "Hold position" };
  }
}

export async function getLeaderboard(
  type: LeaderboardType,
  sport: string = "all",
  limit: number = 25,
): Promise<LeaderboardEntry[]> {
  const cacheKey = `${type}:${sport}:${limit}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

  const rows = await db
    .select()
    .from(playerOutlookCache)
    .where(isNotNull(playerOutlookCache.outlookJson));

  type ScoredEntry = {
    score: number;
    playerName: string;
    sport: string;
    outlook: PlayerOutlookResponse;
    signals: MarketSignals;
    phase: string;
    slug?: string;
  };

  const scored: ScoredEntry[] = [];

  for (const row of rows) {
    if (sport !== "all" && row.sport.toLowerCase() !== sport.toLowerCase()) continue;

    const outlook = row.outlookJson as PlayerOutlookResponse;
    if (!outlook) continue;

    let signals = outlook.marketSignals;

    if (!signals || !signals.composite) {
      const met = outlook.marketMetrics;
      if (met && met.source !== "unavailable") {
        try {
          const classification = row.classificationJson as any;
          const input: MarketScoringInput = {
            metrics: met,
            playerName: row.playerName,
            stage: classification?.stage || "UNKNOWN",
            roleTier: "STARTER",
            roleStabilityScore: 50,
          };
          signals = computeMarketSignals(input);
        } catch {
          continue;
        }
      } else {
        const investmentVerdict = outlook.investmentCall?.verdict;
        if (investmentVerdict) {
          const verdictScoreMap: Record<string, number> = {
            ACCUMULATE: 80, HOLD_CORE: 60, TRADE_THE_HYPE: 55,
            SPECULATIVE_FLYER: 45, HOLD_ROLE_RISK: 50,
            AVOID_NEW_MONEY: 25, AVOID_STRUCTURAL: 15,
          };
          const baseScore = verdictScoreMap[investmentVerdict] ?? 50;
          signals = {
            demandScore: baseScore, momentumScore: 50, liquidityScore: 50,
            supplyPressureScore: 50, volatilityScore: 50, hypeScore: 50,
            confidenceScore: 35, composite: baseScore,
          };
        } else {
          continue;
        }
      }
    }

    if (signals.confidenceScore < 30) continue;

    const phase = outlook.marketPhase ||
      (signals.derivedMetrics ? classifyMarketPhase(signals.derivedMetrics) : "UNKNOWN");

    let score: number;
    switch (type) {
      case "best":
        score = computeBestMarketScore(signals);
        break;
      case "hype":
        score = computeHypeScore(signals);
        break;
      case "emerging":
        score = computeOpportunityScore(signals, phase);
        break;
    }

    scored.push({
      score,
      playerName: row.playerName,
      sport: row.sport,
      outlook,
      signals,
      phase,
      slug: row.slug ?? undefined,
    });
  }

  if (type === "best") {
    scored.sort((a, b) => b.score - a.score);
  } else if (type === "hype") {
    scored.sort((a, b) => b.score - a.score);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  const totalPlayers = scored.length;
  const sortedScores = scored.map(s => s.score).sort((a, b) => a - b);

  const entries: LeaderboardEntry[] = scored.slice(0, limit).map((s, i) => {
    const investmentVerdict = s.outlook.investmentCall?.verdict || "HOLD_CORE";
    const { verdict, label } = mapVerdict(investmentVerdict as InvestmentVerdict);
    const met = s.outlook.marketMetrics;

    let trend7d = "";
    if (met?.avgSoldPrice7d && met?.avgSoldPrice && met.avgSoldPrice > 0) {
      const delta = ((met.avgSoldPrice7d - met.avgSoldPrice) / met.avgSoldPrice) * 100;
      trend7d = `${delta >= 0 ? "+" : ""}${Math.round(delta)}%`;
    }

    const avgPrice = met?.avgSoldPrice ? `$${met.avgSoldPrice.toFixed(0)}` : "";
    const mq = s.signals.derivedMetrics?.marketQuality ?? 0;

    const pctRaw = computePercentile(s.score, sortedScores);
    const pctLabel = formatPercentile(pctRaw);

    return {
      rank: i + 1,
      playerName: s.playerName,
      sport: s.sport,
      score: Math.round(s.score),
      phase: s.phase !== "UNKNOWN" ? s.phase.charAt(0) + s.phase.slice(1).toLowerCase() : "",
      verdict,
      verdictLabel: label,
      keySignal: getKeySignal(s.signals, type),
      trend7d,
      avgPrice,
      confidence: s.signals.confidenceScore >= 65 ? "HIGH" : s.signals.confidenceScore >= 40 ? "MED" : "LOW",
      marketQuality: mq,
      slug: s.slug,
      percentile: pctLabel,
    };
  });

  leaderboardCache.set(cacheKey, { entries, generatedAt: Date.now() });
  return entries;
}

export function invalidateLeaderboardCache() {
  leaderboardCache.clear();
  percentileCache = null;
}

export type PercentileData = {
  marketScore: string;
  demand: string;
  momentum: string;
  hype: string;
  quality: string;
  sampleSize: number;
};

type PercentileCacheEntry = {
  data: Map<string, PercentileData>;
  generatedAt: number;
};

let percentileCache: PercentileCacheEntry | null = null;
const PERCENTILE_TTL_MS = 60 * 60 * 1000;

function computePercentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const v of sortedValues) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const midrank = below + (equal - 1) / 2;
  return Math.round((midrank / (sortedValues.length - 1)) * 100);
}

function formatPercentile(pct: number, inverted: boolean = false): string {
  const effective = inverted ? pct : (100 - pct);
  if (effective <= 0) return "Top 1%";
  if (effective >= 100) return "Bottom 1%";
  return effective <= 50 ? `Top ${effective}%` : `Bottom ${100 - effective}%`;
}

export async function getPlayerPercentiles(playerKey?: string): Promise<Map<string, PercentileData>> {
  if (percentileCache && Date.now() - percentileCache.generatedAt < PERCENTILE_TTL_MS) {
    return percentileCache.data;
  }

  const rows = await db
    .select()
    .from(playerOutlookCache)
    .where(isNotNull(playerOutlookCache.outlookJson));

  type PlayerScore = {
    key: string;
    composite: number;
    demand: number;
    momentum: number;
    hype: number;
    quality: number;
  };

  const players: PlayerScore[] = [];

  for (const row of rows) {
    const outlook = row.outlookJson as PlayerOutlookResponse;
    if (!outlook) continue;

    let signals = outlook.marketSignals;

    if (!signals || !signals.composite) {
      const met = outlook.marketMetrics;
      if (met && met.source !== "unavailable") {
        try {
          const classification = row.classificationJson as any;
          const input: MarketScoringInput = {
            metrics: met,
            playerName: row.playerName,
            stage: classification?.stage || "UNKNOWN",
            roleTier: "STARTER",
            roleStabilityScore: 50,
          };
          signals = computeMarketSignals(input);
        } catch {
          continue;
        }
      } else {
        const investmentVerdict = outlook.investmentCall?.verdict;
        if (investmentVerdict) {
          const verdictScoreMap: Record<string, number> = {
            ACCUMULATE: 80, HOLD_CORE: 60, TRADE_THE_HYPE: 55,
            SPECULATIVE_FLYER: 45, HOLD_ROLE_RISK: 50,
            AVOID_NEW_MONEY: 25, AVOID_STRUCTURAL: 15,
          };
          const base = verdictScoreMap[investmentVerdict] ?? 50;
          signals = {
            demandScore: base, momentumScore: 50, liquidityScore: 50,
            supplyPressureScore: 50, volatilityScore: 50, hypeScore: 50,
            confidenceScore: 35, composite: base,
          };
        } else {
          continue;
        }
      }
    }

    const mq = signals.derivedMetrics?.marketQuality ??
      Math.round((signals.liquidityScore * 0.4) + (signals.volatilityScore * 0.3) + (signals.supplyPressureScore * 0.3));

    players.push({
      key: row.playerKey,
      composite: signals.composite,
      demand: signals.demandScore,
      momentum: signals.momentumScore,
      hype: signals.hypeScore,
      quality: mq,
    });
  }

  const sortedComposite = players.map(p => p.composite).sort((a, b) => a - b);
  const sortedDemand = players.map(p => p.demand).sort((a, b) => a - b);
  const sortedMomentum = players.map(p => p.momentum).sort((a, b) => a - b);
  const sortedHype = players.map(p => p.hype).sort((a, b) => a - b);
  const sortedQuality = players.map(p => p.quality).sort((a, b) => a - b);

  const result = new Map<string, PercentileData>();
  const sampleSize = players.length;

  for (const p of players) {
    result.set(p.key, {
      marketScore: formatPercentile(computePercentile(p.composite, sortedComposite)),
      demand: formatPercentile(computePercentile(p.demand, sortedDemand)),
      momentum: formatPercentile(computePercentile(p.momentum, sortedMomentum)),
      hype: formatPercentile(computePercentile(p.hype, sortedHype), true),
      quality: formatPercentile(computePercentile(p.quality, sortedQuality)),
      sampleSize,
    });
  }

  percentileCache = { data: result, generatedAt: Date.now() };
  return result;
}
