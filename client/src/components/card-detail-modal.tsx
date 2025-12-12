import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Edit2, Save, X, Calendar, Award, DollarSign, TrendingUp, TrendingDown, FileText, Sparkles, RefreshCw, Loader2, Tag, Bookmark, HandCoins, ArrowRightLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Card } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MakeOfferModal } from "@/components/make-offer-modal";
import { ProposeTradeModal } from "@/components/propose-trade-modal";
import { CardOutlookPanel } from "@/components/card-outlook-panel";
import { ProFeatureGate } from "@/components/pro-feature-gate";

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
  set: string;
  year: string;
  variation: string;
  grade: string;
  purchasePrice: string;
  estimatedValue: string;
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
  const [isSaving, setIsSaving] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const { toast } = useToast();

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

  const refreshPriceMutation = useMutation({
    mutationFn: async (cardId: number) => {
      return await apiRequest("POST", `/api/cards/${cardId}/lookup-price`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      if (data.updated) {
        toast({
          title: "Value Updated",
          description: `Found ${data.salesFound} sales. New value: $${data.estimatedValue?.toFixed(2)} (${data.confidence} confidence)`,
        });
        setFormData(prev => ({
          ...prev,
          estimatedValue: data.estimatedValue?.toString() || prev.estimatedValue,
        }));
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
    set: "",
    year: "",
    variation: "",
    grade: "",
    purchasePrice: "",
    estimatedValue: "",
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
        set: card.set || "",
        year: card.year?.toString() || "",
        variation: card.variation || "",
        grade: card.grade || "",
        purchasePrice: card.purchasePrice?.toString() || "",
        estimatedValue: card.estimatedValue?.toString() || "",
        notes: card.notes || "",
        tags: card.tags || [],
        openToOffers: card.openToOffers || false,
        minOfferAmount: card.minOfferAmount?.toString() || "",
      });
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
      await apiRequest("PATCH", `/api/display-cases/${displayCaseId}/cards/${card.id}`, {
        title: formData.title.trim(),
        set: formData.set.trim() || null,
        year: formData.year ? parseInt(formData.year) : null,
        variation: formData.variation.trim() || null,
        grade: formData.grade.trim() || null,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        estimatedValue: formData.estimatedValue ? parseFloat(formData.estimatedValue) : null,
        notes: formData.notes.trim() || null,
        tags: formData.tags.length > 0 ? formData.tags : null,
        openToOffers: formData.openToOffers,
        minOfferAmount: formData.minOfferAmount ? parseFloat(formData.minOfferAmount) : null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      toast({
        title: "Card updated",
        description: "Your card details have been saved.",
      });
      setIsEditing(false);
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
      if (card) {
        setFormData({
          title: card.title || "",
          set: card.set || "",
          year: card.year?.toString() || "",
          variation: card.variation || "",
          grade: card.grade || "",
          purchasePrice: card.purchasePrice?.toString() || "",
          estimatedValue: card.estimatedValue?.toString() || "",
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
    if (card) {
      setFormData({
        title: card.title || "",
        set: card.set || "",
        year: card.year?.toString() || "",
        variation: card.variation || "",
        grade: card.grade || "",
        purchasePrice: card.purchasePrice?.toString() || "",
        estimatedValue: card.estimatedValue?.toString() || "",
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

  const profitLoss = card.estimatedValue && card.purchasePrice 
    ? card.estimatedValue - card.purchasePrice 
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-card"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted">
            <img
              src={card.imagePath}
              alt={card.title}
              className="w-full h-full object-contain"
              data-testid="img-card-detail"
            />
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
                    placeholder="e.g., Cracked Ice 1/10"
                    data-testid="input-edit-variation"
                  />
                </div>

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
                    <Label htmlFor="edit-estimated-value">Estimated Value</Label>
                    <Input
                      id="edit-estimated-value"
                      type="number"
                      step="0.01"
                      value={formData.estimatedValue}
                      onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-edit-estimated-value"
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
                {card.set && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Set:</span>
                    <span className="font-medium" data-testid="text-card-set">{card.set}</span>
                  </div>
                )}

                {card.year && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Year:</span>
                    <span className="font-medium" data-testid="text-card-year">{card.year}</span>
                  </div>
                )}

                {card.variation && (
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Variation:</span>
                    <Badge variant="outline" data-testid="badge-card-variation">{card.variation}</Badge>
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

                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Estimated Value:</span>
                  <span className="font-medium" data-testid="text-estimated-value">
                    {formatCurrency(card.estimatedValue)}
                  </span>
                  {card.previousValue && card.previousValue > 0 && card.estimatedValue && card.estimatedValue !== card.previousValue && (
                    <Badge 
                      variant={card.estimatedValue > card.previousValue ? "default" : "destructive"}
                      className="gap-1"
                      data-testid="badge-value-change"
                    >
                      {card.estimatedValue > card.previousValue ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {card.estimatedValue > card.previousValue ? '+' : ''}
                      {(((card.estimatedValue - card.previousValue) / card.previousValue) * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>

                {card.previousValue && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Previous Value:</span>
                    <span className="font-medium text-muted-foreground" data-testid="text-previous-value">
                      {formatCurrency(card.previousValue)}
                    </span>
                  </div>
                )}

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
                  <ProFeatureGate
                    isPro={isPro}
                    featureName="AI Price Lookup"
                    featureDescription="Get real-time card values from eBay sales data using AI-powered price analysis."
                    showBadge={true}
                    onProClick={() => refreshPriceMutation.mutate(card.id)}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 mt-2"
                      disabled={refreshPriceMutation.isPending}
                      data-testid="button-refresh-price"
                    >
                      {refreshPriceMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {refreshPriceMutation.isPending ? "Looking up..." : "Refresh Value from eBay"}
                    </Button>
                  </ProFeatureGate>
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
    </Dialog>
  );
}
