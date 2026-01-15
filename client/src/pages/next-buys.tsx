import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  RefreshCw, 
  TrendingUp, 
  Target,
  ShoppingCart,
  Eye,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Filter,
  Sparkles,
  Clock,
  Plus,
  Search,
  Info
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NextBuy, NextBuyPortfolioImpact } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageShareButton } from "@/components/page-share-button";

function formatTimestamp(date: Date | string | null | undefined): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  if (!confidence || confidence >= 60) return null;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700">
          <Info className="h-3 w-3" />
          Data is thin
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-sm max-w-[200px]">
          Limited sales data available for pricing. Recommendations may be less accurate.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? "text-green-600 dark:text-green-400" : 
                score >= 50 ? "text-yellow-600 dark:text-yellow-400" : 
                "text-red-600 dark:text-red-400";
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{score}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function PortfolioImpactLine({ impact }: { impact: NextBuyPortfolioImpact | null }) {
  if (!impact) return null;
  
  const items: { label: string; delta: number | string }[] = [];
  
  if (impact.qbExposureDelta) {
    items.push({ label: "QB exposure", delta: impact.qbExposureDelta });
  }
  if (impact.rookieExposureDelta) {
    items.push({ label: "Rookie exposure", delta: impact.rookieExposureDelta });
  }
  if (impact.diversificationGain) {
    items.push({ label: "Diversification", delta: impact.diversificationGain });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {typeof item.delta === "number" ? (
            <>
              {item.delta > 0 ? (
                <ArrowUpRight className="h-3 w-3 text-green-500" />
              ) : item.delta < 0 ? (
                <ArrowDownRight className="h-3 w-3 text-blue-500" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {item.label} {item.delta > 0 ? "+" : ""}{item.delta}%
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 text-purple-500" />
              {item.delta}
            </>
          )}
        </span>
      ))}
    </div>
  );
}

function getVerdictLine(buy: NextBuy): string {
  const price = buy.estPrice ? `$${buy.estPrice.toFixed(0)}` : "this price";
  
  if (buy.verdict === "BUY") {
    return `Good entry point at ${price}. Consider adding.`;
  }
  
  // MONITOR cards get conditional triggers
  const triggers: string[] = [];
  if (buy.estPrice) {
    const buyTarget = Math.round(buy.estPrice * 0.85);
    triggers.push(`Buy if price drops below $${buyTarget}`);
  }
  if (buy.momentumScore && buy.momentumScore < 60) {
    triggers.push("or if momentum picks up");
  }
  
  if (triggers.length > 0) {
    return triggers.join(" ");
  }
  
  return "Wait for better entry. Monitor for price dips or news.";
}

function NextBuyCard({ buy, isBestOpportunity = false }: { buy: NextBuy; isBestOpportunity?: boolean }) {
  const whyBullets = (buy.whyBullets as string[] | null) || [];
  const portfolioImpact = buy.portfolioImpact as NextBuyPortfolioImpact | null;

  return (
    <Card className={`overflow-hidden ${isBestOpportunity ? "ring-2 ring-primary" : ""}`} data-testid={`card-next-buy-${buy.id}`}>
      <CardContent className="pt-4">
        {isBestOpportunity && (
          <div className="flex items-center gap-1 mb-2">
            <Badge className="bg-primary text-primary-foreground gap-1">
              <Sparkles className="h-3 w-3" />
              Best Opportunity
            </Badge>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge 
                variant={buy.verdict === "BUY" ? "default" : "secondary"}
                className={buy.verdict === "BUY" ? "bg-green-600" : ""}
              >
                {buy.verdict}
              </Badge>
              {buy.source && (
                <Badge variant="outline" className="text-xs">
                  {buy.source}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-sm leading-tight">{buy.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {buy.playerName} {buy.year ? `(${buy.year})` : ""}
            </p>
          </div>
          
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-primary">
              {buy.overallScore}
            </div>
            <div className="text-xs text-muted-foreground">Score</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-muted/50 rounded-lg">
          <ScoreBadge score={buy.fitScore || 0} label="Fit" />
          <ScoreBadge score={buy.valueScore || 0} label="Value" />
          <ScoreBadge score={buy.momentumScore || 0} label="Momentum" />
        </div>

        {buy.estPrice && (
          <div className="mb-2 text-sm">
            <span className="text-muted-foreground">Est. Price: </span>
            <span className="font-medium">${buy.estPrice.toFixed(0)}</span>
          </div>
        )}
        
        <p className="text-xs text-foreground/80 mb-3 italic">
          {getVerdictLine(buy)}
        </p>

        {whyBullets.length > 0 && (
          <ul className="space-y-1 mb-3">
            {whyBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <Target className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <PortfolioImpactLine impact={portfolioImpact} />

        <div className="mt-3 pt-3 border-t flex items-center gap-2">
          <Link href={`/player-outlook?player=${encodeURIComponent(buy.playerName || "")}${buy.sport ? `&sport=${buy.sport}` : ""}`}>
            <Button variant="outline" size="sm" className="flex-1">
              <Eye className="h-3 w-3 mr-1" />
              Analyze
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NextBuysPage() {
  const [showBuyOnly, setShowBuyOnly] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error } = useQuery<{ buys: NextBuy[]; count: number; generatedAt?: string }>({
    queryKey: ["/api/portfolio/next-buys"],
  });

  const generateMutation = useMutation({
    mutationFn: async (refresh: boolean) => {
      const result = await apiRequest(
        "POST", 
        `/api/portfolio/next-buys/generate${refresh ? "?refresh=true" : ""}`
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/next-buys"] });
      setIsRefreshing(false);
    },
    onError: () => {
      setIsRefreshing(false);
    },
  });

  const handleGenerate = (refresh: boolean = false) => {
    setIsRefreshing(true);
    generateMutation.mutate(refresh);
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">Failed to load recommendations</h3>
            <p className="text-muted-foreground mb-4">There was an error loading your next buys.</p>
            <Button onClick={() => handleGenerate(true)}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const buys = data?.buys || [];
  const filteredBuys = showBuyOnly ? buys.filter(b => b.verdict === "BUY") : buys;

  if (buys.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Next Buys</h1>
          <p className="text-muted-foreground">Personalized buy recommendations for your portfolio</p>
        </div>
        
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-medium mb-2">No recommendations yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Generate personalized buy recommendations based on your portfolio's exposures and gaps.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button 
                size="lg" 
                onClick={() => handleGenerate(false)}
                disabled={generateMutation.isPending}
                data-testid="button-generate-buys"
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Recommendations
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Link href="/cases/new">
                  <Button variant="outline" size="lg" data-testid="button-add-cards-buys">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Cards First
                  </Button>
                </Link>
                <Link href="/outlook">
                  <Button variant="ghost" size="lg" data-testid="button-quick-check-buys">
                    <Search className="h-4 w-4 mr-2" />
                    Quick Check
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const buyCount = buys.filter(b => b.verdict === "BUY").length;
  const monitorCount = buys.filter(b => b.verdict === "MONITOR").length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Next Buys</h1>
          <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Last generated: {formatTimestamp(data?.generatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PageShareButton pageSlug="next-buys" />
          <Button 
            variant={showBuyOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowBuyOnly(!showBuyOnly)}
            data-testid="button-filter-buy"
          >
            <Filter className="h-4 w-4 mr-1" />
            {showBuyOnly ? "BUY only" : "All"}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleGenerate(true)}
            disabled={isRefreshing || generateMutation.isPending}
            data-testid="button-refresh-buys"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Badge variant="default" className="bg-green-600">
          {buyCount} BUY
        </Badge>
        <Badge variant="secondary">
          {monitorCount} MONITOR
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBuys.map((buy, index) => (
          <NextBuyCard 
            key={buy.id} 
            buy={buy} 
            isBestOpportunity={index === 0 && (buy.overallScore ?? 0) >= 60}
          />
        ))}
      </div>

      {filteredBuys.length === 0 && showBuyOnly && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No BUY recommendations at this time. Check back later or view all recommendations.</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowBuyOnly(false)}>
              Show All
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Not financial advice. Recommendations based on your portfolio profile and market data.
      </p>
    </div>
  );
}
