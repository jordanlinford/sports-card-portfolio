import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  Target,
  Sparkles,
  ShoppingCart,
  Shield,
  Ban,
  Zap,
  Minus,
  BarChart3,
  ExternalLink,
} from "lucide-react";

type LeaderboardEntry = {
  rank: number;
  playerName: string;
  sport: string;
  score: number;
  phase: string;
  verdict: string;
  verdictLabel: string;
  keySignal: string;
  trend7d: string;
  avgPrice: string;
  confidence: string;
  marketQuality: number;
  slug?: string;
  percentile?: string;
  marketDescriptor?: string;
};

type LeaderboardResponse = {
  type: string;
  sport: string;
  entries: LeaderboardEntry[];
  generatedAt: string;
};

type TabType = "best" | "hype" | "emerging";

const TABS: { id: TabType; label: string; icon: typeof TrendingUp; description: string }[] = [
  { id: "best", label: "Best Markets", icon: Target, description: "Where capital should flow" },
  { id: "hype", label: "Hype / Sell", icon: Flame, description: "Where to take profits" },
  { id: "emerging", label: "Emerging", icon: Sparkles, description: "Early opportunities" },
];

const SPORTS = [
  { value: "all", label: "All Sports" },
  { value: "nba", label: "NBA" },
  { value: "nfl", label: "NFL" },
  { value: "mlb", label: "MLB" },
  { value: "nhl", label: "NHL" },
  { value: "soccer", label: "Soccer" },
];

function getVerdictStyle(verdict: string) {
  switch (verdict) {
    case "BUY":
      return { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400", icon: <ShoppingCart className="h-3 w-3" /> };
    case "HOLD_CORE":
      return { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", icon: <Shield className="h-3 w-3" /> };
    case "TRADE_THE_HYPE":
      return { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", icon: <TrendingDown className="h-3 w-3" /> };
    case "AVOID":
      return { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", icon: <Ban className="h-3 w-3" /> };
    case "SPECULATIVE":
      return { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", icon: <Zap className="h-3 w-3" /> };
    default:
      return { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", icon: <Minus className="h-3 w-3" /> };
  }
}

function getRankDisplay(rank: number) {
  if (rank === 1) return "text-amber-500 font-bold text-lg";
  if (rank === 2) return "text-zinc-400 font-bold text-lg";
  if (rank === 3) return "text-orange-500 font-bold text-lg";
  return "text-muted-foreground font-semibold";
}

function getSportBadgeColor(sport: string) {
  switch (sport.toLowerCase()) {
    case "nba": case "basketball": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "nfl": case "football": return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "mlb": case "baseball": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "nhl": return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "soccer": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function PublicIntelPage() {
  const [activeTab, setActiveTab] = useState<TabType>("best");
  const [sport, setSport] = useState("all");

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/market-leaderboard", activeTab, sport],
    queryFn: async () => {
      const res = await fetch(`/api/market-leaderboard?type=${activeTab}&sport=${sport}&limit=25`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const entries = data?.entries || [];

  useEffect(() => {
    document.title = "Sports Card Market Intelligence | Sports Card Portfolio";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Live sports card market rankings powered by signal-driven analysis. Track demand, momentum, liquidity, and market structure across NBA, NFL, MLB, NHL, and Soccer.");
    }
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute("content", "Live sports card market rankings powered by signal-driven analysis.");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg">Sports Card Intel</span>
            <Badge variant="secondary" className="text-[10px] ml-1">LIVE</Badge>
          </div>
          <a href="/" data-testid="link-signup">
            <Button size="sm" className="gap-1.5 text-xs" data-testid="button-get-access">
              Get Full Access
              <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="space-y-6">
          <div className="text-center space-y-2 py-4">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
              Market Intelligence
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Real-time ranked view of sports card markets. Signal-driven analysis across demand, momentum, liquidity, and market structure.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg" data-testid="tab-group-public">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setActiveTab(tab.id)}
                    data-testid={`tab-public-${tab.id}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </Button>
                );
              })}
            </div>

            <Select value={sport} onValueChange={setSport}>
              <SelectTrigger className="w-[140px]" data-testid="select-sport-public">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value} data-testid={`option-sport-public-${s.value}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const tab = TABS.find(t => t.id === activeTab)!;
                    const Icon = tab.icon;
                    return (
                      <>
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{tab.label}</span>
                      </>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground">
                    — {TABS.find(t => t.id === activeTab)?.description}
                  </span>
                </div>
                {data?.generatedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Updated {new Date(data.generatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <div className="p-2 sm:p-4">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-16">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground" data-testid="text-empty-public">
                    No market data available yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5" data-testid="public-leaderboard-entries">
                  <div className="hidden md:grid grid-cols-[36px_1fr_56px_56px_64px_90px_100px_160px_56px_56px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <span>#</span>
                    <span>Player</span>
                    <span>Sport</span>
                    <span>Score</span>
                    <span>Pctile</span>
                    <span>Phase</span>
                    <span>Verdict</span>
                    <span>Structure</span>
                    <span>7d</span>
                    <span>Avg</span>
                  </div>

                  {entries.map((entry) => {
                    const verdictStyle = getVerdictStyle(entry.verdict);
                    return (
                      <div
                        key={`${entry.playerName}-${entry.sport}`}
                        className="grid grid-cols-[36px_1fr_56px_56px] md:grid-cols-[36px_1fr_56px_56px_64px_90px_100px_160px_56px_56px] gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors items-center"
                        data-testid={`row-public-${entry.rank}`}
                      >
                        <span className={getRankDisplay(entry.rank)}>{entry.rank}</span>

                        <span className="font-medium text-sm truncate" data-testid={`text-public-player-${entry.rank}`}>
                          {entry.playerName}
                        </span>

                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getSportBadgeColor(entry.sport)}`}>
                          {entry.sport.toUpperCase()}
                        </Badge>

                        <span className="text-sm font-semibold tabular-nums">
                          {entry.score}
                        </span>

                        <span className={`hidden md:block text-[10px] font-medium ${
                          entry.percentile?.startsWith("Top") ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}>
                          {entry.percentile || "—"}
                        </span>

                        <span className="hidden md:block">
                          {entry.phase && (
                            <Badge variant="outline" className="text-[10px]">
                              {entry.phase}
                            </Badge>
                          )}
                        </span>

                        <span className="hidden md:flex items-center gap-1">
                          <Badge className={`text-[10px] ${verdictStyle.bg} ${verdictStyle.text} border-0`}>
                            {verdictStyle.icon}
                            <span className="ml-0.5">
                              {entry.verdict === "TRADE_THE_HYPE" ? "TRADE" :
                               entry.verdict === "HOLD_CORE" ? "HOLD" :
                               entry.verdict}
                            </span>
                          </Badge>
                        </span>

                        <span className="hidden md:block text-[10px] text-muted-foreground truncate italic">
                          {entry.marketDescriptor || entry.keySignal}
                        </span>

                        <span className={`hidden md:block text-xs font-medium tabular-nums ${
                          entry.trend7d.startsWith("+") ? "text-green-600 dark:text-green-400" :
                          entry.trend7d.startsWith("-") ? "text-red-600 dark:text-red-400" :
                          "text-muted-foreground"
                        }`}>
                          {entry.trend7d || "—"}
                        </span>

                        <span className="hidden md:block text-xs text-muted-foreground tabular-nums">
                          {entry.avgPrice || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="text-center space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              Want deeper analysis, player outlooks, and portfolio tracking?
            </p>
            <a href="/" data-testid="link-signup-bottom">
              <Button size="lg" className="gap-2" data-testid="button-signup-bottom">
                Start Free — Track Your Collection
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>

          <footer className="text-center py-4 border-t">
            <p className="text-[11px] text-muted-foreground">
              Data refreshed from live market signals. Scores reflect demand, momentum, liquidity, and market structure analysis.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}