import { GenerateTakesRequest, Take } from "./types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function tierFromSignalCount(n: number) {
  if (n < 7) return "THIN";
  if (n < 20) return "MEDIUM";
  return "STRONG";
}

function has(tags: string[], key: string) {
  return tags.map((t) => t.toLowerCase()).includes(key.toLowerCase());
}

export function generateTakes(req: GenerateTakesRequest): Take[] {
  const { scope, subject, inputs, portfolioContext } = req;

  const playerName = subject.playerName;
  const tags = inputs.narrativeTags ?? [];
  const signalTier = tierFromSignalCount(inputs.signalCount ?? 0);

  const takes: Omit<Take, "id">[] = [];

  if (signalTier === "THIN") {
    takes.push({
      scope,
      severity: "SOFT",
      type: "CAUTION",
      trigger: "SIGNAL_THIN",
      confidence: 78,
      text: "Signal is thin here. Treat this as sentiment, not a conviction play.",
    });
    return takes.map((t) => ({ ...t, id: `${t.scope}:${t.trigger}:${t.type}:${t.severity}` }));
  }

  if (scope !== "portfolio" && (has(tags, "decline") || has(tags, "benched"))) {
    const base = signalTier === "STRONG" ? 90 : 84;
    const severity = base >= 88 ? "STRONG" : "SOFT";
    takes.push({
      scope,
      severity,
      type: "STRUCTURAL",
      trigger: "HOBBY_MOVED_ON",
      confidence: base,
      text:
        severity === "STRONG"
          ? `The hobby already moved on from ${playerName ?? "this player"}. These markets usually don't circle back.`
          : "Collectors aren't waiting for a comeback here. The hobby has mostly moved on.",
    });
  }

  const pos = (inputs.position ?? "").toUpperCase();
  if (scope !== "portfolio" && pos === "QB" && typeof inputs.age === "number" && inputs.age >= 33 && !inputs.isRookie) {
    const base = clamp(82 + (inputs.age - 33) * 1.5 + (signalTier === "STRONG" ? 4 : 0), 75, 93);
    const severity = base >= 88 ? "STRONG" : "SOFT";
    takes.push({
      scope,
      severity,
      type: "STRUCTURAL",
      trigger: "QB_UPSIDE_WINDOW",
      confidence: base,
      text:
        severity === "STRONG"
          ? `${playerName ?? "This player"}'s card market is structurally capped. The ceiling doesn't come back.`
          : `${playerName ?? "This player"} is past the hobby's upside window. Even solid games rarely rebuild conviction.`,
    });
  }

  if (scope !== "portfolio" && inputs.isRookie) {
    const base = signalTier === "STRONG" ? 88 : 82;
    const severity = base >= 88 ? "STRONG" : "SOFT";
    takes.push({
      scope,
      severity,
      type: "TIMING",
      trigger: "ROOKIE_UNCERTAINTY_WINDOW",
      confidence: base,
      text:
        severity === "STRONG"
          ? `This is the classic rookie uncertainty window for ${playerName ?? "this player"}. Once clarity hits, the market re-prices fast.`
          : `${playerName ?? "This rookie"} is priced like uncertainty is permanent. That rarely lasts once games start.`,
    });
  }

  if (scope !== "portfolio" && has(tags, "hype") && signalTier === "MEDIUM") {
    takes.push({
      scope,
      severity: "SOFT",
      type: "CAUTION",
      trigger: "HYPE_WITHOUT_CONVICTION",
      confidence: 78,
      text: "There's a lot of attention here, but it reads like curiosity more than conviction.",
    });
  }

  if (scope !== "portfolio" && has(tags, "volatile")) {
    takes.push({
      scope,
      severity: "SOFT",
      type: "CAUTION",
      trigger: "VOLATILE_MARKET",
      confidence: 75,
      text: "This market moves fast. Price swings can happen before catalysts are obvious.",
    });
  }

  if (scope !== "portfolio" && (has(tags, "legend") || has(tags, "retired")) && !has(tags, "decline")) {
    const base = signalTier === "STRONG" ? 88 : 82;
    const severity = base >= 88 ? "STRONG" : "SOFT";
    takes.push({
      scope,
      severity,
      type: "STRUCTURAL",
      trigger: "LEGACY_PREMIUM",
      confidence: base,
      text:
        severity === "STRONG"
          ? `${playerName ?? "This player"} carries a permanent legacy premium. The floor is real.`
          : "Legacy cards hold value differently. The nostalgia factor doesn't fade.",
    });
  }

  if (scope !== "portfolio" && has(tags, "buy") && signalTier === "STRONG") {
    takes.push({
      scope,
      severity: "STRONG",
      type: "TIMING",
      trigger: "ACCUMULATION_WINDOW",
      confidence: 86,
      text: `${playerName ?? "This player"} is in an accumulation window. Smart money is positioning before the next leg up.`,
    });
  }

  if (scope !== "portfolio" && has(tags, "sell")) {
    takes.push({
      scope,
      severity: "SOFT",
      type: "TIMING",
      trigger: "DISTRIBUTION_PHASE",
      confidence: 80,
      text: "The smart exit window may be open. Volume often dries up faster than you'd expect.",
    });
  }

  if (scope === "portfolio" && portfolioContext) {
    const pct = portfolioContext.concentrationPctTop1 ?? 0;
    if (pct >= 25) {
      const conf = clamp(82 + (pct - 25) * 0.5, 70, 90);
      const severity = conf >= 88 ? "STRONG" : "SOFT";
      const label = portfolioContext.topExposureLabel ?? "one segment";
      takes.push({
        scope,
        severity,
        type: "CAUTION",
        trigger: "PORTFOLIO_CONCENTRATION",
        confidence: conf,
        text:
          severity === "STRONG"
            ? `Your portfolio is concentrated in ${label}. That's fine when it's hot, dangerous when it cools.`
            : `You're overweight in ${label}. If sentiment turns, it will hit your portfolio fast.`,
      });
    }
  }

  const max = scope === "card" ? 1 : 2;
  const ranked = takes.sort((a, b) => b.confidence - a.confidence).slice(0, max);

  return ranked.map((t) => ({ ...t, id: `${t.scope}:${t.trigger}:${t.type}:${t.severity}` }));
}
