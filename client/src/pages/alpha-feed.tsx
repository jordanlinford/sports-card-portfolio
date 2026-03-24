import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Shield,
  Zap,
  ImageIcon,
  Info,
  ThumbsUp,
  ThumbsDown,
  Clock,
} from "lucide-react";

interface SignalCard {
  id: number;
  title: string;
  playerName: string | null;
  imagePath: string | null;
  set: string | null;
  year: number | null;
  estimatedValue: number | null;
  manualValue: number | null;
  sport: string | null;
  variation: string | null;
}

interface Signal {
  id: number;
  cardId: number | null;
  playerName: string | null;
  cardTitle: string | null;
  alphaScore: number;
  signalType: string;
  confidence: string;
  reasoning: string | null;
  drivers: string[] | null;
  whyNow: string | null;
  expiresAt: string;
  createdAt: string;
  card: SignalCard | null;
}

interface TrendingItem {
  cardId: number | null;
  playerName: string | null;
  cardTitle: string | null;
  totalEvents: number;
  card: SignalCard;
}

interface PortfolioAlert {
  signal: Signal;
  card: SignalCard & { displayCaseName: string };
  action: string;
}

interface FeedData {
  opportunities: Signal[];
  risks: Signal[];
  trending: TrendingItem[];
}

function getSignalBadge(signalType: string) {
  switch (signalType) {
    case "strong_buy":
      return { label: "Strong Buy", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };
    case "buy":
      return { label: "Buy Signal", className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" };
    case "hold":
      return { label: "Hold", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" };
    case "sell":
      return { label: "Sell Signal", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" };
    case "strong_sell":
      return { label: "Strong Sell", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" };
    default:
      return { label: "Signal", className: "bg-muted text-muted-foreground" };
  }
}

function getConfidenceBadge(confidence: string) {
  switch (confidence) {
    case "high":
      return { label: "High Confidence", className: "bg-primary/10 text-primary border-primary/30" };
    case "medium":
      return { label: "Medium", className: "bg-muted text-muted-foreground border-border" };
    case "low":
      return { label: "Low", className: "bg-muted/50 text-muted-foreground/70 border-border/50" };
    default:
      return { label: confidence, className: "bg-muted text-muted-foreground" };
  }
}

function formatPrice(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getSignalLabel(signalType?: string): { label: string; className: string } | null {
  if (!signalType) return null;
  if (signalType === "strong_buy") {
    return { label: "High Conviction", className: "text-emerald-700 dark:text-emerald-400" };
  }
  if (signalType === "buy") {
    return { label: "Early Signal", className: "text-green-700 dark:text-green-400" };
  }
  if (signalType === "strong_sell" || signalType === "sell") {
    return { label: "Emerging Risk", className: "text-red-700 dark:text-red-400" };
  }
  return { label: "Market Watch", className: "text-yellow-700 dark:text-yellow-400" };
}

function trackAlphaEvent(eventType: string, cardId?: number | null, playerName?: string | null, cardTitle?: string | null) {
  fetch("/api/alpha/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, cardId, playerName, cardTitle }),
  }).catch(() => {});
}

function FeedbackButtons({ signalId }: { signalId: number }) {
  const { isAuthenticated } = useAuth();
  const [localVote, setLocalVote] = useState<boolean | null>(null);

  const feedbackMutation = useMutation({
    mutationFn: async (useful: boolean) => {
      await apiRequest("POST", `/api/alpha/signals/${signalId}/feedback`, { useful });
      return useful;
    },
    onSuccess: (useful) => {
      setLocalVote(useful);
    },
  });

  if (!isAuthenticated) return null;

  return (
    <div className="flex items-center gap-1 mt-2" data-testid={`feedback-${signalId}`}>
      <span className="text-[10px] text-muted-foreground mr-1">Useful?</span>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${localVote === true ? "text-green-600 bg-green-500/10" : "text-muted-foreground/50 hover:text-green-600"}`}
        onClick={(e) => { e.stopPropagation(); feedbackMutation.mutate(true); }}
        disabled={feedbackMutation.isPending}
        data-testid={`feedback-useful-${signalId}`}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${localVote === false ? "text-red-600 bg-red-500/10" : "text-muted-foreground/50 hover:text-red-600"}`}
        onClick={(e) => { e.stopPropagation(); feedbackMutation.mutate(false); }}
        disabled={feedbackMutation.isPending}
        data-testid={`feedback-not-useful-${signalId}`}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

function SignalCardComponent({ signal, card, showOwned, ownedAction }: {
  signal?: Signal;
  card: SignalCard | null;
  showOwned?: boolean;
  ownedAction?: string;
}) {
  if (!card) return null;

  const signalBadge = signal ? getSignalBadge(signal.signalType) : null;
  const confidenceBadge = signal ? getConfidenceBadge(signal.confidence) : null;
  const signalLabel = getSignalLabel(signal?.signalType);
  const price = formatPrice(card.manualValue ?? card.estimatedValue);
  const drivers = signal?.drivers?.filter(Boolean) ?? [];
  const whyNow = signal?.whyNow;

  const handleClick = () => {
    trackAlphaEvent("signal_click", card.id, card.playerName, card.title);
  };

  return (
    <Card className="hover-elevate cursor-pointer" data-testid={`signal-card-${card.id}`} onClick={handleClick}>
      <CardContent className="p-4">
        {signalLabel && (
          <div className="flex items-center gap-1.5 mb-2" data-testid={`label-signal-type-${card.id}`}>
            <Zap className={`h-3 w-3 ${signalLabel.className}`} />
            <span className={`text-xs font-semibold ${signalLabel.className}`}>
              {signalLabel.label}
            </span>
          </div>
        )}
        <div className="flex gap-3">
          <div className="w-16 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted">
            {card.imagePath ? (
              <img
                src={card.imagePath}
                alt={card.title}
                className="w-full h-full object-cover"
                data-testid={`img-card-${card.id}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate" data-testid={`text-card-name-${card.id}`}>
                  {card.playerName || card.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate" data-testid={`text-card-set-${card.id}`}>
                  {[card.year, card.set, card.variation].filter(Boolean).join(" · ")}
                </p>
              </div>
              {price && (
                <span className="text-sm font-semibold whitespace-nowrap" data-testid={`text-price-${card.id}`}>
                  {price}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {showOwned && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" data-testid={`badge-owned-${card.id}`}>
                  You own this
                </Badge>
              )}
              {signalBadge && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${signalBadge.className}`} data-testid={`badge-signal-${card.id}`}>
                  {signalBadge.label}
                </Badge>
              )}
              {confidenceBadge && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${confidenceBadge.className}`} data-testid={`badge-confidence-${card.id}`}>
                  {confidenceBadge.label}
                </Badge>
              )}
            </div>

            {ownedAction && (
              <p className="text-xs font-medium mt-1.5 text-primary" data-testid={`text-action-${card.id}`}>
                {ownedAction}
              </p>
            )}

            {drivers.length > 0 && (
              <ul className="mt-2 space-y-0.5" data-testid={`drivers-${card.id}`}>
                {drivers.map((driver, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{driver}</span>
                  </li>
                ))}
              </ul>
            )}

            {!drivers.length && signal?.reasoning && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2" data-testid={`text-reasoning-${card.id}`}>
                {signal.reasoning}
              </p>
            )}

            {whyNow && (
              <div className="flex items-center gap-1 mt-1.5" data-testid={`why-now-${card.id}`}>
                <Clock className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground/80 italic">{whyNow}</span>
              </div>
            )}

            {signal && <FeedbackButtons signalId={signal.id} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendingCardComponent({ item }: { item: TrendingItem }) {
  const card = item.card;
  if (!card) return null;
  const price = formatPrice(card.manualValue ?? card.estimatedValue);

  return (
    <Card className="hover-elevate" data-testid={`trending-card-${card.id}`}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className="w-16 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted">
            {card.imagePath ? (
              <img src={card.imagePath} alt={card.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {card.playerName || card.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {[card.year, card.set, card.variation].filter(Boolean).join(" · ")}
                </p>
              </div>
              {price && (
                <span className="text-sm font-semibold whitespace-nowrap">{price}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                <Activity className="h-3 w-3 mr-0.5" />
                Trending
              </Badge>
              <span className="text-xs text-muted-foreground">
                {item.totalEvents} recent interactions
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Skeleton className="w-16 h-20 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptySection({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

export default function AlphaFeedPage() {
  const { user, isAuthenticated } = useAuth();
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackAlphaEvent("alpha_view");
    }
  }, []);

  const { data: feedData, isLoading: feedLoading, isError: feedError } = useQuery<FeedData>({
    queryKey: ["/api/alpha/feed"],
  });

  const { data: alertsData, isLoading: alertsLoading, isError: alertsError } = useQuery<{ alerts: PortfolioAlert[] }>({
    queryKey: ["/api/alpha/portfolio-alerts"],
    enabled: isAuthenticated,
  });

  const hasOpportunities = (feedData?.opportunities?.length ?? 0) > 0;
  const hasRisks = (feedData?.risks?.length ?? 0) > 0;
  const hasTrending = (feedData?.trending?.length ?? 0) > 0;
  const hasAlerts = (alertsData?.alerts?.length ?? 0) > 0;
  const hasAnyData = hasOpportunities || hasRisks || hasTrending;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-alpha-feed-title">
              Alpha Feed
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered investment signals based on market activity
            </p>
          </div>
        </div>
      </div>

      {isAuthenticated && (hasAlerts || alertsLoading || alertsError) && (
        <section className="mb-8" data-testid="section-portfolio-alerts">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Portfolio Alerts</h2>
            <Badge variant="outline" className="text-[10px]">Your Cards</Badge>
          </div>
          {alertsError ? (
            <p className="text-sm text-muted-foreground">Unable to load portfolio alerts.</p>
          ) : alertsLoading ? (
            <FeedSkeleton />
          ) : hasAlerts ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {alertsData!.alerts.map((alert) => (
                <SignalCardComponent
                  key={alert.card.id}
                  signal={alert.signal}
                  card={alert.card}
                  showOwned
                  ownedAction={alert.action}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

      {feedError ? (
        <EmptySection
          icon={AlertTriangle}
          title="Unable to load signals"
          description="Something went wrong loading the Alpha Feed. Please try refreshing the page."
        />
      ) : feedLoading ? (
        <div className="space-y-8">
          <div>
            <Skeleton className="h-6 w-40 mb-4" />
            <FeedSkeleton />
          </div>
        </div>
      ) : !hasAnyData ? (
        <EmptySection
          icon={Zap}
          title="No signals yet"
          description="The Alpha Engine analyzes the most popular cards every few days. Signals will appear here once the first batch run completes."
        />
      ) : (
        <Tabs defaultValue="opportunities" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6" data-testid="tabs-alpha-feed">
            <TabsTrigger value="opportunities" className="gap-1.5" data-testid="tab-opportunities">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Top </span>Opportunities
              {hasOpportunities && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{feedData!.opportunities.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="risks" className="gap-1.5" data-testid="tab-risks">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Emerging </span>Risks
              {hasRisks && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{feedData!.risks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="trending" className="gap-1.5" data-testid="tab-trending">
              <Activity className="h-4 w-4" />
              Trending
              {hasTrending && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{feedData!.trending.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities">
            {hasOpportunities ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {feedData!.opportunities.map((signal) => (
                  <SignalCardComponent key={signal.id} signal={signal} card={signal.card} />
                ))}
              </div>
            ) : (
              <EmptySection
                icon={TrendingUp}
                title="No buy signals yet"
                description="When the Alpha Engine identifies cards with strong buy potential, they'll appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="risks">
            {hasRisks ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {feedData!.risks.map((signal) => (
                  <SignalCardComponent key={signal.id} signal={signal} card={signal.card} />
                ))}
              </div>
            ) : (
              <EmptySection
                icon={TrendingDown}
                title="No risk signals yet"
                description="When the Alpha Engine identifies cards with elevated sell risk, they'll appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="trending">
            {hasTrending ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {feedData!.trending.map((item, index) => (
                  <TrendingCardComponent key={item.cardId ?? index} item={item} />
                ))}
              </div>
            ) : (
              <EmptySection
                icon={Activity}
                title="No trending cards yet"
                description="As users scan, view, and analyze cards, the most popular ones will appear here."
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <div className="mt-10 pt-6 border-t" data-testid="section-disclaimer">
        <div className="flex items-start gap-2 text-xs text-muted-foreground/70">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Early signals based on observed market activity. Not financial advice. 
            Confidence levels reflect data availability, not prediction certainty.
          </p>
        </div>
      </div>
    </div>
  );
}
