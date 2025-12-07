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
import { Edit2, Save, X, Calendar, Award, DollarSign, TrendingUp, FileText, Sparkles } from "lucide-react";
import type { Card } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CardDetailModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  displayCaseId: number;
  canEdit?: boolean;
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
}

export function CardDetailModal({ 
  card, 
  isOpen, 
  onClose, 
  displayCaseId,
  canEdit = false 
}: CardDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<EditFormData>({
    title: "",
    set: "",
    year: "",
    variation: "",
    grade: "",
    purchasePrice: "",
    estimatedValue: "",
    notes: "",
  });

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
        });
      }
      onClose();
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
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
      });
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
                </div>

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
              </div>

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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
