import { TakeInputs } from "./types";

export function marketToTakeInputs(market: any): TakeInputs {
  const signalCount =
    market?.market?.compCount ??
    market?.matchConfidence?.totalComps ??
    market?.comps?.soldCount ??
    market?.sampleSize ??
    0;

  const narrativeText =
    (market?.explanation?.long ??
      market?.explanation?.short ??
      market?.actionReasons?.join(" ") ??
      "") as string;

  const t = narrativeText.toLowerCase();
  const narrativeTags: string[] = [];

  if (t.includes("rookie")) narrativeTags.push("rookie");
  if (t.includes("breakout") || t.includes("camp buzz") || t.includes("trending up")) narrativeTags.push("breakout");
  if (t.includes("injury") || t.includes("out for season") || t.includes("questionable")) narrativeTags.push("injury");
  if (t.includes("benched") || t.includes("backup") || t.includes("demoted")) narrativeTags.push("benched");
  if (t.includes("decline") || t.includes("washed") || t.includes("lost a step")) narrativeTags.push("decline");
  if (t.includes("hype") || t.includes("viral") || t.includes("highlight")) narrativeTags.push("hype");
  if (t.includes("veteran") || t.includes("aging")) narrativeTags.push("aging");
  if (t.includes("legend") || t.includes("hall of fame") || t.includes("hof")) narrativeTags.push("legend");
  if (t.includes("retired")) narrativeTags.push("retired");
  if (t.includes("volatile") || t.includes("unstable")) narrativeTags.push("volatile");
  if (t.includes("upside") || t.includes("ceiling")) narrativeTags.push("upside");

  const action = market?.action;
  if (action) {
    narrativeTags.push(action.toLowerCase());
  }

  const confidenceScore = 
    market?.confidence?.level === "HIGH" ? 85 :
    market?.confidence?.level === "MED" ? 60 :
    market?.confidence?.level === "LOW" ? 35 :
    market?.confidenceScore ?? undefined;

  const careerStage = market?.careerStage;
  const isRookie = careerStage === "ROOKIE" || 
    narrativeTags.includes("rookie") ||
    market?.card?.title?.toLowerCase().includes("rookie");

  return {
    signalCount,
    confidenceScore,
    narrativeTags: Array.from(new Set(narrativeTags)),
    sport: market?.sport ?? market?.card?.sport,
    position: market?.position ?? market?.card?.position,
    age: market?.age,
    isRookie,
    careerStage,
    action: market?.action,
    roleTier: market?.roleTier,
  };
}
