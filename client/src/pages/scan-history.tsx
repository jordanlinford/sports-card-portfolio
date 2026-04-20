import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Zap,
  ShoppingCart,
  TrendingDown,
  Eye,
  Clock,
  Trophy,
  MinusCircle,
  Camera,
  FolderPlus,
  RefreshCw,
  Crown,
  Plus,
  FolderOpen,
  Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScanHistory, DisplayCase } from "@shared/schema";

const PAGE_SIZE = 20;

function getActionIcon(action: string | null) {
  switch (action) {
    case "BUY": return <ShoppingCart className="h-3 w-3" />;
    case "SELL": return <TrendingDown className="h-3 w-3" />;
    case "MONITOR": return <Eye className="h-3 w-3" />;
    case "LONG_HOLD": return <Clock className="h-3 w-3" />;
    case "LEGACY_HOLD": return <Trophy className="h-3 w-3" />;
    case "LITTLE_VALUE": return <MinusCircle className="h-3 w-3" />;
    default: return null;
  }
}

function getActionColor(action: string | null) {
  switch (action) {
    case "BUY": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "SELL": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
    case "LONG_HOLD": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "LEGACY_HOLD": return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "LITTLE_VALUE": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getActionLabel(action: string | null): string {
  switch (action) {
    case "BUY": return "BUY";
    case "SELL": return "SELL";
    case "MONITOR": return "MONITOR";
    case "LONG_HOLD": return "LONG HOLD";
    case "LEGACY_HOLD": return "LEGACY HOLD";
    case "LITTLE_VALUE": return "LOW VALUE";
    default: return action ?? "";
  }
}

type ScanHistoryResponse = {
  items: ScanHistory[];
  total: number;
  limit: number;
  offset: number;
  isPro?: boolean;
  totalAll?: number;
};

function ScanHistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-12 rounded-md flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ScanHistoryItem({
  scan,
  onDelete,
  onReAnalyze,
  onAddToCollection,
}: {
  scan: ScanHistory;
  onDelete: (id: number) => void;
  onReAnalyze: (scan: ScanHistory) => void;
  onAddToCollection: (scan: ScanHistory) => void;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const cardTitle = [
    scan.year,
    scan.setName,
    scan.playerName,
    scan.variation,
  ]
    .filter(Boolean)
    .join(" ");

  const subtitle = [
    scan.grade && scan.grader !== "raw"
      ? `${scan.grader || ""} ${scan.grade}`.trim()
      : scan.grade === "raw" || scan.grader === "raw"
        ? "Raw"
        : null,
    scan.cardNumber ? `#${scan.cardNumber}` : null,
    scan.sport,
  ]
    .filter(Boolean)
    .join(" \u2022 ");

  return (
    <>
      <Card className="hover-elevate" data-testid={`scan-history-item-${scan.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-14 h-[72px] rounded-md bg-muted flex items-center justify-center overflow-hidden">
              {scan.imagePath && !imgFailed ? (
                <img
                  src={scan.imagePath}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3
                className="font-medium text-sm line-clamp-2"
                data-testid={`text-scan-title-${scan.id}`}
              >
                {cardTitle || "Unknown Card"}
              </h3>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {subtitle}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {scan.marketValue != null && (
                  <span
                    className="text-sm font-semibold"
                    data-testid={`text-scan-value-${scan.id}`}
                  >
                    ${scan.marketValue.toFixed(2)}
                  </span>
                )}
                {scan.action && (
                  <Badge
                    className={`${getActionColor(scan.action)} flex items-center gap-1 text-xs`}
                    data-testid={`badge-scan-action-${scan.id}`}
                  >
                    {getActionIcon(scan.action)}
                    {getActionLabel(scan.action)}
                  </Badge>
                )}
                {scan.scanConfidence && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {scan.scanConfidence}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {scan.createdAt
                  ? new Date(scan.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Unknown date"}
              </p>
            </div>

            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReAnalyze(scan)}
                data-testid={`button-reanalyze-${scan.id}`}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Analyze</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddToCollection(scan)}
                data-testid={`button-add-collection-${scan.id}`}
              >
                <FolderPlus className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Add</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                data-testid={`button-delete-scan-${scan.id}`}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this scan from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(scan.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ScanHistoryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(0);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedScan, setSelectedScan] = useState<ScanHistory | null>(null);
  const autoOpenedIdRef = useRef<string | null>(null);

  const offset = page * PAGE_SIZE;

  // Read ?open=<scanHistoryId> so toasts / the scan indicator can deep-link
  // straight into a specific scan's detail view.
  const autoOpenScanId = (() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("open");
    return raw && /^\d+$/.test(raw) ? raw : null;
  })();

  const { data, isLoading } = useQuery<ScanHistoryResponse>({
    queryKey: ['/api/scan-history', page],
    queryFn: async () => {
      const res = await fetch(`/api/scan-history?limit=${PAGE_SIZE}&offset=${offset}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch scan history');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: displayCases } = useQuery<DisplayCase[]>({
    queryKey: ['/api/display-cases'],
    enabled: !!user && addDialogOpen,
  });

  const addToExistingMutation = useMutation({
    mutationFn: async ({ caseId, scan }: { caseId: number; scan: ScanHistory }) => {
      const title = [scan.playerName, scan.year, scan.setName].filter(Boolean).join(" ");
      await apiRequest("POST", `/api/display-cases/${caseId}/cards`, {
        title: title || "Unknown Card",
        playerName: scan.playerName || null,
        year: scan.year ? Number(scan.year) : null,
        set: scan.setName || null,
        variation: scan.variation || null,
        grade: scan.grade || null,
        grader: scan.grader === "raw" ? null : (scan.grader || null),
        cardNumber: scan.cardNumber || null,
        sport: scan.sport || null,
        imagePath: scan.imagePath || null,
        estimatedValue: scan.marketValue || null,
        cardCategory: "sports" as const,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/display-cases'] });
      setAddDialogOpen(false);
      setSelectedScan(null);
      toast({ title: "Card added", description: "Added to your collection." });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("409") || msg.includes("already") || msg.includes("duplicate")) {
        toast({ title: "Already added", description: "This card is already in that collection." });
      } else {
        toast({ title: "Error", description: "Failed to add card.", variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/scan-history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scan-history'] });
      toast({ title: "Scan deleted", description: "Removed from your scan history." });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete scan.",
        variant: "destructive",
      });
    },
  });

  const handleReAnalyze = (scan: ScanHistory) => {
    const params = new URLSearchParams();
    if (scan.playerName) params.set("title", scan.playerName);
    if (scan.year) params.set("year", String(scan.year));
    if (scan.setName) params.set("set", scan.setName);
    if (scan.variation) params.set("variation", scan.variation);
    if (scan.grade) params.set("grade", scan.grade);
    if (scan.grader) params.set("grader", scan.grader);
    if (scan.cardNumber) params.set("cardNumber", scan.cardNumber);
    if (scan.imagePath) params.set("imagePath", scan.imagePath);
    if (scan.sport) params.set("sport", scan.sport);
    params.set("scanHistoryId", String(scan.id));
    params.set("from", "scan-history");
    navigate(`/outlook?${params.toString()}`);
  };

  const handleAddToCollection = (scan: ScanHistory) => {
    setSelectedScan(scan);
    setAddDialogOpen(true);
  };

  // When arriving with ?open=<id>, auto-open that scan's detail dialog once
  // the scan-history data has loaded. Clears the query param afterwards so
  // a page refresh doesn't re-open it endlessly.
  useEffect(() => {
    if (!autoOpenScanId) return;
    if (autoOpenedIdRef.current === autoOpenScanId) return;
    const match = data?.items?.find((s) => String(s.id) === autoOpenScanId);
    if (!match) return;
    autoOpenedIdRef.current = autoOpenScanId;
    setSelectedScan(match);
    setAddDialogOpen(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }, [autoOpenScanId, data?.items]);

  const handleCreateNewWithCard = () => {
    if (!selectedScan) return;
    const scan = selectedScan;
    const params = new URLSearchParams();
    if (scan.playerName) params.set("playerName", scan.playerName);
    if (scan.year) params.set("year", String(scan.year));
    if (scan.setName) params.set("set", scan.setName);
    if (scan.variation) params.set("variation", scan.variation);
    if (scan.grade) params.set("grade", scan.grade);
    if (scan.grader) params.set("grader", scan.grader);
    if (scan.cardNumber) params.set("cardNumber", scan.cardNumber);
    if (scan.sport) params.set("sport", scan.sport);
    if (scan.imagePath) params.set("imagePath", scan.imagePath);
    if (scan.marketValue != null) params.set("estimatedValue", String(scan.marketValue));
    params.set("from", "scan-history");
    setAddDialogOpen(false);
    setSelectedScan(null);
    navigate(`/cases/new?${params.toString()}`);
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <ScanHistorySkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">Sign in to view scan history</h3>
            <p className="text-muted-foreground mb-4">
              Your card scans are saved automatically so you can revisit them later.
            </p>
            <a href="/api/login">
              <Button data-testid="button-sign-in">Sign In</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              Scan History
            </h1>
          </div>
          {data && data.total > 0 && (
            <Badge variant="secondary" className="text-sm" data-testid="badge-total-scans">
              {data.total} scan{data.total !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Every card you scan is saved here. Re-analyze or add to your collection anytime.
        </p>
      </div>

      {isLoading ? (
        <ScanHistorySkeleton />
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Camera className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-state">
              No scans yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Scan a card using Card Analysis and it will appear here automatically.
            </p>
            <Button onClick={() => navigate("/outlook")} data-testid="button-go-scan">
              <Zap className="h-4 w-4 mr-2" />
              Scan a Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((scan) => (
              <ScanHistoryItem
                key={scan.id}
                scan={scan}
                onDelete={(id) => deleteMutation.mutate(id)}
                onReAnalyze={handleReAnalyze}
                onAddToCollection={handleAddToCollection}
              />
            ))}
          </div>

          {!data.isPro && data.totalAll != null && data.totalAll > data.total && (
            <Card className="mt-4 border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Crown className="h-5 w-5 text-yellow-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    Showing {data.total} of {data.totalAll} scans
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to Pro for unlimited scan history
                  </p>
                </div>
                <Link href="/upgrade">
                  <Button size="sm" data-testid="button-upgrade-scan-history">
                    <Crown className="h-3 w-3 mr-1" />
                    Upgrade
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {data.isPro && totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setSelectedScan(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-scan-result">
          <DialogHeader>
            <DialogTitle>Scan result</DialogTitle>
            <DialogDescription>
              {selectedScan
                ? "Here's what we identified. Save it to a collection or open the full analysis."
                : "Loading scan…"}
            </DialogDescription>
          </DialogHeader>

          {selectedScan && (
            <div className="space-y-4">
              {/* Card preview: image + identification */}
              <div className="flex gap-4">
                {selectedScan.imagePath ? (
                  <img
                    src={selectedScan.imagePath}
                    alt={selectedScan.playerName || "Scanned card"}
                    className="h-32 w-24 rounded-md object-cover border bg-muted shrink-0"
                    data-testid="img-scan-result"
                  />
                ) : (
                  <div className="h-32 w-24 rounded-md border bg-muted flex items-center justify-center shrink-0">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="font-semibold text-base leading-tight" data-testid="text-scan-result-player">
                    {selectedScan.playerName || "Unknown player"}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="text-scan-result-card">
                    {[selectedScan.year, selectedScan.setName, selectedScan.variation]
                      .filter(Boolean)
                      .join(" • ") || "Card details unavailable"}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedScan.cardNumber && (
                      <Badge variant="outline" className="text-xs">#{selectedScan.cardNumber}</Badge>
                    )}
                    {selectedScan.grade && (
                      <Badge variant="outline" className="text-xs">
                        {selectedScan.grader && selectedScan.grader !== "raw"
                          ? `${selectedScan.grader.toUpperCase()} ${selectedScan.grade}`
                          : selectedScan.grade}
                      </Badge>
                    )}
                    {selectedScan.sport && (
                      <Badge variant="outline" className="text-xs capitalize">{selectedScan.sport}</Badge>
                    )}
                    {selectedScan.scanConfidence && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          selectedScan.scanConfidence === "high"
                            ? "bg-green-500/10 text-green-600 border-green-500/20"
                            : selectedScan.scanConfidence === "medium"
                              ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                        }`}
                        data-testid="badge-scan-confidence"
                      >
                        {selectedScan.scanConfidence.toUpperCase()} confidence
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Market value + verdict */}
              {(selectedScan.marketValue != null || selectedScan.action) && (
                <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Market value
                    </div>
                    <div className="text-2xl font-semibold tabular-nums" data-testid="text-scan-result-value">
                      {selectedScan.marketValue != null
                        ? `$${selectedScan.marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : "—"}
                    </div>
                  </div>
                  {selectedScan.action && (
                    <Badge
                      variant="outline"
                      className={`gap-1 ${getActionColor(selectedScan.action)}`}
                      data-testid="badge-scan-action"
                    >
                      {getActionIcon(selectedScan.action)}
                      {getActionLabel(selectedScan.action)}
                    </Badge>
                  )}
                </div>
              )}

              {/* Open full analysis */}
              <Button
                variant="default"
                className="w-full gap-2"
                onClick={() => { setAddDialogOpen(false); handleReAnalyze(selectedScan); }}
                data-testid="button-view-full-analysis"
              >
                <Eye className="h-4 w-4" />
                View full analysis
              </Button>

              <div className="relative pt-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Save to collection</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12"
              onClick={handleCreateNewWithCard}
              data-testid="button-create-new-case"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium">Create New Collection</span>
            </Button>

            {displayCases && displayCases.length > 0 && (
              <>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or add to existing</span>
                  </div>
                </div>
                <ScrollArea className="max-h-64">
                  <div className="space-y-1">
                    {displayCases.map((dc) => (
                      <Button
                        key={dc.id}
                        variant="ghost"
                        className="w-full justify-start gap-3 h-11"
                        disabled={addToExistingMutation.isPending}
                        onClick={() => selectedScan && addToExistingMutation.mutate({ caseId: dc.id, scan: selectedScan })}
                        data-testid={`button-add-to-case-${dc.id}`}
                      >
                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate text-left flex-1">{dc.name}</span>
                        {addToExistingMutation.isPending && addToExistingMutation.variables?.caseId === dc.id && (
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        )}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}

            {displayCases && displayCases.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No collections yet. Create your first one above.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
