import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { SuccessOverlay } from "@/components/success-animation";
import { KeyboardHint } from "@/components/keyboard-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Globe, 
  Lock, 
  Plus, 
  Trash2, 
  Eye,
  Upload,
  ImageIcon,
  Save,
  X,
  RefreshCw,
  Loader2,
  Zap,
  ArrowUpDown,
  ArrowDownAZ,
  CalendarDays,
  DollarSign,
  Camera,
  Sparkles,
  Search,
  CheckCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasProAccess } from "@shared/schema";
import type { DisplayCaseWithCards, Card as CardType } from "@shared/schema";
import { CardDetailModal } from "@/components/card-detail-modal";
import { Badge } from "@/components/ui/badge";
import { OutlookBadge } from "@/components/outlook-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Crown, AlertTriangle } from "lucide-react";
import { DISPLAY_CASE_THEMES } from "@/lib/themes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProFeatureGate } from "@/components/pro-feature-gate";

const LAYOUT_OPTIONS = [
  { id: "grid", name: "Grid", description: "Classic grid layout - cards displayed in rows and columns", icon: "grid" },
  { id: "row", name: "Row", description: "Horizontal scrolling row - great for smaller collections", icon: "row" },
  { id: "showcase", name: "Showcase", description: "Featured first card with smaller cards below", icon: "showcase" },
] as const;

const updateCaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  isPublic: z.boolean(),
  theme: z.string().optional(),
  layout: z.string().optional(),
  showCardCount: z.boolean(),
  showTotalValue: z.boolean(),
});

const addCardSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  set: z.string().max(255).optional(),
  year: z.coerce.number().min(1800).max(new Date().getFullYear() + 1).optional().or(z.literal("")),
  cardNumber: z.string().max(50).optional(),
  variation: z.string().max(255).optional(),
  grade: z.string().max(50).optional(),
  purchasePrice: z.coerce.number().min(0).optional().or(z.literal("")),
  estimatedValue: z.coerce.number().min(0).optional().or(z.literal("")),
  // Card category for outlook scoring
  cardCategory: z.enum(["sports", "tcg", "non_sport"]).default("sports"),
  // Sports card fields for portfolio analytics
  playerName: z.string().max(255).optional(),
  sport: z.enum(["football", "basketball", "baseball", "hockey", "soccer"]).optional(),
  grader: z.enum(["PSA", "BGS", "SGC", "CGC", "HGA", "CSG", "other"]).optional(),
  careerStage: z.enum(["ROOKIE", "RISING", "PRIME", "VETERAN", "RETIRED", "LEGEND"]).optional(),
  isRookie: z.boolean().optional(),
  // TCG/Non-Sport fields
  characterTier: z.string().optional(),
  rarityTier: z.string().optional(),
  eraPrestige: z.string().optional(),
  franchiseHeat: z.string().optional(),
});

type UpdateCaseFormData = z.infer<typeof updateCaseSchema>;
type AddCardFormData = z.infer<typeof addCardSchema>;

function SortableCardTile({ card, onDelete, onClick }: { card: CardType; onDelete: () => void; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative bg-muted rounded-lg overflow-hidden cursor-grab active:cursor-grabbing touch-none"
      data-testid={`card-tile-${card.id}`}
    >
      <div className="aspect-[5/7] relative" onClick={onClick}>
        <img
          src={card.imagePath || undefined}
          alt={card.title}
          className="w-full h-full object-contain bg-muted pointer-events-none"
        />
        {card.outlookAction && (
          <div className="absolute top-1 left-1 pointer-events-none flex items-center gap-1">
            <OutlookBadge action={card.outlookAction} size="sm" />
            {card.outlookBigMover && (
              <div 
                className="bg-purple-500/90 p-1 rounded"
                title="Big Mover Potential"
              >
                <Zap className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        )}
        {card.year && (
          <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
            {card.year}
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white text-sm font-medium truncate">{card.title}</p>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            {card.year && <span>{card.year}</span>}
            {card.estimatedValue && <span>Est. ${card.estimatedValue.toFixed(2)}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 w-8 h-8 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
        data-testid={`button-delete-card-${card.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function CaseEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showAddCard, setShowAddCard] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [duplicateCheckTitle, setDuplicateCheckTitle] = useState("");
  
  // Scan mode state for Add Card - default to scan for easier workflow
  const [addCardMode, setAddCardMode] = useState<"manual" | "scan">("scan");
  const [scanning, setScanning] = useState(false);
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanConfidence, setScanConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: displayCase, isLoading } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}`],
    enabled: isAuthenticated && !!id,
  });

  const { data: user } = useQuery<{ id: string; subscriptionStatus: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  const isPro = hasProAccess(user);

  // Derive selected card from the latest query data to ensure updates are reflected
  const selectedCard = selectedCardId && displayCase?.cards
    ? displayCase.cards.find(c => c.id === selectedCardId) || null
    : null;

  // Duplicate detection - check when title changes
  const { data: duplicates } = useQuery<CardType[]>({
    queryKey: ["/api/cards/duplicates", duplicateCheckTitle],
    queryFn: async () => {
      const res = await fetch(`/api/cards/duplicates?title=${encodeURIComponent(duplicateCheckTitle)}`);
      if (!res.ok) throw new Error("Failed to check duplicates");
      return res.json();
    },
    enabled: isAuthenticated && duplicateCheckTitle.length >= 3,
  });

  const form = useForm<UpdateCaseFormData>({
    resolver: zodResolver(updateCaseSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: true,
      theme: "classic",
      layout: "grid",
      showCardCount: false,
      showTotalValue: false,
    },
  });

  const cardForm = useForm<AddCardFormData>({
    resolver: zodResolver(addCardSchema),
    defaultValues: {
      title: "",
      set: "",
      year: "",
      cardNumber: "",
      variation: "",
      grade: "",
      purchasePrice: "",
      estimatedValue: "",
      cardCategory: "sports",
      // Sports card fields
      playerName: "",
      sport: undefined,
      grader: undefined,
      careerStage: undefined,
      isRookie: false,
      // TCG/Non-Sport fields
      characterTier: "",
      rarityTier: "",
      eraPrestige: "",
      franchiseHeat: "",
    },
  });

  // Keyboard shortcuts for adding cards
  const openAddCardManual = useCallback(() => {
    setAddCardMode("manual");
    setShowAddCard(true);
  }, []);

  const openAddCardScan = useCallback(() => {
    setAddCardMode("scan");
    cardForm.reset();
    setPreviewUrl(null);
    setSelectedFile(null);
    setScanConfidence(null);
    setShowAddCard(true);
  }, [cardForm]);

  useKeyboardShortcuts(
    useMemo(() => [
      { key: 'n', callback: openAddCardManual, description: 'Add new card' },
      { key: 's', callback: openAddCardScan, description: 'Scan card photo' },
    ], [openAddCardManual, openAddCardScan]),
    !showAddCard && !selectedCard
  );

  useEffect(() => {
    if (displayCase) {
      form.reset({
        name: displayCase.name,
        description: displayCase.description || "",
        isPublic: displayCase.isPublic,
        theme: displayCase.theme || "classic",
        layout: displayCase.layout || "grid",
        showCardCount: displayCase.showCardCount ?? false,
        showTotalValue: displayCase.showTotalValue ?? false,
      });
    }
  }, [displayCase, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateCaseFormData) => {
      return await apiRequest("PATCH", `/api/display-cases/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
      toast({
        title: "Display case updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error updating display case",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const addCardMutation = useMutation({
    mutationFn: async (data: AddCardFormData & { imagePath: string }) => {
      const payload = {
        ...data,
        year: data.year === "" ? undefined : Number(data.year),
        cardNumber: data.cardNumber === "" ? undefined : data.cardNumber,
        purchasePrice: data.purchasePrice === "" ? undefined : Number(data.purchasePrice),
        estimatedValue: data.estimatedValue === "" ? undefined : Number(data.estimatedValue),
      };
      return await apiRequest("POST", `/api/display-cases/${id}/cards`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      setShowSuccessAnimation(true);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error adding card",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSuccessAnimationComplete = () => {
    setShowSuccessAnimation(false);
    toast({
      title: "Card added",
      description: "Your card has been added to the display case.",
    });
    setShowAddCard(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setScanPreviewUrl(null);
    setScanConfirmed(false);
    setScanConfidence(null);
    setAddCardMode("manual");
    setDuplicateCheckTitle("");
    cardForm.reset();
  };

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: number) => {
      return await apiRequest("DELETE", `/api/display-cases/${id}/cards/${cardId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({
        title: "Card deleted",
        description: "The card has been removed from your display case.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error deleting card",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/display-cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({
        title: "Display case deleted",
        description: "Your display case has been permanently deleted.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error deleting display case",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [refreshStatus, setRefreshStatus] = useState<{ status: string; total: number; completed: number; failed: number } | null>(null);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshAllPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/refresh-prices`);
    },
    onSuccess: (data) => {
      if (data.status === "running") {
        setRefreshStatus({ status: "running", total: data.total, completed: 0, failed: 0 });
        if (refreshPollRef.current) clearInterval(refreshPollRef.current);
        let pollFailCount = 0;
        refreshPollRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/display-cases/${id}/refresh-prices/status`, { credentials: "include" });
            if (!res.ok) {
              pollFailCount++;
              if (pollFailCount > 5) {
                if (refreshPollRef.current) clearInterval(refreshPollRef.current);
                refreshPollRef.current = null;
                setRefreshStatus(null);
              }
              return;
            }
            pollFailCount = 0;
            const status = await res.json();
            if (status.status === "complete" || status.status === "idle") {
              if (refreshPollRef.current) clearInterval(refreshPollRef.current);
              refreshPollRef.current = null;
              if (status.status === "complete") {
                setRefreshStatus(status);
                queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
                queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
                queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
                const updatedCount = status.results?.filter((r: any) => r.oldValue !== r.newValue).length || 0;
                toast({
                  title: "Values Refreshed",
                  description: `Processed ${status.total} cards. ${updatedCount} values updated.`,
                });
              }
              setTimeout(() => setRefreshStatus(null), 3000);
            } else {
              setRefreshStatus(status);
            }
          } catch (e) {
            pollFailCount++;
            if (pollFailCount > 5) {
              if (refreshPollRef.current) clearInterval(refreshPollRef.current);
              refreshPollRef.current = null;
              setRefreshStatus(null);
            }
          }
        }, 2000);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh card values",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    return () => {
      if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    };
  }, []);

  const reorderMutation = useMutation({
    mutationFn: async (cardIds: number[]) => {
      return await apiRequest("POST", `/api/display-cases/${id}/cards/reorder`, { cardIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
    },
  });

  const autoOrderMutation = useMutation({
    mutationFn: async (orderBy: string) => {
      return await apiRequest("POST", `/api/display-cases/${id}/cards/auto-order`, { orderBy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}/public`] });
      toast({
        title: "Cards Reordered",
        description: "Cards have been automatically sorted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sort Failed",
        description: error.message || "Failed to sort cards",
        variant: "destructive",
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && displayCase?.cards) {
      const oldIndex = displayCase.cards.findIndex((c) => c.id === active.id);
      const newIndex = displayCase.cards.findIndex((c) => c.id === over.id);

      const newCards = arrayMove(displayCase.cards, oldIndex, newIndex);
      const cardIds = newCards.map((c) => c.id);
      reorderMutation.mutate(cardIds);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Compress image for scanning
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
          reject(new Error("Failed to get canvas context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve({ blob, base64 });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        }, "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle scan photo - identifies card and populates form
  const handleScanPhoto = async (file: File) => {
    setScanning(true);
    setScanConfirmed(false);
    setScanConfidence(null);
    
    try {
      const { blob, base64: base64Data } = await compressImage(file, 1200, 0.85);
      
      // Create preview URL
      const previewDataUrl = URL.createObjectURL(blob);
      setScanPreviewUrl(previewDataUrl);
      setPreviewUrl(previewDataUrl);
      setSelectedFile(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      
      const scanAbort = new AbortController();
      const scanTimeout = setTimeout(() => scanAbort.abort(), 120000);
      const scanRes = await fetch("/api/cards/scan-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageData: base64Data, mimeType: "image/jpeg" }),
        signal: scanAbort.signal,
      });
      clearTimeout(scanTimeout);
      if (!scanRes.ok) {
        const errText = (await scanRes.text()) || scanRes.statusText;
        throw new Error(`${scanRes.status}: ${errText}`);
      }
      const response = await scanRes.json();
      
      if (response.success && response.scan?.cardIdentification) {
        const card = response.scan.cardIdentification;
        const gradeInfo = response.scan.gradeEstimate;
        
        // Populate form with scanned data
        cardForm.setValue("title", card.playerName || "");
        cardForm.setValue("year", card.year?.toString() || "");
        cardForm.setValue("set", card.setName || "");
        cardForm.setValue("cardNumber", card.cardNumber || "");
        cardForm.setValue("variation", card.parallel || card.variation || "");
        cardForm.setValue("grade", gradeInfo?.grade || "");
        // Only set grader if it's a valid enum value (raw cards have no grader)
        const validGraders = ["PSA", "BGS", "SGC", "CGC", "HGA", "CSG", "other"];
        if (gradeInfo?.gradingCompany && validGraders.includes(gradeInfo.gradingCompany)) {
          cardForm.setValue("grader", gradeInfo.gradingCompany as "PSA" | "BGS" | "SGC" | "CGC" | "HGA" | "CSG" | "other");
        }
        // If raw card, don't set grader (leave as undefined)
        cardForm.setValue("cardCategory", "sports");
        
        // Set player name for sports card details
        cardForm.setValue("playerName", card.playerName || "");
        
        // Set for duplicate detection
        setDuplicateCheckTitle(card.playerName || "");
        
        setScanConfidence(response.scan.confidence || "medium");
        
        toast({
          title: "Card identified",
          description: "Review and adjust the details, then add to your collection.",
        });
      } else {
        toast({
          title: "Couldn't identify card",
          description: "Please enter the card details manually.",
          variant: "destructive",
        });
        setAddCardMode("manual");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast({
          title: "Scan timed out",
          description: "The scan took too long. Please try again — it may be a connection issue.",
          variant: "destructive",
        });
      } else {
        console.error("Scan error:", error);
        toast({
          title: "Scan failed",
          description: error instanceof Error ? error.message : "Please try again or enter details manually.",
          variant: "destructive",
        });
      }
    } finally {
      setScanning(false);
    }
  };

  // Reset scan state when dialog closes
  const resetAddCardForm = () => {
    cardForm.reset();
    setSelectedFile(null);
    setPreviewUrl(null);
    setScanPreviewUrl(null);
    setScanConfirmed(false);
    setScanConfidence(null);
    setAddCardMode("scan"); // Default back to scan mode
    setDuplicateCheckTitle("");
  };

  const handleAddCard = async (data: AddCardFormData) => {
    if (!selectedFile) {
      toast({
        title: "Image required",
        description: "Please select an image for your card.",
        variant: "destructive",
      });
      return;
    }

    try {
      const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = uploadUrlRes;

      await fetch(uploadURL, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type,
        },
      });

      const updateRes = await apiRequest("PUT", "/api/card-images", {
        cardImageURL: uploadURL,
      });

      addCardMutation.mutate({
        ...data,
        imagePath: updateRes.objectPath,
      });
    } catch (error) {
      toast({
        title: "Error uploading image",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-6 w-32 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!displayCase) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Display case not found</h2>
        <p className="text-muted-foreground mb-4">
          This display case doesn't exist or you don't have access to it.
        </p>
        <Link href="/">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <Link href={`/cases/${id}`}>
          <Button variant="outline" className="gap-2" data-testid="button-view-public">
            <Eye className="h-4 w-4" />
            View Public Page
          </Button>
        </Link>
      </div>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Display Case Details</CardTitle>
            <CardDescription>
              Update the name, description, and visibility of your display case
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-case-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          className="resize-none"
                          {...field}
                          data-testid="input-edit-case-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          {field.value ? (
                            <Globe className="h-4 w-4 text-primary" />
                          ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          )}
                          {field.value ? "Public" : "Private"}
                        </FormLabel>
                        <FormDescription>
                          {field.value
                            ? "Anyone with the link can view this display case"
                            : "Only you can see this display case"}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-is-public"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Theme</FormLabel>
                      <FormDescription>
                        Choose a background theme for your display case
                      </FormDescription>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                        {DISPLAY_CASE_THEMES.map((theme) => {
                          const buttonContent = (
                            <>
                              <div 
                                className="w-full h-12 rounded-md mb-2 border"
                                style={{ background: theme.preview }}
                              />
                              <p className="text-sm font-medium">{theme.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{theme.description}</p>
                            </>
                          );

                          const buttonClasses = `relative p-3 rounded-lg border-2 text-left transition-colors w-full ${
                            field.value === theme.id
                              ? "border-primary"
                              : "border-transparent hover:border-muted-foreground/30"
                          }`;

                          if (theme.isPremium) {
                            return (
                              <ProFeatureGate
                                key={theme.id}
                                isPro={isPro}
                                featureName="Premium Themes"
                                featureDescription="Unlock beautiful premium themes like velvet, wood, ocean, and more to make your display cases stand out."
                                onProClick={() => field.onChange(theme.id)}
                              >
                                <button
                                  type="button"
                                  className={buttonClasses}
                                  data-testid={`button-theme-${theme.id}`}
                                >
                                  {buttonContent}
                                </button>
                              </ProFeatureGate>
                            );
                          }

                          return (
                            <button
                              key={theme.id}
                              type="button"
                              onClick={() => field.onChange(theme.id)}
                              className={buttonClasses}
                              data-testid={`button-theme-${theme.id}`}
                            >
                              {buttonContent}
                            </button>
                          );
                        })}
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="layout"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Layout</FormLabel>
                      <FormDescription>
                        Choose how your cards are arranged in the display case
                      </FormDescription>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        {LAYOUT_OPTIONS.map((layout) => (
                          <button
                            key={layout.id}
                            type="button"
                            onClick={() => field.onChange(layout.id)}
                            className={`relative p-4 rounded-lg border-2 text-left transition-colors ${
                              field.value === layout.id
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/30"
                            }`}
                            data-testid={`button-layout-${layout.id}`}
                          >
                            <div className="w-full h-12 rounded-md bg-muted mb-2 flex items-center justify-center">
                              {layout.id === "grid" && (
                                <div className="grid grid-cols-3 gap-1 p-2">
                                  {[1,2,3,4,5,6].map(i => (
                                    <div key={i} className="w-2 h-3 bg-foreground/30 rounded-sm" />
                                  ))}
                                </div>
                              )}
                              {layout.id === "row" && (
                                <div className="flex gap-1 p-2">
                                  {[1,2,3,4].map(i => (
                                    <div key={i} className="w-3 h-4 bg-foreground/30 rounded-sm" />
                                  ))}
                                </div>
                              )}
                              {layout.id === "showcase" && (
                                <div className="flex flex-col items-center gap-1 p-2">
                                  <div className="w-4 h-5 bg-foreground/40 rounded-sm" />
                                  <div className="flex gap-0.5">
                                    {[1,2,3].map(i => (
                                      <div key={i} className="w-2 h-2.5 bg-foreground/20 rounded-sm" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium">{layout.name}</p>
                            <p className="text-xs text-muted-foreground">{layout.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Display Stats</h4>
                    <p className="text-sm text-muted-foreground">
                      Show collection statistics as a sub-header below the title
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="showCardCount"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Card Count</FormLabel>
                          <FormDescription>
                            Display total number of cards in the collection
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-card-count"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="showTotalValue"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Total Value</FormLabel>
                          <FormDescription>
                            Display estimated total value of the collection
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-total-value"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="gap-2"
                  data-testid="button-save-case"
                >
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>

            <Separator className="my-6" />

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this display case and all its cards
                </p>
              </div>
              <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2" data-testid="button-delete-case">
                    <Trash2 className="h-4 w-4" />
                    Delete Display Case
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Display Case</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete "{displayCase?.name}"? This will permanently remove the display case and all {displayCase?.cards?.length || 0} cards. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                      data-testid="button-cancel-delete"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => deleteCaseMutation.mutate()}
                      disabled={deleteCaseMutation.isPending}
                      data-testid="button-confirm-delete"
                    >
                      {deleteCaseMutation.isPending ? "Deleting..." : "Delete Forever"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Cards</CardTitle>
                <CardDescription>
                  {displayCase.cards?.length || 0} cards in this display case
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isPro && displayCase.cards && displayCase.cards.length > 0 && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => refreshAllPricesMutation.mutate()}
                    disabled={refreshAllPricesMutation.isPending || refreshStatus?.status === "running"}
                    data-testid="button-refresh-all-prices"
                  >
                    {refreshStatus?.status === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : refreshAllPricesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {refreshStatus?.status === "running"
                      ? `Refreshing ${refreshStatus.completed}/${refreshStatus.total}...`
                      : refreshAllPricesMutation.isPending
                        ? "Starting..."
                        : "Refresh All Values"}
                  </Button>
                )}
                {displayCase.cards && displayCase.cards.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="gap-2"
                        disabled={autoOrderMutation.isPending}
                        data-testid="button-auto-order"
                      >
                        {autoOrderMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4" />
                        )}
                        Sort
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Auto-sort cards by</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => autoOrderMutation.mutate("alpha")}
                        data-testid="dropdown-item-sort-alpha"
                      >
                        <ArrowDownAZ className="h-4 w-4 mr-2" />
                        Name (A-Z)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => autoOrderMutation.mutate("year_newest")}
                        data-testid="dropdown-item-sort-year-newest"
                      >
                        <CalendarDays className="h-4 w-4 mr-2" />
                        Year (Newest first)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => autoOrderMutation.mutate("year_oldest")}
                        data-testid="dropdown-item-sort-year-oldest"
                      >
                        <CalendarDays className="h-4 w-4 mr-2" />
                        Year (Oldest first)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => autoOrderMutation.mutate("value_high")}
                        data-testid="dropdown-item-sort-value-high"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Value (Highest first)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => autoOrderMutation.mutate("value_low")}
                        data-testid="dropdown-item-sort-value-low"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Value (Lowest first)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Dialog open={showAddCard} onOpenChange={(open) => {
                  setShowAddCard(open);
                  if (!open) {
                    resetAddCardForm();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-add-card">
                      <Plus className="h-4 w-4" />
                      Add Card
                      <KeyboardHint shortcut="N" />
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add New Card</DialogTitle>
                    <DialogDescription>
                      Scan a photo to auto-fill details or enter manually
                    </DialogDescription>
                  </DialogHeader>
                  
                  {/* Mode Toggle */}
                  <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit" data-testid="add-card-mode-toggle">
                    <Button
                      type="button"
                      variant={addCardMode === "scan" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setAddCardMode("scan");
                        // Clear form when switching to scan mode
                        if (addCardMode !== "scan") {
                          cardForm.reset();
                          setPreviewUrl(null);
                          setSelectedFile(null);
                          setScanConfidence(null);
                        }
                      }}
                      data-testid="button-mode-scan-add"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Scan Photo
                      <KeyboardHint shortcut="S" />
                    </Button>
                    <Button
                      type="button"
                      variant={addCardMode === "manual" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setAddCardMode("manual")}
                      data-testid="button-mode-manual-add"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Enter Details
                    </Button>
                  </div>

                  <Form {...cardForm}>
                    <form onSubmit={cardForm.handleSubmit(handleAddCard)} className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      
                      {/* Scan Mode - Photo Upload with AI */}
                      {addCardMode === "scan" && !scanConfidence && (
                        <div className="space-y-2">
                          <FormLabel>Scan Card Photo</FormLabel>
                          <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/50">
                            {scanning ? (
                              <div className="py-8">
                                <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-3" />
                                <p className="text-sm text-muted-foreground">Identifying card...</p>
                              </div>
                            ) : (
                              <div className="py-4">
                                <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                                <p className="font-medium mb-1">Take or upload a photo</p>
                                <p className="text-sm text-muted-foreground mb-4">
                                  AI will identify the card and fill in the details
                                </p>
                                <div className="flex gap-3 justify-center flex-wrap">
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleScanPhoto(file);
                                      }}
                                      className="hidden"
                                      data-testid="input-scan-camera"
                                    />
                                    <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover-elevate">
                                      <Camera className="h-4 w-4" />
                                      Take Photo
                                    </span>
                                  </label>
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleScanPhoto(file);
                                      }}
                                      className="hidden"
                                      data-testid="input-scan-library"
                                    />
                                    <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 bg-secondary text-secondary-foreground hover-elevate">
                                      <ImageIcon className="h-4 w-4" />
                                      Photo Library
                                    </span>
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Show scan result confidence badge when scanned */}
                      {addCardMode === "scan" && scanConfidence && scanPreviewUrl && (
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <img 
                            src={scanPreviewUrl} 
                            alt="Scanned card" 
                            className="w-16 h-22 object-contain rounded-md border"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="font-medium text-sm">Card Identified</span>
                              <Badge 
                                variant="secondary" 
                                className={
                                  scanConfidence === "high" ? "bg-green-500/10 text-green-600" :
                                  scanConfidence === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                                  "bg-red-500/10 text-red-600"
                                }
                              >
                                {scanConfidence.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Review the details below and adjust if needed
                            </p>
                          </div>
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setScanConfidence(null);
                              setScanPreviewUrl(null);
                              setPreviewUrl(null);
                              setSelectedFile(null);
                              cardForm.reset();
                            }}
                          >
                            Rescan
                          </Button>
                        </div>
                      )}

                      {/* Manual Mode - Regular Image Upload */}
                      {addCardMode === "manual" && (
                        <div className="space-y-2">
                          <FormLabel>Card Image</FormLabel>
                          <div className="border-2 border-dashed rounded-lg p-4 text-center">
                            {previewUrl ? (
                              <div className="relative">
                                <img
                                  src={previewUrl}
                                  alt="Preview"
                                  className="max-h-48 mx-auto rounded-lg object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFile(null);
                                    setPreviewUrl(null);
                                  }}
                                  className="absolute top-2 right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer block py-8">
                                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  Click to upload or drag and drop
                                </p>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleFileChange}
                                  className="hidden"
                                  data-testid="input-card-image"
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      )}

                      <FormField
                        control={cardForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Michael Jordan Rookie Card"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setDuplicateCheckTitle(e.target.value);
                                }}
                                data-testid="input-card-title"
                              />
                            </FormControl>
                            <FormMessage />
                            {duplicates && duplicates.length > 0 && (
                              <Alert className="mt-2 py-2">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                  Possible duplicate: You already have {duplicates.length} card{duplicates.length > 1 ? 's' : ''} with a similar title
                                  {duplicates.length <= 3 && (
                                    <span className="block text-muted-foreground mt-1">
                                      {duplicates.slice(0, 3).map(d => d.title).join(", ")}
                                    </span>
                                  )}
                                </AlertDescription>
                              </Alert>
                            )}
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={cardForm.control}
                        name="cardCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Card Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-card-category">
                                  <SelectValue placeholder="Select card type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="sports">Sports Card</SelectItem>
                                <SelectItem value="tcg">TCG (Pokemon, MTG, etc.)</SelectItem>
                                <SelectItem value="non_sport">Non-Sport (Marvel, Star Wars, etc.)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              Affects how Card Outlook AI analyzes this card
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {cardForm.watch("cardCategory") === "sports" && (
                        <div className="space-y-4 p-3 rounded-md bg-muted/50">
                          <p className="text-xs text-muted-foreground font-medium">Sports Card Details (for Portfolio Analytics)</p>
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={cardForm.control}
                              name="playerName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Player Name</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., Patrick Mahomes"
                                      {...field}
                                      data-testid="input-player-name"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="sport"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Sport</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sport">
                                        <SelectValue placeholder="Select sport" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="football">Football</SelectItem>
                                      <SelectItem value="basketball">Basketball</SelectItem>
                                      <SelectItem value="baseball">Baseball</SelectItem>
                                      <SelectItem value="hockey">Hockey</SelectItem>
                                      <SelectItem value="soccer">Soccer</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="grader"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Grading Company</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-grader">
                                        <SelectValue placeholder="Select grader (or Raw)" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="PSA">PSA</SelectItem>
                                      <SelectItem value="BGS">BGS (Beckett)</SelectItem>
                                      <SelectItem value="SGC">SGC</SelectItem>
                                      <SelectItem value="CGC">CGC</SelectItem>
                                      <SelectItem value="HGA">HGA</SelectItem>
                                      <SelectItem value="CSG">CSG</SelectItem>
                                      <SelectItem value="other">Other / Raw</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="careerStage"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Career Stage</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-career-stage">
                                        <SelectValue placeholder="Select stage" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="ROOKIE">Rookie (1st-2nd year)</SelectItem>
                                      <SelectItem value="RISING">Rising (3rd-5th year)</SelectItem>
                                      <SelectItem value="PRIME">Prime (Peak performance)</SelectItem>
                                      <SelectItem value="VETERAN">Veteran (Declining)</SelectItem>
                                      <SelectItem value="RETIRED">Retired</SelectItem>
                                      <SelectItem value="LEGEND">Legend / HOF</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={cardForm.control}
                            name="isRookie"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value || false}
                                    onChange={field.onChange}
                                    className="h-4 w-4 rounded border-input"
                                    data-testid="checkbox-is-rookie"
                                  />
                                </FormControl>
                                <FormLabel className="text-xs font-normal">This is a rookie card</FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {(cardForm.watch("cardCategory") === "tcg" || cardForm.watch("cardCategory") === "non_sport") && (
                        <div className="space-y-4 p-3 rounded-md bg-muted/50">
                          <p className="text-xs text-muted-foreground font-medium">TCG / Non-Sport Details (for AI Outlook)</p>
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={cardForm.control}
                              name="characterTier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Character Tier</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-character-tier">
                                        <SelectValue placeholder="Select tier" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="S_TIER_ICON">S-Tier Icon (Charizard, Pikachu)</SelectItem>
                                      <SelectItem value="A_TIER_FAVORITE">A-Tier Fan Favorite</SelectItem>
                                      <SelectItem value="B_TIER_POPULAR">B-Tier Popular</SelectItem>
                                      <SelectItem value="C_TIER_NICHE">C-Tier Niche</SelectItem>
                                      <SelectItem value="D_TIER_COMMON">D-Tier Common</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="rarityTier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Rarity</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-rarity-tier">
                                        <SelectValue placeholder="Select rarity" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="SECRET_RARE">Secret Rare / Alt Art</SelectItem>
                                      <SelectItem value="ULTRA_RARE">Ultra Rare / Full Art</SelectItem>
                                      <SelectItem value="RARE_HOLO">Rare Holo</SelectItem>
                                      <SelectItem value="RARE">Rare</SelectItem>
                                      <SelectItem value="UNCOMMON">Uncommon</SelectItem>
                                      <SelectItem value="COMMON">Common</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="eraPrestige"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Era</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-era-prestige">
                                        <SelectValue placeholder="Select era" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="VINTAGE_WOTC">Vintage (WotC 1999-2003)</SelectItem>
                                      <SelectItem value="EARLY_MODERN">Early Modern (2004-2015)</SelectItem>
                                      <SelectItem value="MODERN">Modern (2016+)</SelectItem>
                                      <SelectItem value="SPECIAL_SET">Special Set</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="franchiseHeat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">IP Popularity</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-franchise-heat">
                                        <SelectValue placeholder="Select heat" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="HOT">Hot (new releases, movies)</SelectItem>
                                      <SelectItem value="STABLE">Stable</SelectItem>
                                      <SelectItem value="COOLING">Cooling (declining interest)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={cardForm.control}
                          name="set"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Set (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Fleer"
                                  {...field}
                                  data-testid="input-card-set"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="year"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Year (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="1986"
                                  {...field}
                                  data-testid="input-card-year"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="cardNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Card # (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="10"
                                  {...field}
                                  data-testid="input-card-number"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={cardForm.control}
                        name="variation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Variation (optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Cracked Ice 1/10"
                                {...field}
                                data-testid="input-card-variation"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={cardForm.control}
                          name="grade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Grade (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="PSA 10"
                                  {...field}
                                  data-testid="input-card-grade"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="purchasePrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Purchase Price</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="100.00"
                                  {...field}
                                  data-testid="input-card-purchase-price"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="estimatedValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Est. Value</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="500.00"
                                  {...field}
                                  data-testid="input-card-estimated-value"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      </div>

                      <DialogFooter className="mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddCard(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={addCardMutation.isPending || !selectedFile}
                          data-testid="button-submit-card"
                        >
                          {addCardMutation.isPending ? "Adding..." : "Add Card"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!displayCase.cards || displayCase.cards.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start building your display case by adding your first card.
                </p>
                <Button onClick={() => setShowAddCard(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Card
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayCase.cards.map((c) => c.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {displayCase.cards.map((card) => (
                      <SortableCardTile
                        key={card.id}
                        card={card}
                        onDelete={() => deleteCardMutation.mutate(card.id)}
                        onClick={() => setSelectedCardId(card.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      </div>

      <CardDetailModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCardId(null)}
        displayCaseId={parseInt(id || "0")}
        canEdit={true}
        isPro={isPro}
      />

      <SuccessOverlay
        show={showSuccessAnimation}
        message="Card Added!"
        onComplete={handleSuccessAnimationComplete}
      />
    </div>
  );
}
