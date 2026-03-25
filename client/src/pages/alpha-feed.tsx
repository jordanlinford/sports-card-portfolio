import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Users,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  BarChart3,
  Eye,
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
  ownerCount?: number;
  weeklyScans?: number;
}

interface PriceMover {
  cardId: number;
  playerName: string | null;
  cardTitle: string | null;
  previousPrice: number;
  currentPrice: number;
  pctChange: number;
  card: SignalCard;
  ownerCount?: number;
  weeklyScans?: number;
}

interface MomentumItem {
  cardId: number;
  playerName: string | null;
  cardTitle: string | null;
  addCount: number;
  scanCount: number;
  totalMomentum: number;
  card: SignalCard;
  ownerCount?: number;
  weeklyScans?: number;
}

interface TrendingItem {
  cardId: number | null;
  playerName: string | null;
  cardTitle: string | null;
  totalEvents: number;
  card: SignalCard;
  ownerCount?: number;
  weeklyScans?: number;
}

interface MarketPulse {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  biggestMover: { playerName: string | null; pctChange: number } | null;
  hottestPlayer: string | null;
}

interface PortfolioAlert {
  signal: Signal;
  card: SignalCard & { displayCaseName: string };
  action: string;
}

interface FeedData {
  marketPulse: MarketPulse;
  opportunities: Signal[];
  risks: Signal[];
  holds: Signal[];
  priceMovers: PriceMover[];
  communityMomentum: MomentumItem[];
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

function CommunityBadges({ ownerCount, weeklyScans }: { ownerCount?: number; weeklyScans?: number }) {
  if (!ownerCount && !weeklyScans) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {ownerCount != null && ownerCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {ownerCount} collector{ownerCount !== 1 ? "s" : ""}
        </span>
      )}
      {weeklyScans != null && weeklyScans > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" />
          {weeklyScans} scan{weeklyScans !== 1 ? "s" : ""} this week
        </span>
      )}
    </div>
  );
}

function SignalCardComponent({ signal, card, showOwned, ownedAction, ownerCount, weeklyScans }: {
  signal?: Signal;
  card: SignalCard | null;
  showOwned?: boolean;
  ownedAction?: string;
  ownerCount?: number;
  weeklyScans?: number;
}) {
  if (!card) return null;

  const signalBadge = signal ? getSignalBadge(signal.signalType) : null;
  const confidenceBadge = signal ? getConfidenceBadge(signal.confidence) : null;
  const signalLabel = getSignalLabel(signal?.signalType);
  const price = formatPrice(card.manualValue ?? card.estimatedValue);
  const drivers = signal?.drivers?.filter(Boolean) ?? [];
  const whyNow = signal?.whyNow;
  const oc = ownerCount ?? signal?.ownerCount;
  const ws = weeklyScans ?? signal?.weeklyScans;

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

            <CommunityBadges ownerCount={oc} weeklyScans={ws} />

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

function PriceMoverCard({ mover }: { mover: PriceMover }) {
  const card = mover.card;
  if (!card) return null;
  const isUp = mover.pctChange > 0;
  const price = formatPrice(mover.currentPrice);

  return (
    <Card className="hover-elevate" data-testid={`mover-card-${card.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-12 flex-shrink-0 rounded overflow-hidden bg-muted">
            {card.imagePath ? (
              <img src={card.imagePath} alt={card.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" data-testid={`text-mover-name-${card.id}`}>
              {card.playerName || card.title}
            </h4>
            <p className="text-[11px] text-muted-foreground truncate">
              {[card.year, card.set].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <Badge
              variant="outline"
              className={`text-xs font-semibold px-2 py-0.5 ${isUp ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"}`}
              data-testid={`badge-pct-change-${card.id}`}
            >
              {isUp ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
              {isUp ? "+" : ""}{mover.pctChange.toFixed(1)}%
            </Badge>
            {price && (
              <span className="text-[11px] text-muted-foreground">{price}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MomentumCard({ item }: { item: MomentumItem }) {
  const card = item.card;
  if (!card) return null;
  const price = formatPrice(card.manualValue ?? card.estimatedValue);

  return (
    <Card className="hover-elevate" data-testid={`momentum-card-${card.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-12 flex-shrink-0 rounded overflow-hidden bg-muted">
            {card.imagePath ? (
              <img src={card.imagePath} alt={card.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">
              {card.playerName || card.title}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              {item.addCount > 0 && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  <Users className="h-3 w-3" /> {item.addCount} added
                </span>
              )}
              {item.scanCount > 0 && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  <Search className="h-3 w-3" /> {item.scanCount} scanned
                </span>
              )}
            </div>
          </div>
          {price && (
            <span className="text-sm font-semibold whitespace-nowrap">{price}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendingHeatCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const card = item.card;
  if (!card) return null;
  const price = formatPrice(card.manualValue ?? card.estimatedValue);
  const heatColors = ["bg-red-500/15 text-red-700 dark:text-red-400", "bg-orange-500/15 text-orange-700 dark:text-orange-400", "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"];
  const heatClass = heatColors[Math.min(rank, heatColors.length - 1)] || "bg-muted text-muted-foreground";

  return (
    <Card className="hover-elevate" data-testid={`trending-card-${card.id}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${heatClass}`}>
            #{rank + 1}
          </div>
          <div className="w-10 h-12 flex-shrink-0 rounded overflow-hidden bg-muted">
            {card.imagePath ? (
              <img src={card.imagePath} alt={card.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">{card.playerName || card.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                <Flame className="h-3 w-3" /> {item.totalEvents} interactions
              </span>
              {item.ownerCount != null && item.ownerCount > 0 && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  <Users className="h-3 w-3" /> {item.ownerCount}
                </span>
              )}
            </div>
          </div>
          {price && (
            <span className="text-sm font-semibold whitespace-nowrap">{price}</span>
          )}
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
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge, iconColor }: { icon: any; title: string; badge?: string; iconColor?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-5 w-5 ${iconColor || "text-primary"}`} />
      <h2 className="text-lg font-semibold">{title}</h2>
      {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
    </div>
  );
}

function MarketPulseHeader({ pulse }: { pulse: MarketPulse }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8" data-testid="section-market-pulse">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-primary" data-testid="text-total-signals">{pulse.totalSignals}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Active Signals</div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
        <CardContent className="p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="text-buy-count">{pulse.buySignals}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Buy Signals</div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20">
        <CardContent className="p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-sell-count">{pulse.sellSignals}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Sell Signals</div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 border-orange-500/20">
        <CardContent className="p-4 text-center">
          {pulse.biggestMover ? (
            <>
              <div className="text-sm font-bold truncate" data-testid="text-biggest-mover">
                {pulse.biggestMover.playerName || "—"}
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] mt-1 ${pulse.biggestMover.pctChange > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"}`}
              >
                {pulse.biggestMover.pctChange > 0 ? "+" : ""}{pulse.biggestMover.pctChange.toFixed(1)}%
              </Badge>
            </>
          ) : pulse.hottestPlayer ? (
            <>
              <div className="text-sm font-bold truncate" data-testid="text-hottest-player">
                {pulse.hottestPlayer}
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Flame className="h-3 w-3 text-orange-500" />
                <span className="text-[10px] text-muted-foreground">Trending</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">
            {pulse.biggestMover ? "Biggest Mover" : "Hottest Player"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AlphaFeedPage() {
  const { user, isAuthenticated } = useAuth();
  const tracked = useRef(false);
  const [showAllSignals, setShowAllSignals] = useState(false);

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

  const hasAlerts = (alertsData?.alerts?.length ?? 0) > 0;
  const pulse = feedData?.marketPulse;

  const highConvictionBuys = feedData?.opportunities?.filter(s => s.alphaScore >= 65) ?? [];
  const highConvictionSells = feedData?.risks?.filter(s => s.alphaScore <= 35) ?? [];
  const allBuys = feedData?.opportunities ?? [];
  const allSells = feedData?.risks ?? [];
  const allHolds = feedData?.holds ?? [];
  const displayedBuys = showAllSignals ? allBuys : highConvictionBuys;
  const displayedSells = showAllSignals ? allSells : highConvictionSells;
  const displayedHolds = showAllSignals ? allHolds : [];

  const hasMovers = (feedData?.priceMovers?.length ?? 0) > 0;
  const hasMomentum = (feedData?.communityMomentum?.length ?? 0) > 0;
  const hasTrending = (feedData?.trending?.length ?? 0) > 0;
  const hasSignals = displayedBuys.length > 0 || displayedSells.length > 0 || displayedHolds.length > 0;
  const hasAnyData = hasSignals || hasMovers || hasMomentum || hasTrending;

  const gainers = feedData?.priceMovers?.filter(m => m.pctChange > 0) ?? [];
  const decliners = feedData?.priceMovers?.filter(m => m.pctChange < 0) ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-alpha-feed-title">
              Daily Alpha
            </h1>
            <p className="text-sm text-muted-foreground">
              Cross-platform intelligence from {pulse?.totalSignals ?? 0} signals and community activity
            </p>
          </div>
        </div>
      </div>

      {feedError ? (
        <EmptySection
          icon={AlertTriangle}
          title="Unable to load signals"
          description="Something went wrong loading the Alpha Feed. Please try refreshing the page."
        />
      ) : feedLoading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))}
          </div>
          <FeedSkeleton />
        </div>
      ) : !hasAnyData ? (
        <EmptySection
          icon={Zap}
          title="No signals yet"
          description="The Alpha Engine analyzes the most popular cards every few days. Signals will appear here once the first batch run completes."
        />
      ) : (
        <>
          {pulse && <MarketPulseHeader pulse={pulse} />}

          {isAuthenticated && (hasAlerts || alertsLoading || alertsError) && (
            <section className="mb-8" data-testid="section-portfolio-alerts">
              <SectionHeader icon={Shield} title="Portfolio Alerts" badge="Your Cards" />
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

          {hasMovers && (
            <section className="mb-8" data-testid="section-price-movers">
              <SectionHeader icon={BarChart3} title="Price Movers" iconColor="text-orange-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {gainers.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Gainers</span>
                    </div>
                    <div className="space-y-2">
                      {gainers.slice(0, 5).map(m => <PriceMoverCard key={m.cardId} mover={m} />)}
                    </div>
                  </div>
                )}
                {decliners.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <ArrowDownRight className="h-4 w-4 text-red-600" />
                      <span className="text-xs font-medium text-red-700 dark:text-red-400">Decliners</span>
                    </div>
                    <div className="space-y-2">
                      {decliners.slice(0, 5).map(m => <PriceMoverCard key={m.cardId} mover={m} />)}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="mb-8" data-testid="section-signals">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader icon={Zap} title="Investment Signals" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show all</span>
                <Switch
                  checked={showAllSignals}
                  onCheckedChange={setShowAllSignals}
                  data-testid="toggle-show-all-signals"
                />
              </div>
            </div>

            {displayedBuys.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Opportunities ({displayedBuys.length})
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {displayedBuys.map((signal) => (
                    <SignalCardComponent key={signal.id} signal={signal} card={signal.card} />
                  ))}
                </div>
              </div>
            )}

            {displayedSells.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-400">
                    Risks ({displayedSells.length})
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {displayedSells.map((signal) => (
                    <SignalCardComponent key={signal.id} signal={signal} card={signal.card} />
                  ))}
                </div>
              </div>
            )}

            {displayedHolds.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <Eye className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Watching ({displayedHolds.length})
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {displayedHolds.map((signal) => (
                    <SignalCardComponent key={signal.id} signal={signal} card={signal.card} />
                  ))}
                </div>
              </div>
            )}

            {!hasSignals && (
              <EmptySection
                icon={Zap}
                title={showAllSignals ? "No signals yet" : "No high-conviction signals"}
                description={showAllSignals ? "Signals will appear after the next Alpha Engine batch run." : "Toggle 'Show all' to see lower-conviction signals too."}
              />
            )}
          </section>

          {hasMomentum && (
            <section className="mb-8" data-testid="section-community-momentum">
              <SectionHeader icon={Users} title="Community Momentum" badge="This Week" iconColor="text-blue-500" />
              <div className="grid gap-2 sm:grid-cols-2">
                {feedData!.communityMomentum.slice(0, 8).map(item => (
                  <MomentumCard key={item.cardId} item={item} />
                ))}
              </div>
            </section>
          )}

          {hasTrending && (
            <section className="mb-8" data-testid="section-trending">
              <SectionHeader icon={Flame} title="Trending Cards" iconColor="text-orange-500" />
              <div className="grid gap-2 sm:grid-cols-2">
                {feedData!.trending.slice(0, 10).map((item, index) => (
                  <TrendingHeatCard key={item.cardId ?? index} item={item} rank={index} />
                ))}
              </div>
            </section>
          )}
        </>
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
