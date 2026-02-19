import { useState, useEffect } from "react";
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
  Area,
  AreaChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Loader2, BarChart3, AlertCircle } from "lucide-react";
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
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${monthNames[idx]} '${year.slice(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 10000) return `$${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value < 1 && value > 0) return `$${value.toFixed(2)}`;
  if (value < 10) return `$${value.toFixed(1)}`;
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
            {entry.name}: ${entry.value < 10
              ? entry.value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : entry.value?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

function computeXAxisInterval(dataLength: number): number {
  if (dataLength <= 6) return 0;
  if (dataLength <= 12) return 1;
  return 2;
}

function computePercentChange(dataPoints: MonthlyPricePoint[]): number {
  const prices = dataPoints.map((dp) => dp.avgPrice);
  const firstNonZero = prices.find((p) => p > 0);
  const lastNonZero = [...prices].reverse().find((p) => p > 0);
  if (!firstNonZero || !lastNonZero || firstNonZero === 0) return 0;
  return ((lastNonZero - firstNonZero) / firstNonZero) * 100;
}

export function PriceTrendChart({
  playerRequest,
  autoLoad = false,
  subtitle,
  preloadedData,
}: {
  playerRequest?: PlayerPriceRequest;
  autoLoad?: boolean;
  subtitle?: string;
  preloadedData?: MonthlyPriceHistory | null;
}) {
  const [history, setHistory] = useState<MonthlyPriceHistory | null>(preloadedData || null);
  const [hasTriggeredAutoLoad, setHasTriggeredAutoLoad] = useState(false);

  useEffect(() => {
    if (preloadedData) {
      setHistory(preloadedData);
    }
  }, [preloadedData]);

  const fetchMutation = useMutation({
    mutationFn: async () => {
      if (!playerRequest) throw new Error("No player request provided");
      return await apiRequest("POST", "/api/player-outlook/price-history", playerRequest);
    },
    onSuccess: (data: MonthlyPriceHistory) => {
      setHistory(data);
    },
  });

  useEffect(() => {
    if (autoLoad && !preloadedData && !hasTriggeredAutoLoad && !history && !fetchMutation.isPending) {
      setHasTriggeredAutoLoad(true);
      fetchMutation.mutate();
    }
  }, [autoLoad, preloadedData, hasTriggeredAutoLoad, history, fetchMutation.isPending]);

  if (fetchMutation.isPending) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend
          </CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-[200px] w-full" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching market data...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history) {
    if (!playerRequest) return null;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Price Trend
          </CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
              Load 18-Month Price Chart
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const chartData = history.dataPoints.map((dp) => ({
    month: formatMonth(dp.month),
    price: dp.avgPrice,
    salesCount: dp.salesCount || 0,
  }));

  const prices = history.dataPoints.map((dp) => dp.avgPrice).filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const pctChange = computePercentChange(history.dataPoints);
  const TrendIcon = pctChange >= 0 ? TrendingUp : TrendingDown;

  const yDomain = [
    Math.max(0, Math.floor(minPrice * 0.8)),
    Math.ceil(maxPrice * 1.15),
  ];
  const xInterval = computeXAxisInterval(chartData.length);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Price Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {subtitle || history.cardDescription || "Recent sold prices from market data"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={getConfidenceColor(history.confidence)}>
              {history.confidence}
            </Badge>
            {pctChange !== 0 && (
              <Badge
                variant="outline"
                className={
                  pctChange >= 0
                    ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                    : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                }
              >
                <TrendIcon className="h-3 w-3 mr-1" />
                {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full" data-testid="price-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.player1} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.player1} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                interval={xInterval}
                angle={-30}
                textAnchor="end"
                height={40}
              />
              <YAxis
                tickFormatter={formatPrice}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                domain={yDomain}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                name={history.playerName}
                stroke={CHART_COLORS.player1}
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.player1, stroke: "hsl(var(--background))", strokeWidth: 2 }}
              />
            </AreaChart>
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
            Price Trend Comparison
          </CardTitle>
          <p className="text-xs text-muted-foreground">18-month price history overlay</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading price history for both players...
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
            Price Trend Comparison
          </CardTitle>
          <p className="text-xs text-muted-foreground">18-month price history overlay</p>
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

  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;

  const change1 = computePercentChange(history1.dataPoints);
  const change2 = computePercentChange(history2.dataPoints);

  const xInterval = computeXAxisInterval(chartData.length);

  const TrendIcon1 = change1 >= 0 ? TrendingUp : TrendingDown;
  const TrendIcon2 = change2 >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Price Trend Comparison
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">18-month price history overlay</p>
          </div>
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
              <TrendIcon1 className="h-3 w-3 mr-0.5" />
              {change1 >= 0 ? "+" : ""}{change1.toFixed(1)}%
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
              <TrendIcon2 className="h-3 w-3 mr-0.5" />
              {change2 >= 0 ? "+" : ""}{change2.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full" data-testid="comparison-price-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                interval={xInterval}
                angle={-30}
                textAnchor="end"
                height={40}
              />
              <YAxis
                tickFormatter={formatPrice}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                domain={[Math.max(0, Math.floor(minPrice * 0.8)), Math.ceil(maxPrice * 1.15)]}
                width={50}
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
                activeDot={{ r: 4, fill: CHART_COLORS.player1, stroke: "hsl(var(--background))", strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey={player2Name}
                stroke={CHART_COLORS.player2}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: CHART_COLORS.player2, stroke: "hsl(var(--background))", strokeWidth: 2 }}
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
