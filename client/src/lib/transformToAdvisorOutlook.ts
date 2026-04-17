import type { 
  PlayerOutlookResponse, 
  AdvisorOutlook, 
  AdvisorVerdict, 
  AdvisorConfidence,
  AdvisorHorizon,
  LiquidityTier,
  TradeTarget,
  TradeTargetsData,
  Decisions,
} from "@shared/schema";
import { firstSentence } from "@/lib/formatEnum";

function mapVerdictToAdvisor(
  investmentCall?: PlayerOutlookResponse["investmentCall"],
  legacyVerdict?: PlayerOutlookResponse["verdict"]
): { verdict: AdvisorVerdict; label: string } {
  if (investmentCall) {
    switch (investmentCall.verdict) {
      case "ACCUMULATE":
        return { verdict: "BUY", label: "Accumulate on dips" };
      case "HOLD_CORE":
        return { verdict: "HOLD_CORE", label: "Hold, don't chase" };
      case "TRADE_THE_HYPE":
        return { verdict: "TRADE_THE_HYPE", label: "Take profits now" };
      case "AVOID_NEW_MONEY":
        return { verdict: "AVOID", label: "Avoid new positions" };
      case "SPECULATIVE_FLYER":
        return { verdict: "SPECULATIVE", label: "Small speculative bet only" };
      case "HOLD_ROLE_RISK":
        return { verdict: "HOLD", label: "Hold, monitor role" };
      case "HOLD_INJURY_CONTINGENT":
        return { verdict: "HOLD", label: "Hold as injury hedge" };
      case "SPECULATIVE_SUPPRESSED":
        return { verdict: "BUY", label: "Speculative buy" };
      case "AVOID_STRUCTURAL":
        return { verdict: "AVOID", label: "Avoid, structural decline" };
      default:
        return { verdict: "HOLD", label: "Hold current position" };
    }
  }
  
  if (legacyVerdict) {
    switch (legacyVerdict.action) {
      case "BUY":
        return { verdict: "BUY", label: "Buy opportunity" };
      case "AVOID":
        return { verdict: "AVOID", label: "Avoid" };
      default:
        return { verdict: "HOLD", label: "Monitor position" };
    }
  }
  
  return { verdict: "HOLD", label: "Hold" };
}

function mapConfidence(
  investmentCall?: PlayerOutlookResponse["investmentCall"],
  snapshot?: PlayerOutlookResponse["snapshot"]
): AdvisorConfidence {
  const conf = investmentCall?.confidence || snapshot?.confidence;
  if (conf === "HIGH") return "HIGH";
  if (conf === "LOW") return "LOW";
  return "MED";
}

function mapHorizon(
  investmentCall?: PlayerOutlookResponse["investmentCall"],
  snapshot?: PlayerOutlookResponse["snapshot"]
): AdvisorHorizon {
  const horizon = investmentCall?.timeHorizon || snapshot?.horizon;
  if (horizon === "SHORT") return "1-3m";
  if (horizon === "LONG") return "12m+";
  return "3-12m";
}

function cleanSystemLanguage(text: string): string {
  return text
    .replace(/\bsample factor\s*\d*(\.\d+)?/gi, "limited market data")
    .replace(/\blow data confidence\s*\(\d+\)/gi, "low confidence")
    .replace(/\bdata confidence\s*\(\d+\)/gi, "confidence")
    .replace(/\bconfidence(?:Score)?\s*(?:of\s*)?\(\s*\d+\s*\)/gi, "confidence")
    .replace(/\bconfidenceScore\s*[:=]\s*\d+/gi, "confidence")
    .replace(/\b\d+(?:\.\d+)?%?\s*sample\b/gi, "limited sample")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildAdvisorTake(
  outlook: PlayerOutlookResponse,
  verdictLabel: string
): string {
  const call = outlook.investmentCall;
  
  if (call?.advisorTake && call.advisorTake.length > 50) {
    return cleanSystemLanguage(call.advisorTake).slice(0, 200);
  }
  
  const thesis = outlook.thesis || [];
  
  let sentence1 = `${verdictLabel}.`;
  
  let sentence2 = "";
  if (call?.oneLineRationale) {
    sentence2 = call.oneLineRationale;
  } else if (thesis.length > 0) {
    sentence2 = thesis[0];
  }
  
  return cleanSystemLanguage([sentence1, sentence2]
    .filter(s => s.length > 0)
    .join(" "))
    .slice(0, 200);
}

function extractPackHitReaction(outlook: PlayerOutlookResponse): string | undefined {
  const call = outlook.investmentCall;
  
  if (call?.packHitReaction) {
    return call.packHitReaction;
  }
  
  // Fallback based on verdict - distinct emotional guidance per verdict
  if (call?.verdict) {
    switch (call.verdict) {
      case "ACCUMULATE":
        return "Nice pull! Hold this one—it's got room to run.";
      case "HOLD_CORE":
        return "Solid hit. Flip it quick or grade it—no rush either way.";
      case "TRADE_THE_HYPE":
        return "Lucky! List it tonight—prices won't stay this high.";
      case "AVOID_NEW_MONEY":
        return "Don't overthink it—move it fast before you get attached.";
      case "SPECULATIVE_FLYER":
        return "Swing for the fences or cash out now—your call on this one.";
    }
  }
  
  return undefined;
}

function extractTopReasons(outlook: PlayerOutlookResponse): [string, string, string] {
  const reasons: string[] = [];
  
  const call = outlook.investmentCall;
  if (call?.whyBullets && call.whyBullets.length > 0) {
    reasons.push(...call.whyBullets.slice(0, 2));
  }
  
  if (reasons.length < 3 && outlook.thesis) {
    const remaining = 3 - reasons.length;
    reasons.push(...outlook.thesis.slice(0, remaining));
  }
  
  while (reasons.length < 3) {
    reasons.push("Risk/reward profile favors patience at current levels.");
  }
  
  return [
    reasons[0]?.slice(0, 150) || "",
    reasons[1]?.slice(0, 150) || "",
    reasons[2]?.slice(0, 150) || ""
  ];
}

function extractActionPlan(outlook: PlayerOutlookResponse): {
  now: string;
  entryRule: string;
  sizingRule: string;
} {
  const call = outlook.investmentCall;
  
  return {
    now: call?.actionPlan?.whatToDoNow || "Monitor for entry signals.",
    entryRule: call?.actionPlan?.entryPlan || "Wait for pullback or clear catalyst.",
    sizingRule: call?.actionPlan?.positionSizing || "Standard position sizing.",
  };
}

function extractWhatChangesMyMind(outlook: PlayerOutlookResponse): string[] {
  const call = outlook.investmentCall;
  const items: string[] = [];
  
  if (call?.thesisBreakers && call.thesisBreakers.length > 0) {
    items.push(...call.thesisBreakers.slice(0, 4));
  }
  
  if (items.length < 2 && outlook.marketRealityCheck) {
    items.push(...outlook.marketRealityCheck.slice(0, 2));
  }
  
  if (items.length === 0) {
    items.push("Significant injury or role change");
    items.push("Sustained underperformance over 4+ weeks");
  }
  
  return items.slice(0, 4);
}

function extractBuyTriggers(outlook: PlayerOutlookResponse): string[] {
  const call = outlook.investmentCall;
  const items: string[] = [];
  
  if (call?.triggersToUpgrade && call.triggersToUpgrade.length > 0) {
    items.push(...call.triggersToUpgrade.slice(0, 4));
  }
  
  if (items.length < 2) {
    if (outlook.peakTiming?.shortTermOutlook) {
      items.push(outlook.peakTiming.shortTermOutlook);
    }
    if (outlook.discountAnalysis?.repricingCatalysts) {
      items.push(...outlook.discountAnalysis.repricingCatalysts.slice(0, 2));
    }
  }
  
  if (items.length === 0) {
    items.push("Price drops 20-30% without fundamental change");
    items.push("Major breakout performance signals new ceiling");
  }
  
  return items.slice(0, 4);
}

function extractCards(outlook: PlayerOutlookResponse): { buy: string[]; avoid: string[] } {
  const buy: string[] = [];
  const avoid: string[] = [];
  
  const call = outlook.investmentCall;
  
  if (call?.whatToBuy && call.whatToBuy.length > 0) {
    buy.push(...call.whatToBuy.slice(0, 4));
  }
  if (call?.whatToSell && call.whatToSell.length > 0) {
    avoid.push(...call.whatToSell.map(c => `${c} (sell)`).slice(0, 2));
  }
  if (call?.whatToAvoid && call.whatToAvoid.length > 0) {
    avoid.push(...call.whatToAvoid.slice(0, 2));
  }
  
  if (buy.length === 0) {
    for (const exposure of outlook.exposures || []) {
      if (exposure.tier === "GROWTH" || exposure.tier === "CORE" || exposure.tier === "PREMIUM") {
        buy.push(...(exposure.cardTargets || []).slice(0, 2));
      }
    }
  }
  
  const tiered = outlook.tieredRecommendations;
  if (tiered) {
    if (tiered.baseCards?.verdict === "BUY" && !buy.some(b => b.toLowerCase().includes("base"))) {
      buy.push("Base rookies");
    } else if (tiered.baseCards?.verdict === "SELL" && !avoid.some(a => a.toLowerCase().includes("base"))) {
      avoid.push("Base cards (consider selling)");
    }
    
    if (tiered.midTierParallels?.verdict === "BUY" && !buy.some(b => b.toLowerCase().includes("parallel"))) {
      buy.push("Mid-tier parallels");
    } else if (tiered.midTierParallels?.verdict === "SELL" && !avoid.some(a => a.toLowerCase().includes("parallel"))) {
      avoid.push("Mid-tier parallels (sell into demand)");
    }
    
    if (tiered.premiumGraded?.verdict === "SELL" && !avoid.some(a => a.toLowerCase().includes("graded"))) {
      avoid.push("Premium graded (take profits)");
    }
  }
  
  return {
    buy: Array.from(new Set(buy)).slice(0, 6),
    avoid: Array.from(new Set(avoid)).slice(0, 6),
  };
}

function deriveLiquidityTier(outlook: PlayerOutlookResponse): LiquidityTier | undefined {
  const exposures = outlook.exposures || [];
  
  // Map exposure liquidity levels to our tier system
  // Exposures use HIGH/MEDIUM/LOW, we map to our VERY_HIGH/HIGH/MEDIUM/LOW/UNCERTAIN tiers
  const liquidityLevels = exposures
    .map(exp => exp.liquidity)
    .filter((liq): liq is "HIGH" | "MEDIUM" | "LOW" => !!liq);
  
  if (liquidityLevels.length === 0) return undefined;
  
  const highCount = liquidityLevels.filter(l => l === "HIGH").length;
  const medCount = liquidityLevels.filter(l => l === "MEDIUM").length;
  const lowCount = liquidityLevels.filter(l => l === "LOW").length;
  const total = liquidityLevels.length;
  
  // Priority order: VERY_HIGH > HIGH > MEDIUM > LOW > UNCERTAIN
  // We lean optimistic - presence of HIGH is a good signal
  
  // VERY_HIGH: All exposures are HIGH (strong liquidity across all tiers)
  if (highCount === total && total >= 2) {
    return "VERY_HIGH";
  }
  
  // HIGH: Any HIGH exposure means decent market (lean optimistic)
  // HIGH dominates ties with MEDIUM
  if (highCount >= medCount && highCount > 0 && lowCount < highCount) {
    return "HIGH";
  }
  
  // LOW: Only when LOW is the dominant signal (more LOW than HIGH+MEDIUM combined)
  if (lowCount > (highCount + medCount)) {
    return "LOW";
  }
  
  // MEDIUM: Mixed signals or moderate liquidity dominates
  if (medCount > 0 || (highCount > 0 && lowCount > 0)) {
    return "MEDIUM";
  }
  
  // LOW: Only LOW signals present
  if (lowCount > 0) {
    return "LOW";
  }
  
  return "UNCERTAIN";
}

function buildEvidenceNote(outlook: PlayerOutlookResponse): string {
  const evidence = outlook.evidence;
  const parts: string[] = [];
  
  if (evidence?.compsSummary?.available && evidence.compsSummary.soldCount) {
    parts.push(`${evidence.compsSummary.soldCount} recent eBay sales`);
  }
  
  if (evidence?.newsSnippets && evidence.newsSnippets.length > 0) {
    parts.push(`${evidence.newsSnippets.length} news sources`);
  }
  
  const dataQuality = evidence?.dataQuality || "MEDIUM";
  const qualityNote = dataQuality === "HIGH" 
    ? "high confidence" 
    : dataQuality === "LOW" 
      ? "limited data available"
      : "moderate confidence";
  
  if (parts.length === 0) {
    return `Based on market analysis; ${qualityNote}.`;
  }
  
  return `Based on ${parts.join(" and ")}; ${qualityNote}.`;
}

function extractShortTermTrend(outlook: PlayerOutlookResponse): AdvisorOutlook["shortTermTrend"] {
  const met = outlook.marketMetrics;
  if (!met) return undefined;
  
  const trend: NonNullable<AdvisorOutlook["shortTermTrend"]> = {};
  
  if (met.priceTrend !== undefined) {
    trend.priceTrend30d = `${met.priceTrend >= 0 ? "+" : ""}${Math.round(met.priceTrend * 100)}%`;
  }
  if (met.avgSoldPrice7d !== undefined && met.avgSoldPrice !== undefined && met.avgSoldPrice > 0) {
    const delta7d = ((met.avgSoldPrice7d - met.avgSoldPrice) / met.avgSoldPrice) * 100;
    trend.priceTrend7d = `${delta7d >= 0 ? "+" : ""}${Math.round(delta7d)}%`;
    
    const delta14d = met.priceTrend !== undefined 
      ? Math.round((delta7d + (met.priceTrend * 100)) / 2) 
      : Math.round(delta7d * 0.7);
    trend.priceTrend14d = `${delta14d >= 0 ? "+" : ""}${delta14d}%`;
  }
  if (met.volumeTrend !== undefined) {
    trend.volumeDirection = met.volumeTrend === "up" ? "rising" : met.volumeTrend === "down" ? "falling" : "stable";
  }
  if (met.soldCount30d !== undefined) {
    trend.soldCount30d = met.soldCount30d;
  }
  if (met.soldCount7d !== undefined) {
    trend.soldCount7d = met.soldCount7d;
  }
  if (met.avgSoldPrice != null) {
    trend.avgPrice = `$${met.avgSoldPrice.toFixed(0)}`;
  }
  if (met.internalAvgPrice != null && met.internalAvgPrice > 0) {
    trend.internalAvgPrice = `$${met.internalAvgPrice.toFixed(0)}`;
    if (met.internalObservationCount != null && met.internalObservationCount > 0) {
      trend.internalObservationCount = met.internalObservationCount;
    }
    if (met.avgSoldPrice != null && met.avgSoldPrice > 0) {
      trend.internalVsMarketDeltaPct = Math.round(((met.internalAvgPrice - met.avgSoldPrice) / met.avgSoldPrice) * 100);
    }
  }
  
  return Object.keys(trend).length > 0 ? trend : undefined;
}

function extractTopSignals(outlook: PlayerOutlookResponse): string[] | undefined {
  const signals = outlook.marketSignals;
  if (!signals?.contributions) return undefined;
  
  const c = signals.contributions;
  const scored: { name: string; value: number }[] = [
    { name: "Demand", value: c.demand },
    { name: "Momentum", value: c.momentum },
    { name: "Liquidity", value: c.liquidity },
    { name: "Supply", value: c.supply },
    { name: "Anti-Hype", value: c.antiHype },
    { name: "Volatility", value: c.volatility },
  ];
  
  scored.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  
  return scored.slice(0, 2).map(s => {
    const dir = s.value > 0 ? "bullish" : "bearish";
    return `${s.name}: ${dir} (${s.value > 0 ? "+" : ""}${s.value.toFixed(0)} pts)`;
  });
}

function deriveTiming(outlook: PlayerOutlookResponse): string | undefined {
  const signals = outlook.marketSignals;
  if (!signals) return undefined;
  
  const momentum = signals.momentumScore ?? 50;
  const hype = signals.hypeScore ?? 50;
  const derived = signals.derivedMetrics;
  const accel = derived?.volumeAcceleration ?? 1;
  
  if (hype > 70 && momentum > 65) return "Overextended";
  if (momentum < 35 && accel < 0.8) return "Late";
  if (momentum > 55 && hype < 40 && accel > 1.1) return "Early";
  return "Fair";
}

function deriveStructure(outlook: PlayerOutlookResponse): string | undefined {
  const signals = outlook.marketSignals;
  if (!signals) return undefined;
  
  const mq = signals.derivedMetrics?.marketQuality;
  if (mq === undefined) {
    const liq = signals.liquidityScore ?? 50;
    const vol = signals.volatilityScore ?? 50;
    const sup = signals.supplyPressureScore ?? 50;
    const quality = (liq * 0.4) + (vol * 0.3) + (sup * 0.3);
    if (quality >= 60) return "Strong";
    if (quality >= 40) return "Mixed";
    return "Weak";
  }
  
  if (mq >= 60) return "Strong";
  if (mq >= 40) return "Mixed";
  return "Weak";
}

function extractMarketQuality(outlook: PlayerOutlookResponse): number | undefined {
  const mq = outlook.marketSignals?.derivedMetrics?.marketQuality;
  if (mq !== undefined) return mq;
  
  const signals = outlook.marketSignals;
  if (!signals) return undefined;
  
  const liq = signals.liquidityScore ?? 50;
  const vol = signals.volatilityScore ?? 50;
  const sup = signals.supplyPressureScore ?? 50;
  return Math.round((liq * 0.4) + (vol * 0.3) + (sup * 0.3));
}

function extractConviction(outlook: PlayerOutlookResponse): AdvisorOutlook["conviction"] {
  const conv = outlook.marketSignals?.derivedMetrics?.conviction;
  if (!conv) return undefined;

  const levelLabels: Record<string, string> = {
    HIGH: "High Conviction",
    MEDIUM: "Medium Conviction",
    LOW: "Low Conviction",
    VERY_LOW: "Very Low Conviction",
  };

  const bullishSignals: string[] = [];
  const bearishSignals: string[] = [];
  if (conv.directions) {
    const names: Record<string, string> = { demand: "demand", momentum: "momentum", liquidity: "liquidity", supply: "supply", volatility: "volatility", hype: "hype" };
    for (const [key, dir] of Object.entries(conv.directions)) {
      if (dir === "bullish") bullishSignals.push(names[key] || key);
      else if (dir === "bearish") bearishSignals.push(names[key] || key);
    }
  }

  let narrative: string;
  if (conv.agreementScore >= 80 && bullishSignals.length >= 4) {
    narrative = `Strong alignment — ${bullishSignals.slice(0, 3).join(", ")} all bullish`;
  } else if (conv.agreementScore >= 80 && bearishSignals.length >= 4) {
    narrative = `Aligned bearish — ${bearishSignals.slice(0, 3).join(", ")}`;
  } else if (conv.agreementScore >= 60 && bullishSignals.length > bearishSignals.length) {
    narrative = `Driven by ${bullishSignals.slice(0, 2).join(" and ")}`;
  } else if (conv.agreementScore >= 60 && bearishSignals.length > bullishSignals.length) {
    narrative = `Driven by weak ${bearishSignals.slice(0, 2).join(" and ")}`;
  } else if (conv.agreementScore >= 40) {
    const bull = bullishSignals.length > 0 ? bullishSignals[0] : "";
    const bear = bearishSignals.length > 0 ? bearishSignals[0] : "";
    narrative = bull && bear ? `Conflicting ${bull} and ${bear}` : "Mixed signals";
  } else {
    narrative = `Conflicting signals — no reliable edge`;
  }

  return {
    level: levelLabels[conv.level] || "Unknown",
    score: conv.score,
    alignment: conv.alignmentLabel,
    narrative,
  };
}

function buildDecisions(outlook: PlayerOutlookResponse, verdict: AdvisorVerdict): Decisions {
  const call = outlook.investmentCall;
  const actionPlanNow = call?.actionPlan?.whatToDoNow || "";
  const rationale = call?.oneLineRationale || "";
  const thesis = outlook.thesis?.[0] || "";
  const shortReason = rationale || thesis || actionPlanNow;

  const truncate = (s: string, max = 120) => {
    if (!s) return "";
    const trimmed = s.length > max ? s.slice(0, max).replace(/\s\S*$/, "…") : s;
    return trimmed;
  };

  switch (verdict) {
    case "BUY":
      return {
        holder: { action: "HOLD", reason: truncate(shortReason || "Keep your position — fundamentals are strong") },
        buyer: { action: "BUY", reason: truncate(shortReason || "Entry window is favorable at current prices") },
      };
    case "HOLD_CORE":
      return {
        holder: { action: "HOLD", reason: truncate(shortReason || "Core position — no reason to sell") },
        buyer: { action: "WAIT", reason: truncate(actionPlanNow || "Prices reflect current momentum — wait for a dip") },
      };
    case "TRADE_THE_HYPE":
      return {
        holder: { action: "SELL into strength", reason: truncate(shortReason || "Take profits while demand is elevated") },
        buyer: { action: "DO NOT BUY", reason: truncate("Prices are inflated — wait for pullback") },
      };
    case "SELL":
      return {
        holder: { action: "SELL", reason: truncate(shortReason || "Lock in gains before further decline") },
        buyer: { action: "AVOID entry", reason: truncate("Market conditions don't support new positions") },
      };
    case "AVOID":
      return {
        holder: { action: "SELL / EXIT", reason: truncate(shortReason || "Reduce exposure — risk outweighs upside") },
        buyer: { action: "AVOID", reason: truncate(shortReason || "No favorable entry at current levels") },
      };
    case "SPECULATIVE":
      return {
        holder: { action: "HOLD (small only)", reason: truncate(shortReason || "Keep small position — lottery ticket sizing") },
        buyer: { action: "WAIT", reason: truncate("Low conviction — no clear edge. If you choose to enter, small speculative position only.") },
      };
    case "HOLD":
    default:
      return {
        holder: { action: "HOLD", reason: truncate(shortReason || "No clear catalyst to act on") },
        buyer: { action: "WAIT", reason: truncate(actionPlanNow || "No clear edge — wait for a better entry") },
      };
  }
}

function buildTradeTargets(outlook: PlayerOutlookResponse, verdict: AdvisorVerdict): TradeTargetsData | undefined {
  const call = outlook.investmentCall;
  const evidence = outlook.evidence;
  const tiered = outlook.tieredRecommendations;
  const exposures = outlook.exposures || [];
  const comps = evidence?.compsSummary;
  const breakdown = comps?.breakdown || [];
  const ms = outlook.marketSignals;
  const conv = ms?.derivedMetrics?.conviction;

  if (conv && typeof conv.score === "number" && conv.score < 30) {
    return {
      headline: "No strong entries — market lacks clarity",
      targets: [],
      caveat: "Signals are too conflicting for actionable trade targets. Wait for conviction to improve.",
    };
  }

  if (verdict === "SELL" || verdict === "AVOID" || verdict === "TRADE_THE_HYPE") {
    const sellTargets: TradeTarget[] = [];

    if (call?.whatToSell) {
      for (const card of call.whatToSell.slice(0, 3)) {
        sellTargets.push({
          card,
          tag: "Sell into demand",
          action: "SELL",
          liquidity: "High",
        });
      }
    }

    if (tiered) {
      if (tiered.premiumGraded?.verdict === "SELL" && !sellTargets.some(t => t.card.toLowerCase().includes("graded"))) {
        const bd = breakdown.find(b => b.category.toLowerCase().includes("premium") || b.category.toLowerCase().includes("graded"));
        sellTargets.push({
          card: "Premium graded cards",
          price: bd ? `~$${bd.avgPrice}` : undefined,
          tag: "Take profits before correction",
          action: "SELL",
          liquidity: "High",
        });
      }
      if (tiered.midTierParallels?.verdict === "SELL" && !sellTargets.some(t => t.card.toLowerCase().includes("parallel"))) {
        const bd = breakdown.find(b => b.category.toLowerCase().includes("mid") || b.category.toLowerCase().includes("parallel"));
        sellTargets.push({
          card: "Mid-tier parallels",
          price: bd ? `~$${bd.avgPrice}` : undefined,
          tag: "Overpriced relative to demand",
          action: "SELL",
        });
      }
    }

    if (sellTargets.length === 0) {
      return {
        headline: "Reduce exposure — sell into strength",
        targets: [{
          card: "Recent top performers",
          tag: "Lock in gains before pullback",
          action: "SELL",
        }],
        caveat: verdict === "AVOID" ? "No new money recommended at current levels." : undefined,
      };
    }

    const sellHeadline = verdict === "TRADE_THE_HYPE"
      ? "Sell candidates — trade the hype"
      : verdict === "SELL"
      ? "Sell targets — take profits"
      : "Avoid new positions";

    return {
      headline: sellHeadline,
      targets: sellTargets.slice(0, 3),
    };
  }

  if (verdict === "BUY" || verdict === "HOLD_CORE") {
    const buyTargets: TradeTarget[] = [];

    if (call?.whatToBuy) {
      for (const card of call.whatToBuy.slice(0, 3)) {
        const bd = breakdown.find(b => card.toLowerCase().includes(b.category.toLowerCase().split("/")[0].split(" ")[0]));
        buyTargets.push({
          card,
          price: bd ? `~$${bd.avgPrice}` : undefined,
          tag: verdict === "BUY" ? "Underpriced, lagging demand" : "Stable, liquid position",
          action: "BUY",
          liquidity: exposures.find(e => e.cardTargets?.some(ct => card.toLowerCase().includes(ct.toLowerCase().split(" ")[0])))?.liquidity === "HIGH" ? "High" : exposures.find(e => e.cardTargets?.some(ct => card.toLowerCase().includes(ct.toLowerCase().split(" ")[0])))?.liquidity === "LOW" ? "Low" : "Medium",
        });
      }
    }

    if (buyTargets.length < 3 && tiered) {
      if (tiered.baseCards?.verdict === "BUY" && !buyTargets.some(t => t.card.toLowerCase().includes("base"))) {
        const bd = breakdown.find(b => b.category.toLowerCase().includes("base") || b.category.toLowerCase().includes("common"));
        buyTargets.push({
          card: "Base rookies",
          price: bd ? `~$${bd.avgPrice}` : undefined,
          tag: "High volume, easy exit",
          action: "BUY",
          liquidity: "High",
        });
      }
      if (tiered.midTierParallels?.verdict === "BUY" && !buyTargets.some(t => t.card.toLowerCase().includes("parallel"))) {
        const bd = breakdown.find(b => b.category.toLowerCase().includes("mid") || b.category.toLowerCase().includes("refractor") || b.category.toLowerCase().includes("insert"));
        buyTargets.push({
          card: "Mid-tier parallels / inserts",
          price: bd ? `~$${bd.avgPrice}` : undefined,
          tag: "Value sweet spot",
          action: "BUY",
          liquidity: "Medium",
        });
      }
    }

    if (buyTargets.length === 0 && exposures.length > 0) {
      for (const exp of exposures.slice(0, 2)) {
        if (exp.cardTargets && exp.cardTargets.length > 0) {
          buyTargets.push({
            card: exp.cardTargets[0],
            tag: exp.why?.slice(0, 60) || "Favorable risk/reward",
            action: "BUY",
            liquidity: exp.liquidity === "HIGH" ? "High" : exp.liquidity === "LOW" ? "Low" : "Medium",
          });
        }
      }
    }

    if (buyTargets.length === 0) {
      return undefined;
    }

    return {
      headline: verdict === "BUY" ? "Entry targets — cards lagging demand" : "Core positions — stable holdings",
      targets: buyTargets.slice(0, 3),
    };
  }

  if (verdict === "SPECULATIVE") {
    const specTargets: TradeTarget[] = [];

    if (call?.whatToBuy) {
      for (const card of call.whatToBuy.slice(0, 2)) {
        specTargets.push({
          card,
          tag: "Asymmetric upside",
          action: "WATCH",
        });
      }
    }

    if (specTargets.length < 2) {
      const cheapBd = breakdown
        .filter(b => b.avgPrice > 0)
        .sort((a, b) => a.avgPrice - b.avgPrice);
      for (const bd of cheapBd.slice(0, 2 - specTargets.length)) {
        if (!specTargets.some(t => t.card.toLowerCase().includes(bd.category.toLowerCase().split("/")[0]))) {
          specTargets.push({
            card: bd.category,
            price: `~$${bd.avgPrice}`,
            tag: "Early accumulation — high risk",
            action: "WATCH",
            liquidity: "Low",
          });
        }
      }
    }

    if (specTargets.length === 0) return undefined;

    return {
      headline: "Early accumulation — high risk / asymmetric upside",
      targets: specTargets.slice(0, 3),
      caveat: "Small positions only — lottery ticket sizing.",
    };
  }

  if (verdict === "HOLD") {
    const holdTargets: TradeTarget[] = [];

    if (call?.whatToBuy && call.whatToBuy.length > 0) {
      holdTargets.push({
        card: call.whatToBuy[0],
        tag: "Selective entry only",
        action: "WATCH",
      });
    }

    if (tiered?.premiumGraded?.verdict === "SELL") {
      holdTargets.push({
        card: "Premium graded",
        tag: "Trim if overweight",
        action: "SELL",
      });
    }

    if (holdTargets.length === 0) return undefined;

    return {
      headline: "Selective exposure — not chasing",
      targets: holdTargets.slice(0, 3),
      caveat: "Lagging relative to breakout — selective entry only.",
    };
  }

  return undefined;
}

export function transformToAdvisorOutlook(outlook: PlayerOutlookResponse): AdvisorOutlook {
  const { verdict, label } = mapVerdictToAdvisor(outlook.investmentCall, outlook.verdict);
  
  const phase = outlook.marketPhase;
  const phaseLabel = phase && phase !== "UNKNOWN" 
    ? phase.charAt(0) + phase.slice(1).toLowerCase()
    : undefined;
  
  const advisorTake = buildAdvisorTake(outlook, label);
  const safeLabel = (label && label.trim()) || firstSentence(advisorTake) || verdict.replace(/_/g, " ");

  return {
    verdict,
    verdictLabel: safeLabel,
    confidence: mapConfidence(outlook.investmentCall, outlook.snapshot),
    horizon: mapHorizon(outlook.investmentCall, outlook.snapshot),
    decisions: buildDecisions(outlook, verdict),
    advisorTake,
    packHitReaction: extractPackHitReaction(outlook),
    collectorTip: outlook.investmentCall?.collectorTip,
    topReasons: extractTopReasons(outlook),
    actionPlan: extractActionPlan(outlook),
    whatChangesMyMind: extractWhatChangesMyMind(outlook),
    buyTriggers: extractBuyTriggers(outlook),
    cards: extractCards(outlook),
    tradeTargets: buildTradeTargets(outlook, verdict),
    evidenceNote: buildEvidenceNote(outlook),
    liquidityTier: deriveLiquidityTier(outlook),
    marketPhase: phaseLabel,
    shortTermTrend: extractShortTermTrend(outlook),
    topSignals: extractTopSignals(outlook),
    timing: deriveTiming(outlook),
    structure: deriveStructure(outlook),
    marketQuality: extractMarketQuality(outlook),
    conviction: extractConviction(outlook),
  };
}

export function applyVerdictGuardrails(advisor: AdvisorOutlook): AdvisorOutlook {
  let result = { ...advisor };
  
  if (result.verdict === "SELL") {
    const hasEvidence = result.evidenceNote.length > 20;
    const hasBreakers = result.whatChangesMyMind.length >= 2;
    const isLowConfidence = result.confidence === "LOW";
    
    if (isLowConfidence && (!hasEvidence || !hasBreakers)) {
      result = { ...result, verdict: "HOLD", verdictLabel: "Hold (insufficient data for sell)" };
    }
  }
  
  if (result.verdict === "BUY") {
    const hasEntryRule = result.actionPlan.entryRule.length > 10 && 
      (result.actionPlan.entryRule.toLowerCase().includes("pullback") ||
       result.actionPlan.entryRule.toLowerCase().includes("dip") ||
       result.actionPlan.entryRule.toLowerCase().includes("if") ||
       result.actionPlan.entryRule.toLowerCase().includes("wait") ||
       result.actionPlan.entryRule.toLowerCase().includes("entry"));
    
    if (!hasEntryRule) {
      result = { 
        ...result, 
        actionPlan: {
          ...result.actionPlan,
          entryRule: "Only buy on meaningful pullbacks of 20%+ from recent highs."
        }
      };
    }
  }
  
  if (result.verdict === "SPECULATIVE") {
    result = {
      ...result,
      actionPlan: {
        ...result.actionPlan,
        sizingRule: "Small position only - lottery ticket sizing (1-2% of budget).",
      }
    };
    
    if (result.cards.buy.length > 2) {
      result = {
        ...result,
        cards: {
          ...result.cards,
          buy: result.cards.buy.slice(0, 2),
        }
      };
    }
  }
  
  return result;
}
