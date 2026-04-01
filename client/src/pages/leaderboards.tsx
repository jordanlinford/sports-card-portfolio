import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Heart, DollarSign, Eye, LayoutGrid, Trophy, TrendingUp } from "lucide-react";

type LeaderboardEntry = {
  id: number;
  name: string;
  ownerName: string;
  ownerImage: string | null;
  cardCount: number;
  theme: string;
};

type LikeEntry = LeaderboardEntry & { likeCount: number };
type ValueEntry = LeaderboardEntry & { totalValue: number };
type ViewEntry = LeaderboardEntry & { viewCount: number };
type PoundForPoundEntry = LeaderboardEntry & { avgValue: number; bestCardName: string | null };

type LeaderboardsData = {
  topLikes: LikeEntry[];
  topValue: ValueEntry[];
  mostViewed: ViewEntry[];
  poundForPound: PoundForPoundEntry[];
};

function getRankStyle(rank: number) {
  if (rank === 1) return "text-amber-500 dark:text-amber-400 font-bold";
  if (rank === 2) return "text-zinc-400 dark:text-zinc-300 font-bold";
  if (rank === 3) return "text-orange-600 dark:text-orange-400 font-bold";
  return "text-muted-foreground font-semibold";
}

function getRankBg(rank: number) {
  if (rank === 1) return "bg-amber-500/10 dark:bg-amber-400/10";
  if (rank === 2) return "bg-zinc-400/10 dark:bg-zinc-300/10";
  if (rank === 3) return "bg-orange-600/10 dark:bg-orange-400/10";
  return "bg-muted/50";
}

function formatDollarValue(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return count.toString();
}

function getInitials(name: string): string {
  return name.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function LeaderboardSection({
  title,
  icon: Icon,
  iconColor,
  entries,
  renderMetric,
  renderSubtext,
  testIdPrefix,
  emptyMessage,
}: {
  title: string;
  icon: typeof Heart;
  iconColor: string;
  entries: LeaderboardEntry[];
  renderMetric: (entry: any) => string;
  renderSubtext?: (entry: any) => string | null;
  testIdPrefix: string;
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-4">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <LayoutGrid className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid={`text-empty-${testIdPrefix}`}>
              {emptyMessage || "No public display cases yet"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        <Icon className={`h-5 w-5 ${iconColor}`} />
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.map((entry, index) => {
          const rank = index + 1;
          return (
            <Link key={entry.id} href={`/case/${entry.id}`}>
              <div
                className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover-elevate ${getRankBg(rank)}`}
                data-testid={`link-leaderboard-${testIdPrefix}-${entry.id}`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-md text-sm ${getRankStyle(rank)}`}
                  data-testid={`text-rank-${testIdPrefix}-${entry.id}`}
                >
                  {rank}
                </div>

                <Avatar className="h-8 w-8">
                  {entry.ownerImage ? (
                    <AvatarImage src={entry.ownerImage} alt={entry.ownerName} />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {getInitials(entry.ownerName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-case-name-${testIdPrefix}-${entry.id}`}>
                    {entry.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" data-testid={`text-owner-${testIdPrefix}-${entry.id}`}>
                    {entry.ownerName}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="secondary" className="text-xs no-default-hover-elevate" data-testid={`badge-cards-${testIdPrefix}-${entry.id}`}>
                    {entry.cardCount} cards
                  </Badge>
                  <div className="text-right min-w-[3rem]">
                    <span className="text-sm font-semibold block" data-testid={`text-metric-${testIdPrefix}-${entry.id}`}>
                      {renderMetric(entry)}
                    </span>
                    {renderSubtext && renderSubtext(entry) && (
                      <span className="text-[10px] text-muted-foreground block truncate max-w-[8rem]" data-testid={`text-subtext-${testIdPrefix}-${entry.id}`}>
                        {renderSubtext(entry)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LeaderboardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <Skeleton className="w-7 h-7 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Leaderboards() {
  const { data, isLoading } = useQuery<LeaderboardsData>({
    queryKey: ["/api/leaderboards"],
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            <h1 className="text-3xl font-bold" data-testid="text-leaderboards-title">Leaderboards</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-leaderboards-description">
            Top display cases ranked by likes, value, views, and quality
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isLoading ? (
            <>
              <LeaderboardSkeleton />
              <LeaderboardSkeleton />
              <LeaderboardSkeleton />
              <LeaderboardSkeleton />
            </>
          ) : (
            <>
              <LeaderboardSection
                title="Top Likes"
                icon={Heart}
                iconColor="text-red-500"
                entries={data?.topLikes || []}
                renderMetric={(e: any) => formatCount(e.likeCount)}
                testIdPrefix="likes"
              />
              <LeaderboardSection
                title="Top Value"
                icon={DollarSign}
                iconColor="text-green-500"
                entries={data?.topValue || []}
                renderMetric={(e: any) => formatDollarValue(e.totalValue)}
                testIdPrefix="value"
              />
              <LeaderboardSection
                title="Most Views"
                icon={Eye}
                iconColor="text-blue-500"
                entries={data?.mostViewed || []}
                renderMetric={(e: any) => formatCount(e.viewCount)}
                testIdPrefix="views"
              />
              <LeaderboardSection
                title="Pound for Pound"
                icon={TrendingUp}
                iconColor="text-purple-500"
                entries={data?.poundForPound || []}
                renderMetric={(e: PoundForPoundEntry) => `${formatDollarValue(e.avgValue)}/card`}
                renderSubtext={(e: PoundForPoundEntry) => e.bestCardName ? `Best: ${e.bestCardName}` : null}
                testIdPrefix="p4p"
                emptyMessage="Not enough cases with 5+ valued cards yet"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
