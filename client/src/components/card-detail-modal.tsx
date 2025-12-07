import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit2, Save, X, Calendar, Award, DollarSign, TrendingUp, FileText } from "lucide-react";
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

export function CardDetailModal({ 
  card, 
  isOpen, 
  onClose, 
  displayCaseId,
  canEdit = false 
}: CardDetailModalProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(card?.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  if (!card) return null;

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/display-cases/${displayCaseId}/cards/${card.id}`, {
        notes,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${displayCaseId}`] });
      toast({
        title: "Notes saved",
        description: "Your notes have been updated.",
      });
      setIsEditingNotes(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notes.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsEditingNotes(false);
      setNotes(card?.notes || "");
      onClose();
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
          <DialogTitle className="text-xl" data-testid="text-card-modal-title">
            {card.title}
          </DialogTitle>
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
                  <FileText className="w-4 h-4 text-muted-foreground" />
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

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Notes</span>
                {canEdit && !isEditingNotes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNotes(card.notes || "");
                      setIsEditingNotes(true);
                    }}
                    data-testid="button-edit-notes"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>

              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this card..."
                    className="min-h-[100px]"
                    data-testid="textarea-notes"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={isSaving}
                      data-testid="button-save-notes"
                    >
                      <Save className="w-3 h-3 mr-1" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingNotes(false);
                        setNotes(card.notes || "");
                      }}
                      data-testid="button-cancel-notes"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-card-notes">
                  {card.notes || "No notes added yet."}
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
