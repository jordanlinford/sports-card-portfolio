import { db } from "./db";
import { cards, displayCases, playerWatchlist, portfolioSnapshots, nextBuys } from "@shared/schema";
import type { 
  PortfolioProfile, 
  PortfolioExposures, 
  RiskSignal, 
  PortfolioSnapshot, 
  InsertPortfolioSnapshot,
  RecommendedAction
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import OpenAI from "openai";
import { fetchPlayerNews } from "./outlookEngine";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    // Prefer OPENAI_API_KEY first, fall back to AI_INTEGRATIONS only if it's not a placeholder
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const aiIntegrationsKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (aiIntegrationsKey && !aiIntegrationsKey.includes('DUMMY')) {
        apiKey = aiIntegrationsKey;
      }
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

type CareerStage = "Rookie" | "Rising" | "Prime" | "Decline" | "Retired" | "Unknown";

function inferCareerStage(card: any): CareerStage {
  if (card.isRookie) return "Rookie";
  if (card.playerAge) {
    if (card.playerAge <= 24) return "Rising";
    if (card.playerAge <= 30) return "Prime";
    if (card.playerAge <= 35) return "Decline";
    return "Retired";
  }
  return "Unknown";
}

function inferTeamMarketSize(teamMarket: string | null): "Large" | "Mid" | "Small" | "Unknown" {
  if (!teamMarket) return "Unknown";
  const market = teamMarket.toLowerCase();
  if (market === "large" || market === "big") return "Large";
  if (market === "mid" || market === "medium") return "Mid";
  if (market === "small") return "Small";
  return "Unknown";
}

function normalizeGrader(grader: string | null): string {
  if (!grader) return "Raw";
  const normalized = grader.toUpperCase().trim();
  if (normalized.includes("PSA")) return "PSA";
  if (normalized.includes("BGS") || normalized.includes("BECKETT")) return "BGS";
  if (normalized.includes("SGC")) return "SGC";
  if (normalized.includes("CGC")) return "CGC";
  return "Raw";
}

export async function buildPortfolioProfile(userId: string): Promise<PortfolioProfile> {
  const userCards = await db
    .select({
      id: cards.id,
      title: cards.title,
      playerName: cards.playerName,
      sport: cards.sport,
      position: cards.position,
      estimatedValue: cards.estimatedValue,
      grader: cards.grader,
      grade: cards.grade,
      isRookie: cards.isRookie,
      playerAge: cards.playerAge,
      teamMarketSize: cards.teamMarketSize,
      salesLast30Days: cards.salesLast30Days,
      displayCaseId: cards.displayCaseId,
    })
    .from(cards)
    .innerJoin(displayCases, eq(cards.displayCaseId, displayCases.id))
    .where(eq(displayCases.userId, userId));

  const cardCount = userCards.length;
  const totalValue = userCards.reduce((sum, card) => sum + (card.estimatedValue || 0), 0);

  const sports: Record<string, number> = {};
  const positions: Record<string, number> = {};
  const careerStages: Record<string, number> = {};
  const teamMarkets: Record<string, number> = {};
  const grades: Record<string, number> = {};
  const playerValues: Record<string, number> = {};
  const teamValues: Record<string, number> = {};
  
  let highLiquidityCount = 0;
  let lowLiquidityCount = 0;

  const notableHoldings: PortfolioProfile["notableHoldings"] = [];

  for (const card of userCards) {
    const value = card.estimatedValue || 0;
    const weight = totalValue > 0 ? value / totalValue : 0;

    const sport = card.sport || "Unknown";
    sports[sport] = (sports[sport] || 0) + weight;

    const position = card.position || "Unknown";
    positions[position] = (positions[position] || 0) + weight;

    const stage = inferCareerStage(card);
    careerStages[stage] = (careerStages[stage] || 0) + weight;

    const market = inferTeamMarketSize(card.teamMarketSize);
    teamMarkets[market] = (teamMarkets[market] || 0) + weight;

    const grader = normalizeGrader(card.grader);
    grades[grader] = (grades[grader] || 0) + weight;

    const playerName = card.playerName || "Unknown";
    playerValues[playerName] = (playerValues[playerName] || 0) + value;

    if (card.salesLast30Days !== null) {
      if (card.salesLast30Days >= 10) highLiquidityCount++;
      else if (card.salesLast30Days <= 2) lowLiquidityCount++;
    }

    if (value >= 100) {
      notableHoldings.push({
        cardId: card.id,
        title: card.title,
        estValue: value,
        player: playerName,
        position: card.position || "Unknown",
        stage: stage,
      });
    }
  }

  notableHoldings.sort((a, b) => b.estValue - a.estValue);

  const topPlayers = Object.entries(playerValues)
    .map(([player, value]) => ({
      player,
      value,
      pct: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topTeams = Object.entries(teamValues)
    .map(([team, value]) => ({
      team,
      pct: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const weakSpots: PortfolioProfile["weakSpots"] = [];
  
  const qbExposure = positions["QB"] || 0;
  const wrExposure = positions["WR"] || 0;
  const primeExposure = careerStages["Prime"] || 0;
  
  if (wrExposure < 0.15) {
    weakSpots.push({
      label: "Low WR exposure",
      detail: `Only ${Math.round(wrExposure * 100)}% of value in WRs`,
    });
  }
  if (primeExposure < 0.20) {
    weakSpots.push({
      label: "Limited prime player exposure",
      detail: `Only ${Math.round(primeExposure * 100)}% in prime career players`,
    });
  }

  return {
    portfolioValueEstimate: totalValue,
    cardCount,
    sports,
    positions,
    careerStage: careerStages,
    teamMarket: teamMarkets,
    grades,
    concentration: {
      topPlayers,
      topTeams,
    },
    liquiditySignals: {
      highLiquidityPct: cardCount > 0 ? highLiquidityCount / cardCount : 0,
      lowLiquidityPct: cardCount > 0 ? lowLiquidityCount / cardCount : 0,
    },
    notableHoldings: notableHoldings.slice(0, 10),
    weakSpots,
  };
}

export function generateRiskSignals(profile: PortfolioProfile): RiskSignal[] {
  const signals: RiskSignal[] = [];

  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.15) {
    signals.push({
      code: "HIGH_PLAYER_CONCENTRATION",
      label: "High Player Concentration",
      severity: topPlayer.pct > 0.25 ? "high" : "med",
      explanation: `${topPlayer.player} represents ${Math.round(topPlayer.pct * 100)}% of your portfolio value. Consider diversifying.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.player === topPlayer.player)
        .map(h => h.cardId),
    });
  }

  const qbExposure = profile.positions["QB"] || 0;
  if (qbExposure > 0.55) {
    signals.push({
      code: "HIGH_POSITION_CONCENTRATION",
      label: "Heavy QB Concentration",
      severity: qbExposure > 0.70 ? "high" : "med",
      explanation: `QBs make up ${Math.round(qbExposure * 100)}% of your value. Position risk is elevated.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.position === "QB")
        .map(h => h.cardId),
    });
  }

  const rookieRisingExposure = (profile.careerStage["Rookie"] || 0) + (profile.careerStage["Rising"] || 0);
  if (rookieRisingExposure > 0.45) {
    signals.push({
      code: "HIGH_ROOKIE_EXPOSURE",
      label: "Heavy Early Career Exposure",
      severity: rookieRisingExposure > 0.60 ? "high" : "med",
      explanation: `${Math.round(rookieRisingExposure * 100)}% of value in rookies/rising players. Higher volatility expected.`,
      affectedCardIds: profile.notableHoldings
        .filter(h => h.stage === "Rookie" || h.stage === "Rising")
        .map(h => h.cardId),
    });
  }

  const smallMarketExposure = profile.teamMarket["Small"] || 0;
  if (smallMarketExposure > 0.35) {
    signals.push({
      code: "SMALL_MARKET_BIAS",
      label: "Small Market Concentration",
      severity: smallMarketExposure > 0.50 ? "high" : "med",
      explanation: `${Math.round(smallMarketExposure * 100)}% of value in small market teams. May limit liquidity.`,
      affectedCardIds: [],
    });
  }

  if (profile.liquiditySignals.lowLiquidityPct > 0.25) {
    signals.push({
      code: "LOW_LIQUIDITY",
      label: "Liquidity Concerns",
      severity: profile.liquiditySignals.lowLiquidityPct > 0.40 ? "high" : "med",
      explanation: `${Math.round(profile.liquiditySignals.lowLiquidityPct * 100)}% of cards have low recent sales volume. Exit may be difficult.`,
      affectedCardIds: [],
    });
  }

  const rawExposure = profile.grades["Raw"] || 0;
  if (rawExposure > 0.40) {
    signals.push({
      code: "GRADE_RISK",
      label: "High Raw Card Exposure",
      severity: rawExposure > 0.60 ? "high" : "med",
      explanation: `${Math.round(rawExposure * 100)}% of value in raw cards. Consider grading high-value items.`,
      affectedCardIds: [],
    });
  }

  return signals;
}

const PORTFOLIO_OUTLOOK_SYSTEM_PROMPT = `You are PortfolioOutlookAI for a sports card investing platform.
Tone: confident, honest, non-hype, collector-native. No cringe. No financial advice disclaimers beyond: "Not financial advice."
You must be explainable. Avoid obvious takes. Use the user's actual exposures.
Never claim certainty. Prefer "likely / tends to / historically" language.
Return ONLY valid JSON matching the schema. No markdown, no extra keys.`;

function buildPortfolioOutlookPrompt(profile: PortfolioProfile, riskSignals: RiskSignal[], playerNews: Record<string, string[]>): string {
  // Build news section for top players
  const newsSection = Object.entries(playerNews).length > 0 
    ? `\nRECENT PLAYER NEWS (REAL-TIME - use this for current context, may supersede your training data):\n${Object.entries(playerNews).map(([player, snippets]) => 
        `${player}:\n${snippets.map(s => `  - ${s}`).join('\n')}`
      ).join('\n\n')}\n`
    : "";

  return `Generate a portfolio outlook for this user based on the portfolio profile and risk signals.

Portfolio Profile:
${JSON.stringify(profile, null, 2)}

Risk Signals:
${JSON.stringify(riskSignals, null, 2)}
${newsSection}
Required Output JSON schema:
{
  "overallStance": "Speculative Growth | Balanced | Value | Legacy | Aggressive Speculation",
  "confidenceScore": 1-100,
  "primaryDriver": "short phrase",
  "summaryShort": "1-2 sentences",
  "summaryLong": "5-8 sentences with specific exposures and tradeoffs",
  "opportunities": ["3 bullets, specific, not generic"],
  "watchouts": ["3 bullets, specific, not generic"],
  "recommendedNextActions": [
    {"label":"short", "why":"short", "cta":"string", "target":"portfolio|nextBuys|watchlist|marketOutlook"}
  ]
}

Rules:
- Mention 2-3 concrete exposure facts (like "QB is 58% of value", "rookie+rising is 53%").
- Use language that encourages planning: diversification, liquidity, cycle timing.
- If concentration is high, recommend reducing it via next buys that diversify.
- Keep it punchy and readable. No long paragraphs.
- If RECENT PLAYER NEWS is provided, use it to inform your analysis about players in the portfolio. The news is real-time and supersedes outdated training data.`;
}

type AIOutlookResponse = {
  overallStance: string;
  confidenceScore: number;
  primaryDriver: string;
  summaryShort: string;
  summaryLong: string;
  opportunities: string[];
  watchouts: string[];
  recommendedNextActions: RecommendedAction[];
};

export async function generatePortfolioOutlook(userId: string): Promise<PortfolioSnapshot> {
  const profile = await buildPortfolioProfile(userId);
  const riskSignals = generateRiskSignals(profile);

  const exposures: PortfolioExposures = {
    bySport: profile.sports,
    byPosition: profile.positions,
    byCareerStage: profile.careerStage,
    byTeamMarket: profile.teamMarket,
    byGradeCompany: profile.grades,
    topPlayersConcentration: profile.concentration.topPlayers,
    topTeamsConcentration: profile.concentration.topTeams,
  };

  // Fetch real-time news for top players in portfolio (up to 5)
  const playerNews: Record<string, string[]> = {};
  const topPlayerNames = profile.concentration.topPlayers.slice(0, 5).map(p => p.player);
  
  for (const playerName of topPlayerNames) {
    if (playerName && playerName !== "Unknown") {
      try {
        const newsData = await fetchPlayerNews(playerName, null);
        if (newsData.snippets.length > 0) {
          playerNews[playerName] = newsData.snippets.slice(0, 3);
        }
      } catch (e) {
        console.log(`[PortfolioOutlook] Failed to fetch news for ${playerName}`);
      }
    }
  }
  console.log(`[PortfolioOutlook] Fetched news for ${Object.keys(playerNews).length} players`);

  if (profile.cardCount === 0) {
    const emptySnapshot: InsertPortfolioSnapshot = {
      userId,
      asOfDate: new Date(),
      overallStance: "No Portfolio",
      confidenceScore: 0,
      primaryDriver: "Empty portfolio",
      summaryShort: "Add cards to your portfolio to get AI-powered insights.",
      summaryLong: "Your portfolio is currently empty. Start by adding cards to your collection, and we'll analyze your exposures, concentration risks, and provide personalized recommendations for building a diversified sports card portfolio.",
      portfolioValueEstimate: 0,
      cardCount: 0,
      exposures,
      riskSignals: [],
      opportunities: ["Start building your collection", "Browse the Explore page for inspiration", "Use Quick Card Check before buying"],
      watchouts: [],
      recommendedNextActions: [
        { label: "Browse Portfolios", why: "Get inspiration from other collectors", cta: "View", target: "portfolio" },
        { label: "Check Market", why: "See trending players and cards", cta: "Explore", target: "marketOutlook" },
      ],
    };

    const [saved] = await db.insert(portfolioSnapshots).values(emptySnapshot).returning();
    return saved;
  }

  let aiResponse: AIOutlookResponse;
  
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: PORTFOLIO_OUTLOOK_SYSTEM_PROMPT },
        { role: "user", content: buildPortfolioOutlookPrompt(profile, riskSignals, playerNews) },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No AI response");
    
    aiResponse = JSON.parse(content);
  } catch (error) {
    console.error("AI portfolio outlook failed:", error);
    aiResponse = {
      overallStance: "Balanced",
      confidenceScore: 50,
      primaryDriver: "Unable to generate AI insights",
      summaryShort: "Portfolio analysis temporarily unavailable. Your collection shows interesting patterns.",
      summaryLong: "We encountered an issue generating your personalized outlook. Based on basic analysis, your portfolio has a mix of positions and career stages. Check back soon for full AI-powered insights.",
      opportunities: ["Review your top holdings", "Consider diversification", "Monitor player performance"],
      watchouts: ["Market conditions vary", "Stay informed on player news"],
      recommendedNextActions: [
        { label: "View Cards", why: "Review your collection", cta: "Browse", target: "portfolio" },
      ],
    };
  }

  const snapshot: InsertPortfolioSnapshot = {
    userId,
    asOfDate: new Date(),
    overallStance: aiResponse.overallStance,
    confidenceScore: aiResponse.confidenceScore,
    primaryDriver: aiResponse.primaryDriver,
    summaryShort: aiResponse.summaryShort,
    summaryLong: aiResponse.summaryLong,
    portfolioValueEstimate: profile.portfolioValueEstimate,
    cardCount: profile.cardCount,
    exposures,
    riskSignals,
    opportunities: aiResponse.opportunities,
    watchouts: aiResponse.watchouts,
    recommendedNextActions: aiResponse.recommendedNextActions,
  };

  const [saved] = await db.insert(portfolioSnapshots).values(snapshot).returning();
  return saved;
}

export async function getLatestPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot | null> {
  const [latest] = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(desc(portfolioSnapshots.asOfDate))
    .limit(1);

  return latest || null;
}

export async function isSnapshotFresh(userId: string, maxAgeHours: number = 24): Promise<boolean> {
  const latest = await getLatestPortfolioSnapshot(userId);
  if (!latest || !latest.asOfDate) return false;
  
  const ageMs = Date.now() - new Date(latest.asOfDate).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours < maxAgeHours;
}

// =============================================
// NEXT BUYS ENGINE
// =============================================

type NextBuyCandidate = {
  title: string;
  playerName: string;
  sport: string;
  year?: number;
  setName?: string;
  cardNumber?: string;
  variation?: string;
  gradeCompany?: string;
  grade?: string;
  estPrice?: number;
  source: string;
  sourceUrl?: string;
  position?: string;
  stage?: string;
  compsConfidence?: number;
  priceDiscount?: number;
  momentumTrend?: "up" | "flat" | "down";
};

function generateCardFingerprint(candidate: NextBuyCandidate): string {
  const parts = [
    candidate.playerName?.toLowerCase().trim() || "",
    candidate.year?.toString() || "",
    candidate.setName?.toLowerCase().trim() || "",
    candidate.variation?.toLowerCase().trim() || "",
    candidate.gradeCompany?.toLowerCase().trim() || "",
    candidate.grade?.toLowerCase().trim() || "",
  ];
  return parts.join("|");
}

function scoreValue(candidate: NextBuyCandidate): number {
  let score = 50;
  
  if (candidate.compsConfidence) {
    score += (candidate.compsConfidence - 50) * 0.3;
  }
  
  if (candidate.priceDiscount) {
    if (candidate.priceDiscount > 20) score += 25;
    else if (candidate.priceDiscount > 10) score += 15;
    else if (candidate.priceDiscount > 5) score += 8;
    else if (candidate.priceDiscount < -10) score -= 15;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreFit(candidate: NextBuyCandidate, profile: PortfolioProfile): number {
  let score = 50;
  
  const qbExposure = profile.positions["QB"] || 0;
  if (qbExposure > 0.50 && candidate.position !== "QB") {
    score += 15;
  }
  if (qbExposure < 0.20 && candidate.position === "QB") {
    score += 10;
  }
  
  const rookieExposure = (profile.careerStage["Rookie"] || 0) + (profile.careerStage["Rising"] || 0);
  if (rookieExposure > 0.50 && (candidate.stage === "Prime" || candidate.stage === "Decline")) {
    score += 15;
  }
  if (rookieExposure < 0.30 && candidate.stage === "Rookie") {
    score += 10;
  }
  
  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.15 && candidate.playerName !== topPlayer.player) {
    score += 10;
  }
  
  const wrExposure = profile.positions["WR"] || 0;
  if (wrExposure < 0.15 && candidate.position === "WR") {
    score += 20;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreMomentum(candidate: NextBuyCandidate): number {
  let score = 50;
  
  if (candidate.momentumTrend === "up") score += 25;
  else if (candidate.momentumTrend === "down") score -= 15;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateWhyBullets(
  candidate: NextBuyCandidate, 
  profile: PortfolioProfile,
  scores: { value: number; fit: number; momentum: number }
): string[] {
  const bullets: string[] = [];
  
  if (scores.fit >= 70) {
    const qbExposure = profile.positions["QB"] || 0;
    if (qbExposure > 0.50 && candidate.position !== "QB") {
      bullets.push(`Reduces QB concentration (adds ${candidate.position} exposure)`);
    }
    const wrExposure = profile.positions["WR"] || 0;
    if (wrExposure < 0.15 && candidate.position === "WR") {
      bullets.push("Fills WR gap in your portfolio");
    }
  }
  
  if (scores.value >= 70 && candidate.priceDiscount && candidate.priceDiscount > 10) {
    bullets.push(`Priced ${Math.round(candidate.priceDiscount)}% below recent comps`);
  }
  
  if (scores.momentum >= 70) {
    bullets.push("Momentum improving: trending upward");
  }
  
  const topPlayer = profile.concentration.topPlayers[0];
  if (topPlayer && topPlayer.pct > 0.15 && candidate.playerName !== topPlayer.player) {
    bullets.push(`Diversifies away from ${topPlayer.player} concentration`);
  }
  
  if (candidate.source === "Watchlist") {
    bullets.push("From your watchlist - you've been tracking this player");
  } else if (candidate.source === "HiddenGems") {
    bullets.push("Identified as undervalued by market analysis");
  }
  
  if (bullets.length === 0) {
    bullets.push("Solid addition to diversify your collection");
  }
  
  return bullets.slice(0, 5);
}

function computePortfolioImpact(
  candidate: NextBuyCandidate,
  profile: PortfolioProfile
): import("@shared/schema").NextBuyPortfolioImpact {
  const candidateWeight = (candidate.estPrice || 100) / (profile.portfolioValueEstimate || 1000);
  
  const impact: import("@shared/schema").NextBuyPortfolioImpact = {};
  
  if (candidate.position === "QB") {
    impact.qbExposureDelta = Math.round(candidateWeight * 100);
  } else if ((profile.positions["QB"] || 0) > 0.50) {
    impact.qbExposureDelta = -Math.round(candidateWeight * (profile.positions["QB"] || 0) * 100);
  }
  
  if (candidate.stage === "Rookie") {
    impact.rookieExposureDelta = Math.round(candidateWeight * 100);
  } else if ((profile.careerStage["Rookie"] || 0) > 0.30) {
    impact.rookieExposureDelta = -Math.round(candidateWeight * 50);
  }
  
  if (candidate.position && !(candidate.position in profile.positions)) {
    impact.diversificationGain = `Adds ${candidate.position} exposure`;
  }
  
  return impact;
}

export async function generateNextBuys(userId: string): Promise<import("@shared/schema").NextBuy[]> {
  const profile = await buildPortfolioProfile(userId);
  
  const watchlistPlayers = await db
    .select()
    .from(playerWatchlist)
    .where(eq(playerWatchlist.userId, userId))
    .limit(10);

  const candidates: NextBuyCandidate[] = [];
  
  for (const watched of watchlistPlayers) {
    candidates.push({
      title: `${watched.playerName} Base Rookie`,
      playerName: watched.playerName,
      sport: watched.sport || "football",
      source: "Watchlist",
      position: "Unknown",
      stage: "Unknown",
      estPrice: 50,
      compsConfidence: 60,
      momentumTrend: watched.verdictAtAdd === "BUY" ? "up" : "flat",
    });
  }
  
  if (candidates.length < 5) {
    const popularPlayers = [
      { name: "Jayden Daniels", position: "QB", stage: "Rookie", sport: "football" },
      { name: "Caleb Williams", position: "QB", stage: "Rookie", sport: "football" },
      { name: "Marvin Harrison Jr", position: "WR", stage: "Rookie", sport: "football" },
      { name: "Malik Nabers", position: "WR", stage: "Rookie", sport: "football" },
      { name: "Brock Bowers", position: "TE", stage: "Rookie", sport: "football" },
    ];
    
    for (const player of popularPlayers) {
      if (!candidates.some(c => c.playerName === player.name)) {
        candidates.push({
          title: `${player.name} 2024 Donruss Rated Rookie`,
          playerName: player.name,
          sport: player.sport,
          year: 2024,
          setName: "Donruss",
          source: "MarketOutlook",
          position: player.position,
          stage: player.stage,
          estPrice: 15 + Math.random() * 30,
          compsConfidence: 70,
          momentumTrend: "up",
        });
      }
    }
  }

  const scoredCandidates = candidates.map(candidate => {
    const valueScore = scoreValue(candidate);
    const fitScore = scoreFit(candidate, profile);
    const momentumScore = scoreMomentum(candidate);
    const overallScore = Math.round(0.45 * fitScore + 0.35 * valueScore + 0.20 * momentumScore);
    
    return {
      candidate,
      valueScore,
      fitScore,
      momentumScore,
      overallScore,
      verdict: overallScore >= 78 ? "BUY" : overallScore >= 60 ? "WATCH" : "SKIP",
    };
  });

  const validCandidates = scoredCandidates
    .filter(c => c.verdict !== "SKIP")
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 7);

  await db.delete(nextBuys).where(eq(nextBuys.userId, userId));

  const results: import("@shared/schema").NextBuy[] = [];
  
  for (const { candidate, valueScore, fitScore, momentumScore, overallScore, verdict } of validCandidates) {
    const whyBullets = generateWhyBullets(candidate, profile, { value: valueScore, fit: fitScore, momentum: momentumScore });
    const portfolioImpact = computePortfolioImpact(candidate, profile);
    
    try {
      const [inserted] = await db.insert(nextBuys).values({
        userId,
        asOfDate: new Date(),
        title: candidate.title,
        playerName: candidate.playerName,
        sport: candidate.sport,
        year: candidate.year,
        setName: candidate.setName,
        cardNumber: candidate.cardNumber,
        variation: candidate.variation,
        gradeCompany: candidate.gradeCompany,
        grade: candidate.grade,
        estPrice: candidate.estPrice,
        valueScore,
        fitScore,
        momentumScore,
        overallScore,
        verdict,
        whyBullets,
        portfolioImpact,
        source: candidate.source,
        sourceUrl: candidate.sourceUrl,
        cardFingerprint: generateCardFingerprint(candidate),
      }).returning();
      
      results.push(inserted);
    } catch (error) {
      console.error("Error inserting next buy:", error);
    }
  }

  return results;
}

export async function getLatestNextBuys(userId: string): Promise<import("@shared/schema").NextBuy[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buys = await db
    .select()
    .from(nextBuys)
    .where(and(
      eq(nextBuys.userId, userId),
      gte(nextBuys.asOfDate, today)
    ))
    .orderBy(desc(nextBuys.overallScore));

  return buys;
}
