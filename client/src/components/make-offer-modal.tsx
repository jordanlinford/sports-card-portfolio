import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Send, DollarSign, AlertCircle, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Card } from "@shared/schema";

interface MakeOfferModalProps {
  card: Card;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MakeOfferModal({ card, open, onOpenChange }: MakeOfferModalProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const minOffer = card.minOfferAmount ? Number(card.minOfferAmount) : 0;
  const offerAmount = amount ? parseFloat(amount) : 0;
  const isBelowMinimum = minOffer > 0 && offerAmount < minOffer;

  const createOfferMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/offers`, {
        cardId: card.id,
        amount: amount,
        message: message.trim() || undefined,
        isAnonymous: isAnonymous,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Offer Sent",
        description: "Your offer has been sent to the card owner.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/offers/outgoing"] });
      setAmount("");
      setMessage("");
      setIsAnonymous(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to send offer",
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || offerAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid offer amount.",
      });
      return;
    }
    if (isBelowMinimum) {
      toast({
        variant: "destructive",
        title: "Offer too low",
        description: `The minimum offer for this card is $${minOffer.toFixed(2)}.`,
      });
      return;
    }
    createOfferMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit an offer for "{card.title}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {minOffer > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Minimum offer: ${minOffer.toFixed(2)}
              </AlertDescription>
            </Alert>
          )}

          {card.estimatedValue && (
            <div className="text-sm text-muted-foreground">
              Estimated value: ${Number(card.estimatedValue).toFixed(2)}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="offer-amount">Your Offer</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="offer-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                data-testid="input-offer-amount"
                required
              />
            </div>
            {isBelowMinimum && (
              <p className="text-sm text-destructive">
                Your offer is below the minimum of ${minOffer.toFixed(2)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="offer-message">Message (optional)</Label>
            <Textarea
              id="offer-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message to your offer..."
              rows={3}
              data-testid="input-offer-message"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="anonymous-offer"
              checked={isAnonymous}
              onCheckedChange={(checked) => setIsAnonymous(checked === true)}
              data-testid="checkbox-anonymous-offer"
            />
            <Label htmlFor="anonymous-offer" className="flex items-center gap-2 text-sm cursor-pointer">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              Hide my name from the card owner
            </Label>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-offer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createOfferMutation.isPending || !amount || offerAmount <= 0 || isBelowMinimum}
              data-testid="button-submit-offer"
            >
              {createOfferMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Offer
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
