import { GoogleGenAI, Type } from "@google/genai";
import { storage } from "./storage";
import { getPlayerOutlook } from "./playerOutlookEngine";
import { buildPortfolioProfile, generateRiskSignals } from "./portfolioIntelligenceService";
import { fetchPlayerNews, fetchGeminiMarketData, computeLiquidityScore } from "./outlookEngine";
import { getActiveHiddenGems } from "./hiddenGemsService";
import { getMarketBenchmarks } from "./marketBenchmarkService";
import type { Response } from "express";

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
    description: "Get S&P 500 and Bitcoin performance data to compare against card portfolio returns. Use when the user asks about portfolio performance vs market benchmarks or alpha.",
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
        sport: args.sport || "football",
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
      const news = await fetchPlayerNews(args.playerName, args.sport || "football");
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
      const benchmarks = await getMarketBenchmarks();
      return benchmarks;
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

  sendSSE(res, { status: "step", message: "Agent online, analyzing your query..." });

  try {
    const systemPrompt = `You are the Sports Card Portfolio Auditor — an elite AI agent that helps collectors make smart investment decisions about their sports card collections.

You have access to powerful tools that can analyze portfolios, check player outlooks, get real-time market data, find hidden gems, and benchmark performance. Use these tools strategically to answer the user's question thoroughly.

Guidelines:
- Always use tools to get real data before making recommendations. Never guess at prices or values.
- When analyzing risk, consider: supply growth (overproduction), licensing changes, player injuries, and market liquidity.
- Be direct and actionable. Give clear BUY/HOLD/SELL/AVOID verdicts when appropriate.
- Reference specific data points from your tool calls to support your analysis.
- If the user asks about a specific display case, use get_display_case_cards first to see what's in it.
- For broad portfolio questions, start with get_portfolio_summary or get_all_portfolio_cards.
- Think like a financial advisor for sports cards — be data-driven and risk-aware.

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
        const finalText = (textPart as { text?: string })?.text || "Analysis complete. No specific recommendations at this time.";

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
  const firstLine = lines[0] || "Portfolio Analysis";
  const cleaned = firstLine.replace(/^[#*]+\s*/, "").trim();
  return cleaned.length > 80 ? cleaned.slice(0, 77) + "..." : cleaned;
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
