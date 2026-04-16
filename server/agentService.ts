import { GoogleGenAI, Type } from "@google/genai";
import { storage } from "./storage";
import { getPlayerOutlook } from "./playerOutlookEngine";
import { buildPortfolioProfile, generateRiskSignals } from "./portfolioIntelligenceService";
import { fetchPlayerNews, fetchGeminiMarketData, computeLiquidityScore } from "./outlookEngine";
import { getActiveHiddenGems } from "./hiddenGemsService";
import { getMarketBenchmarks } from "./marketBenchmarkService";
import type { Response } from "express";

/**
 * Convert a snake_case or lower-case enum value into a human-readable label
 * so the AI model never sees raw enums (prevents leaked strings like
 * 'strong_sell' in the user-facing response).
 */
function formatEnum(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatSignalType(value: string | null | undefined): string {
  const map: Record<string, string> = {
    buy: "Buy",
    strong_buy: "Strong Buy",
    sell: "Sell",
    strong_sell: "Strong Sell",
    hold: "Hold",
  };
  if (!value) return "";
  const key = String(value).toLowerCase();
  return map[key] || formatEnum(value);
}

/**
 * Post-process the AI model's final text so any raw enum values that leaked
 * through (e.g., 'strong_sell', "hold_core", TRADE_THE_HYPE) are shown to the
 * user as human-readable phrases.
 */
function humanizeResponse(text: string): string {
  if (!text) return text;
  const enumMap: Record<string, string> = {
    strong_buy: "Strong Buy",
    strong_sell: "Strong Sell",
    hold_core: "Hold Core",
    trade_the_hype: "Trade the Hype",
    speculative_flyer: "Speculative Flyer",
    accumulate: "Accumulate",
  };

  let out = text;

  // Quoted enum values: 'strong_sell' or "strong_sell"
  out = out.replace(/(['"`])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\1/g, (_m, q, val) => {
    const key = val.toLowerCase();
    return enumMap[key] || formatEnum(val);
  });

  // Bare UPPER_SNAKE_CASE tokens (e.g., TRADE_THE_HYPE) likely from schemas
  out = out.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (val) => {
    const key = val.toLowerCase();
    return enumMap[key] || formatEnum(val);
  });

  return out;
}

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
  httpOptions: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
    ? { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
    : undefined,
});

const AGENT_TOOLS = [
  {
    name: "get_portfolio_summary",
    description: "Get a complete summary of the user's card portfolio including total value, card count, sport distribution, and risk signals. Use this when the user asks about their collection, portfolio health, or overall strategy.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: { type: Type.STRING, description: "The user's ID" },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_player_outlook",
    description: "Get a detailed investment outlook for a specific player including market temperature, investment verdict (ACCUMULATE, HOLD, SELL, AVOID), price trends, and risk assessment. Use this when analyzing individual player card values or investment potential.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerName: { type: Type.STRING, description: "The player's full name" },
        sport: { type: Type.STRING, description: "The sport (football, basketball, baseball, hockey, soccer)" },
      },
      required: ["playerName", "sport"],
    },
  },
  {
    name: "get_player_news",
    description: "Get real-time news, injury updates, and momentum signals for a specific player. Use this to check for breaking news that could affect card values.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        playerName: { type: Type.STRING, description: "The player's full name" },
        sport: { type: Type.STRING, description: "The sport" },
      },
      required: ["playerName", "sport"],
    },
  },
  {
    name: "get_card_market_data",
    description: "Get real-time eBay market data for a specific card including recent sale prices, liquidity score, supply growth, and population estimates. Use this for pricing questions about specific cards.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The card title/description (e.g. '2023 Prizm CJ Stroud Silver PSA 10')" },
        playerName: { type: Type.STRING, description: "The player name" },
        year: { type: Type.STRING, description: "The card year" },
        set: { type: Type.STRING, description: "The card set name" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_display_case_cards",
    description: "Get all cards in a specific display case by name. Use this when the user asks about a specific case like 'my NFL case' or 'my rookies case'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: { type: Type.STRING, description: "The user's ID" },
        caseName: { type: Type.STRING, description: "The display case name to search for (partial match supported)" },
      },
      required: ["userId", "caseName"],
    },
  },
  {
    name: "get_hidden_gems",
    description: "Get current Hidden Gems — undervalued players identified by AI and community signals. Use when the user asks about buy opportunities, undervalued players, or investment ideas.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "get_market_benchmarks",
    description: "Get the user's portfolio growth compared against S&P 500 and Bitcoin performance. Returns the user's total cost basis, current value, portfolio return %, and how it compares to market benchmarks. Use when the user asks about portfolio performance, alpha, or how their cards are doing vs the market.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: { type: Type.STRING, description: "The user's ID" },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_all_portfolio_cards",
    description: "Get ALL cards across ALL display cases for a user. Use this when the user asks about their entire collection, wants to find specific cards, or needs a broad analysis.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: { type: Type.STRING, description: "The user's ID" },
      },
      required: ["userId"],
    },
  },
  {
    name: "get_alpha_signals",
    description: "Get active Alpha signals — AI-generated buy/sell/hold recommendations based on market analysis of the most popular cards. Optionally filter to only the user's portfolio cards. Use when the user asks about signals, Alpha feed, what to buy or sell, market opportunities, risk alerts, or 'what does Alpha say'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userId: { type: Type.STRING, description: "The user's ID — provide to get signals relevant to their portfolio" },
        signalType: { type: Type.STRING, description: "Optional filter: 'buy', 'strong_buy', 'sell', 'strong_sell', or 'hold'" },
        portfolioOnly: { type: Type.BOOLEAN, description: "If true, only return signals for cards the user owns" },
      },
    },
  },
];

function buildToolDeclarations() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  userId: string
): Promise<unknown> {
  switch (toolName) {
    case "get_portfolio_summary": {
      const profile = await buildPortfolioProfile(userId);
      const risks = generateRiskSignals(profile);
      return {
        totalValue: profile.portfolioValueEstimate,
        cardCount: profile.cardCount,
        sports: profile.sports,
        positions: profile.positions,
        careerStage: profile.careerStage,
        topPlayers: profile.concentration.topPlayers.slice(0, 10),
        topTeams: profile.concentration.topTeams,
        liquiditySignals: profile.liquiditySignals,
        notableHoldings: profile.notableHoldings.slice(0, 5),
        weakSpots: profile.weakSpots,
        risks: risks.map((r) => ({ code: r.code, label: r.label, severity: r.severity, explanation: r.explanation })),
      };
    }

    case "get_player_outlook": {
      const outlook = await getPlayerOutlook({
        playerName: args.playerName,
        sport: args.sport || undefined,
      });
      return {
        playerName: args.playerName,
        player: outlook.player,
        temperature: outlook.snapshot?.temperature,
        investmentCall: outlook.investmentCall,
        thesis: outlook.thesis,
        marketRealityCheck: outlook.marketRealityCheck,
        exposures: outlook.exposures?.slice(0, 5),
        peakTiming: outlook.peakTiming,
        teamContext: outlook.teamContext,
      };
    }

    case "get_player_news": {
      const news = await fetchPlayerNews(args.playerName, args.sport || "auto");
      return {
        playerName: args.playerName,
        momentum: news.momentum,
        newsCount: news.newsCount,
        snippets: news.snippets.slice(0, 5),
        roleStatus: news.roleStatus,
        injuryStatus: news.injuryStatus,
      };
    }

    case "get_card_market_data": {
      const marketData = await fetchGeminiMarketData({
        title: args.title,
        playerName: args.playerName || null,
        year: args.year ? parseInt(args.year, 10) || null : null,
        set: args.set || null,
      });
      return marketData || { message: "No market data found for this card" };
    }

    case "get_display_case_cards": {
      const cases = await storage.getDisplayCases(userId);
      const searchTerm = (args.caseName || "").toLowerCase();
      const matchedCase = cases.find(
        (c) =>
          c.name.toLowerCase().includes(searchTerm) ||
          c.name.toLowerCase() === searchTerm
      );
      if (!matchedCase) {
        return {
          error: `No display case found matching "${args.caseName}". Available cases: ${cases.map((c) => c.name).join(", ")}`,
        };
      }
      const cards = await storage.getCards(matchedCase.id);
      return {
        caseName: matchedCase.name,
        cardCount: cards.length,
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          playerName: c.playerName,
          year: c.year,
          set: c.set,
          estimatedValue: c.estimatedValue,
          grade: c.grade,
          grader: c.grader,
          outlookAction: c.outlookAction,
          outlookSupplyGrowth: c.outlookSupplyGrowth,
          sport: c.sport,
        })),
      };
    }

    case "get_hidden_gems": {
      const gems = await getActiveHiddenGems();
      return gems.map((g) => ({
        playerName: g.playerName,
        sport: g.sport,
        position: g.position,
        team: g.team,
        verdict: g.verdict,
        modifier: g.modifier,
        temperature: g.temperature,
        tier: g.tier,
        riskLevel: g.riskLevel,
        thesis: g.thesis,
        whyDiscounted: g.whyDiscounted,
        repricingCatalysts: g.repricingCatalysts,
        source: g.source,
        upsideScore: g.upsideScore,
        confidenceScore: g.confidenceScore,
      }));
    }

    case "get_market_benchmarks": {
      const [benchmarks, allCases] = await Promise.all([
        getMarketBenchmarks(),
        storage.getDisplayCases(userId),
      ]);

      let totalCostBasis = 0;
      let totalCurrentValue = 0;
      let cardsWithCost = 0;
      let cardsWithValue = 0;
      let totalCards = 0;
      const sportBreakdown: Record<string, { cost: number; value: number; count: number }> = {};

      for (const dc of allCases) {
        const cards = await storage.getCards(dc.id);
        for (const c of cards) {
          totalCards++;
          const currentVal = c.manualValue ?? c.estimatedValue ?? 0;
          const costBasis = c.purchasePrice ?? 0;
          const sport = c.sport || "Unknown";

          if (costBasis > 0) {
            totalCostBasis += costBasis;
            cardsWithCost++;
          }
          if (currentVal > 0) {
            totalCurrentValue += currentVal;
            cardsWithValue++;
          }

          if (!sportBreakdown[sport]) sportBreakdown[sport] = { cost: 0, value: 0, count: 0 };
          sportBreakdown[sport].cost += costBasis;
          sportBreakdown[sport].value += currentVal;
          sportBreakdown[sport].count++;
        }
      }

      const portfolioReturnPct = totalCostBasis > 0
        ? Math.round(((totalCurrentValue - totalCostBasis) / totalCostBasis) * 10000) / 100
        : null;

      const portfolioGainLoss = totalCostBasis > 0
        ? Math.round((totalCurrentValue - totalCostBasis) * 100) / 100
        : null;

      const sp500Latest = benchmarks.sp500.length > 0 ? benchmarks.sp500[benchmarks.sp500.length - 1] : null;
      const btcLatest = benchmarks.bitcoin.length > 0 ? benchmarks.bitcoin[benchmarks.bitcoin.length - 1] : null;

      const sportPerformance = Object.entries(sportBreakdown)
        .filter(([, v]) => v.cost > 0)
        .map(([sport, v]) => ({
          sport,
          costBasis: Math.round(v.cost * 100) / 100,
          currentValue: Math.round(v.value * 100) / 100,
          returnPct: Math.round(((v.value - v.cost) / v.cost) * 10000) / 100,
          cardCount: v.count,
        }))
        .sort((a, b) => b.currentValue - a.currentValue);

      return {
        portfolio: {
          totalCards,
          cardsWithPurchasePrice: cardsWithCost,
          cardsWithEstimatedValue: cardsWithValue,
          totalCostBasis: Math.round(totalCostBasis * 100) / 100,
          totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
          gainLoss: portfolioGainLoss,
          returnPct: portfolioReturnPct,
          bySport: sportPerformance,
          note: cardsWithCost < totalCards * 0.5
            ? `Only ${cardsWithCost} of ${totalCards} cards have purchase prices entered. Add purchase prices for more accurate return tracking.`
            : undefined,
        },
        benchmarks: {
          sp500: sp500Latest ? { latestChangePct: sp500Latest.changePct, period: "12 months" } : null,
          bitcoin: btcLatest ? { latestChangePct: btcLatest.changePct, period: "12 months" } : null,
        },
        alpha: portfolioReturnPct !== null && sp500Latest ? {
          vsSP500: Math.round((portfolioReturnPct - sp500Latest.changePct) * 100) / 100,
          vsBitcoin: btcLatest ? Math.round((portfolioReturnPct - btcLatest.changePct) * 100) / 100 : null,
          verdict: portfolioReturnPct > (sp500Latest?.changePct || 0)
            ? "Your portfolio is outperforming the S&P 500"
            : "Your portfolio is underperforming the S&P 500",
        } : null,
      };
    }

    case "get_all_portfolio_cards": {
      const allCases = await storage.getDisplayCases(userId);
      const allCards = [];
      for (const dc of allCases) {
        const cards = await storage.getCards(dc.id);
        for (const c of cards) {
          allCards.push({
            displayCase: dc.name,
            title: c.title,
            playerName: c.playerName,
            year: c.year,
            set: c.set,
            estimatedValue: c.estimatedValue,
            grade: c.grade,
            grader: c.grader,
            outlookAction: c.outlookAction,
            outlookSupplyGrowth: c.outlookSupplyGrowth,
            sport: c.sport,
          });
        }
      }
      return {
        totalCards: allCards.length,
        totalCases: allCases.length,
        cards: allCards,
      };
    }

    case "get_alpha_signals": {
      const signals = await storage.getActiveSignals(50, args.signalType || undefined);
      let relevantSignals = signals;

      if (args.portfolioOnly === "true" || args.portfolioOnly === true) {
        const userCards = await storage.getAllUserCards(userId);
        const userCardIds = new Set(userCards.map(c => c.id));
        relevantSignals = signals.filter(s => s.cardId && userCardIds.has(s.cardId));
      }

      const signalCards = await Promise.all(
        relevantSignals.slice(0, 20).map(async (s) => {
          const card = s.cardId ? await storage.getCard(s.cardId) : null;
          return {
            signal: formatSignalType(s.signalType),
            alphaScore: s.alphaScore,
            confidence: formatEnum(s.confidence),
            playerName: s.playerName || card?.playerName,
            cardTitle: s.cardTitle || card?.title,
            drivers: s.drivers,
            whyNow: s.whyNow,
            reasoning: s.reasoning,
            estimatedValue: card?.estimatedValue,
            set: card?.set,
            year: card?.year,
            sport: card?.sport,
          };
        })
      );

      const buyCount = signalCards.filter(s => s.signal === "Buy" || s.signal === "Strong Buy").length;
      const sellCount = signalCards.filter(s => s.signal === "Sell" || s.signal === "Strong Sell").length;
      const holdCount = signalCards.filter(s => s.signal === "Hold").length;

      return {
        totalSignals: signalCards.length,
        summary: { buy: buyCount, sell: sellCount, hold: holdCount },
        signals: signalCards,
        portfolioOnly: args.portfolioOnly === "true" || args.portfolioOnly === true,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

function sendSSE(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const TOOL_STEP_LABELS: Record<string, string> = {
  get_portfolio_summary: "Analyzing portfolio composition and risk signals...",
  get_player_outlook: "Generating player investment outlook...",
  get_player_news: "Scanning real-time news and injury reports...",
  get_card_market_data: "Pulling live eBay market data and comps...",
  get_display_case_cards: "Loading display case inventory...",
  get_hidden_gems: "Checking Hidden Gems discovery engine...",
  get_market_benchmarks: "Comparing portfolio vs S&P 500 and Bitcoin...",
  get_all_portfolio_cards: "Scanning entire collection...",
  get_alpha_signals: "Checking Alpha signals for market opportunities...",
};

export async function runAgentStream(
  query: string,
  userId: string,
  res: Response
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sendSSE(res, { status: "step", message: "Card Advisor online, analyzing your query..." });

  try {
    const systemPrompt = `You are the Card Advisor — an elite AI agent that helps collectors make smart investment decisions about their sports card collections.

You have access to powerful tools that can analyze portfolios, check player outlooks, get real-time market data, find hidden gems, and benchmark performance. Use these tools strategically to answer the user's question thoroughly.

Guidelines:
- Always use tools to get real data before making recommendations. Never guess at prices or values.
- When analyzing risk, consider: supply growth (overproduction), licensing changes, player injuries, and market liquidity.
- Be direct and actionable. Give clear BUY/HOLD/SELL/AVOID verdicts when appropriate.
- Reference specific data points from your tool calls to support your analysis.
- If the user asks about a specific display case, use get_display_case_cards first to see what's in it.
- For broad portfolio questions, start with get_portfolio_summary or get_all_portfolio_cards.
- Think like a financial advisor for sports cards — be data-driven and risk-aware.
- For benchmark/alpha questions, ALWAYS lead with the user's portfolio performance first (cost basis → current value → return %), THEN compare against S&P 500 and Bitcoin. Show the alpha (difference). If many cards lack purchase prices, mention that adding them would improve accuracy. Never just report S&P/Bitcoin numbers without the portfolio comparison.

The current date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
The user's ID is: ${userId}`;

    const toolDeclarations = buildToolDeclarations();

    let contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
      { role: "user", parts: [{ text: query }] },
    ];

    const MAX_TOOL_ROUNDS = 8;
    let round = 0;

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) break;

      const parts = candidate.content.parts;
      contents.push({ role: "model", parts: parts as Array<Record<string, unknown>> });

      const functionCalls = parts.filter((p: Record<string, unknown>) => p.functionCall);

      if (functionCalls.length === 0) {
        const textPart = parts.find((p: Record<string, unknown>) => p.text);
        const rawText = (textPart as { text?: string })?.text || "Analysis complete. No specific recommendations at this time.";
        const finalText = humanizeResponse(rawText);

        sendSSE(res, { status: "step", message: "Synthesizing findings..." });
        sendSSE(res, {
          status: "complete",
          payload: {
            title: extractTitle(finalText),
            description: finalText,
            alert: finalText.toLowerCase().includes("risk") || finalText.toLowerCase().includes("warning") || finalText.toLowerCase().includes("sell"),
            alpha: extractAlpha(finalText),
          },
        });
        break;
      }

      const functionResponses: Array<Record<string, unknown>> = [];

      for (const fc of functionCalls) {
        const call = (fc as { functionCall: { name: string; args: Record<string, string> } }).functionCall;
        const stepLabel = TOOL_STEP_LABELS[call.name] || `Running ${call.name}...`;
        sendSSE(res, { status: "step", message: stepLabel });

        try {
          const result = await executeToolCall(call.name, call.args || {}, userId);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: JSON.stringify(result).slice(0, 15000) },
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[Agent] Tool ${call.name} failed:`, errMsg);
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: errMsg },
            },
          });
        }
      }

      contents.push({ role: "user", parts: functionResponses });
    }

    if (round >= MAX_TOOL_ROUNDS) {
      sendSSE(res, {
        status: "complete",
        payload: {
          title: "Analysis Limit Reached",
          description: "The agent reached its maximum analysis depth. Please try a more specific question.",
          alert: false,
          alpha: null,
        },
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Agent] Stream error:", errMsg);
    sendSSE(res, { status: "error", message: "Agent encountered an error. Please try again." });
  } finally {
    res.end();
  }
}

function extractTitle(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const firstLine = lines[0] || "";
  const cleaned = firstLine.replace(/^[#*]+\s*/, "").trim();

  // If the first line is short enough AND reads like a heading (not a long
  // running sentence), use it directly. Otherwise fall back to a generic
  // title and let the description carry the full content. This avoids the
  // mid-sentence "..." cutoffs users were seeing.
  if (cleaned && cleaned.length <= 80) {
    return cleaned.replace(/[.,;:]+$/, "");
  }

  const lower = text.toLowerCase();
  if (lower.includes("risk") || lower.includes("sell") || lower.includes("warning")) {
    return "Portfolio Risk Update";
  }
  if (lower.includes("buy") || lower.includes("opportunit")) {
    return "Portfolio Opportunities";
  }
  return "Portfolio Analysis";
}

function extractAlpha(text: string): string | null {
  const match = text.match(/[+-]?\d+\.?\d*%/);
  if (match) {
    const val = parseFloat(match[0]);
    if (!isNaN(val) && Math.abs(val) < 500) {
      return val.toFixed(1);
    }
  }
  return null;
}
