import type { PlayerOutlookResponse, AdvisorVerdict, AdvisorConfidence, AdvisorHorizon } from "@shared/schema";

/**
 * Truncate text at a word boundary, appending an ellipsis only when
 * truncation actually occurs. Prevents the mid-word cutoffs like
 * "prices haven't ca" that users saw previously.
 */
function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  const slice = text.substring(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cutoff = lastSpace > maxChars * 0.6 ? lastSpace : maxChars;
  return slice.substring(0, cutoff).replace(/[\s,;:.!?-]+$/, "") + "…";
}

export interface SSRAdvisorOutlook {
  verdict: AdvisorVerdict;
  verdictLabel: string;
  confidence: AdvisorConfidence;
  horizon: AdvisorHorizon;
  advisorTake: string;
  collectorTip: string;
  topReasons: string[];
  whatChangesMyMind: string[];
  evidenceNote: string;
}

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

function buildAdvisorTake(outlook: PlayerOutlookResponse, verdictLabel: string): string {
  const call = outlook.investmentCall;
  
  if (call?.advisorTake && call.advisorTake.length > 50) {
    return call.advisorTake;
  }
  
  const playerName = outlook.player?.name || "This player";
  const thesis = outlook.thesis || [];
  
  if (thesis.length >= 2) {
    return `${playerName}'s cards present a ${verdictLabel.toLowerCase()} situation. ${thesis[0]} ${thesis[1]}`;
  }
  
  if (thesis.length === 1) {
    return `${playerName}'s cards present a ${verdictLabel.toLowerCase()} situation. ${thesis[0]}`;
  }
  
  return `${playerName}'s cards currently warrant a ${verdictLabel.toLowerCase()} stance based on market conditions.`;
}

function extractTopReasons(outlook: PlayerOutlookResponse): [string, string, string] {
  const call = outlook.investmentCall;
  if (call?.whyBullets && call.whyBullets.length >= 3) {
    return [call.whyBullets[0], call.whyBullets[1], call.whyBullets[2]];
  }
  
  const thesis = outlook.thesis || [];
  const reasons: string[] = [];
  
  if (call?.whyBullets) {
    for (const b of call.whyBullets) {
      if (b && b.length > 5) {
        reasons.push(truncateAtWordBoundary(b, 280));
      }
    }
  }
  
  for (const t of thesis.slice(0, 3 - reasons.length)) {
    if (t && t.length > 10) {
      reasons.push(truncateAtWordBoundary(t, 280));
    }
  }
  
  while (reasons.length < 3) {
    reasons.push("Market conditions warrant caution");
  }
  
  return [reasons[0], reasons[1], reasons[2]];
}

function extractWhatChangesMyMind(outlook: PlayerOutlookResponse): string[] {
  const call = outlook.investmentCall;
  if (call?.thesisBreakers && call.thesisBreakers.length > 0) {
    return call.thesisBreakers.slice(0, 4);
  }
  
  return [
    "Major injury or role change",
    "Significant shift in team dynamics"
  ];
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

export function transformToSSRAdvisorOutlook(outlook: PlayerOutlookResponse): SSRAdvisorOutlook {
  const { verdict, label } = mapVerdictToAdvisor(outlook.investmentCall, outlook.verdict);
  
  return {
    verdict,
    verdictLabel: label,
    confidence: mapConfidence(outlook.investmentCall, outlook.snapshot),
    horizon: mapHorizon(outlook.investmentCall, outlook.snapshot),
    advisorTake: buildAdvisorTake(outlook, label),
    collectorTip: outlook.investmentCall?.collectorTip || "",
    topReasons: extractTopReasons(outlook),
    whatChangesMyMind: extractWhatChangesMyMind(outlook),
    evidenceNote: buildEvidenceNote(outlook),
  };
}

export function applySSRVerdictGuardrails(advisor: SSRAdvisorOutlook): SSRAdvisorOutlook {
  let result = { ...advisor };
  
  if (result.verdict === "SELL") {
    const hasEvidence = result.evidenceNote.length > 20;
    const hasBreakers = result.whatChangesMyMind.length >= 2;
    const isLowConfidence = result.confidence === "LOW";
    
    if (isLowConfidence && (!hasEvidence || !hasBreakers)) {
      result = { ...result, verdict: "HOLD", verdictLabel: "Hold (insufficient data for sell)" };
    }
  }
  
  return result;
}
