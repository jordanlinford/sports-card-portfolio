import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Edit2, Save, X, Calendar, Award, DollarSign, TrendingUp, TrendingDown, FileText, Sparkles, RefreshCw, Loader2, Tag, Bookmark, HandCoins, ArrowRightLeft, Trash2, ImagePlus, BarChart3, GitCompare } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Card } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MakeOfferModal } from "@/components/make-offer-modal";
import { ProposeTradeModal } from "@/components/propose-trade-modal";
import { CardOutlookPanel } from "@/components/card-outlook-panel";
import { CardPriceAlertsPanel } from "@/components/card-price-alerts-panel";
import { PriceSparkline } from "@/components/price-sparkline";
import { ProFeatureGate } from "@/components/pro-feature-gate";
import { sanitizeCardField } from "@/lib/sanitizeCardField";
import { bucketVerdict } from "@/lib/verdictBuckets";

function humanReadableVerdict(verdict: string): string {
  return verdict
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function VerdictDivergenceNote({
  cardOutlookAction,
  playerName,
}: {
  cardOutlookAction?: string | null;
  playerName: string;
}) {
  const { data: signalsData } = useQuery<{ signals: Array<{ action?: string | null }> }>({
    queryKey: ["/api/alpha/signals/player", playerName],
    queryFn: async () => {
      const res = await fetch(`/api/alpha/signals/player/${encodeURIComponent(playerName)}`);
      if (!res.ok) return { signals: [] };
      return res.json();
    },
    enabled: !!playerName,
    staleTime: 1000 * 60 * 5,
  });

  const playerVerdict = signalsData?.signals?.[0]?.action;
  if (!playerVerdict) return null;

  const cardBucket = bucketVerdict(cardOutlookAction);
  const playerBucket = bucketVerdict(playerVerdict);
  if (!cardBucket || !playerBucket) return null;
  if (cardBucket === playerBucket) return null;

  return (
    <p
      className="text-xs text-muted-foreground italic mt-2"
      data-testid="text-verdict-divergence-modal"
    >
      The overall {playerName} market signal is {humanReadableVerdict(playerVerdict)} — this card's signal differs based on its specific variation.
    </p>
  );
}

interface CardDetailModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  displayCaseId: number;
  canEdit?: boolean;
  isPro?: boolean;
  isAuthenticated?: boolean;
  ownerUserId?: string;
}

interface EditFormData {
  title: string;
  playerName: string;
  sport: string;
  position: string;
  set: string;
  year: string;
  variation: string;
  grade: string;
  grader: string;
  careerStage: string;
  isRookie: boolean;
  purchasePrice: string;
  manualValue: string; // User-entered value that overrides AI estimates
  notes: string;
  tags: string[];
  openToOffers: boolean;
  minOfferAmount: string;
}

const SUGGESTED_TAGS = [
  "Rookie", "Auto", "Refractor", "Numbered", "Patch", "1/1", "SSP", 
  "Insert", "Base", "Parallel", "Vintage", "Modern", "HOF", 
  "Football", "Basketball", "Baseball", "Hockey", "Soccer"
];

export function CardDetailModal({ 
  card, 
  isOpen, 
  onClose, 
  displayCaseId,
  canEdit = false,
  isPro = false,
  isAuthenticated = false,
  ownerUserId
}: CardDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [playerSuggestions, setPlayerSuggestions] = useState<Array<{ name: string; sport: string }>>([]);
  const [showPlayerSuggestions, setShowPlayerSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [refreshedValue, setRefreshedValue] = useState<number | null>(null);
  const [oneOfOneProjection, setOneOfOneProjection] = useState<{
    isOneOfOne: boolean;
    projectedValue: number | null;
    multiplierUsed: number | null;
    baseParallel: string | null;
    baseParallelValue: number | null;
    parallelComps: Array<{ parallel: string; estimatedValue: number | null; salesFound: number; confidence: string }>;
    projectionMethod: string;
  } | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | undefined>(undefined);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const deleteCardMutation = useMutation({
    mutationFn: async () => {
      if (!card) return;
      await apiRequest("DELETE", `/api/display-cases/${displayCaseId}/cards/${card.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}/public`] });
      toast({
        title: "Card deleted",
        description: "The card has been removed from your collection.",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearNewImage = () => {
    setNewImageFile(null);
    setNewImagePreview(undefined);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const { data: bookmarkStatus, refetch: refetchBookmark } = useQuery<{ hasBookmarked: boolean; bookmarkCount: number }>({
    queryKey: ["/api/cards", card?.id, "bookmark-status"],
    queryFn: async () => {
      if (!card) return { hasBookmarked: false, bookmarkCount: 0 };
      const res = await fetch(`/api/cards/${card.id}/bookmark-status`);
      if (!res.ok) return { hasBookmarked: false, bookmarkCount: 0 };
      return res.json();
    },
    enabled: isOpen && !!card && isAuthenticated && !canEdit,
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!card) return;
      if (bookmarkStatus?.hasBookmarked) {
        await apiRequest("DELETE", `/api/cards/${card.id}/bookmark`);
      } else {
        await apiRequest("POST", `/api/cards/${card.id}/bookmark`);
      }
    },
    onSuccess: () => {
      refetchBookmark();
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      toast({
        title: bookmarkStatus?.hasBookmarked ? "Bookmark Removed" : "Card Bookmarked",
        description: bookmarkStatus?.hasBookmarked 
          ? "Card removed from your bookmarks" 
          : "Card added to your bookmarks",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update bookmark",
        variant: "destructive",
      });
    },
  });

  const { data: internalAvgData } = useQuery<{
    internalAvg: number | null;
    count: number;
    min?: number;
    max?: number;
    oldestObservedAt: string | null;
    newestObservedAt: string | null;
  }>({
    queryKey: ["/api/cards", card?.id, "internal-avg"],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${card!.id}/internal-avg`);
      if (!res.ok) return { internalAvg: null, count: 0, oldestObservedAt: null, newestObservedAt: null };
      return res.json();
    },
    enabled: isOpen && !!card && isAuthenticated,
    staleTime: 1000 * 60 * 10,
  });

  const refreshPriceMutation = useMutation({
    mutationFn: async (cardId: number) => {
      return await apiRequest("POST", `/api/cards/${cardId}/lookup-price`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}/public`] });
      
      if (data.oneOfOneProjection) {
        setOneOfOneProjection(data.oneOfOneProjection);
      }
      
      if (data.updated) {
        const isProjected = data.oneOfOneProjection?.baseParallel;
        toast({
          title: isProjected ? "1/1 Value Projected" : "Value Updated",
          description: isProjected 
            ? `Projected from ${data.oneOfOneProjection.baseParallel} parallel: $${data.estimatedValue?.toFixed(2)} (${data.oneOfOneProjection.multiplierUsed}x multiplier)`
            : `Found ${data.salesFound} sales. Value: $${data.estimatedValue?.toFixed(2)} (${data.confidence} confidence)`,
        });
        setRefreshedValue(data.estimatedValue);
      } else {
        toast({
          title: "No Value Found",
          description: data.details || "Could not find recent sales for this card.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Lookup Failed",
        description: error.message || "Failed to lookup card price",
        variant: "destructive",
      });
    },
  });
  
  const [formData, setFormData] = useState<EditFormData>({
    title: "",
    playerName: "",
    sport: "",
    position: "",
    set: "",
    year: "",
    variation: "",
    grade: "",
    grader: "",
    careerStage: "",
    isRookie: false,
    purchasePrice: "",
    manualValue: "",
    notes: "",
    tags: [],
    openToOffers: false,
    minOfferAmount: "",
  });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (card) {
      setFormData({
        title: card.title || "",
        playerName: card.playerName || "",
        sport: card.sport || "",
        position: card.position || "",
        set: card.set || "",
        year: card.year?.toString() || "",
        variation: card.variation || "",
        grade: card.grade || "",
        grader: card.grader || "",
        careerStage: card.legacyTier || "",
        isRookie: card.isRookie || false,
        purchasePrice: card.purchasePrice?.toString() || "",
        manualValue: card.manualValue?.toString() || "",
        notes: card.notes || "",
        tags: card.tags || [],
        openToOffers: card.openToOffers || false,
        minOfferAmount: card.minOfferAmount?.toString() || "",
      });
      setRefreshedValue(null);
      setOneOfOneProjection(null);
    }
  }, [card]);

  if (!card) return null;

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Card title is required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // If there's a new image, upload it first
      let newImagePath = null;
      if (newImageFile) {
        // Get signed upload URL
        const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
        const { uploadURL } = uploadUrlRes;

        // Upload directly to cloud storage
        await fetch(uploadURL, {
          method: "PUT",
          body: newImageFile,
          headers: {
            "Content-Type": newImageFile.type,
          },
        });

        // Finalize and get the public path
        const updateRes = await apiRequest("PUT", "/api/card-images", {
          cardImageURL: uploadURL,
        });
        newImagePath = updateRes.objectPath;
      }

      await apiRequest("PATCH", `/api/display-cases/${displayCaseId}/cards/${card.id}`, {
        title: formData.title.trim(),
        playerName: formData.playerName.trim() || null,
        sport: formData.sport.trim() || null,
        position: formData.position.trim() || null,
        set: formData.set.trim() || null,
        year: formData.year ? parseInt(formData.year) : null,
        variation: formData.variation.trim() || null,
        grade: formData.grade.trim() || null,
        grader: formData.grader.trim() || null,
        careerStage: formData.careerStage.trim() || null,
        isRookie: formData.isRookie,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        manualValue: formData.manualValue ? parseFloat(formData.manualValue) : null,
        notes: formData.notes.trim() || null,
        tags: formData.tags.length > 0 ? formData.tags : null,
        openToOffers: formData.openToOffers,
        minOfferAmount: formData.minOfferAmount ? parseFloat(formData.minOfferAmount) : null,
        ...(newImagePath && { imagePath: newImagePath }),
      });
      
      // Use refetchQueries to wait for fresh data before closing edit mode
      await queryClient.refetchQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      await queryClient.refetchQueries({ queryKey: [`/api/display-cases/${displayCaseId}/public`] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      // Invalidate any /api/cards/search queries (untagged list, search results, etc.)
      // so the parent page reflects the just-saved changes instead of showing stale data.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/cards/search");
        },
      });
      
      // Mutate the parent-supplied card object so the view-mode display reflects
      // the just-saved values immediately (the search/list parent doesn't refetch
      // its cached row, so without this the modal would still show stale data).
      if (card) {
        (card as any).title = formData.title.trim();
        (card as any).playerName = formData.playerName.trim() || null;
        (card as any).sport = formData.sport.trim() || null;
        (card as any).position = formData.position.trim() || null;
        (card as any).set = formData.set.trim() || null;
        (card as any).year = formData.year ? parseInt(formData.year) : null;
        (card as any).variation = formData.variation.trim() || null;
        (card as any).grade = formData.grade.trim() || null;
        (card as any).grader = formData.grader.trim() || null;
        (card as any).legacyTier = formData.careerStage.trim() || null;
        (card as any).isRookie = formData.isRookie;
        (card as any).purchasePrice = formData.purchasePrice ? parseFloat(formData.purchasePrice) : null;
        (card as any).manualValue = formData.manualValue ? parseFloat(formData.manualValue) : null;
        (card as any).notes = formData.notes.trim() || null;
        (card as any).tags = formData.tags.length > 0 ? formData.tags : null;
        (card as any).openToOffers = formData.openToOffers;
        (card as any).minOfferAmount = formData.minOfferAmount ? parseFloat(formData.minOfferAmount) : null;
        if (newImagePath) (card as any).imagePath = newImagePath;
      }

      toast({
        title: "Card updated",
        description: "Your card details have been saved.",
      });
      setIsEditing(false);
      clearNewImage();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save card details.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsEditing(false);
      setTagInput("");
      clearNewImage();
      if (card) {
        setFormData({
          title: card.title || "",
          playerName: card.playerName || "",
          sport: card.sport || "",
          position: card.position || "",
          set: card.set || "",
          year: card.year?.toString() || "",
          variation: card.variation || "",
          grade: card.grade || "",
          grader: card.grader || "",
          careerStage: card.legacyTier || "",
          isRookie: card.isRookie || false,
          purchasePrice: card.purchasePrice?.toString() || "",
          manualValue: card.manualValue?.toString() || "",
          notes: card.notes || "",
          tags: card.tags || [],
          openToOffers: card.openToOffers || false,
          minOfferAmount: card.minOfferAmount?.toString() || "",
        });
      }
      onClose();
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTagInput("");
    clearNewImage();
    if (card) {
      setFormData({
        title: card.title || "",
        playerName: card.playerName || "",
        sport: card.sport || "",
        position: card.position || "",
        set: card.set || "",
        year: card.year?.toString() || "",
        variation: card.variation || "",
        grade: card.grade || "",
        grader: card.grader || "",
        careerStage: card.legacyTier || "",
        isRookie: card.isRookie || false,
        purchasePrice: card.purchasePrice?.toString() || "",
        manualValue: card.manualValue?.toString() || "",
        notes: card.notes || "",
        tags: card.tags || [],
        openToOffers: card.openToOffers || false,
        minOfferAmount: card.minOfferAmount?.toString() || "",
      });
    }
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData({ ...formData, tags: [...formData.tags, trimmedTag] });
    }
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "Not set";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  // Manual value always takes precedence over eBay values
  const manualVal = card.manualValue;
  const currentValue = manualVal ?? refreshedValue ?? card.estimatedValue;
  const hasManualOverride = manualVal != null;
  const profitLoss = currentValue && card.purchasePrice 
    ? currentValue - card.purchasePrice 
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-xl" data-testid="text-card-modal-title">
              {isEditing ? "Edit Card" : card.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {isAuthenticated && !canEdit && (
                <Button
                  size="sm"
                  variant={bookmarkStatus?.hasBookmarked ? "secondary" : "outline"}
                  onClick={() => bookmarkMutation.mutate()}
                  disabled={bookmarkMutation.isPending}
                  data-testid="button-bookmark-card"
                >
                  <Bookmark className={`w-3 h-3 mr-1 ${bookmarkStatus?.hasBookmarked ? "fill-current" : ""}`} />
                  {bookmarkStatus?.hasBookmarked ? "Saved" : "Save"}
                </Button>
              )}
              {canEdit && !isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-card"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-card"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted relative">
            <img
              src={newImagePreview || card.imagePath || ""}
              alt={card.title}
              className="w-full h-full object-contain"
              data-testid="img-card-detail"
            />
            {isEditing && (
              <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  data-testid="input-card-image"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => imageInputRef.current?.click()}
                  data-testid="button-change-image"
                >
                  <ImagePlus className="w-3 h-3 mr-1" />
                  {newImagePreview ? "Change" : "Replace Image"}
                </Button>
                {newImagePreview && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearNewImage}
                    data-testid="button-cancel-image"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-title">Title *</Label>
                  <Input
                    id="edit-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Card title"
                    data-testid="input-edit-title"
                  />
                </div>

                <div className="space-y-1 relative">
                  <Label htmlFor="edit-player-name">
                    Player Name
                    {!formData.playerName && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400" data-testid="text-identify-player-prompt">
                        Identify player →
                      </span>
                    )}
                  </Label>
                  <Input
                    id="edit-player-name"
                    value={formData.playerName}
                    onChange={async (e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, playerName: val });
                      if (val.trim().length >= 2) {
                        try {
                          const res = await fetch(`/api/player-suggestions?q=${encodeURIComponent(val.trim())}`);
                          if (res.ok) {
                            const data = await res.json();
                            setPlayerSuggestions(Array.isArray(data) ? data : []);
                            setShowPlayerSuggestions(true);
                          }
                        } catch {}
                      } else {
                        setPlayerSuggestions([]);
                        setShowPlayerSuggestions(false);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowPlayerSuggestions(false), 150)}
                    onFocus={() => playerSuggestions.length > 0 && setShowPlayerSuggestions(true)}
                    placeholder="e.g., LeBron James"
                    data-testid="input-edit-player-name"
                    autoComplete="off"
                  />
                  {showPlayerSuggestions && playerSuggestions.length > 0 && (
                    <div
                      className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md"
                      data-testid="dropdown-player-suggestions"
                    >
                      {playerSuggestions.map((p) => (
                        <button
                          key={`${p.name}-${p.sport}`}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover-elevate active-elevate-2 flex justify-between items-center"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormData({
                              ...formData,
                              playerName: p.name,
                              sport: formData.sport || p.sport || "",
                            });
                            setShowPlayerSuggestions(false);
                          }}
                          data-testid={`button-player-suggestion-${p.name.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground capitalize">{p.sport}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-sport">Sport</Label>
                    <Input
                      id="edit-sport"
                      value={formData.sport}
                      onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                      placeholder="e.g., Basketball"
                      data-testid="input-edit-sport"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-position">Position</Label>
                    <Input
                      id="edit-position"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="e.g., Point Guard"
                      data-testid="input-edit-position"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-set">Set</Label>
                  <Input
                    id="edit-set"
                    value={formData.set}
                    onChange={(e) => setFormData({ ...formData, set: e.target.value })}
                    placeholder="e.g., Topps Chrome"
                    data-testid="input-edit-set"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-year">Year</Label>
                  <Input
                    id="edit-year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    placeholder="e.g., 2023"
                    data-testid="input-edit-year"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-variation">Variation</Label>
                  <Input
                    id="edit-variation"
                    value={formData.variation}
                    onChange={(e) => setFormData({ ...formData, variation: e.target.value })}
                    placeholder="e.g., Base, Silver Prizm, Rookie Wave insert, Auto /99"
                    data-testid="input-edit-variation"
                  />
                  <p className="text-xs text-muted-foreground">
                    Include "base" for base cards, or describe the parallel/insert type for accurate pricing
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-grade">Grade</Label>
                    <Input
                      id="edit-grade"
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      placeholder="e.g., PSA 10"
                      data-testid="input-edit-grade"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-grader">Grading Company</Label>
                    <Select
                      value={formData.grader}
                      onValueChange={(value) => setFormData({ ...formData, grader: value })}
                    >
                      <SelectTrigger id="edit-grader" data-testid="select-edit-grader">
                        <SelectValue placeholder="Select grader" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PSA">PSA</SelectItem>
                        <SelectItem value="BGS">BGS (Beckett)</SelectItem>
                        <SelectItem value="SGC">SGC</SelectItem>
                        <SelectItem value="CGC">CGC</SelectItem>
                        <SelectItem value="CSG">CSG</SelectItem>
                        <SelectItem value="RAW">Raw (Ungraded)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-career-stage">Career Stage</Label>
                    <Select
                      value={formData.careerStage}
                      onValueChange={(value) => setFormData({ ...formData, careerStage: value })}
                    >
                      <SelectTrigger id="edit-career-stage" data-testid="select-edit-career-stage">
                        <SelectValue placeholder="AI will detect" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PROSPECT">Rookie / Prospect (1st-2nd year)</SelectItem>
                        <SelectItem value="RISING_STAR">Rising Star (3rd-5th year)</SelectItem>
                        <SelectItem value="STAR">Established Star</SelectItem>
                        <SelectItem value="SUPERSTAR">Superstar (MVP-caliber)</SelectItem>
                        <SelectItem value="AGING_VET">Veteran (Declining)</SelectItem>
                        <SelectItem value="BUST">Bust / Career Stalled</SelectItem>
                        <SelectItem value="RETIRED">Retired</SelectItem>
                        <SelectItem value="HOF">Hall of Fame</SelectItem>
                        <SelectItem value="LEGEND_DECEASED">Legend (Deceased)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Set once - AI uses this for analysis</p>
                  </div>

                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="edit-is-rookie"
                      checked={formData.isRookie}
                      onCheckedChange={(checked) => setFormData({ ...formData, isRookie: checked })}
                      data-testid="switch-edit-is-rookie"
                    />
                    <Label htmlFor="edit-is-rookie" className="font-normal">Rookie Card</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-purchase-price">Purchase Price</Label>
                    <Input
                      id="edit-purchase-price"
                      type="number"
                      step="0.01"
                      value={formData.purchasePrice}
                      onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-edit-purchase-price"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-manual-value">
                      Manual Value Override
                      <span className="text-xs text-muted-foreground ml-1">(overrides AI estimate)</span>
                    </Label>
                    <Input
                      id="edit-manual-value"
                      type="number"
                      step="0.01"
                      value={formData.manualValue}
                      onChange={(e) => setFormData({ ...formData, manualValue: e.target.value })}
                      placeholder="Leave empty to use AI estimate"
                      data-testid="input-edit-manual-value"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add notes about this card..."
                    className="min-h-[80px]"
                    data-testid="textarea-edit-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-background">
                    {formData.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pr-1"
                        data-testid={`badge-tag-${tag}`}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted"
                          data-testid={`button-remove-tag-${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => tagInput && addTag(tagInput)}
                      placeholder={formData.tags.length === 0 ? "Add tags..." : ""}
                      className="flex-1 min-w-[100px] border-0 p-0 h-6 focus-visible:ring-0"
                      data-testid="input-tag"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">Suggestions:</span>
                    {SUGGESTED_TAGS.filter(t => !formData.tags.includes(t)).slice(0, 8).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        data-testid={`button-suggest-tag-${tag}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HandCoins className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="open-to-offers" className="text-sm font-normal">
                        Open to Offers
                      </Label>
                    </div>
                    <Switch
                      id="open-to-offers"
                      checked={formData.openToOffers}
                      onCheckedChange={(checked) => setFormData({ ...formData, openToOffers: checked })}
                      data-testid="switch-open-to-offers"
                    />
                  </div>
                  {formData.openToOffers && (
                    <div className="space-y-1 pl-6">
                      <Label htmlFor="min-offer-amount" className="text-sm font-normal text-muted-foreground">
                        Minimum Offer Amount (optional)
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">$</span>
                        <Input
                          id="min-offer-amount"
                          type="number"
                          step="0.01"
                          value={formData.minOfferAmount}
                          onChange={(e) => setFormData({ ...formData, minOfferAmount: e.target.value })}
                          placeholder="0.00"
                          className="max-w-[120px]"
                          data-testid="input-min-offer-amount"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="button-save-card"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                  data-testid="button-cancel-edit"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {!card.playerName && canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                    data-testid="button-identify-player"
                  >
                    <Edit2 className="w-4 h-4" />
                    Identify player →
                  </button>
                )}
                {sanitizeCardField(card.set) && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Set:</span>
                    <span className="font-medium" data-testid="text-card-set">{sanitizeCardField(card.set)}</span>
                  </div>
                )}

                {card.year && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Year:</span>
                    <span className="font-medium" data-testid="text-card-year">{card.year}</span>
                  </div>
                )}

                {sanitizeCardField(card.variation) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Variation:</span>
                    <Badge variant="outline" data-testid="badge-card-variation">{sanitizeCardField(card.variation)}</Badge>
                  </div>
                )}

                {card.grade && (
                  <div className="flex items-center gap-2 text-sm">
                    <Award className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Grade:</span>
                    <Badge variant="secondary" data-testid="badge-card-grade">{card.grade}</Badge>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Purchase Price:</span>
                  <span className="font-medium" data-testid="text-purchase-price">
                    {formatCurrency(card.purchasePrice)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Market Avg (AI):</span>
                  <span className="font-medium" data-testid="text-estimated-value">
                    {formatCurrency(currentValue)}
                  </span>
                  {hasManualOverride && (
                    <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-manual-override">
                      Manual
                    </Badge>
                  )}
                  {(() => {
                    const displayValue = currentValue;
                    const prevValue = refreshedValue ? card.estimatedValue : card.previousValue;
                    if (!hasManualOverride && prevValue && prevValue > 0 && displayValue && displayValue !== prevValue) {
                      return (
                        <Badge 
                          variant={displayValue > prevValue ? "default" : "destructive"}
                          className="gap-1"
                          data-testid="badge-value-change"
                        >
                          {displayValue > prevValue ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {displayValue > prevValue ? '+' : ''}
                          {(((displayValue - prevValue) / prevValue) * 100).toFixed(1)}%
                        </Badge>
                      );
                    }
                    return null;
                  })()}
                </div>

                {internalAvgData && internalAvgData.internalAvg !== null && internalAvgData.count > 0 && (() => {
                  const internalAvg = internalAvgData.internalAvg!;
                  const delta = currentValue && currentValue > 0
                    ? ((currentValue - internalAvg) / internalAvg) * 100
                    : null;
                  const olderDate = internalAvgData.oldestObservedAt
                    ? new Date(internalAvgData.oldestObservedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : null;
                  const newerDate = internalAvgData.newestObservedAt
                    ? new Date(internalAvgData.newestObservedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : null;
                  return (
                    <div className="flex items-center gap-2 text-sm flex-wrap" data-testid="row-internal-avg">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Internal Avg (history):</span>
                      <span className="font-medium" data-testid="text-internal-avg">
                        {formatCurrency(internalAvg)}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="text-internal-avg-meta">
                        from {internalAvgData.count} comp{internalAvgData.count === 1 ? "" : "s"}
                        {olderDate && newerDate && olderDate !== newerDate && ` · ${olderDate}–${newerDate}`}
                        {olderDate && newerDate && olderDate === newerDate && ` · ${newerDate}`}
                      </span>
                      {delta !== null && Math.abs(delta) > 20 && (
                        <Badge
                          variant={delta > 0 ? "default" : "destructive"}
                          className="gap-1 text-xs"
                          title={delta > 0 ? "Market is above our historical average" : "Market is below our historical average"}
                          data-testid="badge-internal-vs-market"
                        >
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs market
                        </Badge>
                      )}
                    </div>
                  );
                })()}

                {oneOfOneProjection && oneOfOneProjection.isOneOfOne && oneOfOneProjection.baseParallel && (
                  <div className="rounded-md border border-dashed p-3 space-y-2" data-testid="section-1of1-projection">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="font-medium">1/1 Projected Value</span>
                      <Badge variant="outline" className="text-xs" data-testid="badge-projected-value">
                        Projected
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="text-projection-method">
                      {oneOfOneProjection.projectionMethod}
                    </p>
                    {oneOfOneProjection.parallelComps.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Reference Parallels:</p>
                        {oneOfOneProjection.parallelComps.map((comp) => (
                          <div key={comp.parallel} className="flex items-center justify-between text-xs" data-testid={`text-parallel-comp-${comp.parallel}`}>
                            <span>{comp.parallel} parallel</span>
                            <span className="font-medium">
                              {comp.estimatedValue ? `$${comp.estimatedValue.toFixed(2)}` : "N/A"} 
                              <span className="text-muted-foreground ml-1">({comp.salesFound} sales)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {card.previousValue && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Previous Value:</span>
                    <span className="font-medium text-muted-foreground" data-testid="text-previous-value">
                      {formatCurrency(card.previousValue)}
                    </span>
                  </div>
                )}

{/* Price trend and alerts hidden temporarily - will re-enable once backend issues are resolved */}

                {profitLoss !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Profit/Loss:</span>
                    <Badge 
                      variant={profitLoss >= 0 ? "default" : "destructive"}
                      data-testid="badge-profit-loss"
                    >
                      {profitLoss >= 0 ? "+" : ""}{formatCurrency(profitLoss)}
                    </Badge>
                  </div>
                )}

                {canEdit && (
                  <div className="space-y-2">
                    <ProFeatureGate
                      isPro={isPro}
                      featureName="AI Price Lookup"
                      featureDescription="Get real-time card values using AI-powered market analysis."
                      showBadge={true}
                      onProClick={() => refreshPriceMutation.mutate(card.id)}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={refreshPriceMutation.isPending}
                        data-testid="button-refresh-price"
                      >
                        {refreshPriceMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {refreshPriceMutation.isPending ? "Looking up..." : "Refresh Value"}
                      </Button>
                    </ProFeatureGate>
                    <p className="text-xs text-muted-foreground">
                      You can manually override this value if you have more current data.
                    </p>
                  </div>
                )}
              </div>

              {card.tags && card.tags.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Tags:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map((tag) => (
                        <Badge key={tag} variant="outline" data-testid={`badge-card-tag-${tag}`}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {card.notes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Notes</span>
                    <p className="text-sm text-muted-foreground" data-testid="text-card-notes">
                      {card.notes}
                    </p>
                  </div>
                </>
              )}

              <Separator />
              <CardOutlookPanel 
                card={card} 
                isPro={isPro} 
                canEdit={canEdit} 
              />
              {card.playerName && (
                <VerdictDivergenceNote cardOutlookAction={card.outlookAction} playerName={card.playerName} />
              )}

              <Link
                href={`/compare?tab=cards&card1=${card.id}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                data-testid="link-compare-to-another-card"
              >
                <GitCompare className="h-3.5 w-3.5" />
                Compare to another card
                <span aria-hidden="true">→</span>
              </Link>


{/* Price alerts panel hidden temporarily - will re-enable once backend issues are resolved */}

              {card.openToOffers && !canEdit && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <HandCoins className="w-4 h-4 text-green-600" />
                      <Badge className="bg-green-600 text-white" data-testid="badge-open-to-offers">
                        Open to Offers
                      </Badge>
                      {card.minOfferAmount && (
                        <span className="text-sm text-muted-foreground">
                          (Min: ${card.minOfferAmount})
                        </span>
                      )}
                    </div>
                    {isAuthenticated && (
                      <div className="flex flex-col gap-2">
                        <Button 
                          className="w-full gap-2"
                          onClick={() => setShowOfferModal(true)}
                          data-testid="button-make-offer"
                        >
                          <HandCoins className="h-4 w-4" />
                          Make an Offer
                        </Button>
                        <Button 
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => setShowTradeModal(true)}
                          data-testid="button-propose-trade"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          Propose a Trade
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {card && (
        <MakeOfferModal 
          card={card}
          open={showOfferModal}
          onOpenChange={setShowOfferModal}
        />
      )}

      {card && ownerUserId && (
        <ProposeTradeModal
          targetCard={card}
          targetUserId={ownerUserId}
          open={showTradeModal}
          onOpenChange={setShowTradeModal}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{card?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCardMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCardMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteCardMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
