import { useState, useEffect, useRef, useCallback } from "react";
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
import { Link, useLocation } from "wouter";
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
  Trophy,
  MinusCircle,
  ExternalLink,
  Database,
  Bug,
  Star,
  Info,
  Camera,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Card as CardType, DisplayCase } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OutlookDetails, type OutlookDisplayData } from "@/components/outlook-details";
import { SuccessOverlay } from "@/components/success-animation";

type CaseWithCards = DisplayCase & { cards: CardType[] };
type UsageInfo = { used: number; limit: number | null; remaining: number | null; isPro: boolean };

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

// Comps & Confidence Panel Component - simplified to hide technical details
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
  
  // Use the confidence from the API - it's based on match quality from search results
  const effectiveConfidence = comps.confidence || "LOW";
  
  const getConfidenceStyle = (confidence: string) => {
    switch (confidence) {
      case "HIGH": return { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Strong data coverage" };
      case "MED": return { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", label: "Decent data coverage" };
      case "LOW": 
      default: return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Limited data - treat cautiously" };
    }
  };
  
  const confidenceStyle = getConfidenceStyle(effectiveConfidence);
  
  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="panel-comps-confidence">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Data Confidence</span>
        </div>
        <Badge variant="secondary" className={confidenceStyle.bg} data-testid="badge-confidence">
          <span className={confidenceStyle.color}>{effectiveConfidence}</span>
        </Badge>
      </div>
      
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Gathering market data...</span>
        </div>
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
  market: { 
    value: number | null; 
    min: number | null; 
    max: number | null; 
    compCount: number;
    modeledEstimate?: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
      referenceComps: Array<{ cardType: string; estimatedValue: number; liquidity: string }>;
      source: "MODEL";
    } | null;
  };
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
    matchedComps?: number;
    totalComps?: number;
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

// Types for AI price estimate
type ConditionPriceEstimate = {
  condition: string;
  minPrice: number;
  maxPrice: number;
};

type AIPriceEstimate = {
  available: boolean;
  estimates: ConditionPriceEstimate[];
  marketNotes: string;
  confidence: "high" | "medium" | "low";
};

// Type for scan-identify-only result (no pricing, faster)
type ScanIdentifyResult = {
  success: boolean;
  scan: {
    success: boolean;
    confidence: "high" | "medium" | "low";
    cardIdentification: {
      playerName: string;
      year: number | null;
      setName: string;
      cardNumber: string | null;
      variation: string | null;
      parallel: string | null;
      isRookie: boolean;
      sport: string;
    };
    gradeEstimate: {
      appearsToBe: "graded" | "raw";
      gradingCompany: string | null;
      grade: string | null;
      conditionNotes: string | null;
    };
    marketContext: {
      rarity: string;
      desirability: string;
      collectibilityNotes: string;
    };
    rawAnalysis: string;
    error?: string;
  };
  usage: {
    scansToday: number;
    dailyLimit: number;
    remainingScans: number;
    isPro: boolean;
  };
};

// Types for card scan result (legacy, includes pricing)
type CardScanResult = {
  success: boolean;
  scan: {
    success: boolean;
    confidence: "high" | "medium" | "low";
    cardIdentification: {
      playerName: string;
      year: number | null;
      setName: string;
      cardNumber: string | null;
      variation: string | null;
      parallel: string | null;
      isRookie: boolean;
      sport: string;
    };
    gradeEstimate: {
      appearsToBe: "graded" | "raw";
      gradingCompany: string | null;
      grade: string | null;
      conditionNotes: string | null;
    };
    marketContext: {
      rarity: string;
      desirability: string;
      collectibilityNotes: string;
    };
    rawAnalysis: string;
    error?: string;
  };
  searchQuery: string;
  pricing: {
    available: boolean;
    isFetching: boolean;
    isAIEstimate?: boolean;
    soldCount: number;
    medianPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    priceRange: string;
    marketAssessment: string;
    recentSales: Array<{
      title: string;
      price: number;
      soldDate: string | null;
      url: string;
    }>;
    aiEstimate?: AIPriceEstimate;
  };
  queryHash: string;
  usage: {
    scansToday: number;
    dailyLimit: number;
    remainingScans: number;
    isPro: boolean;
  };
};

function QuickAnalyzeSection({ canAnalyze, userCases }: { canAnalyze: boolean; userCases: DisplayCase[] }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [inputMode, setInputMode] = useState<"manual" | "scan">("manual");
  const [result, setResult] = useState<QuickAnalyzeResult | null>(null);
  const [scanResult, setScanResult] = useState<CardScanResult | null>(null);
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
  const [scanImageUploading, setScanImageUploading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showScanAddDialog, setShowScanAddDialog] = useState(false);
  const [showConfirmedAddDialog, setShowConfirmedAddDialog] = useState(false);
  
  // Confirmation workflow state
  const [scanIdentifyResult, setScanIdentifyResult] = useState<ScanIdentifyResult | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [analysisInvalidated, setAnalysisInvalidated] = useState(false);
  
  // Polling state for comps
  const [isPollingComps, setIsPollingComps] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  
  // Rotating loading messages
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Searching live market data...",
    "Analyzing player trajectory...",
    "Building your investment outlook..."
  ];
  
  // Success animation state
  const [showAnalysisSuccess, setShowAnalysisSuccess] = useState(false);
  
  // Recent searches state
  const RECENT_SEARCHES_KEY = "sports-card-recent-searches";
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addRecentSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    const term = searchTerm.trim();
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== term.toLowerCase());
      const updated = [term, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);
  
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
      
      // Update the result with new comps data - build fresh object from backend response
      if (data.status === "complete" || data.fetchStatus === "complete") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            status: "hit",
            soldCount: data.soldCount ?? 0,
            confidence: data.confidence ?? "LOW",
            source: "EBAY_SOLD" as const,
            summary: data.summaryJson ?? data.summary ?? {},
            queryHash: data.queryHash ?? prev.comps?.queryHash ?? "",
            debug: {
              canonicalQuery: data.canonicalQuery ?? prev.comps?.debug?.canonicalQuery ?? "",
              pagesScraped: data.pagesScraped ?? prev.comps?.debug?.pagesScraped ?? 0,
              itemsFound: data.itemsFound ?? prev.comps?.debug?.itemsFound ?? 0,
              itemsKept: data.itemsKept ?? prev.comps?.debug?.itemsKept ?? 0,
              lastFetchedAt: data.lastFetchedAt ?? prev.comps?.debug?.lastFetchedAt ?? null,
            },
            message: "Up to date",
          }
        } : null);
        return true; // Stop polling
      } else if (data.status === "blocked" || data.fetchStatus === "blocked") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            status: "blocked",
            source: "SERPER" as const,
            soldCount: data.soldCount ?? 0,
            confidence: data.confidence ?? "LOW",
            summary: data.summaryJson ?? data.summary ?? prev.comps?.summary ?? {},
            queryHash: data.queryHash ?? prev.comps?.queryHash ?? "",
            debug: {
              canonicalQuery: data.canonicalQuery ?? prev.comps?.debug?.canonicalQuery ?? "",
              pagesScraped: data.pagesScraped ?? prev.comps?.debug?.pagesScraped ?? 0,
              itemsFound: data.itemsFound ?? prev.comps?.debug?.itemsFound ?? 0,
              itemsKept: data.itemsKept ?? prev.comps?.debug?.itemsKept ?? 0,
              lastFetchedAt: data.lastFetchedAt ?? prev.comps?.debug?.lastFetchedAt ?? null,
            },
            message: "Market data loaded",
          }
        } : null);
        return true; // Stop polling
      } else if (data.status === "failed" || data.fetchStatus === "failed") {
        setResult(prev => prev ? {
          ...prev,
          comps: {
            status: "failed",
            source: "SERPER" as const,
            soldCount: data.soldCount ?? 0,
            confidence: data.confidence ?? "LOW",
            summary: data.summaryJson ?? data.summary ?? prev.comps?.summary ?? {},
            queryHash: data.queryHash ?? prev.comps?.queryHash ?? "",
            debug: {
              canonicalQuery: data.canonicalQuery ?? prev.comps?.debug?.canonicalQuery ?? "",
              pagesScraped: data.pagesScraped ?? prev.comps?.debug?.pagesScraped ?? 0,
              itemsFound: data.itemsFound ?? prev.comps?.debug?.itemsFound ?? 0,
              itemsKept: data.itemsKept ?? prev.comps?.debug?.itemsKept ?? 0,
              lastFetchedAt: data.lastFetchedAt ?? prev.comps?.debug?.lastFetchedAt ?? null,
            },
            message: "Market data loaded",
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
          title: "Still gathering data",
          description: "Check back in a moment for updated insights.",
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

  // Poll for scan result comps and update scanResult state
  const pollScanCompsStatus = async (queryHash: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/comps/ebay/status?queryHash=${queryHash}`, {
        credentials: "include"
      });
      if (!response.ok) return false;
      
      const data = await response.json();
      
      if (data.status === "complete" || data.fetchStatus === "complete") {
        // Update scanResult with pricing data
        setScanResult(prev => {
          if (!prev) return null;
          const recentSales = data.comps?.slice(0, 5).map((c: { title: string; totalPrice?: number; soldPrice?: number; soldDate?: string | null; itemUrl?: string }) => ({
            title: c.title,
            price: c.totalPrice ?? c.soldPrice ?? 0,
            soldDate: c.soldDate ?? null,
            url: c.itemUrl ?? "",
          })) || [];
          
          return {
            ...prev,
            pricing: {
              ...prev.pricing,
              available: true,
              isFetching: false,
              soldCount: data.soldCount ?? recentSales.length,
              medianPrice: data.summaryJson?.medianPrice ?? data.summary?.medianPrice ?? prev.pricing.medianPrice,
              minPrice: data.summaryJson?.minPrice ?? data.summary?.minPrice ?? prev.pricing.minPrice,
              maxPrice: data.summaryJson?.maxPrice ?? data.summary?.maxPrice ?? prev.pricing.maxPrice,
              priceRange: data.summaryJson?.minPrice && data.summaryJson?.maxPrice
                ? `$${data.summaryJson.minPrice.toFixed(2)} - $${data.summaryJson.maxPrice.toFixed(2)}`
                : prev.pricing.priceRange,
              marketAssessment: prev.pricing.marketAssessment,
              recentSales,
            }
          };
        });
        return true; // Stop polling
      } else if (data.status === "failed" || data.fetchStatus === "failed") {
        setScanResult(prev => prev ? {
          ...prev,
          pricing: {
            ...prev.pricing,
            isFetching: false,
          }
        } : null);
        return true; // Stop polling
      }
    } catch (err) {
      console.error("Error polling scan comps status:", err);
    }
    return false; // Continue polling
  };

  // Start polling for scan result market data
  const startScanPolling = (queryHash: string) => {
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
        // Mark as not fetching anymore
        setScanResult(prev => prev ? {
          ...prev,
          pricing: { ...prev.pricing, isFetching: false }
        } : null);
        return;
      }
      
      const shouldStop = await pollScanCompsStatus(queryHash);
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
      setShowAnalysisSuccess(true);
      addRecentSearch(title);
      
      // Start polling if comps are being fetched
      if (data.comps && (data.comps.status === "queued" || data.comps.status === "fetching")) {
        startPolling(data.comps.queryHash);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Rotate loading messages while analyzing
  useEffect(() => {
    if (!analyzeMutation.isPending) {
      setLoadingMessageIndex(0);
      return;
    }
    
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2500);
    
    return () => clearInterval(interval);
  }, [analyzeMutation.isPending, loadingMessages.length]);

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

  // Mutation for adding scanned card to portfolio
  const addScanToCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !scanResult?.scan?.cardIdentification) {
        throw new Error("Please select a display case");
      }
      
      const card = scanResult.scan.cardIdentification;
      const gradeInfo = scanResult.scan.gradeEstimate;
      
      // Upload the scan preview image if available
      let uploadedImagePath: string | null = null;
      if (scanPreviewUrl && scanPreviewUrl.startsWith("blob:")) {
        // Convert blob URL to file and upload using object storage
        try {
          const response = await fetch(scanPreviewUrl);
          const blob = await response.blob();
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
          
          // Get presigned upload URL
          const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
          const { uploadURL } = uploadUrlRes;
          
          // Upload file to presigned URL
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          
          // Get the object path
          const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
          uploadedImagePath = updateRes.objectPath;
        } catch (uploadError) {
          console.error("Failed to upload scan image:", uploadError);
          toast({ 
            title: "Image upload failed", 
            description: "Card will be added without the photo",
            variant: "destructive"
          });
        }
      }
      
      // Get estimated value - prefer eBay median, fall back to AI estimate midpoint
      let estimatedValue: number | null = null;
      if (scanResult.pricing?.medianPrice && typeof scanResult.pricing.medianPrice === "number" && !isNaN(scanResult.pricing.medianPrice)) {
        estimatedValue = scanResult.pricing.medianPrice;
      } else if (scanResult.pricing?.aiEstimate?.estimates && Array.isArray(scanResult.pricing.aiEstimate.estimates) && scanResult.pricing.aiEstimate.estimates.length > 0) {
        // Use the first valid estimate's midpoint (usually Raw condition)
        for (const est of scanResult.pricing.aiEstimate.estimates) {
          if (est && typeof est === "object" && "minPrice" in est && "maxPrice" in est) {
            const minPrice = typeof est.minPrice === "number" ? est.minPrice : parseFloat(String(est.minPrice));
            const maxPrice = typeof est.maxPrice === "number" ? est.maxPrice : parseFloat(String(est.maxPrice));
            if (!isNaN(minPrice) && !isNaN(maxPrice) && minPrice >= 0 && maxPrice >= minPrice) {
              estimatedValue = Math.round(((minPrice + maxPrice) / 2) * 100) / 100;
              break; // Found a valid estimate
            }
          }
        }
      }
      
      // Parse year safely
      let parsedYear: number | null = null;
      if (typeof card.year === "number" && !isNaN(card.year)) {
        parsedYear = card.year;
      } else if (card.year) {
        const parsed = parseInt(String(card.year));
        if (!isNaN(parsed)) parsedYear = parsed;
      }
      
      const cardData = {
        title: card.playerName || "Unknown Card",
        year: parsedYear,
        set: card.setName || null,
        cardNumber: card.cardNumber || null,
        variation: card.parallel || card.variation || null,
        grade: gradeInfo.grade || null,
        grader: gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : null),
        imagePath: uploadedImagePath,
        estimatedValue: estimatedValue,
        cardCategory: "sports" as const,
      };
      
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      const cardName = scanResult?.scan?.cardIdentification?.playerName || "Card";
      toast({ title: "Card added!", description: `${cardName} added to your collection` });
      setShowScanAddDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Mutation for adding card from new confirmation workflow (uses state variables)
  const addConfirmedCardMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !title.trim()) {
        throw new Error("Please select a display case");
      }
      
      // Parse year safely
      let parsedYear: number | null = null;
      if (year) {
        const parsed = parseInt(year);
        if (!isNaN(parsed)) parsedYear = parsed;
      }
      
      // Estimated value will be set later when user adds actual pricing
      const estimatedValue: number | null = null;
      
      const cardData = {
        title: title,
        year: parsedYear,
        set: set || null,
        cardNumber: cardNumber || null,
        variation: variation || null,
        grade: grade || null,
        grader: grader === "raw" ? null : (grader || null),
        imagePath: imagePath || null, // Already uploaded during confirmation
        estimatedValue: estimatedValue,
        cardCategory: "sports" as const,
      };
      
      const data = await apiRequest("POST", `/api/display-cases/${selectedCaseId}/cards`, cardData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({ title: "Card added!", description: `${title} added to your collection` });
      setShowScanAddDialog(false);
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
    setScanResult(null);
    setScanPreviewUrl(null);
    setSelectedCaseId("");
    setInputMode("manual");
    setShowScanAddDialog(false);
    // Reset confirmation workflow state
    setScanIdentifyResult(null);
    setIsConfirmed(false);
    setAnalysisInvalidated(false);
  };

  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({ blob, base64: reader.result as string });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle photo scan - NEW: Uses scan-identify endpoint (faster, no pricing)
  const handlePhotoScan = async (file: File) => {
    setScanning(true);
    setScanResult(null);
    setScanIdentifyResult(null);
    setIsConfirmed(false);
    setResult(null);
    setAnalysisInvalidated(false);
    
    try {
      // Compress image to reduce payload size
      const { blob, base64: base64Data } = await compressImage(file, 1200, 0.85);
      
      // Create preview URL from compressed image
      const previewDataUrl = URL.createObjectURL(blob);
      setScanPreviewUrl(previewDataUrl);
      
      // Call the NEW scan-identify API (faster, no pricing)
      const response = await apiRequest("POST", "/api/cards/scan-identify", {
        imageData: base64Data,
        mimeType: "image/jpeg",
      });
      
      // Handle service unavailable errors
      if (response.serviceUnavailable || response.scanError) {
        toast({
          title: "Scan unavailable",
          description: response.message || "Please try again or enter details manually.",
          variant: "destructive",
        });
        return;
      }
      
      // Store the scan identification result
      setScanIdentifyResult(response as ScanIdentifyResult);
      
      // Auto-populate form fields from scan result for editing
      if (response.scan?.success) {
        const card = response.scan.cardIdentification;
        const gradeInfo = response.scan.gradeEstimate;
        
        setTitle(card.playerName || "");
        setYear(card.year?.toString() || "");
        setSet(card.setName || "");
        setCardNumber(card.cardNumber || "");
        setVariation(card.parallel || card.variation || "");
        setGrade(gradeInfo.grade || "");
        setGrader(gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : ""));
        
        toast({
          title: "Card identified!",
          description: "Review the details below and confirm before analysis.",
        });
      } else {
        toast({
          title: "Could not identify card",
          description: response.scan?.error || "Please try a clearer photo or enter details manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error scanning card:", error);
      toast({
        title: "Scan failed",
        description: error instanceof Error ? error.message : "Failed to scan card image",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };
  
  // Handle field change - invalidates any previous analysis results
  const handleFieldChange = (field: string, value: string) => {
    // Invalidate results when any field changes after confirmation
    if (isConfirmed && result) {
      setAnalysisInvalidated(true);
      setResult(null);
    }
    
    switch (field) {
      case "title": setTitle(value); break;
      case "year": setYear(value); break;
      case "set": setSet(value); break;
      case "cardNumber": setCardNumber(value); break;
      case "variation": setVariation(value); break;
      case "grade": setGrade(value); break;
      case "grader": setGrader(value); break;
    }
  };
  
  // Handle confirmation - also upload the scanned image for later use
  const handleConfirmDetails = async () => {
    if (!title.trim()) {
      toast({
        title: "Player name required",
        description: "Please enter at least the player name to continue.",
        variant: "destructive",
      });
      return;
    }
    
    // Upload scanned image to object storage so it can be used when adding to portfolio
    if (scanPreviewUrl && scanPreviewUrl.startsWith("blob:") && !imagePath) {
      try {
        setScanImageUploading(true);
        const response = await fetch(scanPreviewUrl);
        const blob = await response.blob();
        const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
        
        const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
        const { uploadURL } = uploadUrlRes;
        
        await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        
        const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
        setImagePath(updateRes.objectPath);
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        // Continue without image - it's not critical
      } finally {
        setScanImageUploading(false);
      }
    }
    
    setIsConfirmed(true);
    setAnalysisInvalidated(false);
    toast({
      title: "Details confirmed",
      description: "Get market outlook or add directly to your portfolio.",
    });
  };
  
  // Reset to edit mode (go back to confirmation step)
  const handleEditDetails = () => {
    setIsConfirmed(false);
    setResult(null);
    setAnalysisInvalidated(false);
  };

  // Use scan result to populate manual form and run full analysis
  const useScanForAnalysis = async () => {
    if (!scanResult?.scan?.cardIdentification) return;
    
    const card = scanResult.scan.cardIdentification;
    const gradeInfo = scanResult.scan.gradeEstimate;
    
    setTitle(card.playerName || "");
    setYear(card.year?.toString() || "");
    setSet(card.setName || "");
    setCardNumber(card.cardNumber || "");
    setVariation(card.parallel || card.variation || "");
    setGrade(gradeInfo.grade || "");
    setGrader(gradeInfo.gradingCompany || (gradeInfo.appearsToBe === "raw" ? "raw" : ""));
    
    // Preserve the scanned image for the manual form
    if (scanPreviewUrl) {
      setPreviewUrl(scanPreviewUrl);
      
      // Upload the scanned image to object storage so it persists
      if (scanPreviewUrl.startsWith("blob:")) {
        try {
          setScanImageUploading(true);
          const response = await fetch(scanPreviewUrl);
          const blob = await response.blob();
          const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
          
          const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
          const { uploadURL } = uploadUrlRes;
          
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          
          const updateRes = await apiRequest("PUT", "/api/card-images", { cardImageURL: uploadURL });
          setImagePath(updateRes.objectPath);
        } catch (uploadError) {
          // Continue without image - it's not critical for analysis
          toast({
            title: "Image upload issue",
            description: "Card details saved, but photo may not persist",
            variant: "destructive",
          });
        } finally {
          setScanImageUploading(false);
        }
      }
    }
    
    // Switch to manual mode with pre-filled data
    setInputMode("manual");
    setScanResult(null);
    
    toast({
      title: "Card details loaded",
      description: "Review and adjust the details, then click 'Get Outlook' for full analysis.",
    });
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
          {/* NEW WORKFLOW: Confirmation screen after scan */}
          {scanIdentifyResult && !isConfirmed ? (
            <div className="space-y-6">
              {/* Header with scanned image and confidence */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">Confirm Card Details</h3>
                    <p className="text-sm text-muted-foreground">Review and edit before analysis</p>
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className={
                    scanIdentifyResult.scan.confidence === "high" ? "bg-green-500/10 text-green-600" :
                    scanIdentifyResult.scan.confidence === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                    "bg-red-500/10 text-red-600"
                  }
                >
                  {scanIdentifyResult.scan.confidence.toUpperCase()} Scan Confidence
                </Badge>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="confirm-title">Player Name *</Label>
                  <Input
                    id="confirm-title"
                    value={title}
                    onChange={(e) => handleFieldChange("title", e.target.value)}
                    className={scanIdentifyResult.scan.confidence === "low" ? "border-yellow-500" : ""}
                    data-testid="input-confirm-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-year">Year</Label>
                  <Input
                    id="confirm-year"
                    value={year}
                    onChange={(e) => handleFieldChange("year", e.target.value)}
                    data-testid="input-confirm-year"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-set">Set</Label>
                  <Input
                    id="confirm-set"
                    value={set}
                    onChange={(e) => handleFieldChange("set", e.target.value)}
                    data-testid="input-confirm-set"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-cardNumber">Card #</Label>
                  <Input
                    id="confirm-cardNumber"
                    value={cardNumber}
                    onChange={(e) => handleFieldChange("cardNumber", e.target.value)}
                    data-testid="input-confirm-card-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-variation">Variation / Parallel</Label>
                  <Input
                    id="confirm-variation"
                    value={variation}
                    onChange={(e) => handleFieldChange("variation", e.target.value)}
                    data-testid="input-confirm-variation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-grade">Grade</Label>
                  <Input
                    id="confirm-grade"
                    value={grade}
                    onChange={(e) => handleFieldChange("grade", e.target.value)}
                    data-testid="input-confirm-grade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-grader">Grading Company</Label>
                  <Select value={grader} onValueChange={(val) => handleFieldChange("grader", val)}>
                    <SelectTrigger data-testid="select-confirm-grader">
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

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleConfirmDetails} disabled={!title.trim() || scanImageUploading} data-testid="button-confirm-details">
                  {scanImageUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    "Confirm & Continue"
                  )}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={scanImageUploading} data-testid="button-skip-scan">
                  <X className="h-4 w-4 mr-2" />
                  Start Over
                </Button>
              </div>

              {/* Scan info note */}
              <p className="text-xs text-muted-foreground">
                AI scan is assistive only. Please verify all details before analysis.
              </p>
            </div>
          ) : isConfirmed && !result ? (
            /* Confirmed Card - Ready for Action */
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[year, set, variation, grade ? `${grader === "raw" ? "Raw" : `${grader} ${grade}`}` : null].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleEditDetails} data-testid="button-edit-details">
                  Edit Details
                </Button>
              </div>

              {analysisInvalidated && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm text-yellow-600">Card details were changed. Previous results have been cleared.</span>
                </div>
              )}

              {/* Action Buttons - Full Outlook & Add to Portfolio */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending || !canAnalyze}
                  className="flex-1 sm:flex-none"
                  data-testid="button-run-full-outlook"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span className="min-w-[200px] text-left">{loadingMessages[loadingMessageIndex]}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Get Market Outlook
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmedAddDialog(true)}
                  className="flex-1 sm:flex-none"
                  data-testid="button-add-to-portfolio-confirmed"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Portfolio
                </Button>
              </div>
              
              {!canAnalyze && (
                <p className="text-xs text-muted-foreground text-center">
                  Free limit reached. <Link href="/upgrade" className="text-primary hover:underline">Upgrade to Pro</Link> for market analysis.
                </p>
              )}
              
              <p className="text-sm text-muted-foreground text-center">
                Get AI-powered investment insights or add directly to your collection
              </p>
            </div>
          ) : !result && !scanResult ? (
            <>
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit" data-testid="mode-toggle">
                <Button
                  variant={inputMode === "scan" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setInputMode("scan")}
                  data-testid="button-mode-scan"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Scan Photo
                </Button>
                <Button
                  variant={inputMode === "manual" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setInputMode("manual")}
                  data-testid="button-mode-manual"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Enter Details
                </Button>
              </div>

              {inputMode === "scan" ? (
                /* Photo Scan Mode */
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-muted/30">
                    {scanPreviewUrl ? (
                      <div className="relative w-48 h-64 mb-4">
                        <img 
                          src={scanPreviewUrl} 
                          alt="Card to scan" 
                          className="w-full h-full object-contain rounded-lg"
                        />
                        {scanning && (
                          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center rounded-lg">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <span className="text-sm font-medium">Identifying card...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                          <Sparkles className="h-10 w-10 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg mb-2">AI Card Scanner</h3>
                        <p className="text-muted-foreground text-sm mb-4 max-w-sm">
                          Upload a photo of any sports card and our AI will identify it and look up current market prices
                        </p>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap gap-3 justify-center">
                      <div className="relative">
                        <Button 
                          variant="default" 
                          disabled={scanning}
                          data-testid="button-scan-camera"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Take Photo
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoScan(file);
                          }}
                          disabled={scanning}
                          data-testid="input-scan-camera"
                        />
                      </div>
                      <div className="relative">
                        <Button 
                          variant={scanPreviewUrl ? "default" : "outline"} 
                          disabled={scanning}
                          data-testid="button-scan-upload"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {scanPreviewUrl ? "Try Different Photo" : "Upload Photo"}
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoScan(file);
                          }}
                          disabled={scanning}
                          data-testid="input-scan-photo"
                        />
                      </div>
                    </div>
                    
                    {!scanning && (
                      <p className="text-xs text-muted-foreground mt-4 text-center">
                        Works best with clear, well-lit photos of the card front
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Manual Entry Mode */
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
                    {recentSearches.length > 0 && !title && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-xs text-muted-foreground">Recent:</span>
                        {recentSearches.slice(0, 5).map((search, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="text-xs px-2 py-0.5 rounded-full bg-muted hover-elevate text-muted-foreground"
                            onClick={() => setTitle(search)}
                            data-testid={`chip-recent-search-${idx}`}
                          >
                            {search}
                          </button>
                        ))}
                      </div>
                    )}
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

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => analyzeMutation.mutate()}
                    disabled={!title || analyzeMutation.isPending || !canAnalyze}
                    data-testid="button-quick-analyze"
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        <span className="min-w-[200px] text-left">{loadingMessages[loadingMessageIndex]}</span>
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
              </div>
              )}
            </>
          ) : scanResult ? (
            /* Scan Result Display */
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {scanPreviewUrl && (
                    <img 
                      src={scanPreviewUrl} 
                      alt="Scanned card" 
                      className="w-16 h-22 object-contain rounded-md border"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg" data-testid="text-scan-player">
                      {scanResult.scan.cardIdentification.playerName}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-scan-card-info">
                      {scanResult.scan.cardIdentification.year} {scanResult.scan.cardIdentification.setName}
                      {scanResult.scan.cardIdentification.parallel && ` - ${scanResult.scan.cardIdentification.parallel}`}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className={
                    scanResult.scan.confidence === "high" ? "bg-green-500/10 text-green-600" :
                    scanResult.scan.confidence === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                    "bg-red-500/10 text-red-600"
                  }
                  data-testid="badge-scan-confidence"
                >
                  {scanResult.scan.confidence.toUpperCase()} Confidence
                </Badge>
              </div>

              {/* Card Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Sport</p>
                  <p className="font-medium capitalize">{scanResult.scan.cardIdentification.sport}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Condition</p>
                  <p className="font-medium capitalize">
                    {scanResult.scan.gradeEstimate.appearsToBe === "graded" 
                      ? `${scanResult.scan.gradeEstimate.gradingCompany} ${scanResult.scan.gradeEstimate.grade}`
                      : "Raw"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Rarity</p>
                  <p className="font-medium capitalize">{scanResult.scan.marketContext.rarity}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">
                    {scanResult.scan.cardIdentification.isRookie ? "Rookie Card" : "Card Type"}
                  </p>
                  <p className="font-medium">
                    {scanResult.scan.cardIdentification.isRookie ? "Yes" : "Non-Rookie"}
                  </p>
                </div>
              </div>

              {/* Pricing Section */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold">Market Pricing</h4>
                  {scanResult.pricing.isAIEstimate && (
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Estimate
                    </Badge>
                  )}
                </div>
                
                {scanResult.pricing.available ? (
                  <div className="space-y-3">
                    {/* Show AI condition-based estimates */}
                    {scanResult.pricing.isAIEstimate && scanResult.pricing.aiEstimate?.estimates?.length ? (
                      <div className="space-y-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-muted-foreground text-left">
                              <th className="pb-2 font-medium">Condition</th>
                              <th className="pb-2 font-medium text-right">Estimated Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scanResult.pricing.aiEstimate.estimates.map((est, idx) => (
                              <tr key={idx} className="border-t border-border/50">
                                <td className="py-2">{est.condition}</td>
                                <td className="py-2 text-right font-medium">
                                  ${est.minPrice.toLocaleString()} - ${est.maxPrice.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-sm text-muted-foreground pt-2 border-t">
                          {scanResult.pricing.aiEstimate.marketNotes || scanResult.pricing.marketAssessment}
                        </p>
                      </div>
                    ) : scanResult.pricing.isAIEstimate ? (
                      // AI estimate flag is set but no valid estimates - show fallback message
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">AI pricing estimate unavailable for this card</p>
                        {scanResult.pricing.marketAssessment && (
                          <p className="text-sm text-muted-foreground mt-2">{scanResult.pricing.marketAssessment}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Standard eBay pricing display */}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Price Range</span>
                          <span className="font-semibold text-lg" data-testid="text-scan-price-range">
                            {scanResult.pricing.priceRange}
                          </span>
                        </div>
                        {scanResult.pricing.medianPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Median Price</span>
                            <span className="font-medium">${scanResult.pricing.medianPrice.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Recent Sales</span>
                          <span className="font-medium">{scanResult.pricing.soldCount} sold</span>
                        </div>
                        <p className="text-sm text-muted-foreground pt-2 border-t">
                          {scanResult.pricing.marketAssessment}
                        </p>
                        
                        {/* Recent Sales List */}
                        {scanResult.pricing.recentSales.length > 0 && (
                          <div className="pt-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Recent Sales:</p>
                            {scanResult.pricing.recentSales.slice(0, 3).map((sale, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="truncate flex-1 mr-2">{sale.title}</span>
                                <span className="font-medium">${sale.price.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    {scanResult.pricing.isFetching ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground">Fetching market data...</span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{scanResult.pricing.marketAssessment || "Unable to determine pricing"}</p>
                    )}
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              {scanResult.scan.rawAnalysis && (
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">AI Analysis</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {scanResult.scan.rawAnalysis}
                  </p>
                  {scanResult.scan.marketContext.collectibilityNotes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {scanResult.scan.marketContext.collectibilityNotes}
                    </p>
                  )}
                </div>
              )}

              {/* Usage Info */}
              <div className="text-xs text-muted-foreground text-center">
                {scanResult.usage.remainingScans} scans remaining today
                {!scanResult.usage.isPro && " (Free tier)"}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap justify-center">
                {/* Add to Portfolio Dialog */}
                <Dialog open={showScanAddDialog} onOpenChange={setShowScanAddDialog}>
                  <DialogTrigger asChild>
                    <Button disabled={scanImageUploading} data-testid="button-scan-add-to-portfolio">
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Portfolio
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add to Display Case</DialogTitle>
                      <DialogDescription>
                        Choose which display case to add "{scanResult.scan.cardIdentification.playerName}" to.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      {/* Card Preview */}
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        {scanPreviewUrl && (
                          <img 
                            src={scanPreviewUrl} 
                            alt="Card" 
                            className="w-12 h-16 object-contain rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{scanResult.scan.cardIdentification.playerName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {scanResult.scan.cardIdentification.year} {scanResult.scan.cardIdentification.setName}
                          </p>
                          {scanResult.pricing?.medianPrice && (
                            <p className="text-sm text-green-600 font-medium">
                              Est. ${scanResult.pricing.medianPrice.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Select Display Case</Label>
                        <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                          <SelectTrigger data-testid="select-scan-display-case">
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
                        <Button variant="outline" onClick={() => setShowScanAddDialog(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => addScanToCollectionMutation.mutate()}
                          disabled={!selectedCaseId || addScanToCollectionMutation.isPending || scanImageUploading}
                          data-testid="button-confirm-scan-add"
                        >
                          {addScanToCollectionMutation.isPending || scanImageUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {scanImageUploading ? "Uploading..." : "Adding..."}
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
                  onClick={useScanForAnalysis} 
                  disabled={scanImageUploading}
                  data-testid="button-scan-full-analysis"
                >
                  {scanImageUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Get Full Outlook
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setScanResult(null);
                    setScanPreviewUrl(null);
                  }}
                  data-testid="button-scan-another"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Scan Another
                </Button>
                <Button variant="ghost" onClick={resetForm} data-testid="button-scan-reset">
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            </div>
          ) : result ? (
            <Dialog open={!!result} onOpenChange={(open) => !open && resetForm()}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between gap-4 pb-4 border-b">
                  <div className="flex items-center gap-3">
                    {scanPreviewUrl && (
                      <img 
                        src={scanPreviewUrl} 
                        alt="Scanned card" 
                        className="w-16 h-22 object-contain rounded-md border"
                      />
                    )}
                    <div>
                      <DialogTitle className="text-xl">Quick Card Check Result</DialogTitle>
                      <DialogDescription>
                        Market analysis for {result.tempCard.title}
                      </DialogDescription>
                    </div>
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
                      compCount: result.matchConfidence?.totalComps ?? result.comps?.soldCount ?? result.market.compCount,
                      modeledEstimate: result.market.modeledEstimate,
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
          ) : null}
        </CardContent>
      )}

      {/* Add to Portfolio Dialog for new confirmation workflow */}
      <Dialog open={showConfirmedAddDialog} onOpenChange={setShowConfirmedAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Display Case</DialogTitle>
            <DialogDescription>
              Choose which display case to add "{title}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Card Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {scanPreviewUrl && (
                <img 
                  src={scanPreviewUrl} 
                  alt="Card" 
                  className="w-12 h-16 object-contain rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{title}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {[year, set, variation].filter(Boolean).join(" • ")}
                </p>
                {grade && grader && (
                  <p className="text-sm text-muted-foreground">
                    {grader === "raw" ? "Raw" : `${grader} ${grade}`}
                  </p>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Select Display Case</Label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger data-testid="select-confirmed-display-case">
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
              <Button variant="outline" onClick={() => setShowConfirmedAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addConfirmedCardMutation.mutate()}
                disabled={!selectedCaseId || addConfirmedCardMutation.isPending}
                data-testid="button-confirm-add-confirmed"
              >
                {addConfirmedCardMutation.isPending ? (
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

      <SuccessOverlay
        show={showAnalysisSuccess}
        message="Analysis Complete!"
        onComplete={() => {
          setShowAnalysisSuccess(false);
          if (result) {
            toast({ title: "Analysis complete", description: `Got ${result.action} recommendation for ${title}` });
          }
        }}
      />
    </Card>
  );
}

// Helper to extract player name from card title (usually first part before year/set info)
function extractPlayerName(cardTitle: string): string {
  // Common patterns: "Patrick Mahomes 2023 Panini", "LeBron James Rookie", etc.
  // Try to extract just the player name portion
  const cleaned = cardTitle
    .replace(/\d{4}/g, '') // Remove years
    .replace(/\s+(PSA|BGS|SGC|CGC)\s*\d*/gi, '') // Remove grading
    .replace(/\s+(Rookie|RC|Auto|Autograph|Refractor|Prizm|Mosaic|Chrome|Topps|Panini|Bowman|Select|Optic)/gi, '')
    .replace(/\s+#\d+/g, '') // Remove card numbers
    .trim();
  
  // Return first 2-3 words as likely player name, fallback to cleaned title
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return words.slice(0, 3).join(' ');
  }
  return cleaned || cardTitle;
}

function CardOutlookRow({ card, isPro, showDetails = true, canAnalyze = false, onAnalyze }: { 
  card: CardType; 
  isPro: boolean; 
  showDetails?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Use card's stored player name and sport, fallback to extraction from title
  const playerName = card.playerName || extractPlayerName(card.title);
  const sport = card.sport || 'football'; // Default to football if not specified
  const playerKey = `${sport}:${playerName.toLowerCase().replace(/\s+/g, '_')}`;
  
  // Check if player is in watchlist
  const { data: watchlistStatus } = useQuery({
    queryKey: ['/api/unified-watchlist/check', { type: 'player', playerKey }],
    queryFn: async () => {
      const res = await fetch(`/api/unified-watchlist/check?type=player&playerKey=${encodeURIComponent(playerKey)}`);
      if (!res.ok) return { watching: false };
      return res.json();
    },
    enabled: card.outlookAction === 'MONITOR' && isPro,
  });

  // Add to watchlist mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/unified-watchlist', {
        itemType: 'player',
        playerKey,
        playerName,
        sport,
        actionAtAdd: card.outlookAction,
        estimatedValueAtAdd: card.estimatedValue,
        source: 'market-outlook',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/unified-watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['/api/unified-watchlist/check', { type: 'player', playerKey }] });
      toast({ title: 'Added to Watchlist', description: `${playerName} added to your watchlist` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/cards/${card.id}/outlook-v2`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/outlook-usage"] });
      toast({ title: "Outlook generated", description: `Analysis complete for ${card.title}` });
      onAnalyze?.();
      // Navigate to the outlook details page so user can see results immediately
      navigate(`/card/${card.id}/outlook`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const hasOutlook = card.outlookAction !== null;
  const isBigMover = card.outlookBigMover === true;
  const isMonitor = card.outlookAction === 'MONITOR';
  const isInWatchlist = watchlistStatus?.watching ?? false;

  const handleRowClick = () => {
    if (hasOutlook && isPro) {
      navigate(`/card/${card.id}/outlook`);
    }
  };

  return (
    <div 
      className={`flex items-center gap-4 p-4 border rounded-lg hover-elevate ${hasOutlook && isPro ? 'cursor-pointer' : ''}`} 
      data-testid={`outlook-row-${card.id}`}
      onClick={handleRowClick}
    >
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
            {isMonitor && !isInWatchlist && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                onClick={(e) => {
                  e.stopPropagation();
                  addToWatchlistMutation.mutate();
                }}
                disabled={addToWatchlistMutation.isPending}
                data-testid={`button-add-watchlist-${card.id}`}
              >
                {addToWatchlistMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Star className="h-3 w-3" />
                    <span className="hidden sm:inline">Watch</span>
                  </>
                )}
              </Button>
            )}
            {isMonitor && isInWatchlist && (
              <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                <Star className="h-3 w-3 fill-current" />
                Watching
              </Badge>
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
            onClick={(e) => { e.stopPropagation(); generateMutation.mutate(); }}
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
  const monitorCards = cardsWithOutlook.filter(c => c.outlookAction === "MONITOR");
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
        <div className="mt-4">
          <Link href="/player-outlook">
            <Button variant="outline" className="gap-2" data-testid="link-player-outlook">
              <TrendingUp className="h-4 w-4" />
              Try Player Outlook
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
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
          {/* Portfolio Summary with contextual insights */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cards</CardDescription>
                <CardTitle className="text-2xl" data-testid="text-total-cards">{allCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {cardsWithoutOutlook.length > 0 
                    ? `${cardsWithoutOutlook.length} awaiting analysis`
                    : "All cards analyzed"
                  }
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Analyzed</CardDescription>
                <CardTitle className="text-2xl text-primary" data-testid="text-analyzed-cards">{cardsWithOutlook.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {allCards.length > 0 
                    ? `${Math.round((cardsWithOutlook.length / allCards.length) * 100)}% coverage`
                    : "Add cards to analyze"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={bigMovers.length > 0 ? "border-purple-500/30 bg-purple-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-purple-500" />
                  Big Movers
                </CardDescription>
                <CardTitle className="text-2xl text-purple-600 dark:text-purple-400" data-testid="text-big-movers">{bigMovers.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {bigMovers.length > 0 
                    ? "High upside, moderate risk"
                    : "None detected yet"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={buyCards.length > 0 ? "border-green-500/30 bg-green-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-green-500" />
                  Buy
                </CardDescription>
                <CardTitle className="text-2xl text-green-600 dark:text-green-400" data-testid="text-buy-cards">{buyCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {buyCards.length > 0 
                    ? "Good entry points identified"
                    : "No clear buys right now"
                  }
                </p>
              </CardContent>
            </Card>
            <Card className={sellCards.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Sell
                </CardDescription>
                <CardTitle className="text-2xl text-red-600 dark:text-red-400" data-testid="text-sell-cards">{sellCards.length}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-[10px] text-muted-foreground">
                  {sellCards.length > 0 
                    ? "Consider taking profits"
                    : "Nothing to exit now"
                  }
                </p>
              </CardContent>
            </Card>
          </div>
          
          {/* Context line when few cards analyzed */}
          {cardsWithOutlook.length < 3 && allCards.length > 0 && (
            <div className="mb-6 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Analyze more cards to see patterns. With only {cardsWithOutlook.length} analyzed, it's too early for portfolio-level insights.
            </div>
          )}

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

          {monitorCards.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">Monitor List</h2>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                  {monitorCards.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                AI suggests monitoring these players. Add them to your personal watchlist to track outlook changes.
              </p>
              <div className="space-y-2">
                {monitorCards.map((card: CardType) => (
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
