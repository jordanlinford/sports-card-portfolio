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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  User,
  CreditCard,
  Bell,
  ArrowRightLeft,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlayerVerdict, StockTier, MarketTemperature, VerdictModifier, Watchlist as WatchlistType } from "@shared/schema";

interface WatchlistAlert {
  id: number;
  playerName: string;
  playerKey: string;
  sport: string;
  previousVerdict: string | null;
  currentVerdict: string | null;
  verdictChanged: boolean;
  previousModifier: string | null;
  currentModifier: string | null;
  previousTemperature: string | null;
  currentTemperature: string | null;
  temperatureChanged: boolean;
  addedAt: string;
}

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

// Unified watchlist item - supports both players and cards
interface UnifiedWatchlistItem extends WatchlistType {
  // Optional enriched data that may come from API
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

function AlertsBanner({ alerts }: { alerts: WatchlistAlert[] }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || alerts.length === 0) return null;

  return (
    <Card className="mb-6 border-orange-500/30 bg-orange-500/5" data-testid="watchlist-alerts-banner">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10">
              <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm" data-testid="text-alerts-title">
                {alerts.length} Market {alerts.length === 1 ? "Change" : "Changes"} Detected
              </h3>
              <p className="text-xs text-muted-foreground">
                Players on your watchlist have updated outlooks
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDismissed(true)} data-testid="button-dismiss-alerts">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Link key={alert.id} href={`/player-outlook?player=${encodeURIComponent(alert.playerName)}&sport=${alert.sport || 'football'}&from=watchlist`}>
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-background/60 hover:bg-background/90 cursor-pointer transition-colors" data-testid={`alert-item-${alert.id}`}>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm capitalize">{alert.playerName}</span>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {alert.verdictChanged && (
                      <div className="flex items-center gap-1">
                        <Badge className={`${getVerdictColor(alert.previousVerdict as PlayerVerdict)} text-[10px] px-1.5 py-0`}>
                          {alert.previousVerdict}
                        </Badge>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <Badge className={`${getVerdictColor(alert.currentVerdict as PlayerVerdict)} text-[10px] px-1.5 py-0`}>
                          {alert.currentVerdict}
                        </Badge>
                      </div>
                    )}
                    {alert.temperatureChanged && (
                      <div className="flex items-center gap-1">
                        <Badge className={`${getTemperatureColor(alert.previousTemperature as MarketTemperature)} text-[10px] px-1.5 py-0`}>
                          {getTemperatureIcon(alert.previousTemperature as MarketTemperature)}
                          {alert.previousTemperature}
                        </Badge>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <Badge className={`${getTemperatureColor(alert.currentTemperature as MarketTemperature)} text-[10px] px-1.5 py-0`}>
                          {getTemperatureIcon(alert.currentTemperature as MarketTemperature)}
                          {alert.currentTemperature}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
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

// Player watchlist item component
function PlayerWatchlistItem({ 
  item, 
  onRemove, 
  onUpdateNotes 
}: { 
  item: UnifiedWatchlistItem;
  onRemove: () => void;
  onUpdateNotes: (notes: string | null) => void;
}) {
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");

  const handleSaveNotes = () => {
    onUpdateNotes(notes.trim() || null);
    setNotesDialogOpen(false);
  };

  const displayName = item.playerName || item.playerKey?.split(":")[1]?.replace(/_/g, " ") || "Unknown Player";

  return (
    <Card className="group" data-testid={`watchlist-item-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Link href={`/player-outlook?player=${encodeURIComponent(displayName)}&sport=${item.sport || 'football'}&from=watchlist`}>
                <span className="font-semibold text-lg hover:underline cursor-pointer capitalize" data-testid={`link-player-${item.id}`}>
                  {displayName}
                </span>
              </Link>
              {item.sport && (
                <Badge variant="outline" className="text-xs capitalize">
                  {item.sport}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-2">
              {item.verdictAtAdd && (
                <Badge className={`${getVerdictColor(item.verdictAtAdd as PlayerVerdict)} flex items-center gap-1`}>
                  {getVerdictIcon(item.verdictAtAdd as PlayerVerdict)}
                  {item.verdictAtAdd}
                </Badge>
              )}
              {item.actionAtAdd && (
                <Badge variant="secondary" className="text-xs">
                  {item.actionAtAdd}
                </Badge>
              )}
              {item.temperatureAtAdd && (
                <Badge className={`${getTemperatureColor(item.temperatureAtAdd as MarketTemperature)} flex items-center gap-1 text-xs`}>
                  {getTemperatureIcon(item.temperatureAtAdd as MarketTemperature)}
                  {item.temperatureAtAdd}
                </Badge>
              )}
            </div>

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
              {item.source && (
                <span className="text-muted-foreground">via {item.source}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link href={`/player-outlook?player=${encodeURIComponent(displayName)}&sport=${item.sport || 'football'}`}>
              <Button variant="outline" size="sm" data-testid={`button-view-${item.id}`}>
                View
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>

            <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`button-notes-${item.id}`}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  Notes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Notes for {displayName}</DialogTitle>
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
              data-testid={`button-remove-${item.id}`}
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

// Card watchlist item component
function CardWatchlistItem({ 
  item, 
  onRemove, 
  onUpdateNotes 
}: { 
  item: UnifiedWatchlistItem;
  onRemove: () => void;
  onUpdateNotes: (notes: string | null) => void;
}) {
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes || "");

  const handleSaveNotes = () => {
    onUpdateNotes(notes.trim() || null);
    setNotesDialogOpen(false);
  };

  const displayName = item.cardTitle || `Card #${item.cardId}`;

  return (
    <Card className="group" data-testid={`watchlist-item-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-md bg-muted">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {item.cardId ? (
                <Link href={`/card/${item.cardId}/outlook`}>
                  <span className="font-semibold text-lg hover:underline cursor-pointer" data-testid={`link-card-${item.id}`}>
                    {displayName}
                  </span>
                </Link>
              ) : (
                <span className="font-semibold text-lg">{displayName}</span>
              )}
              <Badge variant="outline" className="text-xs">
                Card
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-2">
              {item.actionAtAdd && (
                <Badge variant="secondary" className="text-xs">
                  {item.actionAtAdd}
                </Badge>
              )}
              {item.estimatedValueAtAdd && (
                <Badge variant="outline" className="text-xs">
                  ${item.estimatedValueAtAdd.toFixed(2)}
                </Badge>
              )}
            </div>

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
              {item.source && (
                <span className="text-muted-foreground">via {item.source}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {item.cardId && (
              <Link href={`/card/${item.cardId}/outlook`}>
                <Button variant="outline" size="sm" data-testid={`button-view-${item.id}`}>
                  View
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            )}

            <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`button-notes-${item.id}`}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  Notes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Notes for {displayName}</DialogTitle>
                  <DialogDescription>
                    Add personal notes about this card to help track your investment thesis.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Watch for PSA pop report changes..."
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
              data-testid={`button-remove-${item.id}`}
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
  const [activeTab, setActiveTab] = useState<"all" | "players" | "cards">("all");
  const [sportFilter, setSportFilter] = useState<string>("all");

  const { data: watchlist, isLoading } = useQuery<UnifiedWatchlistItem[]>({
    queryKey: ["/api/unified-watchlist"],
    enabled: !!user,
  });

  const { data: alertsData } = useQuery<{ alerts: WatchlistAlert[]; totalWatchlistItems: number }>({
    queryKey: ["/api/unified-watchlist/alerts"],
    enabled: !!user,
    staleTime: 120000,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/unified-watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unified-watchlist"] });
      toast({
        title: "Removed from watchlist",
        description: "Item has been removed from your watchlist.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item from watchlist.",
        variant: "destructive",
      });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string | null }) => {
      await apiRequest("PATCH", `/api/unified-watchlist/${id}`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unified-watchlist"] });
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
            <a href="/api/login">
              <Button data-testid="button-sign-in">Sign In</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Separate watchlist items by type
  const playerItems = watchlist?.filter(item => item.itemType === "player") || [];
  const cardItems = watchlist?.filter(item => item.itemType === "card") || [];
  
  // Apply filters based on active tab
  const getFilteredItems = () => {
    let items: UnifiedWatchlistItem[] = [];
    
    if (activeTab === "all") {
      items = watchlist || [];
    } else if (activeTab === "players") {
      items = playerItems;
    } else {
      items = cardItems;
    }
    
    // Apply search filter
    if (searchQuery) {
      items = items.filter(item => {
        const searchable = item.itemType === "player" 
          ? (item.playerName || item.playerKey || "").toLowerCase()
          : (item.cardTitle || "").toLowerCase();
        return searchable.includes(searchQuery.toLowerCase());
      });
    }
    
    // Apply sport filter (only for players)
    if (sportFilter !== "all") {
      items = items.filter(item => 
        item.itemType !== "player" || item.sport === sportFilter
      );
    }
    
    return items;
  };
  
  const filteredWatchlist = getFilteredItems();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-3xl font-bold" data-testid="text-watchlist-title">My Watchlist</h1>
          {watchlist && watchlist.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {playerItems.length} player{playerItems.length !== 1 ? "s" : ""}
              </Badge>
              {cardItems.length > 0 && (
                <Badge variant="outline" className="text-sm">
                  {cardItems.length} card{cardItems.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>
        <p className="text-muted-foreground">
          Track players and cards you're interested in. Monitor changes to their market outlook.
        </p>
      </div>

      {alertsData?.alerts && alertsData.alerts.length > 0 && (
        <AlertsBanner alerts={alertsData.alerts} />
      )}

      {isLoading ? (
        <WatchlistSkeleton />
      ) : !watchlist || watchlist.length === 0 ? (
        <EmptyWatchlist onSelectPlayer={handleSelectLaunchPlayer} />
      ) : (
        <>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="mb-6">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">
                All ({watchlist.length})
              </TabsTrigger>
              <TabsTrigger value="players" data-testid="tab-players">
                <User className="h-4 w-4 mr-1" />
                Players ({playerItems.length})
              </TabsTrigger>
              <TabsTrigger value="cards" data-testid="tab-cards">
                <CreditCard className="h-4 w-4 mr-1" />
                Cards ({cardItems.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === "cards" ? "Search cards in your watchlist..." : "Search players in your watchlist..."}
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

            {activeTab !== "cards" && (
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
            )}
          </div>

          {filteredWatchlist && filteredWatchlist.length > 0 ? (
            <div className="space-y-4">
              {filteredWatchlist.map((item) => (
                item.itemType === "player" ? (
                  <PlayerWatchlistItem
                    key={item.id}
                    item={item}
                    onRemove={() => removeMutation.mutate(item.id)}
                    onUpdateNotes={(notes) => updateNotesMutation.mutate({ id: item.id, notes })}
                  />
                ) : (
                  <CardWatchlistItem
                    key={item.id}
                    item={item}
                    onRemove={() => removeMutation.mutate(item.id)}
                    onUpdateNotes={(notes) => updateNotesMutation.mutate({ id: item.id, notes })}
                  />
                )
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  No items match your filters.
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("");
                    setSportFilter("all");
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
