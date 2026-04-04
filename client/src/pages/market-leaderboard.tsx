import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Clock,
} from "lucide-react";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";

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
  dataFreshness?: {
    oldestUpdate: string;
    newestUpdate: string;
    totalPlayers: number;
  };
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

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
    case "nba": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "nfl": return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "mlb": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "nhl": return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "soccer": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function LeaderboardTable({ entries, isLoading }: { entries: LeaderboardEntry[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground" data-testid="text-empty-leaderboard">
          No player data available yet. Look up some players to populate the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="leaderboard-entries">
      <div className="hidden md:grid grid-cols-[40px_1fr_60px_80px_70px_100px_120px_160px_70px_60px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
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
        const playerPath = entry.slug
          ? `/outlook/${entry.sport.toLowerCase()}/${entry.slug}`
          : `/player-outlook?player=${encodeURIComponent(entry.playerName)}&sport=${entry.sport}`;

        return (
          <Link key={`${entry.playerName}-${entry.sport}`} href={playerPath}>
            <div
              className="grid grid-cols-[40px_1fr_60px_80px] md:grid-cols-[40px_1fr_60px_80px_70px_100px_120px_160px_70px_60px] gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer items-center"
              data-testid={`row-leaderboard-${entry.rank}`}
            >
              <span className={getRankDisplay(entry.rank)}>{entry.rank}</span>

              <span className="font-medium text-sm truncate" data-testid={`text-player-${entry.rank}`}>
                {entry.playerName}
              </span>

              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getSportBadgeColor(entry.sport)}`}>
                {entry.sport.toUpperCase()}
              </Badge>

              <span className="text-sm font-semibold tabular-nums" data-testid={`text-score-${entry.rank}`}>
                {entry.score}
              </span>

              <span className={`hidden md:block text-[10px] font-medium ${
                entry.percentile?.startsWith("Top") ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
              }`} data-testid={`text-pctile-${entry.rank}`}>
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

              <span className="hidden md:block text-[10px] text-muted-foreground truncate italic" data-testid={`text-structure-${entry.rank}`}>
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
          </Link>
        );
      })}
    </div>
  );
}

export default function MarketLeaderboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("best");
  const [sport, setSport] = useState("all");

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/market-leaderboard", activeTab, sport],
    queryFn: async () => {
      const res = await fetch(`/api/market-leaderboard?type=${activeTab}&sport=${sport}&limit=25`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const entries = data?.entries || [];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Market Leaderboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time ranked view of player markets based on opportunity, strength, and risk
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg" data-testid="tab-group">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setActiveTab(tab.id)}
                    data-testid={`tab-${tab.id}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </Button>
                );
              })}
            </div>

            <Select value={sport} onValueChange={setSport}>
              <SelectTrigger className="w-[140px]" data-testid="select-sport">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value} data-testid={`option-sport-${s.value}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const tab = TABS.find(t => t.id === activeTab)!;
                  const Icon = tab.icon;
                  return (
                    <>
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{tab.label}</CardTitle>
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                {TABS.find(t => t.id === activeTab)?.description}
              </p>
              {data?.dataFreshness && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1" data-testid="text-data-freshness">
                  <Clock className="h-3 w-3" />
                  <span>
                    Data updated {formatTimeAgo(data.dataFreshness.newestUpdate)}
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{data.dataFreshness.totalPlayers} players tracked</span>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <LeaderboardTable entries={entries} isLoading={isLoading} />
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
