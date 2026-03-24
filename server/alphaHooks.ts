import type { IStorage } from "./storage";

export function recordPriceObservation(storage: IStorage, data: {
  cardId?: number;
  playerName?: string;
  cardTitle?: string;
  setName?: string;
  year?: number;
  variation?: string;
  priceEstimate: number;
  lowEstimate?: number;
  highEstimate?: number;
  confidence?: string;
  soldCount?: number;
  rawResponse?: any;
  source?: string;
}) {
  if (!data.priceEstimate || data.priceEstimate <= 0) return;
  storage.insertPriceObservation({
    cardId: data.cardId ?? null,
    playerName: data.playerName ?? null,
    cardTitle: data.cardTitle ?? null,
    setName: data.setName ?? null,
    year: data.year ?? null,
    variation: data.variation ?? null,
    priceEstimate: data.priceEstimate,
    lowEstimate: data.lowEstimate ?? null,
    highEstimate: data.highEstimate ?? null,
    confidence: data.confidence ?? null,
    source: data.source ?? "gemini",
    soldCount: data.soldCount ?? null,
    rawResponse: data.rawResponse ?? null,
  }).then((obs) => {
    storage.updateMarketSnapshot(
      data.cardId ?? undefined,
      data.playerName ?? undefined,
      data.cardTitle ?? undefined
    ).catch(e => console.error("[Alpha] Snapshot update error:", e.message));
  }).catch(e => console.error("[Alpha] Observation insert error:", e.message));
}

export function recordInterestEvent(storage: IStorage, data: {
  cardId?: number;
  playerName?: string;
  cardTitle?: string;
  eventType: string;
  userId?: string;
}) {
  storage.insertInterestEvent({
    cardId: data.cardId ?? null,
    playerName: data.playerName ?? null,
    cardTitle: data.cardTitle ?? null,
    eventType: data.eventType,
    userId: data.userId ?? null,
  }).catch(e => console.error("[Alpha] Interest event error:", e.message));
}
