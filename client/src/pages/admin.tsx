import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Users, LayoutGrid, CreditCard, Image, Crown, UserMinus, Database, Search, Plus, Pencil, Trash2, Upload, RefreshCw, ChevronLeft, ChevronRight, FileText, Eye, EyeOff, Video, Download, Globe, Zap, ExternalLink, MessageCircle, Send, Clock, CheckCircle, AlertCircle, Sparkles, Loader2, ArrowRight, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, AdminUserSummary, DisplayCaseWithCards, PlayerRegistry, BlogPostWithAuthor, SupportTicketWithRequester, SupportTicketWithMessages, SupportTicketStatus } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { HeroImageUploader } from "@/components/hero-image-uploader";

interface PlatformStats {
  totalUsers: number;
  totalDisplayCases: number;
  totalCards: number;
  proUsers: number;
}

interface DisplayCaseWithOwner extends DisplayCaseWithCards {
  ownerName: string;
}

interface RegistryStats {
  total: number;
  bySport: Record<string, number>;
  byTier: Record<string, number>;
}

interface PlayersResponse {
  players: PlayerRegistry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const SPORTS = ["NFL", "NBA", "MLB", "NHL"] as const;
const ROLE_TIERS = ["FRANCHISE_CORE", "SOLID_STARTER", "UNCERTAIN_ROLE", "BACKUP_OR_FRINGE", "OUT_OF_LEAGUE", "RETIRED_ICON"] as const;
const CAREER_STAGES = ["ROOKIE", "YEAR_2", "YEAR_3", "YEAR_4", "PRIME", "VETERAN", "RETIRED_HOF", "BUST"] as const;
const POSITION_GROUPS = ["QB", "WR", "RB", "TE", "EDGE", "DL", "LB", "CB", "S", "GUARD", "WING", "BIG", "PITCHER", "CATCHER", "INFIELDER", "OUTFIELDER", "GOALIE", "CENTER", "WINGER", "DEFENSEMAN", "UNKNOWN"] as const;

function StatCard({ title, value, icon: Icon, description }: { title: string; value: number; icon: any; description?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value.toLocaleString()}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function UserRow({ user, onUpdateSubscription, onDelete }: { user: AdminUserSummary; onUpdateSubscription: (userId: string, status: string) => void; onDelete: (userId: string) => void }) {
  const initials = user.handle 
    ? user.handle.slice(0, 2).toUpperCase()
    : [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n?.[0])
        .join("")
        .toUpperCase() || "?";

  const isPro = user.subscriptionStatus === "PRO";

  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0" data-testid={`row-user-${user.id}`}>
      <Avatar>
        <AvatarImage src={user.profileImageUrl || undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {user.handle ? `@${user.handle}` : [user.firstName, user.lastName].filter(Boolean).join(" ") || "Anonymous"}
        </p>
        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span data-testid={`text-login-count-${user.id}`}>
            Logins: <span className="font-medium text-foreground">{user.loginCount ?? 0}</span>
          </span>
          <span data-testid={`text-last-login-${user.id}`}>
            Last login: {user.lastLoginAt ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true }) : "never"}
          </span>
          {user.lastActivityAt && (
            <span data-testid={`text-last-active-${user.id}`}>
              Active: {formatDistanceToNow(new Date(user.lastActivityAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {user.isAdmin && (
          <Badge variant="default">Admin</Badge>
        )}
        <Badge variant={isPro ? "default" : "secondary"}>
          {user.subscriptionStatus || "FREE"}
        </Badge>
        {user.isOnTrial && (
          <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400" data-testid={`badge-trial-${user.id}`}>
            Trial{user.trialSource ? ` · ${user.trialSource}` : ""}
            {user.trialEnd ? ` · ends ${format(new Date(user.trialEnd), "MMM d")}` : ""}
          </Badge>
        )}
        {user.promoCodes.map((p) => (
          <Badge
            key={p.code}
            variant="outline"
            className="border-violet-500 text-violet-600 dark:text-violet-400"
            title={p.description || p.code}
            data-testid={`badge-promo-${user.id}-${p.code}`}
          >
            Promo: {p.code}
          </Badge>
        ))}
        {isPro ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateSubscription(user.id, "FREE")}
            data-testid={`button-downgrade-${user.id}`}
          >
            <UserMinus className="h-4 w-4 mr-1" />
            Downgrade
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={() => onUpdateSubscription(user.id, "PRO")}
            data-testid={`button-upgrade-${user.id}`}
          >
            <Crown className="h-4 w-4 mr-1" />
            Upgrade to Pro
          </Button>
        )}
        {!user.isAdmin && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(user.id)}
            data-testid={`button-delete-user-${user.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      {user.createdAt && (
        <span className="text-sm text-muted-foreground hidden md:block">
          Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}

function DisplayCaseRow({ displayCase, onDelete }: { displayCase: DisplayCaseWithOwner; onDelete: (id: number) => void }) {
  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0" data-testid={`row-case-${displayCase.id}`}>
      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
        {displayCase.cards && displayCase.cards.length > 0 && displayCase.cards[0].imagePath ? (
          <img
            src={displayCase.cards[0].imagePath}
            alt=""
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{displayCase.name}</p>
        <p className="text-sm text-muted-foreground truncate">by {displayCase.ownerName}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">
          {displayCase.cards?.length || 0} cards
        </Badge>
        <Badge variant={displayCase.isPublic ? "default" : "outline"}>
          {displayCase.isPublic ? "Public" : "Private"}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(displayCase.id)}
          data-testid={`button-delete-case-${displayCase.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {displayCase.createdAt && (
        <span className="text-sm text-muted-foreground hidden md:block">
          {format(new Date(displayCase.createdAt), "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}

function PlayerRegistryTab() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerRegistry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [clearAllBeforeImport, setClearAllBeforeImport] = useState(false);
  const [aiRefreshOpen, setAiRefreshOpen] = useState(false);
  const [aiRefreshSport, setAiRefreshSport] = useState("all");
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<any>(null);
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set());
  const aiPollRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    sport: "NFL",
    playerName: "",
    aliases: "",
    careerStage: "PRIME",
    roleTier: "SOLID_STARTER",
    positionGroup: "UNKNOWN",
    notes: ""
  });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
    ...(sportFilter !== "all" && { sport: sportFilter }),
    ...(tierFilter !== "all" && { roleTier: tierFilter }),
    ...(searchQuery && { search: searchQuery })
  });

  const { data, isLoading, refetch } = useQuery<PlayersResponse>({
    queryKey: ["/api/admin/registry/players", page, pageSize, sportFilter, tierFilter, searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/admin/registry/players?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    }
  });

  const { data: stats, refetch: refetchStats } = useQuery<RegistryStats>({
    queryKey: ["/api/admin/registry/stats"]
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/registry/import-csv", {});
    },
    onSuccess: (data: any) => {
      refetch();
      refetchStats();
      toast({
        title: "Import Complete",
        description: `Imported ${data.imported} players, skipped ${data.skipped}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ csvContent, clearAll }: { csvContent: string; clearAll: boolean }) => {
      return await apiRequest("POST", "/api/admin/registry/upload-csv", { csvContent, clearAll });
    },
    onSuccess: (data: any) => {
      refetch();
      refetchStats();
      setUploadDialogOpen(false);
      setCsvFile(null);
      setClearAllBeforeImport(false);
      toast({
        title: "Upload Complete",
        description: data.cleared 
          ? `Cleared registry and imported ${data.added} players`
          : `Updated ${data.updated} players, added ${data.added} new players, skipped ${data.skipped}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  });

  const startAiRefreshMutation = useMutation({
    mutationFn: async (sport: string) => {
      return await apiRequest("POST", "/api/admin/registry/ai-refresh", { 
        sport: sport === "all" ? null : sport 
      });
    },
    onSuccess: (data: any) => {
      setAiJob({ status: "running", batchesCompleted: 0, batchesTotal: 0, processedPlayers: 0, totalPlayers: 0, proposals: [], errors: [] });
      setSelectedProposals(new Set());
      setAiJobId(data.jobId);
      startPolling(data.jobId);
      toast({ title: "AI Refresh Started", description: "Analyzing players with AI..." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Start", description: error.message, variant: "destructive" });
    }
  });

  const applyProposalsMutation = useMutation({
    mutationFn: async (acceptedPlayerIds: number[]) => {
      return await apiRequest("POST", `/api/admin/registry/ai-refresh/${aiJobId}/apply`, { acceptedPlayerIds });
    },
    onSuccess: (data: any) => {
      refetch();
      refetchStats();
      toast({ 
        title: "Changes Applied", 
        description: `Updated ${data.applied} players, skipped ${data.skipped}` 
      });
      setAiRefreshOpen(false);
      setAiJobId(null);
      setAiJob(null);
      setSelectedProposals(new Set());
    },
    onError: (error: Error) => {
      toast({ title: "Apply Failed", description: error.message, variant: "destructive" });
    }
  });

  function startPolling(jobId: string) {
    if (aiPollRef.current) clearInterval(aiPollRef.current);
    aiPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/registry/ai-refresh/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();
        setAiJob(job);
        if (job.status === "completed" || job.status === "failed") {
          if (aiPollRef.current) clearInterval(aiPollRef.current);
          aiPollRef.current = null;
          if (job.proposals?.length > 0) {
            setSelectedProposals(new Set(job.proposals.map((p: any) => p.playerId)));
          }
        }
      } catch {}
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (aiPollRef.current) clearInterval(aiPollRef.current);
    };
  }, []);

  const handleExportCSV = async () => {
    try {
      const res = await fetch("/api/admin/registry/export-csv");
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `player_registry_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: "CSV downloaded successfully" });
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleUploadCSV = async () => {
    if (!csvFile) return;
    const content = await csvFile.text();
    uploadMutation.mutate({ csvContent: content, clearAll: clearAllBeforeImport });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/admin/registry/players", data);
    },
    onSuccess: () => {
      refetch();
      refetchStats();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Player Added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Add Player", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return await apiRequest("PUT", `/api/admin/registry/players/${id}`, data);
    },
    onSuccess: () => {
      refetch();
      refetchStats();
      setDialogOpen(false);
      setEditingPlayer(null);
      resetForm();
      toast({ title: "Player Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Update", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/registry/players/${id}`, {});
    },
    onSuccess: () => {
      refetch();
      refetchStats();
      setDeleteConfirmId(null);
      toast({ title: "Player Deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Delete", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      sport: "NFL",
      playerName: "",
      aliases: "",
      careerStage: "PRIME",
      roleTier: "SOLID_STARTER",
      positionGroup: "UNKNOWN",
      notes: ""
    });
  };

  const openEditDialog = (player: PlayerRegistry) => {
    setEditingPlayer(player);
    setFormData({
      sport: player.sport,
      playerName: player.playerName,
      aliases: player.aliases || "",
      careerStage: player.careerStage,
      roleTier: player.roleTier,
      positionGroup: player.positionGroup,
      notes: player.notes || ""
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const submitData = {
      ...formData,
      aliases: formData.aliases || null,
      notes: formData.notes || null
    };
    if (editingPlayer) {
      updateMutation.mutate({ id: editingPlayer.id, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const getTierBadgeVariant = (tier: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (tier) {
      case "FRANCHISE_CORE": return "default";
      case "SOLID_STARTER": return "secondary";
      case "UNCERTAIN_ROLE": return "outline";
      case "BACKUP_OR_FRINGE":
      case "OUT_OF_LEAGUE": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Total Players</p>
          </CardContent>
        </Card>
        {SPORTS.map(sport => (
          <Card key={sport}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats?.bySport[sport] || 0}</div>
              <p className="text-xs text-muted-foreground">{sport}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div>
              <CardTitle>Player Registry</CardTitle>
              <CardDescription>Manage player status data for investment verdicts</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setAiRefreshOpen(true)}
                data-testid="button-ai-refresh"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Refresh
              </Button>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => setUploadDialogOpen(true)}
                data-testid="button-upload-csv"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button
                onClick={() => {
                  resetForm();
                  setEditingPlayer(null);
                  setDialogOpen(true);
                }}
                data-testid="button-add-player"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Player
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
                data-testid="input-search-player"
              />
            </div>
            <Select value={sportFilter} onValueChange={(v) => { setSportFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="select-sport-filter">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                {SPORTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-tier-filter">
                <SelectValue placeholder="Role Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {ROLE_TIERS.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[100px]" data-testid="select-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : data?.players && data.players.length > 0 ? (
              <div className="space-y-1">
                {data.players.map(player => (
                  <div key={player.id} className="flex items-center gap-4 p-3 border-b last:border-b-0" data-testid={`row-player-${player.id}`}>
                    <Badge variant="outline" className="w-12 justify-center">{player.sport}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{player.playerName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {player.positionGroup} - {player.careerStage.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant={getTierBadgeVariant(player.roleTier)}>
                      {player.roleTier.replace(/_/g, " ")}
                    </Badge>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(player)} data-testid={`button-edit-${player.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(player.id)} data-testid={`button-delete-${player.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No players found. Import from CSV or add manually.
              </div>
            )}
          </ScrollArea>

          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, data.pagination.total)} of {data.pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 py-1 text-sm">Page {page} of {data.pagination.totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingPlayer(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlayer ? "Edit Player" : "Add Player"}</DialogTitle>
            <DialogDescription>
              {editingPlayer ? "Update player registry information" : "Add a new player to the registry"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select value={formData.sport} onValueChange={(v) => setFormData(f => ({ ...f, sport: v }))}>
                  <SelectTrigger data-testid="input-sport"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPORTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Position Group</Label>
                <Select value={formData.positionGroup} onValueChange={(v) => setFormData(f => ({ ...f, positionGroup: v }))}>
                  <SelectTrigger data-testid="input-position"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POSITION_GROUPS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Player Name</Label>
              <Input
                value={formData.playerName}
                onChange={(e) => setFormData(f => ({ ...f, playerName: e.target.value }))}
                placeholder="Patrick Mahomes"
                data-testid="input-player-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Aliases (pipe-separated)</Label>
              <Input
                value={formData.aliases}
                onChange={(e) => setFormData(f => ({ ...f, aliases: e.target.value }))}
                placeholder="P Mahomes|Pat Mahomes"
                data-testid="input-aliases"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Career Stage</Label>
                <Select value={formData.careerStage} onValueChange={(v) => setFormData(f => ({ ...f, careerStage: v }))}>
                  <SelectTrigger data-testid="input-career-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAREER_STAGES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role Tier</Label>
                <Select value={formData.roleTier} onValueChange={(v) => setFormData(f => ({ ...f, roleTier: v }))}>
                  <SelectTrigger data-testid="input-role-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_TIERS.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional admin notes..."
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.playerName || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-player"
            >
              {(createMutation.isPending || updateMutation.isPending) && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {editingPlayer ? "Update" : "Add"} Player
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Player?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDialogOpen} onOpenChange={(open) => { setUploadDialogOpen(open); if (!open) { setCsvFile(null); setClearAllBeforeImport(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file to update players. The CSV should have columns: Sport, PlayerName, Aliases, CareerStage, RoleTier, PositionGroup, Notes.
              Players will be matched by Sport + PlayerName and updated. New players will be added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                className="flex-1"
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Current Registry
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Download the current registry, make your changes in a spreadsheet, then upload the modified CSV below.
            </p>
            <div className="space-y-2">
              <Label>Select CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                data-testid="input-csv-file"
              />
            </div>
            {csvFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="clearAll" 
                checked={clearAllBeforeImport} 
                onCheckedChange={(checked) => setClearAllBeforeImport(checked === true)}
                data-testid="checkbox-clear-all"
              />
              <Label htmlFor="clearAll" className="text-sm font-normal cursor-pointer">
                Clear all existing entries before import (recommended for fresh start)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setCsvFile(null); setClearAllBeforeImport(false); }}>Cancel</Button>
            <Button
              onClick={handleUploadCSV}
              disabled={!csvFile || uploadMutation.isPending}
              data-testid="button-upload-confirm"
            >
              {uploadMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Upload and Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiRefreshOpen} onOpenChange={(open) => { 
        if (!open && aiJob?.status !== "running") {
          setAiRefreshOpen(false);
          setAiJobId(null);
          setAiJob(null);
          setSelectedProposals(new Set());
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Registry Refresh
            </DialogTitle>
            <DialogDescription>
              Use AI to scan for career stage and role tier changes across all players.
            </DialogDescription>
          </DialogHeader>

          {!aiJobId ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Filter by Sport</Label>
                <Select value={aiRefreshSport} onValueChange={setAiRefreshSport}>
                  <SelectTrigger data-testid="select-ai-sport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sports ({stats?.total || 0} players)</SelectItem>
                    {SPORTS.map(sport => (
                      <SelectItem key={sport} value={sport}>
                        {sport} ({stats?.bySport[sport] || 0} players)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                AI will search for current player news, trades, injuries, and retirements to suggest updates. Players are processed in batches of 20 with a 3-second delay between batches.
              </p>
              <p className="text-sm text-muted-foreground">
                Estimated time: ~{Math.ceil((aiRefreshSport === "all" ? (stats?.total || 792) : (stats?.bySport[aiRefreshSport] || 0)) / 20) * 6} seconds
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAiRefreshOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => startAiRefreshMutation.mutate(aiRefreshSport)}
                  disabled={startAiRefreshMutation.isPending}
                  data-testid="button-start-ai-refresh"
                >
                  {startAiRefreshMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Start AI Analysis
                </Button>
              </DialogFooter>
            </div>
          ) : aiJob?.status === "running" ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">Analyzing players...</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${aiJob.batchesTotal > 0 ? (aiJob.batchesCompleted / aiJob.batchesTotal) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Batch {aiJob.batchesCompleted} of {aiJob.batchesTotal} ({aiJob.processedPlayers} / {aiJob.totalPlayers} players)
              </p>
              {aiJob.proposals?.length > 0 && (
                <p className="text-sm">{aiJob.proposals.length} changes found so far...</p>
              )}
            </div>
          ) : aiJob?.status === "completed" ? (
            <div className="space-y-4 py-2">
              {aiJob.proposals.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium">All players are up to date</p>
                  <p className="text-sm text-muted-foreground mt-1">No changes needed</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium">{aiJob.proposals.length} proposed changes</p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedProposals(new Set(aiJob.proposals.map((p: any) => p.playerId)))}
                        data-testid="button-select-all"
                      >
                        Select All
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedProposals(new Set())}
                        data-testid="button-deselect-all"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
                    {aiJob.proposals.map((p: any) => (
                      <div 
                        key={p.playerId} 
                        className={`p-3 flex items-start gap-3 cursor-pointer transition-colors ${selectedProposals.has(p.playerId) ? 'bg-primary/5' : ''}`}
                        onClick={() => {
                          const next = new Set(selectedProposals);
                          if (next.has(p.playerId)) next.delete(p.playerId);
                          else next.add(p.playerId);
                          setSelectedProposals(next);
                        }}
                        data-testid={`proposal-row-${p.playerId}`}
                      >
                        <Checkbox 
                          checked={selectedProposals.has(p.playerId)} 
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{p.playerName}</span>
                            <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">{p.sport}</Badge>
                            <Badge 
                              variant={p.confidence === "HIGH" ? "default" : "secondary"}
                              className="no-default-hover-elevate no-default-active-elevate"
                            >
                              {p.confidence}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {p.proposedCareerStage && (
                              <span className="flex items-center gap-1">
                                Career: <span className="text-muted-foreground">{p.currentCareerStage}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium text-primary">{p.proposedCareerStage}</span>
                              </span>
                            )}
                            {p.proposedRoleTier && (
                              <span className="flex items-center gap-1">
                                Role: <span className="text-muted-foreground">{p.currentRoleTier}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium text-primary">{p.proposedRoleTier}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{p.rationale}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {aiJob.errors?.length > 0 && (
                <div className="text-sm text-destructive">
                  {aiJob.errors.length} batch error(s) occurred during processing
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAiRefreshOpen(false); setAiJobId(null); setAiJob(null); setSelectedProposals(new Set()); }}>
                  {aiJob.proposals.length === 0 ? "Close" : "Cancel"}
                </Button>
                {aiJob.proposals.length > 0 && (
                  <Button
                    onClick={() => applyProposalsMutation.mutate(Array.from(selectedProposals))}
                    disabled={selectedProposals.size === 0 || applyProposalsMutation.isPending}
                    data-testid="button-apply-proposals"
                  >
                    {applyProposalsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Apply {selectedProposals.size} Changes
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : aiJob?.status === "failed" ? (
            <div className="text-center py-6">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
              <p className="font-medium">Job Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{aiJob?.errors?.[0] || "Unknown error"}</p>
              <Button variant="outline" className="mt-4" onClick={() => { setAiJobId(null); setAiJob(null); }}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">Starting analysis...</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface OutlookCacheEntry {
  playerKey: string;
  playerName: string;
  sport: string;
  slug: string | null;
  isPublic: boolean;
  seoTitle: string | null;
  updatedAt: string;
}

interface SeedResult {
  playerName: string;
  sport: string;
  success: boolean;
  url?: string;
  error?: string;
}

function OutlookSEOTab() {
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const [seedResults, setSeedResults] = useState<SeedResult[] | null>(null);

  const { data: cacheEntries, isLoading, refetch } = useQuery<OutlookCacheEntry[]>({
    queryKey: ["/api/admin/outlook"],
  });

  const togglePublicMutation = useMutation({
    mutationFn: async ({ playerKey, isPublic }: { playerKey: string; isPublic: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/outlook/${encodeURIComponent(playerKey)}/public`, { isPublic });
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Visibility updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteOutlookMutation = useMutation({
    mutationFn: async (playerKey: string) => {
      return await apiRequest("POST", `/api/admin/outlook/delete`, { playerKey });
    },
    onSuccess: (_data: any, playerKey: string) => {
      refetch();
      toast({ title: "Player outlook deleted", description: playerKey });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSeedTopAthletes = async () => {
    setSeeding(true);
    setSeedResults(null);
    try {
      const res = await apiRequest("POST", "/api/admin/outlook/seed", {});
      const data = res as { results: SeedResult[] };
      setSeedResults(data.results);
      refetch();
      const successCount = data.results.filter((r: SeedResult) => r.success).length;
      toast({ 
        title: "Seeding Complete", 
        description: `${successCount}/${data.results.length} athletes seeded successfully` 
      });
    } catch (error: any) {
      toast({ title: "Seeding Failed", description: error.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const publicCount = cacheEntries?.filter(e => e.isPublic).length || 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{cacheEntries?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Cached Outlooks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{publicCount}</div>
            <p className="text-xs text-muted-foreground">Public Pages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Button 
              onClick={handleSeedTopAthletes} 
              disabled={seeding}
              className="w-full"
              data-testid="button-seed-athletes"
            >
              {seeding ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Seed Top Athletes
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Generates outlooks for popular players
            </p>
          </CardContent>
        </Card>
      </div>

      {seedResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Seed Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {seedResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant={result.success ? "default" : "destructive"}>
                    {result.sport}
                  </Badge>
                  <span>{result.playerName}</span>
                  {result.success ? (
                    <a 
                      href={result.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-destructive">{result.error}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public Outlook Pages</CardTitle>
          <CardDescription>
            Manage which player outlooks are publicly accessible for SEO
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : cacheEntries && cacheEntries.length > 0 ? (
              <div className="space-y-1">
                {cacheEntries.map(entry => (
                  <div 
                    key={entry.playerKey} 
                    className="flex items-center gap-4 p-3 border-b last:border-b-0"
                    data-testid={`row-outlook-${entry.playerKey}`}
                  >
                    <Badge variant="outline" className="w-12 justify-center">{entry.sport}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{entry.playerName}</p>
                      {entry.slug && (
                        <p className="text-xs text-muted-foreground truncate">
                          /outlook/{entry.sport.toLowerCase()}/{entry.slug}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={entry.isPublic}
                        onCheckedChange={(checked) => 
                          togglePublicMutation.mutate({ playerKey: entry.playerKey, isPublic: checked })
                        }
                        data-testid={`switch-public-${entry.playerKey}`}
                      />
                      <span className="text-sm text-muted-foreground w-16">
                        {entry.isPublic ? "Public" : "Private"}
                      </span>
                      {entry.isPublic && entry.slug && (
                        <a
                          href={`/outlook/${entry.sport.toLowerCase()}/${entry.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="icon" variant="ghost">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete cached outlook for ${entry.playerName} (${entry.sport})?`)) {
                            deleteOutlookMutation.mutate(entry.playerKey);
                          }
                        }}
                        disabled={deleteOutlookMutation.isPending}
                        data-testid={`button-delete-outlook-${entry.playerKey}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No cached outlooks. Use "Seed Top Athletes" or analyze players in the app.
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

const TICKET_STATUS_CONFIG: Record<SupportTicketStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }> = {
  OPEN: { label: "Open", variant: "destructive", icon: AlertCircle },
  IN_PROGRESS: { label: "In Progress", variant: "secondary", icon: Clock },
  WAITING_ON_USER: { label: "Awaiting User", variant: "outline", icon: MessageCircle },
  RESOLVED: { label: "Resolved", variant: "default", icon: CheckCircle },
  CLOSED: { label: "Closed", variant: "outline", icon: CheckCircle },
};

interface ActivityLog {
  id: number;
  userId: string | null;
  activityType: string;
  targetId: string | null;
  targetType: string | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface ActivityStats {
  totalActivities: number;
  byType: Record<string, number>;
  byDay: { date: string; count: number }[];
  topUsers: { userId: string; count: number }[];
}

const ACTIVITY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  card_scan: { label: "Card Scan", color: "bg-blue-500" },
  card_add: { label: "Card Added", color: "bg-green-500" },
  card_edit: { label: "Card Edited", color: "bg-yellow-500" },
  card_delete: { label: "Card Deleted", color: "bg-red-500" },
  outlook_request: { label: "Outlook Request", color: "bg-purple-500" },
  case_view: { label: "Case Viewed", color: "bg-cyan-500" },
  case_create: { label: "Case Created", color: "bg-emerald-500" },
  offer_send: { label: "Offer Sent", color: "bg-orange-500" },
  offer_respond: { label: "Offer Response", color: "bg-amber-500" },
  message_send: { label: "Message Sent", color: "bg-indigo-500" },
  login: { label: "Login", color: "bg-slate-500" },
  signup: { label: "Signup", color: "bg-teal-500" },
  subscription_change: { label: "Subscription Change", color: "bg-pink-500" },
  card_analysis: { label: "Card Analysis", color: "bg-violet-500" },
  share_case: { label: "Case Shared", color: "bg-rose-500" },
};

function AlphaEngineTab() {
  const { toast } = useToast();
  const [batchRunning, setBatchRunning] = useState(false);

  const { data: batchStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{
    running: boolean;
    lastRun: {
      runId: string;
      startedAt: string;
      completedAt: string;
      cardsAnalyzed: number;
      cardsFailed: number;
      signalsGenerated: number;
      estimatedCost: number;
      durationMs: number;
    } | null;
  }>({
    queryKey: ["/api/admin/alpha-batch-status"],
    refetchInterval: batchRunning ? 10000 : false,
  });

  const { data: signalsData, isLoading: signalsLoading, refetch: refetchSignals } = useQuery<{
    signals: Array<{
      id: number;
      cardId: number;
      playerName: string | null;
      cardTitle: string | null;
      signalType: string;
      alphaScore: number;
      confidence: string;
      drivers: string[] | null;
      whyNow: string | null;
      expiresAt: string;
    }>;
  }>({
    queryKey: ["/api/alpha/signals"],
  });

  useEffect(() => {
    if (batchStatus && !batchStatus.running && batchRunning) {
      setBatchRunning(false);
      refetchSignals();
      toast({ title: "Batch complete", description: `${batchStatus.lastRun?.signalsGenerated || 0} signals generated` });
    }
  }, [batchStatus]);

  const runBatchMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/alpha-batch-run");
    },
    onSuccess: () => {
      setBatchRunning(true);
      toast({ title: "Alpha batch started", description: "Analyzing cards and generating signals..." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to start batch", description: err.message, variant: "destructive" });
    },
  });

  const signals = signalsData?.signals || [];
  const signalsByType: Record<string, number> = {};
  signals.forEach(s => { signalsByType[s.signalType] = (signalsByType[s.signalType] || 0) + 1; });

  const lastRun = batchStatus?.lastRun;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Alpha Engine Controls
          </CardTitle>
          <CardDescription>
            Run the Alpha batch job to analyze top cards and generate buy/sell/hold signals for the Alpha Feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => runBatchMutation.mutate()}
              disabled={runBatchMutation.isPending || batchRunning || batchStatus?.running}
              data-testid="button-run-alpha-batch"
            >
              {(batchRunning || batchStatus?.running) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Batch Running...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run Alpha Batch
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => { refetchStatus(); refetchSignals(); }}
              data-testid="button-refresh-alpha-status"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>
          </div>

          {lastRun && (
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-medium text-sm">Last Batch Run</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Cards Analyzed:</span>
                  <span className="ml-1 font-medium">{lastRun.cardsAnalyzed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failed:</span>
                  <span className="ml-1 font-medium">{lastRun.cardsFailed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Signals:</span>
                  <span className="ml-1 font-medium">{lastRun.signalsGenerated}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cost:</span>
                  <span className="ml-1 font-medium">~${lastRun.estimatedCost.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="ml-1 font-medium">{Math.round(lastRun.durationMs / 1000)}s</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed:</span>
                  <span className="ml-1 font-medium">{format(new Date(lastRun.completedAt), "MMM d, h:mm a")}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Signals ({signals.length})</CardTitle>
          <CardDescription>
            {Object.entries(signalsByType).map(([type, count]) => `${type}: ${count}`).join(" · ") || "No active signals"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signalsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : signals.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {signals.map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Badge variant={
                        signal.signalType === "strong_buy" || signal.signalType === "buy" ? "default" :
                        signal.signalType === "strong_sell" || signal.signalType === "sell" ? "destructive" :
                        "secondary"
                      }>
                        {signal.signalType.replace("_", " ").toUpperCase()}
                      </Badge>
                      <div>
                        <p className="font-medium text-sm">{signal.playerName || signal.cardTitle || `Card #${signal.cardId}`}</p>
                        {signal.drivers && signal.drivers.length > 0 && (
                          <p className="text-xs text-muted-foreground">{signal.drivers[0]}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium">{signal.alphaScore}</p>
                      <p className="text-xs text-muted-foreground">{signal.confidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No active signals. Run the Alpha batch to generate signals.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface RebrandDryRunResponse {
  dryRun: true;
  alreadySentCount: number;
  eligibleCount: number;
  wouldSendCount: number;
  sampleRecipients: Array<string | null>;
}

interface RebrandSendResponse {
  dryRun: false;
  started: true;
  jobId: string;
  queued: number;
  alreadySentCount: number;
  eligibleCount: number;
}

interface RebrandStatusResponse {
  running: boolean;
  jobId: string | null;
  startedAt: string | null;
  lastFinishedAt: string | null;
  totalQueued: number;
  sentCount: number;
  failedCount: number;
  remaining: number;
  alreadySentCount: number;
  eligibleCount: number;
  error: string | null;
  // True from the moment an admin clicks "Cancel broadcast" until the worker
  // notices and exits. Used to disable the Cancel button so it can't be
  // clicked twice and to show a "stopping..." label while we wait.
  stopRequested: boolean;
  // Set on the most recent broadcast only when it ended early due to a cancel
  // request. The UI uses this to switch the result panel from "Last batch
  // result" to "Broadcast cancelled".
  cancelledAt: string | null;
}

interface RebrandEmailPreviewResponse {
  subject: string;
  html: string;
  text: string;
  // The hidden inbox-preview snippet (preheader). Surfaced separately so the
  // UI can display it as a faux Gmail/Apple Mail/Outlook row alongside the
  // subject — the in-body preheader markup is `display:none` so admins
  // otherwise have no way to QA what recipients see in their inbox list.
  preheader: string;
  previewedAs: {
    userId: string | null;
    name: string | null;
    email: string | null;
    kind: "admin" | "user" | "next";
  };
}

interface ScheduledEmailPreviewResponse {
  subject: string;
  html: string;
  text?: string;
  preheader: string;
  previewedAs: { name: string | null; email: string | null };
}

// Small presentational helper used by every email-preview modal. Renders the
// faux inbox row Gmail / Apple Mail / Outlook show next to the subject line:
//   From: HobbyAlpha   <subject>   <preheader>
// so admins can QA both pieces of inbox real estate (subject + hidden
// preheader) before sending. Kept as its own component so any future preview
// (welcome, payment-confirmation, etc.) gets a consistent look.
function InboxPreviewRow({
  subject,
  preheader,
  testIdPrefix,
}: {
  subject: string;
  preheader: string;
  testIdPrefix: string;
}) {
  return (
    <div
      className="rounded-md border bg-background p-3 text-sm"
      data-testid={`inbox-preview-${testIdPrefix}`}
    >
      <div className="text-xs text-muted-foreground mb-1">
        How this will look in the recipient's inbox list:
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className="font-semibold shrink-0"
          data-testid={`inbox-preview-${testIdPrefix}-from`}
        >
          HobbyAlpha
        </span>
        <span className="text-muted-foreground shrink-0">—</span>
        <span
          className="font-medium truncate"
          data-testid={`inbox-preview-${testIdPrefix}-subject`}
        >
          {subject}
        </span>
        <span className="text-muted-foreground shrink-0">—</span>
        <span
          className="text-muted-foreground truncate"
          data-testid={`inbox-preview-${testIdPrefix}-preheader`}
        >
          {preheader}
        </span>
      </div>
    </div>
  );
}

// Reusable card for the "preview + test send" pattern shared by the weekly
// digest and win-back announcement panels. The rebrand-announcement panel has
// its own bespoke flow (batch sizing, ledger, in-flight progress) and is not
// expressible through this component — these scheduled emails are simpler:
// no ledger, no batching, just "render against admin" + "send a sample to me".
function ScheduledEmailPreviewCard({
  title,
  description,
  previewEndpoint,
  testEndpoint,
  testIdPrefix,
  modalTitle,
  modalDescription,
}: {
  title: string;
  description: string;
  previewEndpoint: string;
  testEndpoint: string;
  testIdPrefix: string;
  modalTitle: string;
  modalDescription: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Lazy-load the rendered email preview only when the modal is open so we
  // don't render every panel's email on every Announcements tab visit.
  const previewQuery = useQuery<ScheduledEmailPreviewResponse>({
    queryKey: [previewEndpoint],
    enabled: open,
    staleTime: 60_000,
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      return (await apiRequest("POST", testEndpoint)) as {
        success: boolean;
        sentTo: string;
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Test email sent",
        description: `Delivered to ${data.sentTo}. Check your inbox.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Test send failed",
        description: err?.message || "Could not send the test email.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid={`card-${testIdPrefix}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setOpen(true)}
            variant="outline"
            data-testid={`button-${testIdPrefix}-preview-email`}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview email
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle data-testid={`text-${testIdPrefix}-preview-title`}>
              {modalTitle}
            </DialogTitle>
            <DialogDescription>
              {modalDescription} Test sends are clearly labeled in the UI and
              do not write to any "already sent" ledger — re-send as many
              times as you need.
            </DialogDescription>
          </DialogHeader>

          {previewQuery.isLoading && (
            <div
              className="flex items-center justify-center py-12"
              data-testid={`loading-${testIdPrefix}-preview`}
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {previewQuery.isError && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
              data-testid={`error-${testIdPrefix}-preview`}
            >
              Could not load the email preview.{" "}
              {(previewQuery.error as any)?.message || "Please try again."}
            </div>
          )}

          {previewQuery.data && (
            <div className="space-y-3">
              <InboxPreviewRow
                subject={previewQuery.data.subject}
                preheader={previewQuery.data.preheader}
                testIdPrefix={testIdPrefix}
              />
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span
                    className="font-medium"
                    data-testid={`text-${testIdPrefix}-subject`}
                  >
                    {previewQuery.data.subject}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Inbox preview:</span>{" "}
                  <span
                    className="font-medium"
                    data-testid={`text-${testIdPrefix}-preheader`}
                  >
                    {previewQuery.data.preheader}
                  </span>
                </div>
                {previewQuery.data.previewedAs.email && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Personalized for{" "}
                    {previewQuery.data.previewedAs.name || "(no name on file)"} &lt;
                    {previewQuery.data.previewedAs.email}&gt;
                  </div>
                )}
              </div>
              <iframe
                title={modalTitle}
                srcDoc={previewQuery.data.html}
                sandbox=""
                className="w-full h-[480px] rounded-md border bg-white"
                data-testid={`iframe-${testIdPrefix}-preview`}
              />
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid={`button-${testIdPrefix}-preview-close`}
            >
              Close
            </Button>
            <Button
              onClick={() => testSendMutation.mutate()}
              disabled={testSendMutation.isPending || !previewQuery.data}
              data-testid={`button-${testIdPrefix}-send-test`}
            >
              {testSendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test to me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AnnouncementsTab() {
  const { toast } = useToast();
  const [batchSize, setBatchSize] = useState(100);
  const [preview, setPreview] = useState<RebrandDryRunResponse | null>(null);
  // The batch size that was used for the most recent preview. The confirm-and-send
  // step uses this value (NOT the live input) so the admin can never accidentally
  // confirm a "send 100" preview while actually sending 1000.
  const [previewedBatch, setPreviewedBatch] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  // The text the admin types into the "preview as" input. We don't fire a
  // new preview on every keystroke — only when they click a button or use
  // the "Use next eligible recipient" shortcut, so previewTarget below is
  // the *committed* value the query actually requests.
  const [previewTargetInput, setPreviewTargetInput] = useState("");
  // What the preview is currently rendered against. `null` means the default
  // (admin's own account); `{ kind: "user", value }` means a specific
  // id/email; `{ kind: "next" }` means the "next eligible recipient" shortcut.
  const [previewTarget, setPreviewTarget] = useState<
    | { kind: "user"; value: string }
    | { kind: "next" }
    | null
  >(null);

  // Lazy-load the rendered email preview only when the modal is open so we
  // don't hammer the server on every Announcements tab visit. We use a
  // custom queryFn so the userId/email/nextEligible query params can be
  // appended without colliding with the default queryKey-as-path fetcher.
  const emailPreviewQuery = useQuery<RebrandEmailPreviewResponse>({
    queryKey: ["/api/admin/rebrand-announcement/preview", previewTarget],
    enabled: emailPreviewOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (previewTarget?.kind === "user") {
        // Heuristic: anything containing "@" is treated as an email lookup;
        // everything else is treated as a user id. Matches what the server
        // expects (?userId= or ?email=).
        if (previewTarget.value.includes("@")) {
          params.set("email", previewTarget.value);
        } else {
          params.set("userId", previewTarget.value);
        }
      } else if (previewTarget?.kind === "next") {
        params.set("nextEligible", "1");
      }
      const qs = params.toString();
      const url = qs
        ? `/api/admin/rebrand-announcement/preview?${qs}`
        : "/api/admin/rebrand-announcement/preview";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return (await res.json()) as RebrandEmailPreviewResponse;
    },
    retry: false,
  });

  // After the "next eligible recipient" shortcut resolves on the server,
  // mirror the resolved user back into the input box so the admin can see
  // (and copy/edit) which user the preview is rendered against. Without
  // this the input stays blank after clicking the shortcut, which is
  // confusing — the task explicitly asks the shortcut to "auto-fill the
  // next user the broadcast would send to".
  useEffect(() => {
    if (
      emailPreviewQuery.data?.previewedAs.kind === "next" &&
      emailPreviewQuery.data.previewedAs.email
    ) {
      setPreviewTargetInput(emailPreviewQuery.data.previewedAs.email);
    }
  }, [emailPreviewQuery.data]);

  const testSendMutation = useMutation({
    mutationFn: async () => {
      return (await apiRequest(
        "POST",
        "/api/admin/rebrand-announcement/test",
      )) as { success: boolean; sentTo: string };
    },
    onSuccess: (data) => {
      toast({
        title: "Test email sent",
        description: `Delivered to ${data.sentTo}. Check your inbox.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Test send failed",
        description: err?.message || "Could not send the test email.",
        variant: "destructive",
      });
    },
  });

  const clampedBatch = Math.max(1, Math.min(1000, Number.isFinite(batchSize) ? batchSize : 100));

  // If the admin edits the batch size after previewing, the preview is no longer
  // representative — clear it so a fresh preview is required before sending.
  useEffect(() => {
    if (previewedBatch !== null && clampedBatch !== previewedBatch) {
      setPreview(null);
      setPreviewedBatch(null);
    }
  }, [clampedBatch, previewedBatch]);

  const previewMutation = useMutation({
    mutationFn: async (limit: number) => {
      return (await apiRequest("POST", "/api/admin/rebrand-announcement", {
        dryRun: true,
        limit,
      })) as RebrandDryRunResponse;
    },
    onSuccess: (data, limit) => {
      setPreview(data);
      setPreviewedBatch(limit);
      // Intentionally do NOT clear lastResult here — we want the post-send result
      // panel to remain visible after the auto-refresh that follows a send.
    },
    onError: (err: any) => {
      toast({
        title: "Preview failed",
        description: err?.message || "Could not load eligible recipients.",
        variant: "destructive",
      });
    },
  });

  // Tracks the most recent broadcast we kicked off, so the polling status
  // query can identify when *our* job finishes (vs. a stale job that was
  // already running when the tab was opened) and we know when to flip from
  // "in-flight" UI to "done" UI.
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hasNotifiedFinish, setHasNotifiedFinish] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (limit: number) => {
      return (await apiRequest("POST", "/api/admin/rebrand-announcement", {
        dryRun: false,
        limit,
      })) as RebrandSendResponse;
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setHasNotifiedFinish(false);
      setConfirmOpen(false);
      // Force an immediate status refetch so the progress panel appears
      // instantly instead of waiting up to 1.5s for the next poll tick.
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/rebrand-announcement/status"],
      });
      toast({
        title: "Broadcast started",
        description: `${data.queued} email${data.queued === 1 ? "" : "s"} queued. Progress will update live below.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Send failed",
        description: err?.message || "Could not broadcast the announcement.",
        variant: "destructive",
      });
    },
  });

  // Poll the broadcast status. We always poll once on mount so a previously
  // started job (e.g. admin closed the tab and came back) is still visible.
  // While a job is running we poll every 1.5s; otherwise the query is idle.
  const statusQuery = useQuery<RebrandStatusResponse>({
    queryKey: ["/api/admin/rebrand-announcement/status"],
    refetchInterval: (query) => (query.state.data?.running ? 1500 : false),
    refetchOnWindowFocus: true,
  });

  const status = statusQuery.data;
  const isJobRunning = status?.running === true;
  const isStopRequested = status?.stopRequested === true;
  const wasCancelled = !!status?.cancelledAt && !status?.running;

  // Ask the worker to stop between recipients. Returns 409 if the worker has
  // already finished (e.g. the admin clicked just as the last send completed),
  // which we surface as a friendly toast rather than a destructive error.
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return (await apiRequest(
        "POST",
        "/api/admin/rebrand-announcement/cancel",
      )) as { cancelled: boolean; alreadyRequested: boolean; jobId: string };
    },
    onSuccess: (data) => {
      // Force an immediate poll so the UI flips to "stopping..." right away
      // instead of waiting up to 1.5s for the next scheduled status tick.
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/rebrand-announcement/status"],
      });
      toast({
        title: data.alreadyRequested ? "Cancel already requested" : "Cancel requested",
        description: data.alreadyRequested
          ? "Waiting for the worker to finish the current send and exit."
          : "The broadcast will stop after the current send finishes.",
      });
    },
    onError: (err: any) => {
      // The expected race here is the worker finishing the very last send
      // between the admin's click and the server processing the POST. The
      // cancel endpoint returns 409 in that case — surface that as a neutral
      // "already finished" toast rather than a scary destructive error,
      // since nothing actually went wrong.
      const message = String(err?.message || "");
      const isAlreadyDone = message.startsWith("409");
      // Either way, refresh the status so the UI reflects reality.
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/rebrand-announcement/status"],
      });
      toast({
        title: isAlreadyDone ? "Broadcast already finished" : "Cancel failed",
        description: isAlreadyDone
          ? "The worker had already processed the last recipient before your cancel reached the server."
          : message || "Could not cancel the broadcast.",
        variant: isAlreadyDone ? "default" : "destructive",
      });
    },
  });

  // When the broadcast we kicked off finishes, surface a single toast and
  // re-fetch the preview so the eligible/already-sent counts reflect the
  // updated ledger.
  useEffect(() => {
    if (!status) return;
    if (!activeJobId) return;
    if (status.jobId !== activeJobId) return;
    if (status.running) return;
    if (hasNotifiedFinish) return;
    setHasNotifiedFinish(true);
    const finishedByCancel = !!status.cancelledAt;
    toast({
      title: finishedByCancel ? "Broadcast cancelled" : "Broadcast finished",
      description: `${status.sentCount} sent, ${status.failedCount} failed${
        finishedByCancel ? `, ${status.remaining} skipped` : ""
      }${status.error ? ` — ${status.error}` : ""}.`,
      variant: status.error || status.failedCount > 0 ? "destructive" : "default",
    });
    if (previewedBatch !== null) {
      previewMutation.mutate(previewedBatch);
    }
  }, [status, activeJobId, hasNotifiedFinish, previewedBatch, previewMutation, toast]);

  const eligibleCount = preview?.eligibleCount ?? 0;
  const wouldSendCount = preview?.wouldSendCount ?? 0;

  const progressTotal = status?.totalQueued ?? 0;
  const progressDone = (status?.sentCount ?? 0) + (status?.failedCount ?? 0);
  const progressPct =
    progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Rename Announcement
          </CardTitle>
          <CardDescription>
            One-click broadcast of the "Sports Card Portfolio is now HobbyAlpha" email to every user
            with an email on file. A ledger prevents double-sends, so you can re-run safely in
            batches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
            <div className="flex-1 max-w-[200px]">
              <Label htmlFor="rebrand-batch-size">Batch size</Label>
              <Input
                id="rebrand-batch-size"
                type="number"
                min={1}
                max={1000}
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 0)}
                data-testid="input-rebrand-batch-size"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Between 1 and 1000. Default 100.
              </p>
            </div>
            <Button
              onClick={() => previewMutation.mutate(clampedBatch)}
              disabled={previewMutation.isPending}
              variant="outline"
              data-testid="button-rebrand-preview"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Preview eligible recipients
            </Button>
            <Button
              onClick={() => setEmailPreviewOpen(true)}
              variant="outline"
              data-testid="button-rebrand-preview-email"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview email
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={
                !preview ||
                wouldSendCount === 0 ||
                sendMutation.isPending ||
                isJobRunning
              }
              data-testid="button-rebrand-send"
            >
              {sendMutation.isPending || isJobRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {isJobRunning ? "Broadcast running..." : "Send to next batch"}
            </Button>
            {isJobRunning && (
              <Button
                onClick={() => cancelMutation.mutate()}
                disabled={
                  cancelMutation.isPending || isStopRequested
                }
                variant="destructive"
                data-testid="button-rebrand-cancel-broadcast"
              >
                {cancelMutation.isPending || isStopRequested ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                {isStopRequested ? "Stopping..." : "Cancel broadcast"}
              </Button>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border p-4 space-y-3" data-testid="panel-rebrand-preview">
              <h4 className="font-medium text-sm">Preview</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Already sent:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-already-sent">
                    {preview.alreadySentCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Eligible (not yet sent):</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-eligible">
                    {eligibleCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Will send this batch:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-would-send">
                    {wouldSendCount}
                  </span>
                </div>
              </div>
              {preview.sampleRecipients.length > 0 ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sample recipients</p>
                  <ul className="text-sm space-y-1" data-testid="list-rebrand-sample">
                    {preview.sampleRecipients.map((email, i) => (
                      <li
                        key={`${email ?? "unknown"}-${i}`}
                        className="font-mono text-xs"
                        data-testid={`text-rebrand-sample-${i}`}
                      >
                        {email ?? "(no email)"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No remaining recipients — everyone with an email has already been sent the
                  announcement.
                </p>
              )}
            </div>
          )}

          {status && (status.running || status.lastFinishedAt) && (
            <div
              className="rounded-lg border p-4 space-y-3 bg-muted/30"
              data-testid="panel-rebrand-result"
            >
              <h4 className="font-medium text-sm flex items-center gap-2">
                {status.running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span data-testid="text-rebrand-status-label">
                      {isStopRequested ? "Stopping broadcast..." : "Broadcast in progress"}
                    </span>
                  </>
                ) : wasCancelled ? (
                  <>
                    <X className="h-4 w-4 text-destructive" />
                    <span data-testid="text-rebrand-status-label">
                      Broadcast cancelled
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span data-testid="text-rebrand-status-label">
                      Last batch result
                    </span>
                  </>
                )}
              </h4>

              {status.totalQueued > 0 && (
                <div className="space-y-1" data-testid="panel-rebrand-progress">
                  <Progress value={progressPct} data-testid="progress-rebrand" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span data-testid="text-rebrand-progress-counts">
                      {progressDone} of {status.totalQueued} processed
                    </span>
                    <span data-testid="text-rebrand-progress-pct">
                      {progressPct}%
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Sent:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-sent">
                    {status.sentCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failed:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-failed">
                    {status.failedCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Remaining:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-remaining">
                    {status.remaining}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total sent overall:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-overall">
                    {status.alreadySentCount}
                  </span>
                </div>
              </div>

              {status.lastFinishedAt && !status.running && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="text-rebrand-finished-at"
                >
                  {wasCancelled ? "Cancelled" : "Finished"}{" "}
                  {format(new Date(status.lastFinishedAt), "MMM d, h:mm:ss a")}
                </p>
              )}

              {status.error && (
                <p
                  className="text-xs text-destructive"
                  data-testid="text-rebrand-error"
                >
                  Worker error: {status.error}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send rename announcement?</DialogTitle>
            <DialogDescription>
              This will email up to <strong>{wouldSendCount}</strong> recipient
              {wouldSendCount === 1 ? "" : "s"} from the eligible pool of{" "}
              <strong>{eligibleCount}</strong>. Already-emailed addresses are skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sendMutation.isPending}
              data-testid="button-rebrand-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => previewedBatch !== null && sendMutation.mutate(previewedBatch)}
              disabled={
                sendMutation.isPending ||
                wouldSendCount === 0 ||
                previewedBatch === null ||
                isJobRunning
              }
              data-testid="button-rebrand-confirm"
            >
              {sendMutation.isPending || isJobRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Confirm and send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailPreviewOpen} onOpenChange={setEmailPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle data-testid="text-rebrand-email-preview-title">
              Rename announcement email preview
            </DialogTitle>
            <DialogDescription>
              This is the exact rendered body recipients will receive, using the same
              template as the live broadcast. Pick a real recipient to confirm the
              greeting and one-click unsubscribe URL look right for the people who'll
              actually receive the email — by default the preview is rendered against
              your admin account.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <Label htmlFor="rebrand-preview-as" className="text-xs">
              Preview as user (id or email)
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="rebrand-preview-as"
                placeholder="user-123 or alice@example.com"
                value={previewTargetInput}
                onChange={(e) => setPreviewTargetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = previewTargetInput.trim();
                    if (v) setPreviewTarget({ kind: "user", value: v });
                  }
                }}
                data-testid="input-rebrand-preview-as"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const v = previewTargetInput.trim();
                  if (v) setPreviewTarget({ kind: "user", value: v });
                }}
                disabled={!previewTargetInput.trim() || emailPreviewQuery.isFetching}
                data-testid="button-rebrand-preview-as-apply"
              >
                Preview as user
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewTarget({ kind: "next" })}
                disabled={emailPreviewQuery.isFetching}
                data-testid="button-rebrand-preview-as-next"
              >
                Use next eligible recipient
              </Button>
              {previewTarget !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPreviewTarget(null);
                    setPreviewTargetInput("");
                  }}
                  disabled={emailPreviewQuery.isFetching}
                  data-testid="button-rebrand-preview-as-reset"
                >
                  Reset to admin
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Validates the chosen user exists and skips users who've opted out of
              announcement emails.
            </p>
          </div>

          {emailPreviewQuery.isLoading && (
            <div className="flex items-center justify-center py-12" data-testid="loading-rebrand-email-preview">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {emailPreviewQuery.isError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="error-rebrand-email-preview">
              Could not load the email preview.{" "}
              {(emailPreviewQuery.error as any)?.message || "Please try again."}
            </div>
          )}

          {emailPreviewQuery.data && (
            <div className="space-y-3">
              <InboxPreviewRow
                subject={emailPreviewQuery.data.subject}
                preheader={emailPreviewQuery.data.preheader}
                testIdPrefix="rebrand-email"
              />
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-email-subject">
                    {emailPreviewQuery.data.subject}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Inbox preview:</span>{" "}
                  <span className="font-medium" data-testid="text-rebrand-email-preheader">
                    {emailPreviewQuery.data.preheader}
                  </span>
                </div>
                <div
                  className="text-xs text-muted-foreground mt-1"
                  data-testid="text-rebrand-email-personalized-for"
                >
                  {emailPreviewQuery.data.previewedAs.kind === "admin" && (
                    <>Personalized for your admin account ({emailPreviewQuery.data.previewedAs.name || "(no name on file)"}{emailPreviewQuery.data.previewedAs.email ? <> &lt;{emailPreviewQuery.data.previewedAs.email}&gt;</> : null})</>
                  )}
                  {emailPreviewQuery.data.previewedAs.kind === "next" && (
                    <>Personalized for next eligible recipient: {emailPreviewQuery.data.previewedAs.name || "(no name on file)"}{emailPreviewQuery.data.previewedAs.email ? <> &lt;{emailPreviewQuery.data.previewedAs.email}&gt;</> : null} (id {emailPreviewQuery.data.previewedAs.userId})</>
                  )}
                  {emailPreviewQuery.data.previewedAs.kind === "user" && (
                    <>Personalized for {emailPreviewQuery.data.previewedAs.name || "(no name on file)"}{emailPreviewQuery.data.previewedAs.email ? <> &lt;{emailPreviewQuery.data.previewedAs.email}&gt;</> : null} (id {emailPreviewQuery.data.previewedAs.userId})</>
                  )}
                </div>
              </div>
              <iframe
                title="Rename announcement email preview"
                srcDoc={emailPreviewQuery.data.html}
                sandbox=""
                className="w-full h-[480px] rounded-md border bg-white"
                data-testid="iframe-rebrand-email-preview"
              />
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setEmailPreviewOpen(false)}
              data-testid="button-rebrand-email-preview-close"
            >
              Close
            </Button>
            <Button
              onClick={() => testSendMutation.mutate()}
              disabled={testSendMutation.isPending || !emailPreviewQuery.data}
              data-testid="button-rebrand-email-send-test"
            >
              {testSendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test to me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduledEmailPreviewCard
        title="Weekly Digest"
        description="The weekly collection summary that goes out on schedule. Use this to eyeball the rendered email — top movers, totals, unsubscribe footer — before the next scheduled run."
        previewEndpoint="/api/admin/weekly-digest/preview"
        testEndpoint="/api/admin/weekly-digest/test"
        testIdPrefix="weekly-digest"
        modalTitle="Weekly digest email preview"
        modalDescription="This is the exact rendered body recipients will receive, using the same template as the scheduled job. Sample collection data is used for illustration; personalization (greeting, unsubscribe link) is rendered against your admin account."
      />

      <ScheduledEmailPreviewCard
        title="Win-Back Email"
        description="The dormant-user re-engagement email triggered by the win-back job. Preview what users see when their watchlist moves and they haven't logged in for a week."
        previewEndpoint="/api/admin/win-back/preview"
        testEndpoint="/api/admin/win-back/test"
        testIdPrefix="win-back"
        modalTitle="Win-back email preview"
        modalDescription="This is the exact rendered body dormant users will receive, using the same template as the scheduled win-back job. Sample watchlist moves are used for illustration; personalization (greeting, unsubscribe link) is rendered against your admin account."
      />
    </div>
  );
}

function UnsubscribeEventsCard() {
  const { data: events, isLoading } = useQuery<UnsubscribeEvent[]>({
    queryKey: ["/api/admin/unsubscribe-events?limit=50"],
  });

  const formatRecipient = (e: UnsubscribeEvent): string => {
    if (e.user?.email) return e.user.email;
    if (e.email) return e.email;
    if (e.user?.handle) return `@${e.user.handle}`;
    if (e.userId) return `user ${e.userId.substring(0, 8)}…`;
    return "(unknown)";
  };

  const formatCategory = (cat: string | null): string => {
    if (!cat) return "—";
    return UNSUBSCRIBE_CATEGORY_LABELS[cat] ?? cat;
  };

  const formatSource = (src: string | null) => {
    if (!src) return { label: "—", color: "bg-gray-500" };
    return UNSUBSCRIBE_SOURCE_LABELS[src] ?? { label: src, color: "bg-gray-500" };
  };

  return (
    <Card data-testid="card-unsubscribe-events">
      <CardHeader>
        <CardTitle>Unsubscribe Audit Trail</CardTitle>
        <CardDescription>
          Recent opt-outs honored across HTTPS one-click links, the
          mailto fallback inbox, and the support CLI. Use this to
          answer deliverability disputes and CAN-SPAM compliance
          questions without querying the database directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <div className="divide-y">
              {events.map((event) => {
                const sourceInfo = formatSource(event.source);
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-3 text-sm"
                    data-testid={`unsubscribe-event-${event.id}`}
                  >
                    <div className={`h-2 w-2 rounded-full ${sourceInfo.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="font-medium truncate"
                          data-testid={`text-unsubscribe-recipient-${event.id}`}
                        >
                          {formatRecipient(event)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {formatCategory(event.category)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {sourceInfo.label}
                        </Badge>
                      </div>
                      {event.ipAddress && (
                        <p className="text-xs text-muted-foreground truncate">
                          IP: {event.ipAddress}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {event.createdAt &&
                        format(new Date(event.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No unsubscribe events recorded yet. They'll appear here as
              soon as a user opts out of any bulk email category.
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ActivityTab() {
  const { data: activity, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/admin/activity?limit=100"],
  });

  const { data: stats } = useQuery<ActivityStats>({
    queryKey: ["/api/admin/activity/stats?days=7"],
  });

  const getActivityLabel = (type: string) => {
    return ACTIVITY_TYPE_LABELS[type] || { label: type, color: "bg-gray-500" };
  };

  const formatMetadata = (metadata: Record<string, any> | null) => {
    if (!metadata) return "";
    const parts = [];
    if (metadata.playerName) parts.push(metadata.playerName);
    if (metadata.title) parts.push(metadata.title);
    if (metadata.name) parts.push(metadata.name);
    if (metadata.action) parts.push(`Action: ${metadata.action}`);
    if (metadata.amount) parts.push(`$${metadata.amount}`);
    return parts.join(" · ");
  };

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">7 Day Activity</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalActivities}</div>
            </CardContent>
          </Card>
          
          {Object.entries(stats.byType).slice(0, 3).map(([type, count]) => (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{getActivityLabel(type).label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 100 user activities across the platform</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="divide-y">
                {activity.map((log) => {
                  const typeInfo = getActivityLabel(log.activityType);
                  return (
                    <div key={log.id} className="flex items-center gap-4 p-4" data-testid={`activity-log-${log.id}`}>
                      <div className={`h-2 w-2 rounded-full ${typeInfo.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {typeInfo.label}
                          </Badge>
                          {log.userId && (
                            <span className="text-xs text-muted-foreground">
                              User: {log.userId.substring(0, 8)}...
                            </span>
                          )}
                          {!log.userId && (
                            <span className="text-xs text-muted-foreground">Anonymous</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {formatMetadata(log.metadata)}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.createdAt && format(new Date(log.createdAt), "MMM d, h:mm a")}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No activity recorded yet. Activity will appear here as users interact with the platform.
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function SupportTicketsTab() {
  const { toast } = useToast();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const { data: tickets, isLoading } = useQuery<SupportTicketWithRequester[]>({
    queryKey: ["/api/admin/support/tickets"],
  });

  const { data: selectedTicket, isLoading: ticketLoading } = useQuery<SupportTicketWithMessages>({
    queryKey: ["/api/support/tickets", selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/support/tickets/${selectedTicketId}/messages`, { body: replyBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      setReplyBody("");
      toast({ title: "Reply sent" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/admin/support/tickets/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      toast({ title: "Status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCount = tickets?.filter(t => t.status === "OPEN").length || 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Support Tickets
              {openCount > 0 && (
                <Badge variant="destructive" className="ml-2">{openCount} open</Badge>
              )}
            </CardTitle>
            <CardDescription>User questions and problems</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : tickets && tickets.length > 0 ? (
                <div className="divide-y">
                  {tickets.map(ticket => {
                    const statusConfig = TICKET_STATUS_CONFIG[ticket.status as SupportTicketStatus] || TICKET_STATUS_CONFIG.OPEN;
                    const StatusIcon = statusConfig.icon;
                    return (
                      <div
                        key={ticket.id}
                        className={`p-3 cursor-pointer hover-elevate ${selectedTicketId === ticket.id ? 'bg-primary/10' : ''}`}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        data-testid={`row-ticket-${ticket.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={statusConfig.variant} className="text-xs">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm truncate">{ticket.subject}</p>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <span>{ticket.requester.firstName || ticket.requester.handle || "User"}</span>
                          <span>·</span>
                          <span>{ticket.createdAt ? format(new Date(ticket.createdAt), "MMM d") : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No open tickets</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-2">
        <Card className="h-[580px] flex flex-col">
          {selectedTicketId && selectedTicket ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-lg" data-testid="text-ticket-subject">{selectedTicket.subject}</CardTitle>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      <span>From: {selectedTicket.requester.email || selectedTicket.requester.handle}</span>
                      <span>·</span>
                      <span>{selectedTicket.createdAt ? format(new Date(selectedTicket.createdAt), "MMM d, yyyy 'at' h:mm a") : ""}</span>
                    </CardDescription>
                  </div>
                  <Select
                    value={selectedTicket.status}
                    onValueChange={(status) => statusMutation.mutate({ id: selectedTicket.id, status })}
                  >
                    <SelectTrigger className="w-[160px]" data-testid="select-ticket-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="WAITING_ON_USER">Awaiting User</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={selectedTicket.requester.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {selectedTicket.requester.firstName?.[0] || selectedTicket.requester.handle?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {selectedTicket.requester.firstName && selectedTicket.requester.lastName
                                ? `${selectedTicket.requester.firstName} ${selectedTicket.requester.lastName}`
                                : selectedTicket.requester.handle || "User"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedTicket.createdAt && format(new Date(selectedTicket.createdAt), "MMM d 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-ticket-body">{selectedTicket.body}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedTicket.messages.map((message) => (
                    <Card 
                      key={message.id} 
                      className={message.isAdminReply ? "border-primary/30 bg-primary/5" : "bg-muted/50"}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.sender.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {message.sender.firstName?.[0] || message.sender.handle?.[0] || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {message.sender.firstName && message.sender.lastName
                                  ? `${message.sender.firstName} ${message.sender.lastName}`
                                  : message.sender.handle || "Unknown"}
                              </span>
                              {message.isAdminReply && (
                                <Badge variant="secondary" className="text-xs">Admin</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {message.createdAt && format(new Date(message.createdAt), "MMM d 'at' h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              {selectedTicket.status !== "CLOSED" && (
                <div className="p-4 border-t flex gap-2">
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={2}
                    className="flex-1"
                    data-testid="input-admin-reply"
                  />
                  <Button 
                    onClick={() => replyMutation.mutate()}
                    disabled={!replyBody.trim() || replyMutation.isPending}
                    data-testid="button-send-admin-reply"
                  >
                    {replyMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : ticketLoading ? (
            <CardContent className="flex-1 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          ) : (
            <CardContent className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Select a ticket to view details</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

function BlogTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostWithAuthor | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    contentFormat: "text" as "text" | "html",
    heroImageUrl: "",
    videoEmbeds: [] as Array<{ provider: string; url: string; caption?: string }>,
    isPublished: false,
  });

  const { data: posts, isLoading } = useQuery<BlogPostWithAuthor[]>({
    queryKey: ["/api/admin/blog"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/admin/blog", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Blog post created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return await apiRequest("PATCH", `/api/admin/blog/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Blog post updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/admin/blog/${id}/toggle-publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      toast({ title: "Publish status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/blog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setDeleteConfirmId(null);
      toast({ title: "Blog post deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      contentFormat: "text",
      heroImageUrl: "",
      videoEmbeds: [],
      isPublished: false,
    });
    setEditingPost(null);
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (post: BlogPostWithAuthor) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      contentFormat: (post.contentFormat as "text" | "html") || "text",
      heroImageUrl: post.heroImageUrl || "",
      videoEmbeds: post.videoEmbeds || [],
      isPublished: post.isPublished,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingPost) {
      updateMutation.mutate({ id: editingPost.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const addVideoEmbed = () => {
    setFormData(f => ({
      ...f,
      videoEmbeds: [...f.videoEmbeds, { provider: "youtube", url: "", caption: "" }],
    }));
  };

  const updateVideoEmbed = (index: number, field: string, value: string) => {
    setFormData(f => ({
      ...f,
      videoEmbeds: f.videoEmbeds.map((v, i) => i === index ? { ...v, [field]: value } : v),
    }));
  };

  const removeVideoEmbed = (index: number) => {
    setFormData(f => ({
      ...f,
      videoEmbeds: f.videoEmbeds.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Blog Posts</h3>
        <Button onClick={openNewDialog} data-testid="button-new-blog-post">
          <Plus className="h-4 w-4 mr-2" />
          New Post
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : posts && posts.length > 0 ? (
              <div className="divide-y">
                {posts.map((post) => (
                  <div key={post.id} className="flex items-center gap-4 p-4" data-testid={`row-blog-${post.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{post.title}</p>
                        <Badge variant={post.isPublished ? "default" : "secondary"}>
                          {post.isPublished ? "Published" : "Draft"}
                        </Badge>
                        {post.videoEmbeds && post.videoEmbeds.length > 0 && (
                          <Badge variant="outline">
                            <Video className="h-3 w-3 mr-1" />
                            {post.videoEmbeds.length} video{post.videoEmbeds.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">/{post.slug}</p>
                      {post.publishedAt && (
                        <p className="text-xs text-muted-foreground">
                          Published {format(new Date(post.publishedAt), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => togglePublishMutation.mutate(post.id)}
                        disabled={togglePublishMutation.isPending}
                        data-testid={`button-toggle-publish-${post.id}`}
                      >
                        {post.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(post)}
                        data-testid={`button-edit-blog-${post.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirmId(post.id)}
                        data-testid={`button-delete-blog-${post.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No blog posts yet</p>
                <p className="text-sm">Click "New Post" to create your first blog post</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } else { setDialogOpen(true); }}}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPost ? "Edit Blog Post" : "New Blog Post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setFormData(f => ({
                    ...f,
                    title,
                    slug: !editingPost ? generateSlug(title) : f.slug,
                  }));
                }}
                placeholder="My Blog Post Title"
                data-testid="input-blog-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData(f => ({ ...f, slug: e.target.value }))}
                placeholder="my-blog-post-title"
                data-testid="input-blog-slug"
              />
            </div>
            <div className="space-y-2">
              <Label>Excerpt (optional)</Label>
              <Textarea
                value={formData.excerpt}
                onChange={(e) => setFormData(f => ({ ...f, excerpt: e.target.value }))}
                placeholder="A short description of your post..."
                data-testid="input-blog-excerpt"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Content</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="content-format-toggle" className="text-sm text-muted-foreground">
                    {formData.contentFormat === "html" ? "HTML Mode" : "Plain Text"}
                  </Label>
                  <Switch
                    id="content-format-toggle"
                    checked={formData.contentFormat === "html"}
                    onCheckedChange={(checked) => setFormData(f => ({ ...f, contentFormat: checked ? "html" : "text" }))}
                    data-testid="switch-content-format"
                  />
                </div>
              </div>
              {formData.contentFormat === "html" && (
                <p className="text-xs text-muted-foreground">
                  Paste HTML content directly. Great for formatted text from ChatGPT.
                </p>
              )}
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(f => ({ ...f, content: e.target.value }))}
                placeholder={formData.contentFormat === "html" 
                  ? "Paste your HTML content here..." 
                  : "Write your blog post content here... Use [link text](url) for links."}
                className="min-h-[200px] font-mono"
                data-testid="input-blog-content"
              />
            </div>
            <div className="space-y-2">
              <Label>Hero Image (optional)</Label>
              <HeroImageUploader
                value={formData.heroImageUrl}
                onChange={(url) => setFormData(f => ({ ...f, heroImageUrl: url }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Video Embeds</Label>
                <Button size="sm" variant="outline" onClick={addVideoEmbed} data-testid="button-add-video">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Video
                </Button>
              </div>
              {formData.videoEmbeds.map((video, index) => (
                <div key={index} className="flex items-start gap-2 p-3 border rounded-md">
                  <div className="flex-1 space-y-2">
                    <Select
                      value={video.provider}
                      onValueChange={(v) => updateVideoEmbed(index, "provider", v)}
                    >
                      <SelectTrigger data-testid={`select-video-provider-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="vimeo">Vimeo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={video.url}
                      onChange={(e) => updateVideoEmbed(index, "url", e.target.value)}
                      placeholder="Video URL"
                      data-testid={`input-video-url-${index}`}
                    />
                    <Input
                      value={video.caption || ""}
                      onChange={(e) => updateVideoEmbed(index, "caption", e.target.value)}
                      placeholder="Caption (optional)"
                      data-testid={`input-video-caption-${index}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeVideoEmbed(index)}
                    data-testid={`button-remove-video-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.title || !formData.slug || !formData.content || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-blog-post"
            >
              {(createMutation.isPending || updateMutation.isPending) && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {editingPost ? "Update" : "Create"} Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Blog Post?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-blog"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------------------------------------------------------------------
// V2 Verdict Migration Tab
// ---------------------------------------------------------------------------
interface VMigDistribution {
  BUY: number; MONITOR: number; WATCH: number;
  AVOID: number; SELL: number; LONGSHOT_BET: number;
  total: number;
}
interface VMigBandValidation {
  key: string; actualPct: number; minPct: number; maxPct: number;
  inTolerance: boolean; delta: number;
}
interface VMigProgress {
  processedCount: number; totalCount: number; currentPlayerName: string;
  elapsedMs: number; estimatedRemainingMs: number; lastUpdatedAt: string;
  runningTally: { BUY: number; MONITOR: number; WATCH: number; AVOID: number; SELL: number; LONGSHOT_BET: number; errored: number };
}
interface VMigState {
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null; completedAt: string | null; forceMode: boolean;
  progress: VMigProgress | null;
  beforeDistribution: VMigDistribution | null;
  afterDistribution: VMigDistribution | null;
  bandValidation: VMigBandValidation[] | null;
  error: string | null; interruptedWarning: string | null;
}

function fmtDuration(ms: number): string {
  if (ms < 60000) return Math.round(ms / 1000) + "s";
  return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
}

interface VMigChunkResult {
  done: boolean;
  reason?: string;
  processedThisBatch: number;
  regeneratedThisBatch: number;
  unchangedThisBatch: number;
  erroredThisBatch: number;
  remainingCount: number;
  totalCount: number;
  cumulativeProcessed: number;
  runningTally: VMigProgress["runningTally"];
  startedAt: string | null;
  completedAt?: string | null;
  afterDistribution?: VMigDistribution | null;
  bandValidation?: VMigBandValidation[] | null;
}

function VerdictMigrationTab() {
  const [migState, setMigState] = useState<VMigState | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chunked-loop state
  const [chunkLoopActive, setChunkLoopActive] = useState(false);
  const [chunkBatchSize, setChunkBatchSize] = useState(5);
  const [lastChunkResult, setLastChunkResult] = useState<VMigChunkResult | null>(null);
  const [chunkConsecutiveErrors, setChunkConsecutiveErrors] = useState(0);
  const loopActiveRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/migrate-verdicts-v2/status");
      if (res.ok) { const d = await res.json(); setMigState(d); return d; }
    } catch {}
    return null;
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = (migState?.status === "running" || chunkLoopActive) ? 5000 : 30000;
    pollRef.current = setInterval(fetchStatus, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [migState?.status, chunkLoopActive, fetchStatus]);

  const triggerMigration = async (force: boolean) => {
    const msg = force
      ? "Force-regenerate ALL entries? This overwrites all existing verdicts and may take hours. May die mid-run on autoscale -- prefer the Chunked button instead."
      : "Run V2 migration (legacy fire-and-forget mode)? May die mid-run on autoscale -- prefer the Chunked button instead.";
    if (!confirm(msg)) return;
    setLoading(true); setTriggerError(null);
    try {
      await apiRequest("POST", `/api/admin/migrate-verdicts-v2?force=${String(force)}`);
      await fetchStatus();
    } catch (e: any) { setTriggerError(e.message ?? "Network error"); }
    finally { setLoading(false); }
  };

  const runOneChunk = useCallback(async (size: number): Promise<VMigChunkResult | null> => {
    try {
      const res = await fetch(`/api/admin/migrate-verdicts-v2/chunk?size=${size}`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return (await res.json()) as VMigChunkResult;
    } catch (err: any) {
      console.error("[ChunkedMigration] chunk error:", err);
      return null;
    }
  }, []);

  const startChunkedLoop = useCallback(async () => {
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;
    setChunkLoopActive(true);
    setTriggerError(null);
    setChunkConsecutiveErrors(0);
    let consecutiveErrors = 0;

    while (loopActiveRef.current) {
      const result = await runOneChunk(chunkBatchSize);
      if (!result) {
        consecutiveErrors++;
        setChunkConsecutiveErrors(consecutiveErrors);
        if (consecutiveErrors >= 3) {
          setTriggerError("3 consecutive chunk failures -- loop stopped. Click Resume to retry.");
          loopActiveRef.current = false;
          setChunkLoopActive(false);
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      consecutiveErrors = 0;
      setChunkConsecutiveErrors(0);
      setLastChunkResult(result);
      await fetchStatus();
      if (result.done) {
        loopActiveRef.current = false;
        setChunkLoopActive(false);
        break;
      }
      if (result.reason === "Chunk already running") {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, [chunkBatchSize, runOneChunk, fetchStatus]);

  const pauseChunkedLoop = useCallback(() => {
    loopActiveRef.current = false;
    setChunkLoopActive(false);
  }, []);

  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
    };
  }, []);

  const VKEYS = ["BUY", "MONITOR", "WATCH", "AVOID", "SELL", "LONGSHOT_BET"] as const;
  const isIdle = !migState || migState.status === "idle" || migState.status === "complete" || migState.status === "error";
  const totalToProcess = migState?.progress?.totalCount ?? lastChunkResult?.totalCount ?? 0;
  const cumProcessed = migState?.progress?.processedCount ?? lastChunkResult?.cumulativeProcessed ?? 0;
  const remaining = lastChunkResult?.remainingCount ?? Math.max(0, totalToProcess - cumProcessed);
  const chunkPct = totalToProcess > 0 ? Math.round((cumProcessed / totalToProcess) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold mb-1">V2 Verdict Migration</h2>
        <p className="text-sm text-muted-foreground">Reclassify all player_outlook_cache entries under the V2 waterfall engine. <strong>Use Chunked mode</strong> -- it survives autoscale instance kills by processing a few entries per HTTP request.</p>
      </div>

      {migState?.interruptedWarning && (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-sm text-yellow-800">
          <strong>Warning:</strong> {migState.interruptedWarning}
        </div>
      )}
      {triggerError && (
        <div className="bg-red-50 border border-red-300 rounded p-3 text-sm text-red-700">{triggerError}</div>
      )}

      {/* Chunked migration controls (PRIMARY PATH) */}
      <div className="border-2 border-blue-300 rounded p-4 space-y-3 bg-blue-50/50">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-blue-900">Chunked Migration (recommended)</div>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-blue-900">Batch size:</label>
            <select
              value={chunkBatchSize}
              onChange={(e) => setChunkBatchSize(Number(e.target.value))}
              disabled={chunkLoopActive}
              className="border border-blue-300 rounded px-2 py-1 bg-white"
              data-testid="select-chunk-batch-size"
            >
              {[1,2,3,5,7,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-blue-800">
          Processes {chunkBatchSize} entries per HTTP request, then loops automatically. Browser tab must stay open. Survives instance kills (next click resumes from DB state).
        </p>
        <div className="flex gap-3 flex-wrap items-center">
          {!chunkLoopActive ? (
            <Button onClick={startChunkedLoop} disabled={loading} data-testid="button-start-chunked-migration">
              <RefreshCw className="h-4 w-4 mr-2" />
              {lastChunkResult && !lastChunkResult.done ? "Resume Chunked Migration" : "Start Chunked Migration"}
            </Button>
          ) : (
            <Button onClick={pauseChunkedLoop} variant="outline" data-testid="button-pause-chunked-migration">
              Pause (current chunk will finish)
            </Button>
          )}
          {chunkConsecutiveErrors > 0 && (
            <span className="text-xs text-orange-700">Consecutive errors: {chunkConsecutiveErrors}/3</span>
          )}
        </div>
        {(chunkLoopActive || lastChunkResult) && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-blue-900">
              {chunkLoopActive && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span>Cumulative <strong>{cumProcessed}</strong> / <strong>{totalToProcess}</strong> ({chunkPct}%) &middot; Remaining: <strong>{remaining}</strong></span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: chunkPct + "%" }} />
            </div>
            {lastChunkResult && (
              <div className="text-xs text-blue-700 font-mono">
                Last batch: regen={lastChunkResult.regeneratedThisBatch} unchanged={lastChunkResult.unchangedThisBatch} errored={lastChunkResult.erroredThisBatch}
                {" | "}Tally: BUY:{lastChunkResult.runningTally.BUY} MON:{lastChunkResult.runningTally.MONITOR} AVD:{lastChunkResult.runningTally.AVOID} SEL:{lastChunkResult.runningTally.SELL} LONG:{lastChunkResult.runningTally.LONGSHOT_BET} ERR:{lastChunkResult.runningTally.errored}
              </div>
            )}
            {migState?.progress?.currentPlayerName && (
              <div className="text-xs text-blue-700">Last processed: <em>{migState.progress.currentPlayerName}</em></div>
            )}
          </div>
        )}
      </div>

      {isIdle && (
        <div className="flex gap-3 flex-wrap items-center pt-2 border-t">
          <span className="text-xs text-muted-foreground">Legacy fire-and-forget (may die on autoscale):</span>
          <Button onClick={() => triggerMigration(false)} disabled={loading} variant="outline" size="sm">
            {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Run V2 Migration (legacy)
          </Button>
          <Button variant="outline" size="sm" className="text-orange-600 border-orange-300 hover:bg-orange-50"
            onClick={() => triggerMigration(true)} disabled={loading}>
            Force Regenerate All
          </Button>
        </div>
      )}

      {migState?.status === "running" && migState.progress && (
        <div className="border rounded p-4 space-y-3 bg-blue-50">
          <div className="flex items-center gap-2 font-semibold text-blue-800">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Migration running{migState.forceMode ? " (force mode)" : ""}
          </div>
          <div className="text-sm text-blue-700">
            Player <strong>{migState.progress.processedCount}</strong> of <strong>{migState.progress.totalCount}</strong>
            {migState.progress.currentPlayerName ? <> &mdash; <em>{migState.progress.currentPlayerName}</em></> : null}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: (migState.progress.totalCount > 0 ? Math.round(migState.progress.processedCount / migState.progress.totalCount * 100) : 0) + "%" }} />
          </div>
          <div className="flex gap-4 flex-wrap text-xs text-blue-600">
            <span>Elapsed: {fmtDuration(migState.progress.elapsedMs)}</span>
            {migState.progress.estimatedRemainingMs > 0 && <span>Remaining ~{fmtDuration(migState.progress.estimatedRemainingMs)}</span>}
            <span>Updated: {new Date(migState.progress.lastUpdatedAt).toLocaleTimeString()}</span>
          </div>
          <div className="text-xs text-blue-700 font-mono">
            BUY:{migState.progress.runningTally.BUY} MON:{migState.progress.runningTally.MONITOR} WAT:{migState.progress.runningTally.WATCH} AVD:{migState.progress.runningTally.AVOID} SEL:{migState.progress.runningTally.SELL} LONG:{migState.progress.runningTally.LONGSHOT_BET} ERR:{migState.progress.runningTally.errored}
          </div>
          <p className="text-xs text-muted-foreground">Safe to close browser -- job continues server-side.</p>
        </div>
      )}

      {migState?.status === "complete" && migState.beforeDistribution && migState.afterDistribution && (
        <div className="space-y-4">
          <div className="text-green-700 font-semibold">
            Migration complete -- {migState.completedAt ? new Date(migState.completedAt).toLocaleString() : ""}
          </div>
          <div className="border rounded overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-muted"><tr>
                <th className="text-left p-2 font-medium">Verdict</th>
                <th className="text-right p-2 font-medium">Before</th>
                <th className="text-right p-2 font-medium">After</th>
                <th className="text-right p-2 font-medium">Delta</th>
              </tr></thead>
              <tbody>
                {VKEYS.map((v) => {
                  const b = (migState.beforeDistribution as any)[v] as number;
                  const a = (migState.afterDistribution as any)[v] as number;
                  const d = a - b;
                  return (
                    <tr key={v} className="border-t">
                      <td className="p-2 font-mono text-xs">{v}</td>
                      <td className="p-2 text-right">{b}</td>
                      <td className="p-2 text-right font-semibold">{a}</td>
                      <td className={"p-2 text-right " + (d > 0 ? "text-green-600" : d < 0 ? "text-red-600" : "text-muted-foreground")}>
                        {d > 0 ? "+" + d : d}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-muted/50 font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2 text-right">{migState.beforeDistribution.total}</td>
                  <td className="p-2 text-right">{migState.afterDistribution.total}</td>
                  <td className="p-2 text-right text-muted-foreground">--</td>
                </tr>
              </tbody>
            </table>
          </div>
          {migState.bandValidation && (
            <div className="border rounded overflow-hidden text-sm">
              <div className="bg-muted p-2 font-medium">Band Validation (target +/-5pp)</div>
              <table className="w-full">
                <thead className="bg-muted/50"><tr>
                  <th className="text-left p-2">Band</th>
                  <th className="text-right p-2">Target</th>
                  <th className="text-right p-2">Actual</th>
                  <th className="text-center p-2">Status</th>
                </tr></thead>
                <tbody>
                  {migState.bandValidation.map((b) => (
                    <tr key={b.key} className="border-t">
                      <td className="p-2 font-mono text-xs">{b.key}</td>
                      <td className="p-2 text-right text-muted-foreground">{b.minPct}-{b.maxPct}%</td>
                      <td className="p-2 text-right font-semibold">{b.actualPct}%</td>
                      <td className="p-2 text-center">
                        {b.inTolerance
                          ? <span className="text-green-600 font-bold">&#x2713;</span>
                          : <span className="text-red-600 font-bold">&#x2717; ({b.delta > 0 ? "+" : ""}{b.delta}pp)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => triggerMigration(false)}>Re-run (skip migrated)</Button>
            <Button variant="outline" size="sm" className="text-orange-600 border-orange-300" onClick={() => triggerMigration(true)}>Force Re-run All</Button>
          </div>
        </div>
      )}

      {migState?.status === "error" && (
        <div className="bg-red-50 border border-red-300 rounded p-4 text-red-700 text-sm">
          <strong>Migration failed:</strong> {migState.error}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteCaseConfirm, setDeleteCaseConfirm] = useState<{ id: number; name: string } | null>(null);
  
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    retry: false,
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUserSummary[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState<"all" | "pro" | "free" | "trial" | "promo" | "admin">("all");
  const [userActivityFilter, setUserActivityFilter] = useState<"all" | "never" | "7d" | "30d" | "stale30">("all");
  const [userSortBy, setUserSortBy] = useState<"recent_login" | "most_logins" | "newest" | "least_active">("recent_login");

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = userSearch.trim().toLowerCase();
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    let list = users.filter((u) => {
      if (q) {
        const hay = [
          u.email,
          u.handle,
          u.firstName,
          u.lastName,
          u.id,
          ...u.promoCodes.map((p) => p.code),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      switch (userPlanFilter) {
        case "pro":
          if (u.subscriptionStatus !== "PRO") return false;
          break;
        case "free":
          if (u.subscriptionStatus === "PRO") return false;
          break;
        case "trial":
          if (!u.isOnTrial) return false;
          break;
        case "promo":
          if (u.promoCodes.length === 0) return false;
          break;
        case "admin":
          if (!u.isAdmin) return false;
          break;
      }

      const last = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : null;
      switch (userActivityFilter) {
        case "never":
          if (last !== null) return false;
          break;
        case "7d":
          if (last === null || now - last > 7 * DAY) return false;
          break;
        case "30d":
          if (last === null || now - last > 30 * DAY) return false;
          break;
        case "stale30":
          if (last !== null && now - last <= 30 * DAY) return false;
          break;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      if (userSortBy === "most_logins") {
        return (b.loginCount ?? 0) - (a.loginCount ?? 0);
      }
      if (userSortBy === "newest") {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }
      if (userSortBy === "least_active") {
        const ta = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const tb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        return ta - tb;
      }
      const ta = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const tb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return tb - ta;
    });

    return list;
  }, [users, userSearch, userPlanFilter, userActivityFilter, userSortBy]);

  const { data: displayCases, isLoading: casesLoading } = useQuery<DisplayCaseWithOwner[]>({
    queryKey: ["/api/admin/display-cases"],
    retry: false,
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ userId, subscriptionStatus }: { userId: string; subscriptionStatus: string }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/subscription`, { subscriptionStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: variables.subscriptionStatus === "PRO" ? "User Upgraded" : "User Downgraded",
        description: `User subscription updated to ${variables.subscriptionStatus}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user subscription",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/display-cases"] });
      setDeleteUserConfirm(null);
      toast({ title: "User Deleted", description: "User and all their data have been removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async (caseId: number) => {
      return await apiRequest("DELETE", `/api/admin/display-cases/${caseId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setDeleteCaseConfirm(null);
      toast({ title: "Display Case Deleted", description: "Display case and all cards have been removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete display case", variant: "destructive" });
    },
  });

  const handleUpdateSubscription = (userId: string, status: string) => {
    updateSubscriptionMutation.mutate({ userId, subscriptionStatus: status });
  };

  const handleDeleteUser = (userId: string) => {
    const user = users?.find(u => u.id === userId);
    const name = user?.handle ? `@${user.handle}` : user?.email || "Unknown User";
    setDeleteUserConfirm({ id: userId, name });
  };

  const handleDeleteCase = (caseId: number) => {
    const dc = displayCases?.find(c => c.id === caseId);
    setDeleteCaseConfirm({ id: caseId, name: dc?.name || "Unknown Case" });
  };

  if (statsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>Return to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users and monitor platform activity</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {statsLoading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : stats ? (
            <>
              <StatCard
                title="Total Users"
                value={stats.totalUsers}
                icon={Users}
                description="Registered users"
              />
              <StatCard
                title="Pro Users"
                value={stats.proUsers}
                icon={CreditCard}
                description="Paid subscribers"
              />
              <StatCard
                title="Display Cases"
                value={stats.totalDisplayCases}
                icon={LayoutGrid}
                description="Total collections"
              />
              <StatCard
                title="Total Cards"
                value={stats.totalCards}
                icon={Image}
                description="Cards uploaded"
              />
            </>
          ) : null}
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users">Users ({users?.length || 0})</TabsTrigger>
            <TabsTrigger value="cases" data-testid="tab-cases">Display Cases ({displayCases?.length || 0})</TabsTrigger>
            <TabsTrigger value="registry" data-testid="tab-registry">
              <Database className="h-4 w-4 mr-1" />
              Player Registry
            </TabsTrigger>
            <TabsTrigger value="blog" data-testid="tab-blog">
              <FileText className="h-4 w-4 mr-1" />
              Blog
            </TabsTrigger>
            <TabsTrigger value="outlook" data-testid="tab-outlook">
              <Globe className="h-4 w-4 mr-1" />
              Outlook SEO
            </TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-support">
              <MessageCircle className="h-4 w-4 mr-1" />
              Support
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Clock className="h-4 w-4 mr-1" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="alpha" data-testid="tab-alpha">
              <Zap className="h-4 w-4 mr-1" />
              Alpha Engine
            </TabsTrigger>
                <TabsTrigger value="migration" data-testid="tab-migration">
                  V2 Migration
                </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>
                  Manage platform users and their subscriptions
                  {users && (
                    <span className="ml-2 text-xs" data-testid="text-user-result-count">
                      · Showing {filteredUsers.length} of {users.length}
                    </span>
                  )}
                </CardDescription>
                <div className="flex flex-col md:flex-row gap-2 pt-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by email, handle, name, or promo code..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-8"
                      data-testid="input-user-search"
                    />
                  </div>
                  <Select value={userPlanFilter} onValueChange={(v) => setUserPlanFilter(v as typeof userPlanFilter)}>
                    <SelectTrigger className="w-full md:w-[160px]" data-testid="select-user-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All plans</SelectItem>
                      <SelectItem value="pro">Pro only</SelectItem>
                      <SelectItem value="free">Free only</SelectItem>
                      <SelectItem value="trial">On trial</SelectItem>
                      <SelectItem value="promo">Used promo code</SelectItem>
                      <SelectItem value="admin">Admins</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={userActivityFilter} onValueChange={(v) => setUserActivityFilter(v as typeof userActivityFilter)}>
                    <SelectTrigger className="w-full md:w-[170px]" data-testid="select-user-activity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any activity</SelectItem>
                      <SelectItem value="7d">Active last 7 days</SelectItem>
                      <SelectItem value="30d">Active last 30 days</SelectItem>
                      <SelectItem value="stale30">Inactive 30+ days</SelectItem>
                      <SelectItem value="never">Never logged in</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={userSortBy} onValueChange={(v) => setUserSortBy(v as typeof userSortBy)}>
                    <SelectTrigger className="w-full md:w-[170px]" data-testid="select-user-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent_login">Most recent login</SelectItem>
                      <SelectItem value="most_logins">Most logins</SelectItem>
                      <SelectItem value="newest">Newest signup</SelectItem>
                      <SelectItem value="least_active">Least active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {usersLoading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <UserRow key={user.id} user={user} onUpdateSubscription={handleUpdateSubscription} onDelete={handleDeleteUser} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground" data-testid="text-no-users">
                      {users && users.length > 0 ? "No users match your filters" : "No users found"}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases">
            <Card>
              <CardHeader>
                <CardTitle>All Display Cases</CardTitle>
                <CardDescription>View all display cases across the platform</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {casesLoading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : displayCases && displayCases.length > 0 ? (
                    displayCases.map((displayCase) => (
                      <DisplayCaseRow key={displayCase.id} displayCase={displayCase} onDelete={handleDeleteCase} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No display cases found
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registry">
            <PlayerRegistryTab />
          </TabsContent>

          <TabsContent value="blog">
            <BlogTab />
          </TabsContent>

          <TabsContent value="outlook">
            <OutlookSEOTab />
          </TabsContent>

          <TabsContent value="support">
            <SupportTicketsTab />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab />
          </TabsContent>

          <TabsContent value="alpha">
            <AlphaEngineTab />
          </TabsContent>
            <TabsContent value="migration">
              <VerdictMigrationTab />
            </TabsContent>
        </Tabs>
      </div>

      <Dialog open={deleteUserConfirm !== null} onOpenChange={() => setDeleteUserConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteUserConfirm?.name}</strong> and all their data including display cases, cards, and activity. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserConfirm && deleteUserMutation.mutate(deleteUserConfirm.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteCaseConfirm !== null} onOpenChange={() => setDeleteCaseConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Display Case?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteCaseConfirm?.name}</strong> and all its cards. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCaseConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCaseConfirm && deleteCaseMutation.mutate(deleteCaseConfirm.id)}
              disabled={deleteCaseMutation.isPending}
              data-testid="button-confirm-delete-case"
            >
              {deleteCaseMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
