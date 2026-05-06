import { db } from "./db";
import { playerOutlookCache, cards } from "@shared/schema";
import type { PlayerOutlookResponse, MarketSignals, MarketPhase, InvestmentVerdict } from "@shared/schema";
import { isNotNull, sql } from "drizzle-orm";
import { computeMarketSignals, classifyMarketPhase } from "./marketScoringEngine";
import type { MarketScoringInput } from "./marketScoringEngine";

// Phase 3 verdict-engine deploy timestamp (commit fb23cf6, 2026-04-17T03:25Z).
// Outlooks cached before this date were produced by the pre-Phase-3 model and
// must be excluded from actionable leaderboard surfaces.
const PHASE_3_LAYERED_MODEL_DEPLOY_CUTOFF = new Date("2026-04-17T03:25:00Z");

// Fix 1 helper: matches the Alpha-feed isInsufficientDataModifier pattern.
// Normalizes the modifier string (case-insensitive, strips spaces/dashes/underscores)
// before comparing. The legacy verdict.modifier field stores "Insufficient data"
// (display casing) while VERDICT_MODIFIER stores "INSUFFICIENT_DATA"; normalizing
// both to "insufficient_data" makes the check immune to casing drift.
// Access via (outlook as any).verdict?.modifier to stay compatible with the
// PlayerVerdictResult legacy path (same pattern as Alpha-feed routes.ts).
function isInsufficientDataModifier(mod: string | null | undefined): boolean {
  if (!mod) return false;
  const norm = String(mod).trim().toLowerCase().replace(/[\s_-]+/g, "_");
  return norm === "insufficient_data";
}

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
  marketDescriptor?: string;
};

function classifyMarketStructure(signals: MarketSignals, phase: string): string {
  const { demandScore, momentumScore, liquidityScore, hypeScore, volatilityScore, supplyPressureScore } = signals;
  const derived = signals.derivedMetrics;
  const mq = derived?.marketQuality ?? 50;
  const priceTrend = derived?.priceTrend ?? 0;
  const volumeTrend = derived?.volumeTrend ?? 1;

  if (hypeScore > 70 && momentumScore > 60 && (mq < 45 || volatilityScore < 40)) {
    return "Hype-driven, thin liquidity";
  }

  if (hypeScore > 65 && momentumScore > 55 && demandScore > 55) {
    return "Momentum-heavy, watch for exhaustion";
  }

  if (demandScore > 65 && momentumScore > 55 && liquidityScore > 50 && hypeScore < 45) {
    return "Broad-based demand";
  }

  if (demandScore > 60 && hypeScore < 40 && liquidityScore > 45 && momentumScore < 50) {
    return "Steady accumulation";
  }

  if (momentumScore > 65 && demandScore > 55 && liquidityScore > 50 && hypeScore < 55) {
    return "Strong momentum, healthy market";
  }

  if (phase === "Exhaustion" || (momentumScore < 35 && hypeScore > 50 && priceTrend < 0)) {
    return "Exhaustion risk";
  }

  if (phase === "Decline" || (priceTrend < -0.1 && momentumScore < 40)) {
    return "Declining, watch for bottom";
  }

  if (demandScore > 55 && hypeScore < 35 && momentumScore > 45 && phase === "Accumulation") {
    return "Early accumulation phase";
  }

  if (demandScore > 50 && liquidityScore > 55 && volatilityScore > 55 && supplyPressureScore > 50) {
    return "Healthy market structure";
  }

  if (liquidityScore < 35 && demandScore > 50) {
    return "Demand present, low liquidity";
  }

  if (volatilityScore < 35) {
    return "High volatility, unstable pricing";
  }

  if (supplyPressureScore < 35 && demandScore > 45) {
    return "Supply-constrained market";
  }

  if (mq > 60 && demandScore > 50) {
    return "Solid fundamentals";
  }

  return "Mixed signals";
}

type CachedLeaderboard = {
  result: LeaderboardResult;
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

export type LeaderboardResult = {
  entries: LeaderboardEntry[];
  dataFreshness: {
    oldestUpdate: string;
    newestUpdate: string;
    totalPlayers: number;
  };
};

export async function getLeaderboard(
  type: LeaderboardType,
  sport: string = "all",
  limit: number = 25,
): Promise<LeaderboardResult> {
  const cacheKey = `${type}:${sport}:${limit}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return cached.result;
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

  const VALID_SPORTS = new Set(["football", "basketball", "baseball", "hockey", "soccer"]);
  const scored: ScoredEntry[] = [];

  // Fix 2 (parity with Alpha-feed): build blocking-player set from cards table.
  // Excludes players who have ANY card in a blocking price state:
  // pending | needs_review | needs_admin_review | paywalled | insufficient_data.
  // Join key: LOWER(TRIM(player_name)) — same as Alpha feed, immune to 187-row
  // playerKey pollution (see polluted-key investigation).
  // Cost: ~0.3ms (one indexed scan on cards, ~32 rows today).
  const blockingRows = await db.execute<{ norm_name: string; has_blocking: boolean }>(sql`
    SELECT LOWER(TRIM(player_name)) AS norm_name,
           BOOL_OR(price_state IN (
             'pending','needs_review','needs_admin_review','paywalled','insufficient_data'
           )) AS has_blocking
    FROM cards
    WHERE player_name IS NOT NULL AND player_name <> ''
    GROUP BY 1
  `);
  const blockingPlayerKeys = new Set<string>(
    (blockingRows.rows as Array<{ norm_name: string; has_blocking: boolean }>)
      .filter((r) => r.has_blocking)
      .map((r) => r.norm_name)
  );

  let oldestUpdate: Date | null = null;
  let newestUpdate: Date | null = null;

  for (const row of rows) {
    const rowUpdated = row.updatedAt ? new Date(row.updatedAt) : null;

    // Fix 6 (parity with Alpha-feed): exclude pre-Phase-3 cached outlooks.
    // Any row with updatedAt before the Phase 3 deploy cutoff was scored by
    // the old model and must not appear on actionable leaderboard surfaces.
    // dataFreshness (oldestUpdate/newestUpdate) is computed AFTER this guard
    // so the reported freshness window reflects only the rows actually served.
    if (!rowUpdated || rowUpdated < PHASE_3_LAYERED_MODEL_DEPLOY_CUTOFF) continue;

    // Track freshness window across all rows that pass the cutoff guard.
    if (!oldestUpdate || rowUpdated < oldestUpdate) oldestUpdate = rowUpdated;
    if (!newestUpdate || rowUpdated > newestUpdate) newestUpdate = rowUpdated;
    const rowSport = row.sport.toLowerCase();
    if (!VALID_SPORTS.has(rowSport)) continue;
    if (sport !== "all" && rowSport !== sport.toLowerCase()) continue;

    const playerNameTrimmed = (row.playerName || "").trim();
    if (!playerNameTrimmed.includes(" ")) continue;

    const outlook = row.outlookJson as PlayerOutlookResponse;
    if (!outlook) continue;

    // Fix 1 (parity with Alpha-feed): exclude INSUFFICIENT_DATA outlooks from
    // actionable leaderboard buckets. These rows lack reliable signal and must
    // not influence Buy/Sell/Speculative rankings.
    if (isInsufficientDataModifier((outlook as any).verdict?.modifier)) continue;

    // Fix 2 (parity with Alpha-feed): exclude players whose cards are in a
    // blocking price state. blockingPlayerKeys was built above via cross-table
    // query on cards.player_name (LOWER TRIM), matching Alpha-feed precedent.
    if (blockingPlayerKeys.has((row.playerName || "").toLowerCase().trim())) continue;

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

    const classification = row.classificationJson as any;
    const stage = classification?.stage || "";
    const injuryStatus = classification?.injuryStatus || outlook.injuryStatus || "";
    const careerStatus = classification?.careerStatus || "";
    const isInjured = /INJURED|OUT|ACL|TORN|SURGERY|IR\b/i.test(injuryStatus) || /INJURED/i.test(careerStatus);
    const isRetired = /RETIRED|BUST|INACTIVE|FREE_AGENT_UNSIGNED/i.test(stage) || /RETIRED|BUST/i.test(careerStatus);
    const isAging = /AGING|VETERAN/i.test(stage);
    const verdict = outlook.investmentCall?.verdict || "";
    const isAvoid = /AVOID/i.test(verdict);

    if (type === "best") {
      if (isInjured) score *= 0.6;
      if (isRetired) score *= 0.5;
      else if (isAging) score *= 0.85;
      if (isAvoid) score *= 0.7;
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

  scored.sort((a, b) => b.score - a.score);

  const deduped: ScoredEntry[] = [];
  const seenPlayers = new Set<string>();
  const seenFuzzy = new Map<string, string>();
  
  const fuzzyKey = (name: string): string => {
    return name.toLowerCase().trim()
      .replace(/[^a-z ]/g, "")
      .replace(/\s+/g, " ")
      .split(" ")
      .map(w => w.length <= 2 ? w : w.replace(/[aeiou]/g, ""))
      .join(" ");
  };
  
  const editDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) matrix[i] = [i];
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    return matrix[a.length][b.length];
  };

  const isSimilar = (a: string, b: string): boolean => {
    if (a === b) return true;
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.startsWith(shorter) && longer.length - shorter.length <= 3) return true;
    if (shorter.length >= 4 && longer.includes(shorter)) return true;
    if (shorter.length >= 5 && editDistance(a, b) <= 2) return true;
    const wordsA = a.split(" ").filter(Boolean);
    const wordsB = b.split(" ").filter(Boolean);
    if (wordsA.length === wordsB.length && wordsA.length >= 2) {
      let wordMatches = 0;
      for (let i = 0; i < wordsA.length; i++) {
        if (wordsA[i] === wordsB[i] || editDistance(wordsA[i], wordsB[i]) <= 1) wordMatches++;
      }
      if (wordMatches === wordsA.length) return true;
    }
    return false;
  };
  
  for (const entry of scored) {
    const normalizedName = entry.playerName.toLowerCase().trim();
    if (seenPlayers.has(normalizedName)) continue;
    
    const fk = fuzzyKey(normalizedName);
    let isDupe = false;
    for (const [existingFk, existingName] of seenFuzzy) {
      if (isSimilar(fk, existingFk) || isSimilar(normalizedName, existingName)) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;
    
    seenPlayers.add(normalizedName);
    seenFuzzy.set(fk, normalizedName);
    deduped.push(entry);
  }

  const dedupedScored = deduped;
  const totalPlayers = dedupedScored.length;
  const sortedScores = dedupedScored.map(s => s.score).sort((a, b) => a - b);

  const entries: LeaderboardEntry[] = dedupedScored.slice(0, limit).map((s, i) => {
    const investmentVerdict = s.outlook.investmentCall?.verdict || "HOLD_CORE";
    const { verdict, label } = mapVerdict(investmentVerdict as InvestmentVerdict);
    const met = s.outlook.marketMetrics;

    let trend7d = "";
    if (met?.avgSoldPrice7d && met?.avgSoldPrice && met.avgSoldPrice > 0) {
      const delta = ((met.avgSoldPrice7d - met.avgSoldPrice) / met.avgSoldPrice) * 100;
      trend7d = `${delta >= 0 ? "+" : ""}${Math.round(delta)}%`;
    } else if (met?.priceTrend && met.priceTrend !== 0) {
      const pct = Math.round(met.priceTrend * 100);
      trend7d = `${pct >= 0 ? "+" : ""}${pct}%`;
    } else if (s.signals.derivedMetrics?.priceTrend && s.signals.derivedMetrics.priceTrend !== 0) {
      const derived = s.signals.derivedMetrics.priceTrend;
      const pct = Math.round((derived - 1) * 100);
      trend7d = `${pct >= 0 ? "+" : ""}${pct}%`;
    }

    const avgPrice = met?.avgSoldPrice ? `$${met.avgSoldPrice.toFixed(0)}` : "";
    const mq = s.signals.derivedMetrics?.marketQuality ?? 0;

    const pctRaw = computePercentile(s.score, sortedScores);
    const pctLabel = formatPercentile(pctRaw);

    const phaseLabel = s.phase !== "UNKNOWN" ? s.phase.charAt(0) + s.phase.slice(1).toLowerCase() : "";

    return {
      rank: i + 1,
      playerName: s.playerName,
      sport: s.sport,
      score: Math.round(s.score),
      phase: phaseLabel,
      verdict,
      verdictLabel: label,
      keySignal: getKeySignal(s.signals, type),
      trend7d,
      avgPrice,
      confidence: s.signals.confidenceScore >= 65 ? "HIGH" : s.signals.confidenceScore >= 40 ? "MED" : "LOW",
      marketQuality: mq,
      slug: s.slug,
      percentile: pctLabel,
      marketDescriptor: classifyMarketStructure(s.signals, phaseLabel),
    };
  });

  const result: LeaderboardResult = {
    entries,
    dataFreshness: {
      oldestUpdate: oldestUpdate?.toISOString() || new Date().toISOString(),
      newestUpdate: newestUpdate?.toISOString() || new Date().toISOString(),
      totalPlayers: totalPlayers,
    },
  };

  leaderboardCache.set(cacheKey, { result, generatedAt: Date.now() });
  return result;
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

  const VALID_SPORTS_PCT = new Set(["football", "basketball", "baseball", "hockey", "soccer"]);
  const players: PlayerScore[] = [];

  for (const row of rows) {
    if (!VALID_SPORTS_PCT.has(row.sport.toLowerCase())) continue;
    const outlook = row.outlookJson as PlayerOutlookResponse;
    if (!outlook) continue;

    // Fix 6 (parity with Alpha-feed): exclude pre-Phase-3 cached outlooks from
    // the percentile denominator. This narrows the comparison population to
    // rows scored by the current model only.
    //
    // TRADEOFF (document for future engineers): filtering the denominator shifts
    // the semantic meaning of each percentile. A score in the "Top 30%" after
    // this filter means "better than 70% of *fresh-data peers*" not "better than
    // 70% of all-time peers." For the leaderboard use case this is the correct
    // interpretation — we want fresh-data comparisons. However, any consumer
    // that compares percentile values across time will see a step-change
    // discontinuity at PHASE_3_LAYERED_MODEL_DEPLOY_CUTOFF (2026-04-17T03:25Z).
    // This is intentional and not an oversight.
    const rowUpdatedPct = row.updatedAt ? new Date(row.updatedAt) : null;
    if (!rowUpdatedPct || rowUpdatedPct < PHASE_3_LAYERED_MODEL_DEPLOY_CUTOFF) continue;

    // Fix 1 (parity with Alpha-feed): exclude INSUFFICIENT_DATA outlooks from
    // percentile population. These rows lack reliable signal and must not
    // skew the population distribution used for ranking comparisons.
    if (isInsufficientDataModifier((outlook as any).verdict?.modifier)) continue;

    // NOTE: Fix 2 (pricing-state guard) intentionally NOT applied to percentile
    // population. Excluding players by card priceState would skew the scoring
    // distribution; the population should include all fresh, data-complete rows
    // regardless of card transactability. Leaderboard rendering (getLeaderboard)
    // handles the Fix 2 exclusion at display time.

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
