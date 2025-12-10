import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, ArrowRightLeft, DollarSign, Plus, X } from "lucide-react";
import type { Card, DisplayCaseWithCards } from "@shared/schema";

interface ProposeTradeModalProps {
  targetCard: Card;
  targetUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProposeTradeModal({ targetCard, targetUserId, open, onOpenChange }: ProposeTradeModalProps) {
  const { toast } = useToast();
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [message, setMessage] = useState("");

  const { data: myDisplayCases = [], isLoading: isLoadingCases } = useQuery<DisplayCaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: open,
  });

  const myCards = myDisplayCases.flatMap(dc => dc.cards || []);

  const createTradeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/trades`, {
        toUserId: targetUserId,
        offeredCardIds: selectedCardIds,
        requestedCardIds: [targetCard.id],
        cashAdjustment: cashAmount ? parseFloat(cashAmount) : 0,
        message: message.trim() || undefined,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Trade Proposed",
        description: "Your trade offer has been sent to the card owner.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades/sent"] });
      setSelectedCardIds([]);
      setCashAmount("");
      setMessage("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to propose trade",
        description: error.message,
      });
    },
  });

  const toggleCardSelection = (cardId: number) => {
    setSelectedCardIds(prev => 
      prev.includes(cardId) 
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCardIds.length === 0 && (!cashAmount || parseFloat(cashAmount) <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid trade",
        description: "Please select at least one card or add cash to your offer.",
      });
      return;
    }
    createTradeMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Propose a Trade
          </DialogTitle>
          <DialogDescription>
            Select cards from your collection to trade for "{targetCard.title}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <div className="p-3 border rounded-md bg-muted/50">
            <p className="text-sm font-medium">You want:</p>
            <div className="flex items-center gap-3 mt-2">
              {targetCard.imagePath && (
                <img 
                  src={targetCard.imagePath} 
                  alt={targetCard.title} 
                  className="h-16 w-12 object-cover rounded"
                />
              )}
              <div>
                <p className="font-medium">{targetCard.title}</p>
                {targetCard.estimatedValue && (
                  <p className="text-sm text-muted-foreground">
                    Est. value: ${Number(targetCard.estimatedValue).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Your cards to offer:</Label>
            {isLoadingCases ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : myCards.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground border rounded-md">
                You don't have any cards in your collection yet.
              </div>
            ) : (
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {myCards.map(card => (
                    <div
                      key={card.id}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        selectedCardIds.includes(card.id) 
                          ? "border-primary bg-primary/10" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleCardSelection(card.id)}
                      data-testid={`trade-card-${card.id}`}
                    >
                      <Checkbox 
                        checked={selectedCardIds.includes(card.id)}
                        onCheckedChange={() => toggleCardSelection(card.id)}
                      />
                      {card.imagePath && (
                        <img 
                          src={card.imagePath} 
                          alt={card.title} 
                          className="h-12 w-9 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{card.title}</p>
                        {card.estimatedValue && (
                          <p className="text-xs text-muted-foreground">
                            ${Number(card.estimatedValue).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedCardIds.length > 0 && (
              <div className="text-sm text-muted-foreground mt-2">
                {selectedCardIds.length} card{selectedCardIds.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-amount">Add cash (optional)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cash-amount"
                type="number"
                step="0.01"
                min="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                data-testid="input-trade-cash"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-message">Message (optional)</Label>
            <Textarea
              id="trade-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message to your trade offer..."
              rows={2}
              data-testid="input-trade-message"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-trade"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTradeMutation.isPending || (selectedCardIds.length === 0 && (!cashAmount || parseFloat(cashAmount) <= 0))}
              data-testid="button-submit-trade"
            >
              {createTradeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Propose Trade
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
