import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Users, LayoutGrid, CreditCard, Image, Crown, UserMinus, Database, Search, Plus, Pencil, Trash2, Upload, RefreshCw, ChevronLeft, ChevronRight, FileText, Eye, EyeOff, Video } from "lucide-react";
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
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, DisplayCaseWithCards, PlayerRegistry, BlogPostWithAuthor } from "@shared/schema";

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

function UserRow({ user, onUpdateSubscription, onDelete }: { user: User; onUpdateSubscription: (userId: string, status: string) => void; onDelete: (userId: string) => void }) {
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
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {user.isAdmin && (
          <Badge variant="default">Admin</Badge>
        )}
        <Badge variant={isPro ? "default" : "secondary"}>
          {user.subscriptionStatus || "FREE"}
        </Badge>
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerRegistry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

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
    limit: "25",
    ...(sportFilter !== "all" && { sport: sportFilter }),
    ...(tierFilter !== "all" && { roleTier: tierFilter }),
    ...(searchQuery && { search: searchQuery })
  });

  const { data, isLoading, refetch } = useQuery<PlayersResponse>({
    queryKey: ["/api/admin/registry/players", page, sportFilter, tierFilter, searchQuery],
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
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                data-testid="button-import-csv"
              >
                {importMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Import CSV
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
                Showing {((page - 1) * 25) + 1}-{Math.min(page * 25, data.pagination.total)} of {data.pagination.total}
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
              <Label>Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(f => ({ ...f, content: e.target.value }))}
                placeholder="Write your blog post content here..."
                className="min-h-[200px]"
                data-testid="input-blog-content"
              />
            </div>
            <div className="space-y-2">
              <Label>Hero Image URL (optional)</Label>
              <Input
                value={formData.heroImageUrl}
                onChange={(e) => setFormData(f => ({ ...f, heroImageUrl: e.target.value }))}
                placeholder="https://example.com/image.jpg"
                data-testid="input-blog-hero-image"
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

export default function AdminDashboard() {
  const { toast } = useToast();
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteCaseConfirm, setDeleteCaseConfirm] = useState<{ id: number; name: string } | null>(null);
  
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    retry: false,
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

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
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage platform users and their subscriptions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {usersLoading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : users && users.length > 0 ? (
                    users.map((user) => (
                      <UserRow key={user.id} user={user} onUpdateSubscription={handleUpdateSubscription} onDelete={handleDeleteUser} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No users found
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
