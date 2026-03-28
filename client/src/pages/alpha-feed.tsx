import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Shield,
  Zap,
  Info,
  Flame,
  BarChart3,
  Eye,
  ArrowRight,
  Target,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PlayerMarket {
  playerKey: string;
  playerName: string;
  sport: string;
  temperature: string | null;
  viewCount: number;
  verdict: string;
  verdictSummary: string | null;
  composite: number | null;
  demand: number | null;
  momentum: number | null;
  hype: number | null;
  liquidity: number | null;
  confidence: number | null;
  phase: string | null;
  sampleFactor: number;
  lastFetchedAt: string | null;
}

interface MarketPulse {
  totalPlayers: number;
  playersWithSignals: number;
  buyCount: number;
  sellCount: number;
  topPlayer: { name: string; composite: number; sport: string } | null;
  sportBreakdown: Record<string, number>;
  verdictBreakdown: Record<string, number>;
}

interface FeedData {
  marketPulse: MarketPulse;
  hotMarkets: PlayerMarket[];
  coolingMarkets: PlayerMarket[];
  buyOpportunities: PlayerMarket[];
  sellWarnings: PlayerMarket[];
  speculativePlays: PlayerMarket[];
  hottestByTemp: PlayerMarket[];
}

function trackAlphaEvent(eventType: string, playerName?: string | null) {
  fetch("/api/alpha/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, playerName }),
  }).catch(() => {});
}

function getVerdictBadge(verdict: string) {
  switch (verdict) {
    case "BUY":
    case "ACCUMULATE":
      return { label: verdict === "BUY" ? "Buy" : "Accumulate", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };
    case "HOLD_CORE":
      return { label: "Hold Core", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" };
    case "MONITOR":
      return { label: "Monitor", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" };
    case "TRADE_THE_HYPE":
      return { label: "Trade Hype", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" };
    case "AVOID":
    case "SELL":
      return { label: verdict === "SELL" ? "Sell" : "Avoid", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" };
    case "SPECULATIVE_FLYER":
      return { label: "Speculative", className: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" };
    default:
      return { label: verdict, className: "bg-muted text-muted-foreground border-border" };
  }
}

function getTemperatureBadge(temp: string | null) {
  switch (temp) {
    case "HOT":
      return { label: "Hot", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", icon: Flame };
    case "WARM":
      return { label: "Warm", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30", icon: Activity };
    case "COOLING":
      return { label: "Cooling", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30", icon: TrendingDown };
    case "NEUTRAL":
      return { label: "Neutral", className: "bg-muted text-muted-foreground border-border", icon: Activity };
    default:
      return null;
  }
}

function getSportEmoji(sport: string) {
  const map: Record<string, string> = {
    basketball: "\u{1F3C0}", baseball: "\u26BE", football: "\u{1F3C8}",
    hockey: "\u{1F3D2}", soccer: "\u26BD",
  };
  return map[sport.toLowerCase()] || "\u{1F3C6}";
}

function ScoreBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-muted-foreground w-7 text-right">{Math.round(value)}</span>
    </div>
  );
}

function PlayerMarketCard({ player, showScores }: { player: PlayerMarket; showScores?: boolean }) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const verdictBadge = getVerdictBadge(player.verdict);
  const tempBadge = getTemperatureBadge(player.temperature);
  const hasScores = player.composite !== null && player.sampleFactor > 0;

  const handleClick = () => {
    trackAlphaEvent("market_click", player.playerName);
    trackEvent("market_click", "alpha", player.playerName);
    setLocation(`/player-outlook?player=${encodeURIComponent(player.playerName)}&sport=${player.sport}&from=alpha`);
  };

  return (
    <Card className="hover-elevate cursor-pointer" data-testid={`player-market-${player.playerKey}`} onClick={handleClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg" role="img">{getSportEmoji(player.sport)}</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate" data-testid={`text-player-name-${player.playerKey}`}>
                {player.playerName}
              </h3>
              <span className="text-[11px] text-muted-foreground capitalize">{player.sport}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${verdictBadge.className}`} data-testid={`badge-verdict-${player.playerKey}`}>
              {verdictBadge.label}
            </Badge>
            {tempBadge && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tempBadge.className}`}>
                {tempBadge.label}
              </Badge>
            )}
          </div>
        </div>

        {hasScores && (showScores || expanded) && (
          <div className="space-y-1 mt-3 mb-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold">Composite: {Math.round(player.composite!)}</span>
              {player.phase && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">{player.phase}</Badge>
              )}
            </div>
            <ScoreBar label="Demand" value={player.demand} color="bg-emerald-500" />
            <ScoreBar label="Momentum" value={player.momentum} color="bg-blue-500" />
            <ScoreBar label="Hype" value={player.hype} color="bg-orange-500" />
            <ScoreBar label="Liquidity" value={player.liquidity} color="bg-cyan-500" />
          </div>
        )}

        {player.verdictSummary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5" data-testid={`text-summary-${player.playerKey}`}>
            {player.verdictSummary}
          </p>
        )}

        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[11px] text-primary font-medium flex items-center gap-1" data-testid={`cta-${player.playerKey}`}>
            See full outlook
            <ArrowRight className="h-3 w-3" />
          </span>
          {hasScores && !showScores && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              data-testid={`toggle-scores-${player.playerKey}`}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Less" : "Scores"}
            </Button>
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
            <div className="flex items-start gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
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
  const sportEntries = Object.entries(pulse.sportBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div data-testid="section-market-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-players">{pulse.totalPlayers}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Markets Tracked</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="text-buy-count">{pulse.buyCount}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Buy Signals</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-500/20">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <span className="text-2xl font-bold text-red-700 dark:text-red-400" data-testid="text-sell-count">{pulse.sellCount}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Sell / Avoid</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 border-orange-500/20">
          <CardContent className="p-4 text-center">
            {pulse.topPlayer ? (
              <>
                <div className="text-sm font-bold truncate" data-testid="text-top-player">
                  {pulse.topPlayer.name}
                </div>
                <Badge variant="outline" className="text-[10px] mt-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                  Score: {Math.round(pulse.topPlayer.composite)}
                </Badge>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">--</div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">Top Market</div>
          </CardContent>
        </Card>
      </div>
      {sportEntries.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {sportEntries.map(([sport, count]) => (
            <Badge key={sport} variant="outline" className="text-[10px] capitalize">
              {getSportEmoji(sport)} {sport} ({count})
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function SportFilter({ selected, onChange, sports }: { selected: string | null; onChange: (s: string | null) => void; sports: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-6" data-testid="sport-filter">
      <Button
        variant={selected === null ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onChange(null)}
        data-testid="filter-all"
      >
        All Sports
      </Button>
      {sports.map(sport => (
        <Button
          key={sport}
          variant={selected === sport ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs capitalize"
          onClick={() => onChange(sport)}
          data-testid={`filter-${sport}`}
        >
          {getSportEmoji(sport)} {sport}
        </Button>
      ))}
    </div>
  );
}

export default function AlphaFeedPage() {
  const { isAuthenticated } = useAuth();
  const tracked = useRef(false);
  const [sportFilter, setSportFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      trackAlphaEvent("alpha_view");
    }
  }, []);

  const queryKey = sportFilter ? ["/api/alpha/feed", sportFilter] : ["/api/alpha/feed"];
  const { data: feedData, isLoading: feedLoading, isError: feedError } = useQuery<FeedData>({
    queryKey,
    queryFn: async () => {
      const url = sportFilter ? `/api/alpha/feed?sport=${sportFilter}` : "/api/alpha/feed";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch feed");
      return res.json();
    },
  });

  const pulse = feedData?.marketPulse;
  const hotMarkets = feedData?.hotMarkets ?? [];
  const coolingMarkets = feedData?.coolingMarkets ?? [];
  const buyOpportunities = feedData?.buyOpportunities ?? [];
  const sellWarnings = feedData?.sellWarnings ?? [];
  const speculativePlays = feedData?.speculativePlays ?? [];
  const hottestByTemp = feedData?.hottestByTemp ?? [];

  const hasAnyData = hotMarkets.length > 0 || buyOpportunities.length > 0 || sellWarnings.length > 0 || speculativePlays.length > 0 || hottestByTemp.length > 0;

  const availableSports = pulse?.sportBreakdown ? Object.keys(pulse.sportBreakdown).sort() : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-alpha-feed-title">
                Daily Alpha
              </h1>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30" data-testid="badge-scope-market">Market-Wide</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Market intelligence across {pulse?.totalPlayers ?? 0} player markets. For analysis of your own cards, see{" "}
              <Link href="/outlook" className="text-primary hover:underline">Market Outlook</Link>.
            </p>
          </div>
        </div>
      </div>

      {feedError ? (
        <EmptySection
          icon={AlertTriangle}
          title="Unable to load feed"
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
      ) : !hasAnyData && !pulse ? (
        <EmptySection
          icon={Zap}
          title="No market data yet"
          description="The Alpha Engine builds player market intelligence from outlook analyses. Data will appear here as players are analyzed."
        />
      ) : (
        <>
          {pulse && <MarketPulseHeader pulse={pulse} />}

          {availableSports.length > 1 && (
            <SportFilter selected={sportFilter} onChange={setSportFilter} sports={availableSports} />
          )}

          {hotMarkets.length > 0 && (
            <section className="mb-8" data-testid="section-hot-markets">
              <SectionHeader icon={Flame} title="Hot Markets" badge={`${hotMarkets.length}`} iconColor="text-orange-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {hotMarkets.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} showScores />
                ))}
              </div>
            </section>
          )}

          {buyOpportunities.length > 0 && (
            <section className="mb-8" data-testid="section-buy-opportunities">
              <SectionHeader icon={TrendingUp} title="Buy Opportunities" badge={`${buyOpportunities.length}`} iconColor="text-emerald-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {buyOpportunities.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} />
                ))}
              </div>
            </section>
          )}

          {sellWarnings.length > 0 && (
            <section className="mb-8" data-testid="section-sell-warnings">
              <SectionHeader icon={AlertTriangle} title="Sell / Avoid" badge={`${sellWarnings.length}`} iconColor="text-red-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {sellWarnings.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} />
                ))}
              </div>
            </section>
          )}

          {speculativePlays.length > 0 && (
            <section className="mb-8" data-testid="section-speculative">
              <SectionHeader icon={Sparkles} title="Speculative Plays" badge={`${speculativePlays.length}`} iconColor="text-purple-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {speculativePlays.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} />
                ))}
              </div>
            </section>
          )}

          {coolingMarkets.length > 0 && (
            <section className="mb-8" data-testid="section-cooling-markets">
              <SectionHeader icon={TrendingDown} title="Cooling Markets" badge={`${coolingMarkets.length}`} iconColor="text-blue-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {coolingMarkets.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} />
                ))}
              </div>
            </section>
          )}

          {hottestByTemp.length > 0 && !hotMarkets.length && (
            <section className="mb-8" data-testid="section-trending">
              <SectionHeader icon={Flame} title="Trending Players" iconColor="text-orange-500" />
              <div className="grid gap-3 sm:grid-cols-2">
                {hottestByTemp.map(p => (
                  <PlayerMarketCard key={p.playerKey} player={p} />
                ))}
              </div>
            </section>
          )}

          {!hasAnyData && (
            <EmptySection
              icon={Zap}
              title={sportFilter ? `No signals for ${sportFilter}` : "No signals yet"}
              description="Market data will appear as more players are analyzed by the Alpha Engine."
            />
          )}
        </>
      )}

      <div className="mt-10 pt-6 border-t" data-testid="section-disclaimer">
        <div className="flex items-start gap-2 text-xs text-muted-foreground/70">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Market intelligence based on AI analysis of player markets. Not financial advice. 
            Verdicts reflect current market conditions and may change as new data arrives.
          </p>
        </div>
      </div>
    </div>
  );
}
