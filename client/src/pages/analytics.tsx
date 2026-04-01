import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  LayoutGrid, 
  ImageIcon,
  BarChart3,
  LineChart,
  Sparkles
} from "lucide-react";
import type { Card as CardType } from "@shared/schema";
import { ShareSnapshotButton } from "@/components/share-snapshot-button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type AnalyticsData = {
  totalValue: number;
  totalCards: number;
  totalCases: number;
  topCards: CardType[];
  valueByCase: { caseName: string; totalValue: number; cardCount: number }[];
  recentValueChanges: (CardType & { displayCaseName: string })[];
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getEffectiveValue(card: CardType): number {
  return card.manualValue ?? card.estimatedValue ?? 0;
}

function ValueChangeIndicator({ current, previous }: { current: number | null; previous: number | null }) {
  if (!current || !previous || previous === 0) return null;
  
  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  
  return (
    <Badge 
      variant="secondary" 
      className={`text-xs gap-1 ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? "+" : ""}{change.toFixed(1)}%
    </Badge>
  );
}

function AnalyticsSkeleton() {
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view your analytics</h2>
        <a href="/api/login">
          <Button data-testid="button-signin">Sign In</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-analytics-title">Portfolio Analytics</h1>
          </div>
          {analytics && analytics.totalCards > 0 && (
            <ShareSnapshotButton
              snapshotType="portfolio_analytics"
              title="Portfolio Analytics"
              snapshotData={{
                totalValue: analytics.totalValue,
                totalCards: analytics.totalCards,
                totalCases: analytics.totalCases,
                topCards: analytics.topCards.slice(0, 5).map((c: CardType) => ({
                  title: c.title,
                  estimatedValue: c.estimatedValue,
                  previousValue: c.previousValue,
                })),
                valueByCase: analytics.valueByCase,
              }}
            />
          )}
        </div>
        <p className="text-muted-foreground">
          Track your collection's value and performance
        </p>
      </div>

      <Link href="/analytics/growth">
        <Card className="mb-6 hover-elevate cursor-pointer border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-md bg-primary/10">
              <LineChart className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">Growth Projections</h3>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  Pro
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-powered forecasts for your collection's future value
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : !analytics || (analytics.totalCards === 0) ? (
        <Card className="text-center py-16">
          <CardContent>
            <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Analytics Available</h3>
            <p className="text-muted-foreground mb-6">
              Add cards to your display cases to start tracking your collection's value.
            </p>
            <Link href="/dashboard">
              <Button data-testid="button-go-dashboard">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-value">
                  {formatCurrency(analytics.totalValue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated collection value
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-cards">
                  {analytics.totalCards.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cards in your collection
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Display Cases</CardTitle>
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-cases">
                  {analytics.totalCases}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cases in your collection
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Value by Display Case</CardTitle>
                <CardDescription>
                  Distribution of value across your cases
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.valueByCase.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.valueByCase} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis 
                        type="number" 
                        tickFormatter={(value) => `$${value.toLocaleString()}`}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis 
                        type="category" 
                        dataKey="caseName" 
                        width={120}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), "Value"]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          color: "hsl(var(--foreground))"
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Bar dataKey="totalValue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No value data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cards per Case</CardTitle>
                <CardDescription>
                  Distribution of cards across your cases
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.valueByCase.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={analytics.valueByCase}
                        dataKey="cardCount"
                        nameKey="caseName"
                        cx="50%"
                        cy="45%"
                        outerRadius={80}
                        label={({ x, y, cardCount }) => (
                          <text 
                            x={x} 
                            y={y} 
                            fill="hsl(var(--foreground))" 
                            textAnchor="middle" 
                            dominantBaseline="central"
                            fontSize={12}
                          >
                            {cardCount}
                          </text>
                        )}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                      >
                        {analytics.valueByCase.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string) => [`${value} cards`, name]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          color: "hsl(var(--foreground))"
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Legend 
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                        wrapperStyle={{ paddingTop: 10, color: "hsl(var(--foreground))" }}
                        formatter={(value: string) => <span style={{ color: "hsl(var(--foreground))" }}>{value.length > 20 ? `${value.substring(0, 20)}...` : value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    No case data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Most Valuable Cards</CardTitle>
                <CardDescription>
                  Your highest value cards
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.topCards.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topCards.map((card, index) => (
                      <Link 
                        key={card.id}
                        href={`/card/${card.id}/outlook`}
                        className="flex items-center gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                        data-testid={`top-card-${card.id}`}
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-muted">
                          {card.imagePath ? (
                            <img 
                              src={card.imagePath} 
                              alt={card.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{card.playerName || card.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{[card.year, card.set, card.variation].filter(Boolean).join(" · ")}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(getEffectiveValue(card))}</p>
                          <ValueChangeIndicator current={getEffectiveValue(card)} previous={card.previousValue} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    Add estimated values to your cards to see rankings
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Value Changes</CardTitle>
                <CardDescription>
                  Cards with recent price updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.recentValueChanges.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.recentValueChanges.map((card) => (
                      <Link 
                        key={card.id}
                        href={`/card/${card.id}/outlook`}
                        className="flex items-center gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                        data-testid={`value-change-${card.id}`}
                      >
                        <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-muted">
                          {card.imagePath ? (
                            <img 
                              src={card.imagePath} 
                              alt={card.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{card.playerName || card.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{card.displayCaseName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(getEffectiveValue(card))}</p>
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-muted-foreground">was {formatCurrency(card.previousValue || 0)}</span>
                            <ValueChangeIndicator current={getEffectiveValue(card)} previous={card.previousValue} />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No value changes recorded yet. Use AI price lookup to track changes.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
