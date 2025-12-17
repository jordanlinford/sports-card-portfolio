import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown,
  Eye,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Crown,
  ArrowRight,
  RefreshCw,
  Sparkles
} from "lucide-react";
import type { Card as CardType, DisplayCase } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type CaseWithCards = DisplayCase & { cards: CardType[] };
type UsageInfo = { used: number; limit: number | null; remaining: number | null; isPro: boolean };

function getActionIcon(action: string | null) {
  switch (action) {
    case "BUY": return <ShoppingCart className="h-3 w-3" />;
    case "SELL": return <TrendingDown className="h-3 w-3" />;
    case "WATCH": return <Eye className="h-3 w-3" />;
    case "LONG_HOLD": return <Clock className="h-3 w-3" />;
    default: return null;
  }
}

function getActionColor(action: string | null) {
  switch (action) {
    case "BUY": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "SELL": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WATCH": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "LONG_HOLD": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function OutlookSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-16 w-16 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

function CardOutlookRow({ card, isPro, showDetails = true, canAnalyze = false, onAnalyze }: { 
  card: CardType; 
  isPro: boolean; 
  showDetails?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
}) {
  const { toast } = useToast();
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cards/${card.id}/outlook-v2`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to generate outlook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      toast({ title: "Outlook generated", description: `Analysis complete for ${card.title}` });
      onAnalyze?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const hasOutlook = card.outlookAction !== null;
  const isBigMover = card.outlookBigMover === true;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover-elevate" data-testid={`outlook-row-${card.id}`}>
      <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {card.imagePath ? (
          <img 
            src={card.imagePath.startsWith('/objects/') ? card.imagePath : `/objects/${card.imagePath}`}
            alt={card.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
            No Image
          </div>
        )}
        {isBigMover && isPro && (
          <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
            <Zap className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium truncate" data-testid={`text-card-title-${card.id}`}>{card.title}</h3>
          {isBigMover && isPro && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 gap-1">
              <Zap className="h-3 w-3" />
              Big Mover
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {card.year} {card.set} {card.variation ? `- ${card.variation}` : ""} {card.grade ? `(${card.grade})` : ""}
        </p>
        {showDetails && isPro && hasOutlook && card.outlookExplanationShort && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {card.outlookExplanationShort}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {hasOutlook && isPro ? (
          <>
            <Badge variant="outline" className={`gap-1 ${getActionColor(card.outlookAction)}`}>
              {getActionIcon(card.outlookAction)}
              {card.outlookAction}
            </Badge>
            {showDetails && card.outlookUpsideScore !== null && (
              <div className="text-xs text-muted-foreground hidden sm:block">
                <span className="text-green-600 dark:text-green-400">{card.outlookUpsideScore}</span>
                /
                <span className="text-red-600 dark:text-red-400">{card.outlookRiskScore}</span>
              </div>
            )}
          </>
        ) : hasOutlook && !isPro ? (
          <Badge variant="secondary" className="gap-1">
            <Crown className="h-3 w-3" />
            Pro to view
          </Badge>
        ) : canAnalyze ? (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid={`button-generate-outlook-${card.id}`}
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Analyze
              </>
            )}
          </Button>
        ) : (
          <Link href="/upgrade">
            <Badge variant="secondary" className="gap-1 cursor-pointer">
              <Crown className="h-3 w-3" />
              Upgrade
            </Badge>
          </Link>
        )}
        
        {hasOutlook && isPro && (
          <Link href={`/card/${card.id}/outlook`}>
            <Button size="icon" variant="ghost" data-testid={`button-view-outlook-${card.id}`}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function OutlookOverviewPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isPro = user?.subscriptionStatus === "PRO";

  const { data: cases, isLoading } = useQuery<CaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated,
  });

  const { data: usage } = useQuery<UsageInfo>({
    queryKey: ["/api/user/outlook-usage"],
    enabled: isAuthenticated,
  });

  const canAnalyze = isPro || (usage?.remaining != null && usage.remaining > 0);

  const allCards = cases?.flatMap(c => c.cards) || [];
  const cardsWithOutlook = allCards.filter(c => c.outlookAction !== null);
  const bigMovers = allCards.filter(c => c.outlookBigMover === true);
  const cardsWithoutOutlook = allCards.filter(c => c.outlookAction === null);

  const buyCards = cardsWithOutlook.filter(c => c.outlookAction === "BUY");
  const sellCards = cardsWithOutlook.filter(c => c.outlookAction === "SELL");
  const watchCards = cardsWithOutlook.filter(c => c.outlookAction === "WATCH");
  const holdCards = cardsWithOutlook.filter(c => c.outlookAction === "LONG_HOLD");

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view Market Outlook</h2>
        <p className="text-muted-foreground mb-6">Get AI-powered buy/sell recommendations for your card collection.</p>
        <a href="/api/login">
          <Button data-testid="button-signin">Sign In</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Market Outlook</h1>
        </div>
        <p className="text-muted-foreground">
          AI-powered analysis of your cards with buy, sell, and hold recommendations based on market signals.
        </p>
      </div>

      {!isPro && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div className="flex items-center gap-3">
              {usage?.remaining != null && usage.remaining > 0 ? (
                <Sparkles className="h-6 w-6 text-primary" />
              ) : (
                <Crown className="h-6 w-6 text-primary" />
              )}
              <div>
                {usage?.remaining != null && usage.remaining > 0 ? (
                  <>
                    <p className="font-medium">
                      {usage.remaining} free {usage.remaining === 1 ? "analysis" : "analyses"} remaining this month
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and full insights.
                    </p>
                  </>
                ) : usage?.remaining === 0 ? (
                  <>
                    <p className="font-medium">You've used all free analyses this month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses and full access to Market Outlook.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Get 3 free analyses per month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and detailed insights.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Link href="/upgrade">
              <Button data-testid="button-upgrade">Upgrade to Pro</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <OutlookSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cards</CardDescription>
                <CardTitle className="text-2xl" data-testid="text-total-cards">{allCards.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Analyzed</CardDescription>
                <CardTitle className="text-2xl text-primary" data-testid="text-analyzed-cards">{cardsWithOutlook.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={bigMovers.length > 0 ? "border-purple-500/30 bg-purple-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-purple-500" />
                  Big Movers
                </CardDescription>
                <CardTitle className="text-2xl text-purple-600 dark:text-purple-400" data-testid="text-big-movers">{bigMovers.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={buyCards.length > 0 ? "border-green-500/30 bg-green-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-green-500" />
                  Buy
                </CardDescription>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400" data-testid="text-buy-cards">{buyCards.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={sellCards.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Sell
                </CardDescription>
                <CardTitle className="text-2xl text-red-600 dark:text-red-400" data-testid="text-sell-cards">{sellCards.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {bigMovers.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-purple-500" />
                <h2 className="text-xl font-semibold">Big Movers</h2>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                  {bigMovers.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards with asymmetric upside potential - high reward with moderate risk.
              </p>
              <div className="space-y-2">
                {bigMovers.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {buyCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="h-5 w-5 text-green-500" />
                <h2 className="text-xl font-semibold">Buy Recommendations</h2>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                  {buyCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {buyCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {sellCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="text-xl font-semibold">Sell Recommendations</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                  {sellCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {sellCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {holdCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" />
                <h2 className="text-xl font-semibold">Long Hold</h2>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  {holdCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {holdCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {watchCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">Watch List</h2>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                  {watchCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {watchCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {cardsWithoutOutlook.length > 0 && isPro && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Pending Analysis</h2>
                <Badge variant="secondary">
                  {cardsWithoutOutlook.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                These cards haven't been analyzed yet. Click "Analyze" to get an outlook.
              </p>
              <div className="space-y-2">
                {cardsWithoutOutlook.slice(0, 10).map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
                {cardsWithoutOutlook.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    And {cardsWithoutOutlook.length - 10} more cards...
                  </p>
                )}
              </div>
            </div>
          )}

          {allCards.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add some cards to your display cases to get AI-powered outlook analysis.
                </p>
                <Link href="/cases/new">
                  <Button>Create Display Case</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
