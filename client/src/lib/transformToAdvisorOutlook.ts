import type { 
  PlayerOutlookResponse, 
  AdvisorOutlook, 
  AdvisorVerdict, 
  AdvisorConfidence,
  AdvisorHorizon 
} from "@shared/schema";

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
        return { verdict: "SELL", label: "Sell into strength" };
      case "AVOID_NEW_MONEY":
        return { verdict: "AVOID", label: "Avoid new positions" };
      case "SPECULATIVE_FLYER":
        return { verdict: "HOLD", label: "Small speculative bet only" };
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
  if (horizon === "SHORT" || horizon === "1-3 months") return "1-3m";
  if (horizon === "LONG" || horizon === "12+ months") return "12m+";
  return "3-12m";
}

function buildAdvisorTake(
  outlook: PlayerOutlookResponse,
  verdictLabel: string
): string {
  const playerName = outlook.player?.name || "This player";
  const call = outlook.investmentCall;
  const thesis = outlook.thesis || [];
  
  let sentence1 = `${verdictLabel}.`;
  
  let sentence2 = "";
  if (call?.oneLineRationale) {
    sentence2 = call.oneLineRationale;
  } else if (thesis.length > 0) {
    sentence2 = thesis[0];
  }
  
  let sentence3 = "";
  if (call?.thesisBreakers && call.thesisBreakers.length > 0) {
    sentence3 = `This changes if: ${call.thesisBreakers[0].toLowerCase()}.`;
  } else if (outlook.marketRealityCheck?.length > 0) {
    sentence3 = outlook.marketRealityCheck[0];
  }
  
  let sentence4 = "";
  if (call?.actionPlan?.whatToDoNow) {
    sentence4 = call.actionPlan.whatToDoNow;
  }
  
  return [sentence1, sentence2, sentence3, sentence4]
    .filter(s => s.length > 0)
    .join(" ")
    .slice(0, 500);
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
    reasons.push("Analysis based on available market data.");
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
  
  for (const exposure of outlook.exposures || []) {
    if (exposure.tier === "GROWTH" || exposure.tier === "CORE") {
      buy.push(...(exposure.cardTargets || []).slice(0, 2));
    } else if (exposure.tier === "SPECULATIVE") {
      avoid.push(...(exposure.cardTargets || []).slice(0, 2));
    }
  }
  
  const tiered = outlook.tieredRecommendations;
  if (tiered) {
    if (tiered.baseCards?.verdict === "BUY") {
      buy.push("Base rookies");
    } else if (tiered.baseCards?.verdict === "SELL") {
      avoid.push("Base rookies (consider selling)");
    }
    
    if (tiered.midTierParallels?.verdict === "BUY") {
      buy.push("Mid-tier parallels");
    } else if (tiered.midTierParallels?.verdict === "SELL") {
      avoid.push("Mid-tier parallels (sell into demand)");
    }
    
    if (tiered.premiumGraded?.verdict === "SELL") {
      avoid.push("Premium graded (take profits)");
    }
  }
  
  return {
    buy: Array.from(new Set(buy)).slice(0, 6),
    avoid: Array.from(new Set(avoid)).slice(0, 6),
  };
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

export function transformToAdvisorOutlook(outlook: PlayerOutlookResponse): AdvisorOutlook {
  const { verdict, label } = mapVerdictToAdvisor(outlook.investmentCall, outlook.verdict);
  
  return {
    verdict,
    verdictLabel: label,
    confidence: mapConfidence(outlook.investmentCall, outlook.snapshot),
    horizon: mapHorizon(outlook.investmentCall, outlook.snapshot),
    advisorTake: buildAdvisorTake(outlook, label),
    topReasons: extractTopReasons(outlook),
    actionPlan: extractActionPlan(outlook),
    whatChangesMyMind: extractWhatChangesMyMind(outlook),
    buyTriggers: extractBuyTriggers(outlook),
    cards: extractCards(outlook),
    evidenceNote: buildEvidenceNote(outlook),
  };
}

export function applyVerdictGuardrails(advisor: AdvisorOutlook): AdvisorOutlook {
  if (advisor.verdict === "SELL") {
    const hasEvidence = advisor.evidenceNote.length > 20;
    const hasBreakers = advisor.whatChangesMyMind.length >= 2;
    const isLowConfidence = advisor.confidence === "LOW";
    
    if (isLowConfidence && (!hasEvidence || !hasBreakers)) {
      return { ...advisor, verdict: "HOLD", verdictLabel: "Hold (insufficient data for sell)" };
    }
  }
  
  if (advisor.verdict === "BUY") {
    const hasEntryRule = advisor.actionPlan.entryRule.length > 10 && 
      (advisor.actionPlan.entryRule.toLowerCase().includes("pullback") ||
       advisor.actionPlan.entryRule.toLowerCase().includes("dip") ||
       advisor.actionPlan.entryRule.toLowerCase().includes("if") ||
       advisor.actionPlan.entryRule.toLowerCase().includes("wait"));
    
    if (!hasEntryRule) {
      return { 
        ...advisor, 
        actionPlan: {
          ...advisor.actionPlan,
          entryRule: "Only buy on meaningful pullbacks of 20%+ from recent highs."
        }
      };
    }
  }
  
  return advisor;
}
