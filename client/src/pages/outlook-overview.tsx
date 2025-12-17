import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown,
  Eye,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Crown,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Search,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Upload,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Trophy,
  MinusCircle,
  ExternalLink,
  Database,
  Activity,
  Bug,
} from "lucide-react";
import type { Card as CardType, DisplayCase } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OutlookDetails, type OutlookDisplayData } from "@/components/outlook-details";

type CaseWithCards = DisplayCase & { cards: CardType[] };
type UsageInfo = { used: number; limit: number | null; remaining: number | null; isPro: boolean };

function getActionIcon(action: string | null) {
  switch (action) {
    case "BUY": return <ShoppingCart className="h-3 w-3" />;
    case "SELL": return <TrendingDown className="h-3 w-3" />;
    case "WATCH": return <Eye className="h-3 w-3" />;
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
    case "WATCH": return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
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
    case "WATCH": return "WATCH";
    case "LONG_HOLD": return "LONG HOLD";
    case "LEGACY_HOLD": return "LEGACY HOLD";
    case "LITTLE_VALUE": return "LOW VALUE";
    default: return action ?? "";
  }
}

function OutlookSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-16 w-16 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

// Comps & Confidence Panel Component
function CompsConfidencePanel({ 
  comps, 
  onRefresh, 
  isPolling,
  showDebug = false 
}: { 
  comps: CompsData; 
  onRefresh?: () => void;
  isPolling?: boolean;
  showDebug?: boolean;
}) {
  const isLoading = comps.status === "queued" || comps.status === "fetching";
  const isAvailable = comps.status === "hit" || comps.status === "complete";
  const isFallback = comps.status === "blocked" || comps.status === "failed";
  
  const getConfidenceStyle = (confidence: string) => {
    switch (confidence) {
      case "HIGH": return { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Strong comp coverage" };
      case "MED": return { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", label: "Decent comp coverage" };
      case "LOW": 
      default: return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Thin comps - treat cautiously" };
    }
  };
  
  const getStatusDisplay = () => {
    if (isLoading) return { icon: Loader2, text: "Gathering sold comps...", animate: true };
    if (isAvailable) return { icon: CheckCircle, text: "Up to date", animate: false };
    if (comps.status === "blocked") return { icon: AlertTriangle, text: "Using fallback comps", animate: false };
    if (comps.status === "failed") return { icon: XCircle, text: "Using fallback comps", animate: false };
    return { icon: Activity, text: comps.message || "Unknown", animate: false };
  };
  
  const confidenceStyle = getConfidenceStyle(comps.confidence);
  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;
  
  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="panel-comps-confidence">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Comps & Confidence</span>
        </div>
        <Badge variant="secondary" className={confidenceStyle.bg} data-testid="badge-confidence">
          <span className={confidenceStyle.color}>{comps.confidence}</span>
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Sold Comps</span>
          <p className="font-medium" data-testid="text-sold-count">
            {isLoading ? (
              <Skeleton className="h-5 w-16 inline-block" />
            ) : (
              `${comps.soldCount} sold`
            )}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Data Source</span>
          <p className="font-medium" data-testid="text-data-source">
            {comps.source === "EBAY_SOLD" ? "eBay Sold" : comps.source === "SERPER" ? "Fallback comps" : "Mixed"}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon className={`h-3 w-3 ${statusDisplay.animate ? "animate-spin" : ""} ${isFallback ? "text-yellow-500" : isAvailable ? "text-green-500" : "text-muted-foreground"}`} />
        <span className="text-muted-foreground" data-testid="text-status">{statusDisplay.text}</span>
        {isPolling && (
          <span className="text-muted-foreground/60">(polling...)</span>
        )}
      </div>
      
      {comps.confidence === "LOW" && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 p-2 rounded" data-testid="text-low-confidence-warning">
          Low confidence because we found limited matching sold comps.
        </p>
      )}
      
      {isFallback && (
        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded" data-testid="text-fallback-notice">
          {comps.message || (comps.status === "blocked" 
            ? "eBay is temporarily limiting requests. Using fallback data."
            : "Using fallback comps. Try refresh later for better coverage.")}
        </p>
      )}
      
      {showDebug && comps.debug && (
        <div className="mt-3 p-2 rounded bg-muted/30 border border-dashed text-xs font-mono space-y-1" data-testid="panel-debug">
          <div className="flex items-center gap-1 text-muted-foreground mb-1">
            <Bug className="h-3 w-3" />
            <span>Debug Info</span>
          </div>
          <div>Query: {comps.debug.canonicalQuery}</div>
          <div>Hash: {comps.queryHash}</div>
          <div>Pages: {comps.debug.pagesScraped} | Found: {comps.debug.itemsFound} | Kept: {comps.debug.itemsKept}</div>
          {comps.debug.lastFetchedAt && (
            <div>Last fetch: {new Date(comps.debug.lastFetchedAt).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}

type CompsData = {
  status: "hit" | "complete" | "queued" | "fetching" | "failed" | "blocked";
  source: "EBAY_SOLD" | "SERPER" | "MIXED";
  soldCount: number;
  confidence: "HIGH" | "MED" | "LOW" | string;
  summary: {
    medianPrice?: number | null;
    meanPrice?: number;
    minPrice?: number;
    maxPrice?: number;
    trendSeries?: Array<{ week: string; medianPrice: number; count: number }>;
    trendSlope?: number;
    volatility?: number;
    liquidity?: number;
    soldCount?: number;
  };
  queryHash: string;
  debug?: {
    canonicalQuery: string;
    pagesScraped: number;
    itemsFound: number;
    itemsKept: number;
    lastFetchedAt: string | null;
  };
  message?: string;
};

type QuickAnalyzeResult = {
  tempCard: { title: string; year?: string; set?: string; variation?: string; grade?: string; grader?: string; imagePath?: string };
  market: { value: number | null; min: number | null; max: number | null; compCount: number };
  signals: { upside: number; downsideRisk: number; marketFriction: number };
  action: string;
  actionReasons: string[] | null;
  explanation: { short: string; long: string | null; bullets?: string[] };
  bigMover: { flag: boolean; reason: string | null };
  confidence: { level: string; reason: string | null };
  matchConfidence?: {
    score: number;
    tier: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    samples?: Array<{
      title: string;
      price: number;
      matchScore: number;
      url?: string;
    }>;
  } | null;
  comps?: CompsData;
  isPro: boolean;
};

function QuickAnalyzeSection({ canAnalyze, userCases }: { canAnalyze: boolean; userCases: DisplayCase[] }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [result, setResult] = useState<QuickAnalyzeResult | null>(null);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [set, setSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [variation, setVariation] = useState("");
  const [grade, setGrade] = useState("");
  const [grader, setGrader] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  
  // Polling state for comps
  const [isPollingComps, setIsPollingComps] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  
  // Check for debug mode via query param
  const searchParams = new URLSearchParams(window.location.search);
  const showDebug = searchParams.get("debug") === "1";
  
  // Cleanup polling on unmount or result clear
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);
  
  // Stop polling when result is cleared
  useEffect(() => {
    if (!result && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      setIsPollingComps(false);
    }
  }, [result]);
  
  // Poll for comps status when queued/fetching
  const pollCompsStatus = async (queryHash: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/comps/ebay/status?queryHash=${queryHash}`, {
        credentials: "include"
      });
      if (!response.ok) return false;
      
      const data = await response.json();
      
      // Update the result with new comps data
      if (data.status === "complete" || data.fetchStatus === "complete") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            ...prev.comps!,
            status: "hit",
            soldCount: data.soldCount ?? prev.comps?.soldCount ?? 0,
            confidence: data.confidence ?? prev.comps?.confidence ?? "LOW",
            source: "EBAY_SOLD",
            summary: data.summaryJson ?? data.summary ?? prev.comps?.summary ?? {},
            debug: prev.comps?.debug ? {
              ...prev.comps.debug,
              pagesScraped: data.pagesScraped ?? prev.comps.debug.pagesScraped,
              itemsFound: data.itemsFound ?? prev.comps.debug.itemsFound,
              itemsKept: data.itemsKept ?? prev.comps.debug.itemsKept,
              lastFetchedAt: data.lastFetchedAt ?? prev.comps.debug.lastFetchedAt,
            } : undefined,
            message: "Up to date",
          }
        } : null);
        return true; // Stop polling
      } else if (data.status === "blocked" || data.fetchStatus === "blocked") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            ...prev.comps!,
            status: "blocked",
            source: "SERPER",
            message: data.fetchError || "eBay is temporarily limiting requests. Using fallback data.",
          }
        } : null);
        return true; // Stop polling
      } else if (data.status === "failed" || data.fetchStatus === "failed") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            ...prev.comps!,
            status: "failed",
            source: "SERPER",
            message: data.fetchError || "Using fallback comps",
          }
        } : null);
        return true; // Stop polling
      }
    } catch (err) {
      console.error("Error polling comps status:", err);
    }
    return false; // Continue polling
  };
  
  // Start polling when result has queued/fetching comps
  const startPolling = (queryHash: string) => {
    // Don't start if already polling
    if (pollIntervalRef.current) return;
    
    setIsPollingComps(true);
    pollStartTimeRef.current = Date.now();
    
    pollIntervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartTimeRef.current;
      
      // Stop after 20 seconds
      if (elapsed > 20000) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsPollingComps(false);
        toast({
          title: "Still gathering comps",
          description: "We'll keep improving comps - try refresh in a bit.",
        });
        return;
      }
      
      const shouldStop = await pollCompsStatus(queryHash);
      if (shouldStop) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsPollingComps(false);
      }
    }, 2000);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image under 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = uploadUrlRes;

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
      setImagePath(updateRes.objectPath);
      toast({ title: "Image uploaded", description: "Card image ready" });
    } catch (error) {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const data = await apiRequest("POST", "/api/outlook/quick-analyze", {
        title,
        year: year || undefined,
        set: set || undefined,
        cardNumber: cardNumber || undefined,
        variation: variation || undefined,
        grade: grade || undefined,
        grader: grader || undefined,
        imagePath: imagePath || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      toast({ title: "Analysis complete", description: `Got ${data.action} recommendation for ${title}` });
      
      // Start polling if comps are being fetched
      if (data.comps && (data.comps.status === "queued" || data.comps.status === "fetching")) {
        startPolling(data.comps.queryHash);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const addToCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !result) throw new Error("Please select a display case");
      const cardData = {
        title: result.tempCard.title,
        year: result.tempCard.year ? parseInt(result.tempCard.year) : null,
        set: result.tempCard.set || null,
        cardNumber: cardNumber || null,
        variation: result.tempCard.variation || null,
        grade: result.tempCard.grade || null,
        grader: result.tempCard.grader || null,
        imagePath: imagePath || null,
        estimatedValue: result.market.value,
        cardCategory: "sports" as const,
      };
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({ title: "Card added", description: `${result?.tempCard.title} added to your collection` });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setTitle("");
    setYear("");
    setSet("");
    setCardNumber("");
    setVariation("");
    setGrade("");
    setGrader("");
    setImagePath(null);
    setPreviewUrl(null);
    setResult(null);
    setSelectedCaseId("");
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return "N/A";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Quick Card Check</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) resetForm();
            }}
            data-testid="button-toggle-quick-analyze"
          >
            {showForm ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Close
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Analyze Any Card
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Check a card before buying or get a quick outlook without adding to your collection
        </CardDescription>
      </CardHeader>

      {showForm && (
        <CardContent className="space-y-4">
          {!result ? (
            <>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-shrink-0">
                  <Label className="mb-2 block">Card Image (optional)</Label>
                  <div className="relative w-32 h-44 border-2 border-dashed rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Card preview" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Upload image</span>
                      </div>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      disabled={uploading}
                      data-testid="input-quick-image"
                    />
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Card Title / Player Name *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., LeBron James Rookie"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      data-testid="input-quick-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      placeholder="e.g., 2003"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      data-testid="input-quick-year"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="set">Set</Label>
                    <Input
                      id="set"
                      placeholder="e.g., Topps Chrome"
                      value={set}
                      onChange={(e) => setSet(e.target.value)}
                      data-testid="input-quick-set"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card #</Label>
                    <Input
                      id="cardNumber"
                      placeholder="e.g., 23"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      data-testid="input-quick-card-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="variation">Variation</Label>
                    <Input
                      id="variation"
                      placeholder="e.g., Refractor"
                      value={variation}
                      onChange={(e) => setVariation(e.target.value)}
                      data-testid="input-quick-variation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade</Label>
                    <Input
                      id="grade"
                      placeholder="e.g., PSA 10"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      data-testid="input-quick-grade"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grader">Grader</Label>
                    <Select value={grader} onValueChange={setGrader}>
                      <SelectTrigger data-testid="select-quick-grader">
                        <SelectValue placeholder="Select grader" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PSA">PSA</SelectItem>
                        <SelectItem value="BGS">BGS</SelectItem>
                        <SelectItem value="SGC">SGC</SelectItem>
                        <SelectItem value="CGC">CGC</SelectItem>
                        <SelectItem value="raw">Raw (ungraded)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={!title || analyzeMutation.isPending || !canAnalyze}
                  data-testid="button-quick-analyze"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Get Outlook
                    </>
                  )}
                </Button>
                {!canAnalyze && (
                  <Link href="/upgrade">
                    <Button variant="outline">
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade for Analyses
                    </Button>
                  </Link>
                )}
              </div>
            </>
          ) : (
            <Dialog open={!!result} onOpenChange={(open) => !open && resetForm()}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between gap-4 pb-4 border-b">
                  <div>
                    <DialogTitle className="text-xl">Quick Card Check Result</DialogTitle>
                    <DialogDescription>
                      Market analysis for {result.tempCard.title}
                    </DialogDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-add-to-collection">
                          <Plus className="h-4 w-4 mr-2" />
                          Add to Collection
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add to Display Case</DialogTitle>
                          <DialogDescription>
                            Choose which display case to add "{result.tempCard.title}" to.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Select Display Case</Label>
                            <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                              <SelectTrigger data-testid="select-display-case">
                                <SelectValue placeholder="Choose a display case" />
                              </SelectTrigger>
                              <SelectContent>
                                {userCases.map((c) => (
                                  <SelectItem key={c.id} value={c.id.toString()}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {userCases.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              You don't have any display cases yet. Create one first from your dashboard.
                            </p>
                          )}
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={() => addToCollectionMutation.mutate()}
                              disabled={!selectedCaseId || addToCollectionMutation.isPending}
                              data-testid="button-confirm-add"
                            >
                              {addToCollectionMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Adding...
                                </>
                              ) : (
                                "Add Card"
                              )}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      onClick={resetForm}
                      data-testid="button-quick-reset"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Check Another
                    </Button>
                  </div>
                </DialogHeader>
                
                {result.comps && (
                  <div className="mb-4">
                    <CompsConfidencePanel 
                      comps={result.comps}
                      isPolling={isPollingComps}
                      showDebug={showDebug}
                      onRefresh={() => {
                        if (result.comps?.queryHash) {
                          startPolling(result.comps.queryHash);
                        }
                      }}
                    />
                  </div>
                )}
                
                <OutlookDetails 
                  data={{
                    card: {
                      title: result.tempCard.title,
                      year: result.tempCard.year,
                      set: result.tempCard.set,
                      variation: result.tempCard.variation,
                      grade: result.tempCard.grade ? `${result.tempCard.grader || ''} ${result.tempCard.grade}`.trim() : null,
                      imagePath: previewUrl || result.tempCard.imagePath,
                    },
                    market: {
                      value: result.market.value,
                      min: result.market.min,
                      max: result.market.max,
                      compCount: result.comps?.soldCount ?? result.market.compCount,
                    },
                    signals: result.signals,
                    action: result.action,
                    actionReasons: result.actionReasons,
                    confidence: result.confidence,
                    matchConfidence: result.matchConfidence,
                    explanation: result.explanation,
                    bigMover: result.bigMover,
                    isPro: result.isPro,
                  }}
                  cardImageUrl={previewUrl}
                  showDetailedSignals={result.isPro}
                />
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CardOutlookRow({ card, isPro, showDetails = true, canAnalyze = false, onAnalyze }: { 
  card: CardType; 
  isPro: boolean; 
  showDetails?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
}) {
  const { toast } = useToast();
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cards/${card.id}/outlook-v2`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to generate outlook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      toast({ title: "Outlook generated", description: `Analysis complete for ${card.title}` });
      onAnalyze?.();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const hasOutlook = card.outlookAction !== null;
  const isBigMover = card.outlookBigMover === true;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover-elevate" data-testid={`outlook-row-${card.id}`}>
      <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {card.imagePath ? (
          <img 
            src={card.imagePath.startsWith('/objects/') ? card.imagePath : `/objects/${card.imagePath}`}
            alt={card.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
            No Image
          </div>
        )}
        {isBigMover && isPro && (
          <div className="absolute top-1 right-1 bg-purple-500 rounded-full p-0.5">
            <Zap className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium truncate" data-testid={`text-card-title-${card.id}`}>{card.title}</h3>
          {isBigMover && isPro && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 gap-1">
              <Zap className="h-3 w-3" />
              Big Mover
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {card.year} {card.set} {card.variation ? `- ${card.variation}` : ""} {card.grade ? `(${card.grade})` : ""}
        </p>
        {showDetails && isPro && hasOutlook && card.outlookExplanationShort && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {card.outlookExplanationShort}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {hasOutlook && isPro ? (
          <>
            <Badge variant="outline" className={`gap-1 ${getActionColor(card.outlookAction)}`}>
              {getActionIcon(card.outlookAction)}
              {getActionLabel(card.outlookAction)}
            </Badge>
            {showDetails && card.outlookUpsideScore !== null && (
              <div className="text-xs text-muted-foreground hidden sm:block">
                <span className="text-green-600 dark:text-green-400">{card.outlookUpsideScore}</span>
                /
                <span className="text-red-600 dark:text-red-400">{card.outlookRiskScore}</span>
              </div>
            )}
          </>
        ) : hasOutlook && !isPro ? (
          <Badge variant="secondary" className="gap-1">
            <Crown className="h-3 w-3" />
            Pro to view
          </Badge>
        ) : canAnalyze ? (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid={`button-generate-outlook-${card.id}`}
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Analyze
              </>
            )}
          </Button>
        ) : (
          <Link href="/upgrade">
            <Badge variant="secondary" className="gap-1 cursor-pointer">
              <Crown className="h-3 w-3" />
              Upgrade
            </Badge>
          </Link>
        )}
        
        {hasOutlook && isPro && (
          <Link href={`/card/${card.id}/outlook`}>
            <Button size="icon" variant="ghost" data-testid={`button-view-outlook-${card.id}`}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function OutlookOverviewPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isPro = user?.subscriptionStatus === "PRO";

  const { data: cases, isLoading } = useQuery<CaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated,
  });

  const { data: usage } = useQuery<UsageInfo>({
    queryKey: ["/api/user/outlook-usage"],
    enabled: isAuthenticated,
  });

  const canAnalyze = isPro || (usage?.remaining != null && usage.remaining > 0);

  const allCards = cases?.flatMap(c => c.cards) || [];
  const cardsWithOutlook = allCards.filter(c => c.outlookAction !== null);
  const bigMovers = allCards.filter(c => c.outlookBigMover === true);
  const cardsWithoutOutlook = allCards.filter(c => c.outlookAction === null);

  const buyCards = cardsWithOutlook.filter(c => c.outlookAction === "BUY");
  const sellCards = cardsWithOutlook.filter(c => c.outlookAction === "SELL");
  const watchCards = cardsWithOutlook.filter(c => c.outlookAction === "WATCH");
  const holdCards = cardsWithOutlook.filter(c => c.outlookAction === "LONG_HOLD");

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view Market Outlook</h2>
        <p className="text-muted-foreground mb-6">Get AI-powered buy/sell recommendations for your card collection.</p>
        <a href="/api/login">
          <Button data-testid="button-signin">Sign In</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Market Outlook</h1>
        </div>
        <p className="text-muted-foreground">
          AI-powered analysis of your cards with buy, sell, and hold recommendations based on market signals.
        </p>
      </div>

      {!isPro && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div className="flex items-center gap-3">
              {usage?.remaining != null && usage.remaining > 0 ? (
                <Sparkles className="h-6 w-6 text-primary" />
              ) : (
                <Crown className="h-6 w-6 text-primary" />
              )}
              <div>
                {usage?.remaining != null && usage.remaining > 0 ? (
                  <>
                    <p className="font-medium">
                      {usage.remaining} free {usage.remaining === 1 ? "analysis" : "analyses"} remaining this month
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and full insights.
                    </p>
                  </>
                ) : usage?.remaining === 0 ? (
                  <>
                    <p className="font-medium">You've used all free analyses this month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses and full access to Market Outlook.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Get 3 free analyses per month</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Pro for unlimited analyses, Big Mover alerts, and detailed insights.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Link href="/upgrade">
              <Button data-testid="button-upgrade">Upgrade to Pro</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <QuickAnalyzeSection 
        canAnalyze={isPro || (usage?.remaining != null && usage.remaining > 0)} 
        userCases={cases?.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt, updatedAt: c.updatedAt, userId: c.userId, description: c.description, isPublic: c.isPublic, theme: c.theme, layout: c.layout, showCardCount: c.showCardCount, showTotalValue: c.showTotalValue, viewCount: c.viewCount })) || []}
      />

      {isLoading ? (
        <OutlookSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cards</CardDescription>
                <CardTitle className="text-2xl" data-testid="text-total-cards">{allCards.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Analyzed</CardDescription>
                <CardTitle className="text-2xl text-primary" data-testid="text-analyzed-cards">{cardsWithOutlook.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={bigMovers.length > 0 ? "border-purple-500/30 bg-purple-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-purple-500" />
                  Big Movers
                </CardDescription>
                <CardTitle className="text-2xl text-purple-600 dark:text-purple-400" data-testid="text-big-movers">{bigMovers.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={buyCards.length > 0 ? "border-green-500/30 bg-green-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-green-500" />
                  Buy
                </CardDescription>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400" data-testid="text-buy-cards">{buyCards.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card className={sellCards.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Sell
                </CardDescription>
                <CardTitle className="text-2xl text-red-600 dark:text-red-400" data-testid="text-sell-cards">{sellCards.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {bigMovers.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-purple-500" />
                <h2 className="text-xl font-semibold">Big Movers</h2>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                  {bigMovers.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Cards with asymmetric upside potential - high reward with moderate risk.
              </p>
              <div className="space-y-2">
                {bigMovers.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {buyCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="h-5 w-5 text-green-500" />
                <h2 className="text-xl font-semibold">Buy Recommendations</h2>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                  {buyCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {buyCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {sellCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="text-xl font-semibold">Sell Recommendations</h2>
                <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                  {sellCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {sellCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {holdCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" />
                <h2 className="text-xl font-semibold">Long Hold</h2>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  {holdCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {holdCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {watchCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">Watch List</h2>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                  {watchCards.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {watchCards.map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
              </div>
            </div>
          )}

          {cardsWithoutOutlook.length > 0 && isPro && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Pending Analysis</h2>
                <Badge variant="secondary">
                  {cardsWithoutOutlook.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                These cards haven't been analyzed yet. Click "Analyze" to get an outlook.
              </p>
              <div className="space-y-2">
                {cardsWithoutOutlook.slice(0, 10).map(card => (
                  <CardOutlookRow key={card.id} card={card} isPro={isPro} canAnalyze={canAnalyze} />
                ))}
                {cardsWithoutOutlook.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    And {cardsWithoutOutlook.length - 10} more cards...
                  </p>
                )}
              </div>
            </div>
          )}

          {allCards.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add some cards to your display cases to get AI-powered outlook analysis.
                </p>
                <Link href="/cases/new">
                  <Button>Create Display Case</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
