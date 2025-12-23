export interface Take {
  id: string;
  scope: "card" | "player" | "portfolio";
  severity: "SOFT" | "STRONG";
  type: "STRUCTURAL" | "TIMING" | "CAUTION";
  trigger: string;
  confidence: number;
  text: string;
}

export async function getTakesFromMarket(payload: {
  scope: "card" | "player" | "portfolio";
  subject: { playerName?: string; cardName?: string; subjectId?: string; portfolioId?: string };
  market: any;
  portfolioContext?: any;
}): Promise<Take[]> {
  const res = await fetch("/api/takes/from-market", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to fetch takes");
  const data = await res.json();
  return data.takes ?? [];
}
