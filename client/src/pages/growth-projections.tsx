import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { hasProAccess } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Target,
  Flame,
  Snowflake,
  ThermometerSun,
  Lock,
  LineChart
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart as RechartsLineChart,
  Line,
} from "recharts";

type MarketTemperature = "HOT" | "WARM" | "NEUTRAL" | "COOLING";

interface GrowthProjection {
  timeframe: "3m" | "6m" | "12m";
  label: string;
  bearCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
  baseCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
  bullCase: {
    valuePct: number;
    dollarChange: number;
    projectedValue: number;
  };
}

interface CardProjection {
  cardId: number;
  playerName: string;
  sport: string;
  currentValue: number;
  projectedGrowth: {
    "3m": number;
    "6m": number;
    "12m": number;
  };
  growthDriver: string;
  riskLevel: "low" | "medium" | "high";
  temperature: MarketTemperature | null;
  verdict: string | null;
}

interface GrowthInsight {
  type: "opportunity" | "risk" | "trend";
  title: string;
  description: string;
  impactLevel: "high" | "medium" | "low";
  affectedCards: number;
}

interface GrowthProjectionsData {
  currentValue: number;
  projections: GrowthProjection[];
  topGrowers: CardProjection[];
  riskCards: CardProjection[];
  insights: GrowthInsight[];
  sportBreakdown: {
    sport: string;
    value: number;
    projectedGrowth12m: number;
    cardCount: number;
  }[];
  temperatureBreakdown: {
    temperature: MarketTemperature;
    value: number;
    cardCount: number;
  }[];
  methodology: string;
  generatedAt: string;
  aiSummary: string;
}

interface BenchmarkDataPoint {
  date: string;
  value: number;
  changePct: number;
}

interface MarketBenchmarksData {
  benchmarks: {
    sp500: BenchmarkDataPoint[];
    bitcoin: BenchmarkDataPoint[];
    fetchedAt: string;
  };
  portfolioPerformance: BenchmarkDataPoint[];
}

const TEMP_COLORS: Record<MarketTemperature, string> = {
  HOT: "hsl(var(--chart-1))",
  WARM: "hsl(var(--chart-2))",
  NEUTRAL: "hsl(var(--chart-3))",
  COOLING: "hsl(var(--chart-4))",
};

const TEMP_ICONS: Record<MarketTemperature, typeof Flame> = {
  HOT: Flame,
  WARM: ThermometerSun,
  NEUTRAL: Target,
  COOLING: Snowflake,
};

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function GrowthSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32 mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function InsightCard({ insight }: { insight: GrowthInsight }) {
  const iconMap = {
    opportunity: <Sparkles className="h-4 w-4" />,
    risk: <AlertTriangle className="h-4 w-4" />,
    trend: <TrendingUp className="h-4 w-4" />,
  };
  
  const colorMap = {
    opportunity: "text-green-600 dark:text-green-400",
    risk: "text-red-600 dark:text-red-400",
    trend: "text-blue-600 dark:text-blue-400",
  };
  
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
      <div className={colorMap[insight.type]}>
        {iconMap[insight.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{insight.title}</span>
          <Badge variant="secondary" className="text-xs">
            {insight.affectedCards} cards
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
      </div>
    </div>
  );
}

export default function GrowthProjectionsPage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isPro = hasProAccess(user);

  const { data, isLoading, error } = useQuery<GrowthProjectionsData>({
    queryKey: ["/api/analytics/growth-projections"],
    enabled: isAuthenticated && isPro,
    retry: false,
  });

  const { data: benchmarkData } = useQuery<MarketBenchmarksData>({
    queryKey: ["/api/analytics/market-benchmarks"],
    enabled: isAuthenticated && isPro && !!data && data.currentValue > 0,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view growth projections</h2>
        <a href="/api/login">
          <Button data-testid="button-signin">Sign In</Button>
        </a>
      </div>
    );
  }

  if (!isPro && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/analytics" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Analytics
          </Link>
        </div>
        
        <Card className="text-center py-16">
          <CardContent>
            <Lock className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Pro Feature</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Growth Projections uses AI to forecast your collection's future value based on market trends, player performance, and investment signals.
            </p>
            <Link href="/upgrade">
              <Button data-testid="button-upgrade">Upgrade to Pro</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartData = data?.projections.map(p => ({
    name: p.label,
    bear: p.bearCase.projectedValue,
    base: p.baseCase.projectedValue,
    bull: p.bullCase.projectedValue,
  })) || [];

  if (data?.currentValue) {
    chartData.unshift({
      name: "Now",
      bear: data.currentValue,
      base: data.currentValue,
      bull: data.currentValue,
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/analytics" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Analytics
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <LineChart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-growth-title">Growth Projections</h1>
          <Badge variant="secondary">Pro</Badge>
        </div>
        <p className="text-muted-foreground">
          AI-powered forecasts for your collection's value
        </p>
      </div>

      {isLoading ? (
        <GrowthSkeleton />
      ) : error || !data ? (
        <Card className="text-center py-16">
          <CardContent>
            <AlertTriangle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Unable to Load Projections</h3>
            <p className="text-muted-foreground mb-6">
              Please try again later or contact support if the issue persists.
            </p>
          </CardContent>
        </Card>
      ) : data.currentValue === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <LineChart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Cards to Project</h3>
            <p className="text-muted-foreground mb-6">
              Add cards with estimated values to see growth projections.
            </p>
            <Link href="/dashboard">
              <Button data-testid="button-go-dashboard">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {data.aiSummary && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed" data-testid="text-ai-summary">{data.aiSummary}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-current-value">
                  {formatCurrency(data.currentValue)}
                </div>
              </CardContent>
            </Card>

            {data.projections.map((p) => (
              <Card key={p.timeframe}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{p.label} Projection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid={`text-projection-${p.timeframe}`}>
                    {formatCurrency(p.baseCase.projectedValue)}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {p.baseCase.valuePct >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className={`text-sm ${p.baseCase.valuePct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatPercent(p.baseCase.valuePct)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Value Projection Scenarios</CardTitle>
              <CardDescription>
                Bear, base, and bull case projections over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-muted-foreground text-xs" />
                  <YAxis 
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    className="text-muted-foreground text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [formatCurrency(value), name === "bear" ? "Bear Case" : name === "base" ? "Base Case" : "Bull Case"]}
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px"
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="bull" 
                    stroke="hsl(var(--chart-2))" 
                    fill="hsl(var(--chart-2))" 
                    fillOpacity={0.1}
                    strokeWidth={2}
                    name="bull"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="base" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.3}
                    strokeWidth={2}
                    name="base"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="bear" 
                    stroke="hsl(var(--chart-4))" 
                    fill="hsl(var(--chart-4))" 
                    fillOpacity={0.1}
                    strokeWidth={2}
                    name="bear"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
                  <span className="text-sm text-muted-foreground">Bull Case</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                  <span className="text-sm text-muted-foreground">Base Case</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(var(--chart-4))" }} />
                  <span className="text-sm text-muted-foreground">Bear Case</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {benchmarkData && benchmarkData.portfolioPerformance.length > 0 && (() => {
            const portfolio = benchmarkData.portfolioPerformance;
            const sp500 = benchmarkData.benchmarks.sp500;
            const btc = benchmarkData.benchmarks.bitcoin;
            
            const portfolioReturn = portfolio.length > 0 ? portfolio[portfolio.length - 1].changePct : 0;
            const sp500Return = sp500.length > 0 ? sp500[sp500.length - 1].changePct : 0;
            const btcReturn = btc.length > 0 ? btc[btc.length - 1].changePct : 0;
            
            const sp500Alpha = Math.round((portfolioReturn - sp500Return) * 100) / 100;
            
            const allDates = new Set<string>();
            portfolio.forEach(p => allDates.add(p.date));
            sp500.forEach(p => allDates.add(p.date));
            btc.forEach(p => allDates.add(p.date));
            
            const sortedDates = Array.from(allDates).sort();
            
            const sp500Map = new Map(sp500.map(p => [p.date, p.changePct]));
            const btcMap = new Map(btc.map(p => [p.date, p.changePct]));
            const portfolioMap = new Map(portfolio.map(p => [p.date, p.changePct]));
            
            const comparisonData = sortedDates.map(date => ({
              date,
              portfolio: portfolioMap.get(date) ?? null,
              sp500: sp500Map.get(date) ?? null,
              bitcoin: btcMap.get(date) ?? null,
            }));
            
            const beatingMarket = sp500.length > 0 && portfolioReturn > sp500Return;
            
            return (
              <Card data-testid="card-market-comparison">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Market Comparison
                  </CardTitle>
                  <CardDescription>
                    {sp500.length > 0 || btc.length > 0
                      ? "Your portfolio performance vs traditional assets (trailing 12 months)"
                      : "Your portfolio performance over the trailing 12 months"}
                  </CardDescription>
                  
                  {sp500.length > 0 && (
                    <div className={`mt-3 p-3 rounded-md ${beatingMarket ? "bg-green-500/10 border border-green-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                      <p className={`text-sm font-medium ${beatingMarket ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`} data-testid="text-alpha-headline">
                        {beatingMarket ? (
                          <>Your portfolio is outperforming the S&P 500 by {Math.abs(sp500Alpha)}%</>
                        ) : sp500Alpha === 0 ? (
                          <>Your portfolio is matching the S&P 500</>
                        ) : (
                          <>Your portfolio is underperforming the S&P 500 by {Math.abs(sp500Alpha)}%</>
                        )}
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-3 rounded-md bg-muted/50" data-testid="stat-portfolio-return">
                      <p className="text-xs text-muted-foreground mb-1">Your Portfolio</p>
                      <p className={`text-lg font-bold ${portfolioReturn >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatPercent(portfolioReturn)}
                      </p>
                    </div>
                    {sp500.length > 0 && (
                      <div className="text-center p-3 rounded-md bg-muted/50" data-testid="stat-sp500-return">
                        <p className="text-xs text-muted-foreground mb-1">S&P 500</p>
                        <p className={`text-lg font-bold ${sp500Return >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {formatPercent(sp500Return)}
                        </p>
                      </div>
                    )}
                    {btc.length > 0 && (
                      <div className="text-center p-3 rounded-md bg-muted/50" data-testid="stat-btc-return">
                        <p className="text-xs text-muted-foreground mb-1">Bitcoin</p>
                        <p className={`text-lg font-bold ${btcReturn >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {formatPercent(btcReturn)}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsLineChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-muted-foreground text-xs"
                        tickFormatter={(v) => {
                          const [year, month] = v.split("-");
                          return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(month) - 1]} '${year.slice(2)}`;
                        }}
                      />
                      <YAxis 
                        tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                        className="text-muted-foreground text-xs"
                      />
                      <Tooltip 
                        formatter={(value: number | null, name: string) => {
                          if (value === null) return ["-", name];
                          const label = name === "portfolio" ? "Your Portfolio" : name === "sp500" ? "S&P 500" : "Bitcoin";
                          return [`${value > 0 ? "+" : ""}${value}%`, label];
                        }}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px"
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="portfolio" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        dot={false}
                        connectNulls
                        name="portfolio"
                      />
                      {sp500.length > 0 && (
                        <Line 
                          type="monotone" 
                          dataKey="sp500" 
                          stroke="hsl(var(--chart-2))" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls
                          name="sp500"
                        />
                      )}
                      {btc.length > 0 && (
                        <Line 
                          type="monotone" 
                          dataKey="bitcoin" 
                          stroke="hsl(var(--chart-4))" 
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls
                          name="bitcoin"
                        />
                      )}
                    </RechartsLineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 rounded" style={{ backgroundColor: "hsl(var(--primary))" }} />
                      <span className="text-sm text-muted-foreground">Your Portfolio</span>
                    </div>
                    {sp500.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 rounded border-dashed" style={{ backgroundColor: "hsl(var(--chart-2))", borderTop: "2px dashed hsl(var(--chart-2))" }} />
                        <span className="text-sm text-muted-foreground">S&P 500</span>
                      </div>
                    )}
                    {btc.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 rounded" style={{ backgroundColor: "hsl(var(--chart-4))", borderTop: "2px dotted hsl(var(--chart-4))" }} />
                        <span className="text-sm text-muted-foreground">Bitcoin</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Market data refreshed daily. Portfolio value based on current card values at each month.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {data.insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Market Insights</CardTitle>
                <CardDescription>
                  Key opportunities and risks in your portfolio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Growth Opportunities</CardTitle>
                <CardDescription>
                  Cards with highest projected 12-month growth
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.topGrowers.length > 0 ? (
                  <div className="space-y-3">
                    {data.topGrowers.map((card) => {
                      const TempIcon = card.temperature ? TEMP_ICONS[card.temperature] : Target;
                      return (
                        <div 
                          key={card.cardId}
                          className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                          data-testid={`top-grower-${card.cardId}`}
                        >
                          <TempIcon className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{card.playerName}</p>
                            <p className="text-xs text-muted-foreground">{card.growthDriver}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(card.currentValue)}</p>
                            <span className="text-sm text-green-600 dark:text-green-400">
                              {formatPercent(card.projectedGrowth["12m"])}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No growth opportunities identified
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Watch</CardTitle>
                <CardDescription>
                  Cards with elevated risk or negative outlook
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.riskCards.length > 0 ? (
                  <div className="space-y-3">
                    {data.riskCards.map((card) => (
                      <div 
                        key={card.cardId}
                        className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                        data-testid={`risk-card-${card.cardId}`}
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{card.playerName}</p>
                          <p className="text-xs text-muted-foreground">{card.growthDriver}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(card.currentValue)}</p>
                          <span className={`text-sm ${card.projectedGrowth["12m"] >= 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                            {formatPercent(card.projectedGrowth["12m"])}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No significant risk cards identified
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {data.sportBreakdown.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Growth by Sport</CardTitle>
                <CardDescription>
                  Projected 12-month growth by sport category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.sportBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      type="number" 
                      tickFormatter={(v) => `${v}%`}
                      className="text-muted-foreground text-xs"
                    />
                    <YAxis 
                      type="category" 
                      dataKey="sport" 
                      width={80}
                      className="text-muted-foreground text-xs"
                      tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value}%`, "Projected Growth"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px"
                      }}
                    />
                    <Bar dataKey="projectedGrowth12m" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                      {data.sportBreakdown.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.projectedGrowth12m >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {data.temperatureBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Market Temperature Mix</CardTitle>
                <CardDescription>
                  Distribution of your cards by market heat
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {data.temperatureBreakdown.map((t) => {
                    const TempIcon = TEMP_ICONS[t.temperature];
                    return (
                      <div 
                        key={t.temperature}
                        className="p-4 rounded-md bg-muted/50 text-center"
                        data-testid={`temp-${t.temperature.toLowerCase()}`}
                      >
                        <TempIcon 
                          className="h-6 w-6 mx-auto mb-2" 
                          style={{ color: TEMP_COLORS[t.temperature] }}
                        />
                        <p className="font-medium">{t.temperature}</p>
                        <p className="text-sm text-muted-foreground">{t.cardCount} cards</p>
                        <p className="text-lg font-semibold">{formatCurrency(t.value)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {data.methodology}
          </p>
        </div>
      )}
    </div>
  );
}
