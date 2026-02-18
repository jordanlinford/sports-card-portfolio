import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Loader2, BarChart3, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface MonthlyPricePoint {
  month: string;
  avgPrice: number;
  salesCount?: number;
}

interface MonthlyPriceHistory {
  playerName: string;
  sport: string;
  cardDescription: string;
  dataPoints: MonthlyPricePoint[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  notes: string;
}

interface PlayerPriceRequest {
  playerName: string;
  sport: string;
  year?: string;
  setName?: string;
  variation?: string;
  grade?: string;
  grader?: string;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} '${year.slice(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function getConfidenceColor(confidence: string) {
  switch (confidence) {
    case "HIGH": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "MEDIUM": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "LOW": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

const CHART_COLORS = {
  player1: "hsl(var(--chart-1))",
  player2: "hsl(var(--chart-2))",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-popover border border-border rounded-md p-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm font-medium">
            {entry.name}: ${entry.value?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PriceTrendChart({
  playerRequest,
  autoLoad = false,
}: {
  playerRequest: PlayerPriceRequest;
  autoLoad?: boolean;
}) {
  const [history, setHistory] = useState<MonthlyPriceHistory | null>(null);

  const fetchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/player-outlook/price-history", playerRequest);
    },
    onSuccess: (data: MonthlyPriceHistory) => {
      setHistory(data);
    },
  });

  if (!history && !fetchMutation.isPending && !fetchMutation.isError) {
    if (autoLoad && !fetchMutation.isSuccess) {
      fetchMutation.mutate();
    }
  }

  if (fetchMutation.isPending) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend (18 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-[200px] w-full" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching eBay sold data...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend (18 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetchMutation.isError ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Could not load price history</p>
              <Button variant="outline" size="sm" onClick={() => fetchMutation.mutate()}>
                Retry
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fetchMutation.mutate()}
              data-testid="button-load-price-chart"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Load Price Chart
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const chartData = history.dataPoints.map((dp) => ({
    month: formatMonth(dp.month),
    [history.playerName]: dp.avgPrice,
  }));

  const allPricesRaw = history.dataPoints.map((dp) => dp.avgPrice);
  const prices = allPricesRaw.filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const firstPrice = allPricesRaw[0] || 0;
  const lastPrice = allPricesRaw[allPricesRaw.length - 1] || 0;
  const pctChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend (18 Months)
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={getConfidenceColor(history.confidence)}>
              {history.confidence} Confidence
            </Badge>
            <Badge
              variant="outline"
              className={
                pctChange >= 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
              }
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                interval={2}
              />
              <YAxis
                tickFormatter={formatPrice}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                domain={[Math.floor(minPrice * 0.85), Math.ceil(maxPrice * 1.1)]}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={history.playerName}
                stroke={CHART_COLORS.player1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.player1 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {history.notes && (
          <p className="text-xs text-muted-foreground mt-2">{history.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ComparisonPriceTrendChart({
  player1Request,
  player2Request,
  player1Name,
  player2Name,
}: {
  player1Request: PlayerPriceRequest;
  player2Request: PlayerPriceRequest;
  player1Name: string;
  player2Name: string;
}) {
  const [history1, setHistory1] = useState<MonthlyPriceHistory | null>(null);
  const [history2, setHistory2] = useState<MonthlyPriceHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [h1, h2] = await Promise.all([
        apiRequest("POST", "/api/player-outlook/price-history", player1Request),
        apiRequest("POST", "/api/player-outlook/price-history", player2Request),
      ]);
      setHistory1(h1 as MonthlyPriceHistory);
      setHistory2(h2 as MonthlyPriceHistory);
    } catch (err: any) {
      setError(err.message || "Failed to load price history");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend Comparison (18 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching eBay sold data for both players...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history1 || !history2) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend Comparison (18 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={loadBoth}>
                Retry
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={loadBoth}
              data-testid="button-load-comparison-chart"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Load Price Comparison Chart
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const allMonths = new Set<string>();
  history1.dataPoints.forEach((dp) => allMonths.add(dp.month));
  history2.dataPoints.forEach((dp) => allMonths.add(dp.month));
  const sortedMonths = Array.from(allMonths).sort();

  const p1Map = new Map(history1.dataPoints.map((dp) => [dp.month, dp.avgPrice]));
  const p2Map = new Map(history2.dataPoints.map((dp) => [dp.month, dp.avgPrice]));

  const chartData = sortedMonths.map((month) => ({
    month: formatMonth(month),
    [player1Name]: p1Map.get(month) || 0,
    [player2Name]: p2Map.get(month) || 0,
  }));

  const allPrices = [
    ...history1.dataPoints.map((dp) => dp.avgPrice),
    ...history2.dataPoints.map((dp) => dp.avgPrice),
  ].filter((p) => p > 0);

  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  const getChange = (h: MonthlyPriceHistory) => {
    const prices = h.dataPoints.map((dp) => dp.avgPrice).filter((p) => p > 0);
    if (prices.length < 2) return 0;
    return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  };

  const change1 = getChange(history1);
  const change2 = getChange(history2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend Comparison (18 Months)
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={
                change1 >= 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
              }
            >
              <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: CHART_COLORS.player1 }} />
              {player1Name}: {change1 >= 0 ? "+" : ""}{change1.toFixed(1)}%
            </Badge>
            <Badge
              variant="outline"
              className={
                change2 >= 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                  : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
              }
            >
              <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: CHART_COLORS.player2 }} />
              {player2Name}: {change2 >= 0 ? "+" : ""}{change2.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                interval={2}
              />
              <YAxis
                tickFormatter={formatPrice}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                domain={[Math.floor(minPrice * 0.85), Math.ceil(maxPrice * 1.1)]}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey={player1Name}
                stroke={CHART_COLORS.player1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.player1 }}
              />
              <Line
                type="monotone"
                dataKey={player2Name}
                stroke={CHART_COLORS.player2}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.player2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          {history1.notes && <p className="flex-1">{player1Name}: {history1.notes}</p>}
          {history2.notes && <p className="flex-1">{player2Name}: {history2.notes}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
