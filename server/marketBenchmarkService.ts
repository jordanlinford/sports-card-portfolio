interface BenchmarkDataPoint {
  date: string;
  value: number;
  changePct: number;
}

interface BenchmarkData {
  sp500: BenchmarkDataPoint[];
  bitcoin: BenchmarkDataPoint[];
  fetchedAt: string;
}

let cachedBenchmarkData: BenchmarkData | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchSP500Data(): Promise<BenchmarkDataPoint[]> {
  try {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (365 * 24 * 60 * 60);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=${startDate}&period2=${endDate}&interval=1mo`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);

    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error("No chart data");

    const timestamps: number[] = result.timestamp || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];

    if (timestamps.length === 0 || closes.length === 0) throw new Error("Empty data");

    const basePrice = closes[0];
    if (!basePrice) throw new Error("No base price");

    return timestamps.map((ts, i) => {
      const price = closes[i] ?? basePrice;
      return {
        date: new Date(ts * 1000).toISOString().slice(0, 7),
        value: Math.round(price * 100) / 100,
        changePct: Math.round(((price - basePrice) / basePrice) * 10000) / 100,
      };
    });
  } catch (error) {
    console.error("[Benchmark] Failed to fetch S&P 500 data:", error);
    return [];
  }
}

async function fetchBitcoinData(): Promise<BenchmarkDataPoint[]> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);

    const json = await res.json();
    const prices: [number, number][] = json.prices || [];

    if (prices.length === 0) throw new Error("Empty data");

    const monthlyPrices = new Map<string, number>();
    for (const [ts, price] of prices) {
      const monthKey = new Date(ts).toISOString().slice(0, 7);
      monthlyPrices.set(monthKey, price);
    }

    const sortedMonths = Array.from(monthlyPrices.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (sortedMonths.length === 0) throw new Error("No monthly data");

    const basePrice = sortedMonths[0][1];

    return sortedMonths.map(([date, price]) => ({
      date,
      value: Math.round(price * 100) / 100,
      changePct: Math.round(((price - basePrice) / basePrice) * 10000) / 100,
    }));
  } catch (error) {
    console.error("[Benchmark] Failed to fetch Bitcoin data:", error);
    return [];
  }
}

export async function getMarketBenchmarks(): Promise<BenchmarkData> {
  if (cachedBenchmarkData && Date.now() < cacheExpiresAt) {
    return cachedBenchmarkData;
  }

  const [sp500, bitcoin] = await Promise.all([
    fetchSP500Data(),
    fetchBitcoinData(),
  ]);

  const data: BenchmarkData = {
    sp500,
    bitcoin,
    fetchedAt: new Date().toISOString(),
  };

  if (sp500.length > 0 || bitcoin.length > 0) {
    cachedBenchmarkData = data;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  }

  return data;
}

export interface PortfolioPerformancePoint {
  date: string;
  value: number;
  changePct: number;
}

export async function getPortfolioPerformanceOverTime(
  userId: string
): Promise<PortfolioPerformancePoint[]> {
  const { storage } = await import("./storage");

  const displayCases = await storage.getDisplayCasesByUserId(userId);
  if (displayCases.length === 0) return [];

  const allCards: any[] = [];
  for (const dc of displayCases) {
    const cards = await storage.getCardsByDisplayCaseId(dc.id);
    allCards.push(...cards);
  }

  if (allCards.length === 0) return [];

  const now = new Date();
  const monthsBack = 12;

  const priceHistoryByCard = new Map<number, Map<string, number>>();
  for (const card of allCards) {
    const history = await storage.getCardPriceHistory(card.id, 365);
    const monthMap = new Map<string, number>();
    for (const entry of history) {
      const monthKey = new Date(entry.recordedAt).toISOString().slice(0, 7);
      monthMap.set(monthKey, entry.price);
    }
    priceHistoryByCard.set(card.id, monthMap);
  }

  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - monthsBack);
  startDate.setDate(1);

  const points: PortfolioPerformancePoint[] = [];
  let firstValue = 0;

  for (let m = 0; m <= monthsBack; m++) {
    const pointDate = new Date(startDate);
    pointDate.setMonth(pointDate.getMonth() + m);

    if (pointDate > now) break;

    const monthKey = pointDate.toISOString().slice(0, 7);
    const monthEnd = new Date(pointDate.getFullYear(), pointDate.getMonth() + 1, 0);

    let portfolioValue = 0;
    for (const card of allCards) {
      const cardDate = card.createdAt ? new Date(card.createdAt) : now;
      if (cardDate > monthEnd) continue;

      const cardHistory = priceHistoryByCard.get(card.id);
      let cardValue: number | undefined;

      if (cardHistory && cardHistory.size > 0) {
        cardValue = cardHistory.get(monthKey);
        if (cardValue === undefined) {
          const sortedEntries = Array.from(cardHistory.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          for (const [entryMonth, entryPrice] of sortedEntries) {
            if (entryMonth <= monthKey) {
              cardValue = entryPrice;
            }
          }
        }
      }

      if (cardValue === undefined) {
        const isCurrentMonth = monthKey === now.toISOString().slice(0, 7);
        if (isCurrentMonth) {
          cardValue = card.manualValue || card.estimatedValue || card.purchasePrice || 0;
        } else {
          cardValue = card.purchasePrice || card.estimatedValue || 0;
        }
      }

      portfolioValue += cardValue;
    }

    if (m === 0 || firstValue === 0) {
      firstValue = portfolioValue || 1;
    }

    points.push({
      date: monthKey,
      value: Math.round(portfolioValue * 100) / 100,
      changePct: Math.round(((portfolioValue - firstValue) / firstValue) * 10000) / 100,
    });
  }

  return points;
}
