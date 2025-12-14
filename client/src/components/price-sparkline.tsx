import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PriceHistory } from "@shared/schema";

interface PriceSparklineProps {
  cardId: number;
  className?: string;
  height?: number;
  days?: number;
  showTrend?: boolean;
}

export function PriceSparkline({
  cardId,
  className = "",
  height = 40,
  days = 30,
  showTrend = false,
}: PriceSparklineProps) {
  const { data: history, isLoading } = useQuery<PriceHistory[]>({
    queryKey: ["/api/cards", cardId, "price-history", days],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${cardId}/price-history?days=${days}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-muted-foreground text-xs ${className}`}
        style={{ height }}
      >
        No trend data
      </div>
    );
  }

  const chartData = history.map((h) => ({
    date: new Date(h.recordedAt).getTime(),
    price: h.price,
  }));

  const firstPrice = chartData[0].price;
  const lastPrice = chartData[chartData.length - 1].price;
  const priceChange = lastPrice - firstPrice;
  const percentChange = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  const strokeColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  const fillColor = isPositive
    ? "hsl(var(--chart-2) / 0.2)"
    : "hsl(var(--destructive) / 0.2)";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`gradient-${cardId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#gradient-${cardId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {showTrend && (
        <div
          className={`flex items-center gap-0.5 text-xs font-medium ${
            isPositive ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
          }`}
        >
          {priceChange === 0 ? (
            <Minus className="h-3 w-3" />
          ) : isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>{isPositive && priceChange !== 0 ? "+" : ""}{percentChange.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
