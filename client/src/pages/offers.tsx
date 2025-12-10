import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Inbox, 
  Send, 
  Check, 
  X, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle,
  MessageSquare,
  Loader2,
  ArrowRightLeft
} from "lucide-react";
import type { TradeOfferWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";

interface OfferWithDetails {
  id: number;
  cardId: number;
  fromUserId: string;
  toUserId: string;
  amount: string;
  message: string | null;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
  card?: {
    id: number;
    title: string;
    imageUrl: string | null;
  };
  fromUser?: {
    id: string;
    username: string;
    profileImageUrl: string | null;
  };
  toUser?: {
    id: string;
    username: string;
    profileImageUrl: string | null;
  };
}

function getStatusBadge(status: OfferStatus) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case "accepted":
      return <Badge className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> Accepted</Badge>;
    case "declined":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Declined</Badge>;
    case "withdrawn":
      return <Badge variant="secondary" className="gap-1">Withdrawn</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function OfferCard({ 
  offer, 
  type,
  onAccept,
  onDecline,
  isUpdating
}: { 
  offer: OfferWithDetails; 
  type: "incoming" | "outgoing";
  onAccept?: (id: number) => void;
  onDecline?: (id: number) => void;
  isUpdating?: boolean;
}) {
  const otherUser = type === "incoming" ? offer.fromUser : offer.toUser;
  
  return (
    <Card className="overflow-visible">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {offer.card?.imageUrl && (
            <div className="flex-shrink-0">
              <img
                src={offer.card.imageUrl}
                alt={offer.card.title}
                className="w-16 h-24 object-cover rounded-md"
              />
            </div>
          )}
          
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-medium truncate" data-testid={`text-offer-card-title-${offer.id}`}>
                  {offer.card?.title || "Unknown Card"}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={otherUser?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {otherUser?.username?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">
                    {type === "incoming" ? "From" : "To"}: {otherUser?.username || "Unknown"}
                  </span>
                </div>
              </div>
              {getStatusBadge(offer.status)}
            </div>
            
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-lg" data-testid={`text-offer-amount-${offer.id}`}>
                ${Number(offer.amount).toFixed(2)}
              </span>
            </div>
            
            {offer.message && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{offer.message}</span>
              </div>
            )}
            
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(offer.createdAt), { addSuffix: true })}
              </span>
              
              {type === "incoming" && offer.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onDecline?.(offer.id)}
                    disabled={isUpdating}
                    data-testid={`button-decline-offer-${offer.id}`}
                  >
                    {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => onAccept?.(offer.id)}
                    disabled={isUpdating}
                    data-testid={`button-accept-offer-${offer.id}`}
                  >
                    {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Accept
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OffersSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Skeleton className="w-16 h-24 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TradeCard({ 
  trade, 
  type,
  onAccept,
  onDecline,
  isUpdating
}: { 
  trade: TradeOfferWithDetails; 
  type: "incoming" | "outgoing";
  onAccept?: (id: number) => void;
  onDecline?: (id: number) => void;
  isUpdating?: boolean;
}) {
  const otherUser = type === "incoming" ? trade.fromUser : trade.toUser;
  
  return (
    <Card className="overflow-visible">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={otherUser?.profileImageUrl || undefined} />
              <AvatarFallback className="text-xs">
                {otherUser?.firstName?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">
              {type === "incoming" ? "From" : "To"}: {otherUser?.firstName} {otherUser?.lastName}
            </span>
          </div>
          {getStatusBadge(trade.status as OfferStatus)}
        </div>

        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground block">Offering:</span>
            <div className="flex flex-wrap gap-1">
              {trade.offeredCards.map((card) => (
                <div key={card.id} className="relative group">
                  <img
                    src={card.imagePath}
                    alt={card.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                </div>
              ))}
              {trade.cashAdjustment > 0 && (
                <Badge variant="outline" className="gap-1">
                  <DollarSign className="h-3 w-3" />
                  +${trade.cashAdjustment.toFixed(2)}
                </Badge>
              )}
              {trade.offeredCards.length === 0 && trade.cashAdjustment <= 0 && (
                <span className="text-sm text-muted-foreground">Nothing</span>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground block">Wants:</span>
            <div className="flex flex-wrap gap-1">
              {trade.requestedCards.map((card) => (
                <div key={card.id} className="relative group">
                  <img
                    src={card.imagePath}
                    alt={card.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {trade.message && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
            <MessageSquare className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{trade.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {trade.createdAt && formatDistanceToNow(new Date(trade.createdAt), { addSuffix: true })}
          </span>
          
          {type === "incoming" && trade.status === "pending" && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDecline?.(trade.id)}
                disabled={isUpdating}
                className="gap-1"
                data-testid={`button-decline-trade-${trade.id}`}
              >
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept?.(trade.id)}
                disabled={isUpdating}
                className="gap-1"
                data-testid={`button-accept-trade-${trade.id}`}
              >
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OffersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: incomingOffers, isLoading: incomingLoading } = useQuery<OfferWithDetails[]>({
    queryKey: ["/api/offers/incoming"],
    enabled: isAuthenticated,
  });

  const { data: outgoingOffers, isLoading: outgoingLoading } = useQuery<OfferWithDetails[]>({
    queryKey: ["/api/offers/outgoing"],
    enabled: isAuthenticated,
  });

  const { data: receivedTrades, isLoading: receivedTradesLoading } = useQuery<TradeOfferWithDetails[]>({
    queryKey: ["/api/trades/received"],
    enabled: isAuthenticated,
  });

  const { data: sentTrades, isLoading: sentTradesLoading } = useQuery<TradeOfferWithDetails[]>({
    queryKey: ["/api/trades/sent"],
    enabled: isAuthenticated,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ offerId, action }: { offerId: number; action: "accept" | "decline" }) => {
      return apiRequest("POST", `/api/offers/${offerId}/${action}`);
    },
    onSuccess: (_, { action }) => {
      toast({
        title: action === "accept" ? "Offer Accepted" : "Offer Declined",
        description: action === "accept" 
          ? "The buyer will be notified of your decision."
          : "The offer has been declined.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/offers/incoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to respond",
        description: error.message,
      });
    },
  });

  const tradeRespondMutation = useMutation({
    mutationFn: async ({ tradeId, action }: { tradeId: number; action: "accept" | "decline" }) => {
      return apiRequest("PATCH", `/api/trades/${tradeId}/${action}`);
    },
    onSuccess: (_, { action }) => {
      toast({
        title: action === "accept" ? "Trade Accepted" : "Trade Declined",
        description: action === "accept" 
          ? "The trade has been accepted. Contact the other party to complete the exchange."
          : "The trade has been declined.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades/received"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to respond to trade",
        description: error.message,
      });
    },
  });

  if (authLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <OffersSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  const pendingIncoming = incomingOffers?.filter(o => o.status === "pending") || [];
  const pendingOutgoing = outgoingOffers?.filter(o => o.status === "pending") || [];
  const pendingReceivedTrades = receivedTrades?.filter(t => t.status === "pending") || [];
  const pendingSentTrades = sentTrades?.filter(t => t.status === "pending") || [];
  const totalPendingTrades = pendingReceivedTrades.length + pendingSentTrades.length;

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" data-testid="text-offers-title">Offers & Trades</h1>
        <p className="text-muted-foreground mt-2">
          Manage offers and trade proposals for cards
        </p>
      </div>

      <Tabs defaultValue="incoming" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="incoming" className="gap-2" data-testid="tab-incoming-offers">
            <Inbox className="h-4 w-4" />
            Received
            {pendingIncoming.length > 0 && (
              <Badge variant="default" className="ml-1">{pendingIncoming.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2" data-testid="tab-outgoing-offers">
            <Send className="h-4 w-4" />
            Sent
            {pendingOutgoing.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingOutgoing.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trades" className="gap-2" data-testid="tab-trades">
            <ArrowRightLeft className="h-4 w-4" />
            Trades
            {totalPendingTrades > 0 && (
              <Badge variant="outline" className="ml-1">{totalPendingTrades}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="space-y-4">
          {incomingLoading ? (
            <OffersSkeleton />
          ) : incomingOffers?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <CardTitle className="mb-2">No offers received</CardTitle>
                <CardDescription>
                  When collectors make offers on your cards, they'll appear here.
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            incomingOffers?.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                type="incoming"
                onAccept={(id) => respondMutation.mutate({ offerId: id, action: "accept" })}
                onDecline={(id) => respondMutation.mutate({ offerId: id, action: "decline" })}
                isUpdating={respondMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="space-y-4">
          {outgoingLoading ? (
            <OffersSkeleton />
          ) : outgoingOffers?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <CardTitle className="mb-2">No offers sent</CardTitle>
                <CardDescription>
                  When you make offers on cards, they'll appear here.
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            outgoingOffers?.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                type="outgoing"
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="trades" className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Received Trade Proposals
              {pendingReceivedTrades.length > 0 && (
                <Badge variant="default">{pendingReceivedTrades.length} pending</Badge>
              )}
            </h3>
            {receivedTradesLoading ? (
              <OffersSkeleton />
            ) : receivedTrades?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <ArrowRightLeft className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-base mb-1">No trade proposals received</CardTitle>
                  <CardDescription>
                    When collectors propose card trades, they'll appear here.
                  </CardDescription>
                </CardContent>
              </Card>
            ) : (
              receivedTrades?.map((trade) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  type="incoming"
                  onAccept={(id) => tradeRespondMutation.mutate({ tradeId: id, action: "accept" })}
                  onDecline={(id) => tradeRespondMutation.mutate({ tradeId: id, action: "decline" })}
                  isUpdating={tradeRespondMutation.isPending}
                />
              ))
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" />
              Sent Trade Proposals
              {pendingSentTrades.length > 0 && (
                <Badge variant="secondary">{pendingSentTrades.length} pending</Badge>
              )}
            </h3>
            {sentTradesLoading ? (
              <OffersSkeleton />
            ) : sentTrades?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <ArrowRightLeft className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <CardTitle className="text-base mb-1">No trade proposals sent</CardTitle>
                  <CardDescription>
                    When you propose trades to other collectors, they'll appear here.
                  </CardDescription>
                </CardContent>
              </Card>
            ) : (
              sentTrades?.map((trade) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  type="outgoing"
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
