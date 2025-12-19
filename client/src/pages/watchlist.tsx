import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Link } from "wouter";
import { 
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Thermometer,
  Snowflake,
  ShoppingCart,
  Eye as EyeIcon,
  Ban,
  Target,
  Layers,
  Zap,
  Crown,
  Loader2,
  Trash2,
  Edit3,
  Star,
  ArrowRight,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlayerVerdict, StockTier, MarketTemperature, VerdictModifier, PlayerWatchlist } from "@shared/schema";

const LAUNCH_PLAYERS = [
  { name: "Drake Maye", sport: "football" },
  { name: "Jayden Daniels", sport: "football" },
  { name: "Shedeur Sanders", sport: "football" },
  { name: "Caleb Williams", sport: "football" },
  { name: "C.J. Stroud", sport: "football" },
  { name: "Jordan Love", sport: "football" },
  { name: "Trevor Lawrence", sport: "football" },
  { name: "Bryce Young", sport: "football" },
  { name: "Mac Jones", sport: "football" },
  { name: "Russell Wilson", sport: "football" },
];

function getVerdictIcon(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return <ShoppingCart className="h-4 w-4" />;
    case "MONITOR": return <EyeIcon className="h-4 w-4" />;
    case "AVOID": return <Ban className="h-4 w-4" />;
    default: return null;
  }
}

function getVerdictColor(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "AVOID": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getTierIcon(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return <Crown className="h-3 w-3" />;
    case "GROWTH": return <TrendingUp className="h-3 w-3" />;
    case "CORE": return <Target className="h-3 w-3" />;
    case "COMMON": return <Layers className="h-3 w-3" />;
    case "SPECULATIVE": return <Zap className="h-3 w-3" />;
    default: return null;
  }
}

function getTierColor(tier: StockTier) {
  switch (tier) {
    case "PREMIUM": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "GROWTH": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "CORE": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "COMMON": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "SPECULATIVE": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getTemperatureIcon(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-3 w-3" />;
    case "WARM": return <Thermometer className="h-3 w-3" />;
    case "NEUTRAL": return <Minus className="h-3 w-3" />;
    case "COOLING": return <Snowflake className="h-3 w-3" />;
    default: return null;
  }
}

function getTemperatureColor(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WARM": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "NEUTRAL": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "COOLING": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getModifierColor(modifier: VerdictModifier) {
  switch (modifier) {
    case "Speculative": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "Momentum": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "Value": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "Long-Term": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "Late Cycle": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

interface WatchlistItemWithOutlook extends PlayerWatchlist {
  currentOutlook?: {
    playerInfo: {
      name: string;
      team?: string | null;
      position?: string | null;
    };
    verdict: {
      action: PlayerVerdict;
      modifier?: VerdictModifier | null;
    };
    snapshot: {
      tier: StockTier;
      temperature: MarketTemperature;
    };
    insight: {
      oneLineSummary: string;
    };
  } | null;
  changes?: {
    verdictChanged: boolean;
    previousVerdict?: PlayerVerdict;
    modifierChanged?: boolean;
    previousModifier?: VerdictModifier | null;
    temperatureChanged?: boolean;
    previousTemperature?: MarketTemperature;
    changeCount: number;
  } | null;
}

function WatchlistSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
              <Skeleton className="h-9 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyWatchlist({ onSelectPlayer }: { onSelectPlayer: (name: string, sport: string) => void }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Star className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Your watchlist is empty</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Track your favorite players and get notified when their market outlook changes. Start by adding some players to watch.
        </p>
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Popular players to get started:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {LAUNCH_PLAYERS.map((player) => (
              <Button
                key={player.name}
                variant="outline"
                size="sm"
                onClick={() => onSelectPlayer(player.name, player.sport)}
                data-testid={`button-add-${player.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {player.name}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WatchlistItem({ 
  item, 
  onRemove, 
  onUpdateNotes 
}: { 
  item: WatchlistItemWithOutlook;
  onRemove: () => void;
  onUpdateNotes: (notes: string | null) => void;
}) {
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");
  const outlook = item.currentOutlook;

  const handleSaveNotes = () => {
    onUpdateNotes(notes.trim() || null);
    setNotesDialogOpen(false);
  };

  const displayName = item.playerName || item.playerKey.split(":")[1]?.replace(/_/g, " ") || item.playerKey;

  return (
    <Card className="group" data-testid={`watchlist-item-${item.playerKey}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Link href={`/player-outlook?player=${encodeURIComponent(displayName)}&sport=${item.sport}`}>
                <span className="font-semibold text-lg hover:underline cursor-pointer capitalize" data-testid={`link-player-${item.playerKey}`}>
                  {outlook?.playerInfo?.name || displayName}
                </span>
              </Link>
              {outlook?.playerInfo?.team && (
                <span className="text-sm text-muted-foreground">
                  {outlook.playerInfo.team}
                </span>
              )}
              {outlook?.playerInfo?.position && (
                <Badge variant="outline" className="text-xs">
                  {outlook.playerInfo.position}
                </Badge>
              )}
            </div>

            {outlook ? (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge className={`${getVerdictColor(outlook.verdict.action)} flex items-center gap-1`}>
                    {getVerdictIcon(outlook.verdict.action)}
                    {outlook.verdict.action}
                  </Badge>
                  {outlook.verdict.modifier && (
                    <Badge className={`${getModifierColor(outlook.verdict.modifier)} text-xs`}>
                      {outlook.verdict.modifier}
                    </Badge>
                  )}
                  <Badge className={`${getTierColor(outlook.snapshot.tier)} flex items-center gap-1 text-xs`}>
                    {getTierIcon(outlook.snapshot.tier)}
                    {outlook.snapshot.tier}
                  </Badge>
                  <Badge className={`${getTemperatureColor(outlook.snapshot.temperature)} flex items-center gap-1 text-xs`}>
                    {getTemperatureIcon(outlook.snapshot.temperature)}
                    {outlook.snapshot.temperature}
                  </Badge>
                </div>

                {item.changes?.verdictChanged && (
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">
                      Verdict changed from {item.changes.previousVerdict} to {outlook.verdict.action}
                    </span>
                  </div>
                )}

                <p className="text-sm text-muted-foreground line-clamp-2">
                  {outlook.insight.oneLineSummary}
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4" />
                <span className="text-sm">No analysis yet - view player to generate outlook</span>
              </div>
            )}

            {item.notes && (
              <div className="mt-3 p-2 bg-muted/50 rounded-md">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <FileText className="h-3 w-3" />
                  <span>Your notes:</span>
                </div>
                <p className="text-sm">{item.notes}</p>
              </div>
            )}

            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Added {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "recently"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link href={`/player-outlook?player=${encodeURIComponent(item.playerKey)}&sport=${item.sport}`}>
              <Button variant="outline" size="sm" data-testid={`button-view-${item.playerKey}`}>
                View
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>

            <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`button-notes-${item.playerKey}`}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  Notes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Notes for {item.playerKey}</DialogTitle>
                  <DialogDescription>
                    Add personal notes about this player to help track your investment thesis.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Wait for price dip after injury news..."
                  className="min-h-[100px]"
                  data-testid="input-notes"
                />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleSaveNotes} data-testid="button-save-notes">
                    Save Notes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              variant="ghost" 
              size="sm" 
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
              data-testid={`button-remove-${item.playerKey}`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Watchlist() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");

  const { data: watchlist, isLoading } = useQuery<WatchlistItemWithOutlook[]>({
    queryKey: ["/api/watchlist"],
    enabled: !!user,
  });

  const removeMutation = useMutation({
    mutationFn: async (playerKey: string) => {
      await apiRequest("DELETE", `/api/watchlist/${encodeURIComponent(playerKey)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: "Removed from watchlist",
        description: "Player has been removed from your watchlist.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove player from watchlist.",
        variant: "destructive",
      });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ playerKey, notes }: { playerKey: string; notes: string | null }) => {
      await apiRequest("PUT", `/api/watchlist/${encodeURIComponent(playerKey)}/notes`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: "Notes saved",
        description: "Your notes have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save notes.",
        variant: "destructive",
      });
    },
  });

  const handleSelectLaunchPlayer = (name: string, sport: string) => {
    window.location.href = `/player-outlook?player=${encodeURIComponent(name)}&sport=${sport}`;
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <WatchlistSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">Sign in to use your watchlist</h3>
            <p className="text-muted-foreground mb-4">
              Track your favorite players and monitor market changes.
            </p>
            <Link href="/api/login">
              <Button data-testid="button-sign-in">Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredWatchlist = watchlist?.filter((item) => {
    if (searchQuery && !item.playerKey.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (sportFilter !== "all" && item.sport !== sportFilter) {
      return false;
    }
    if (verdictFilter !== "all" && item.currentOutlook?.verdict?.action !== verdictFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-3xl font-bold" data-testid="text-watchlist-title">Player Watchlist</h1>
          {watchlist && watchlist.length > 0 && (
            <Badge variant="secondary" className="text-sm">
              {watchlist.length} player{watchlist.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Track players you're interested in and monitor changes to their market outlook.
        </p>
      </div>

      {isLoading ? (
        <WatchlistSkeleton />
      ) : !watchlist || watchlist.length === 0 ? (
        <EmptyWatchlist onSelectPlayer={handleSelectLaunchPlayer} />
      ) : (
        <>
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-sport">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                <SelectItem value="football">Football</SelectItem>
                <SelectItem value="basketball">Basketball</SelectItem>
                <SelectItem value="baseball">Baseball</SelectItem>
                <SelectItem value="hockey">Hockey</SelectItem>
              </SelectContent>
            </Select>

            <Select value={verdictFilter} onValueChange={setVerdictFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-verdict">
                <SelectValue placeholder="Verdict" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verdicts</SelectItem>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="MONITOR">MONITOR</SelectItem>
                <SelectItem value="AVOID">AVOID</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredWatchlist && filteredWatchlist.length > 0 ? (
            <div className="space-y-4">
              {filteredWatchlist.map((item) => (
                <WatchlistItem
                  key={item.id}
                  item={item}
                  onRemove={() => removeMutation.mutate(item.playerKey)}
                  onUpdateNotes={(notes) => updateNotesMutation.mutate({ playerKey: item.playerKey, notes })}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  No players match your filters.
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setSportFilter("all");
                    setVerdictFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
