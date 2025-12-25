import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft,
  Calendar, 
  Users, 
  DollarSign, 
  Clock,
  Lock,
  Truck,
  Video,
  CheckCircle,
  Package,
  UserPlus,
  CreditCard,
  ListOrdered,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Share2,
  Copy,
  Check,
} from "lucide-react";
import type { SplitInstanceWithSeats, SeatWithUser, SeatCounts, SplitStatus, BreakEventWithSplits } from "@shared/schema";

const STATUS_CONFIG: Record<SplitStatus, { label: string; description: string; color: string; icon: React.ReactNode }> = {
  OPEN_INTEREST: { 
    label: "Open for Interest", 
    description: "Join now to secure your spot",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", 
    icon: <Users className="w-4 h-4" /> 
  },
  PAYMENT_OPEN: { 
    label: "Payment Window Open", 
    description: "Pay now to confirm your seat",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", 
    icon: <DollarSign className="w-4 h-4" /> 
  },
  LOCKED: { 
    label: "Assignments Locked", 
    description: "Teams/slots have been assigned",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", 
    icon: <Lock className="w-4 h-4" /> 
  },
  ORDERED: { 
    label: "Product Ordered", 
    description: "Waiting for delivery",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
    icon: <Package className="w-4 h-4" /> 
  },
  SHIPPED: { 
    label: "Shipped", 
    description: "Package on the way",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", 
    icon: <Truck className="w-4 h-4" /> 
  },
  IN_HAND: { 
    label: "In Hand", 
    description: "Ready to break",
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", 
    icon: <CheckCircle className="w-4 h-4" /> 
  },
  BROKEN: { 
    label: "Break Complete", 
    description: "Watch the recorded break",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", 
    icon: <Video className="w-4 h-4" /> 
  },
  CANCELED: { 
    label: "Canceled", 
    description: "This split has been canceled",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", 
    icon: <AlertCircle className="w-4 h-4" /> 
  },
  REFUNDED: { 
    label: "Refunded", 
    description: "Payments have been refunded",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", 
    icon: <AlertCircle className="w-4 h-4" /> 
  },
};

const STATUS_ORDER: SplitStatus[] = ["OPEN_INTEREST", "PAYMENT_OPEN", "LOCKED", "ORDERED", "SHIPPED", "IN_HAND", "BROKEN"];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusTimeline({ currentStatus }: { currentStatus: SplitStatus }) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STATUS_ORDER.map((status, index) => {
        const config = STATUS_CONFIG[status];
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        
        return (
          <div 
            key={status}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap ${
              isCurrent ? config.color : isComplete 
                ? "bg-muted text-muted-foreground" 
                : "bg-muted/50 text-muted-foreground/50"
            }`}
          >
            {config.icon}
            <span className="hidden sm:inline">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShareButton({ title, description, splitId }: { title: string; description: string; splitId: number }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const shareUrl = `${window.location.origin}/portfolio-builder/splits/${splitId}`;
  
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: description,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          copyToClipboard();
        }
      }
    } else {
      copyToClipboard();
    }
  };
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share this link with friends to join the split" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
  
  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={handleShare}
      data-testid="button-share-split"
    >
      {copied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
      {copied ? "Copied!" : "Share"}
    </Button>
  );
}

function SeatsList({ seats, currentUserId }: { seats: SeatWithUser[]; currentUserId?: string }) {
  const paidSeats = seats.filter(s => s.status === "PAID");
  const interestedSeats = seats.filter(s => s.status === "INTERESTED");
  const waitlistSeats = seats.filter(s => s.status === "WAITLIST");

  const SeatItem = ({ seat, showAssignment = false }: { seat: SeatWithUser; showAssignment?: boolean }) => (
    <div 
      className={`flex items-center justify-between p-3 rounded-md border ${
        seat.userId === currentUserId ? "border-primary bg-primary/5" : "border-border"
      }`}
      data-testid={`seat-item-${seat.id}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
          {seat.user?.firstName?.[0] || seat.user?.handle?.[0] || "?"}
        </div>
        <div>
          <p className="font-medium">
            {seat.user?.firstName || seat.user?.handle || "Unknown"}
            {seat.userId === currentUserId && <span className="text-primary ml-2">(You)</span>}
          </p>
          {showAssignment && seat.assignment && (
            <p className="text-sm text-muted-foreground">
              Assigned: <span className="font-medium">{seat.assignment}</span>
            </p>
          )}
        </div>
      </div>
      <Badge variant={seat.status === "PAID" ? "default" : "outline"}>
        {seat.status === "PAID" && seat.priorityNumber && `#${seat.priorityNumber}`}
        {seat.status !== "PAID" && seat.status}
      </Badge>
    </div>
  );

  return (
    <div className="space-y-6">
      {paidSeats.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Confirmed ({paidSeats.length})
          </h4>
          <div className="space-y-2">
            {paidSeats.map(seat => <SeatItem key={seat.id} seat={seat} showAssignment />)}
          </div>
        </div>
      )}
      
      {interestedSeats.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Interested ({interestedSeats.length})
          </h4>
          <div className="space-y-2">
            {interestedSeats.map(seat => <SeatItem key={seat.id} seat={seat} />)}
          </div>
        </div>
      )}
      
      {waitlistSeats.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Waitlist ({waitlistSeats.length})
          </h4>
          <div className="space-y-2">
            {waitlistSeats.map(seat => <SeatItem key={seat.id} seat={seat} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioBuilderSplitPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const splitId = parseInt(id || "0");

  const { data: splitData, isLoading, refetch } = useQuery<{
    seats: any[];
    seatCounts: SeatCounts;
    breakEvent: BreakEventWithSplits;
  } & SplitInstanceWithSeats>({
    queryKey: ["/api/splits", splitId],
    enabled: splitId > 0,
  });

  const { data: seatsData } = useQuery<SeatWithUser[]>({
    queryKey: ["/api/splits", splitId, "seats"],
    enabled: splitId > 0,
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/splits/${splitId}/join`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/splits", splitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/splits", splitId, "seats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-seats"] });
      
      // Pack breaks don't need preferences - packs are assigned randomly
      if (split?.formatType === "PACK") {
        toast({ title: "Joined!", description: "You've joined this pack break. Pay to confirm your spot!" });
      } else {
        toast({ title: "Joined!", description: "Now set your team/division preferences" });
        setLocation(`/portfolio-builder/splits/${splitId}/preferences`);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to join", variant: "destructive" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/splits/${splitId}/checkout`),
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to start checkout", variant: "destructive" });
    },
  });

  const currentUserId = currentUser?.id;
  const mySeat = seatsData?.find(s => s.userId === currentUserId);
  const split = splitData;
  const breakEvent = splitData?.breakEvent;
  const seatCounts = splitData?.seatCounts;

  const statusConfig = split ? STATUS_CONFIG[split.status as SplitStatus] : null;
  const spotsFilledPercent = seatCounts 
    ? ((seatCounts.paid + seatCounts.interested) / split!.participantCount) * 100 
    : 0;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!split || !breakEvent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h3 className="text-xl font-semibold mb-2">Split Not Found</h3>
            <p className="text-muted-foreground mb-4">
              This split may have been removed or doesn't exist.
            </p>
            <Link href="/portfolio-builder">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Portfolio Builder
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/portfolio-builder" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Portfolio Builder
        </Link>
        
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-split-title">
              {breakEvent.title}
            </h1>
            <p className="text-muted-foreground">
              {breakEvent.year} {breakEvent.brand} {breakEvent.sport} - {split.formatType}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusConfig && (
              <Badge className={statusConfig.color}>
                {statusConfig.icon}
                <span className="ml-1">{statusConfig.label}</span>
              </Badge>
            )}
            <ShareButton 
              title={breakEvent.title}
              description={`Join this ${breakEvent.year} ${breakEvent.brand} ${breakEvent.sport} box split - ${formatPrice(split.seatPriceCents)} per seat!`}
              splitId={splitId}
            />
          </div>
        </div>
      </div>

      <StatusTimeline currentStatus={split.status as SplitStatus} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          {breakEvent.imageUrl && (
            <Card className="overflow-hidden">
              <img 
                src={breakEvent.imageUrl} 
                alt={`${breakEvent.year} ${breakEvent.brand} ${breakEvent.sport}`}
                className="w-full h-48 object-cover"
                data-testid="img-box-image"
              />
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Split Details</CardTitle>
              {statusConfig && (
                <CardDescription>{statusConfig.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    {split.participantCount} spots total
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    {formatPrice(split.seatPriceCents)} per seat
                  </span>
                </div>
              </div>

              {seatCounts && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Spots Filled</span>
                    <span>{seatCounts.paid + seatCounts.interested} / {split.participantCount}</span>
                  </div>
                  <Progress value={spotsFilledPercent} className="h-2" />
                </div>
              )}

              {split.status === "PAYMENT_OPEN" && split.paymentWindowEndsAt && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                  <Clock className="w-5 h-5" />
                  <div>
                    <p className="font-medium">Payment Window</p>
                    <p className="text-sm">
                      Ends {new Date(split.paymentWindowEndsAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {split.status === "BROKEN" && split.youtubeUrl && (
                <a 
                  href={split.youtubeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30"
                >
                  <Video className="w-5 h-5" />
                  <div className="flex-1">
                    <p className="font-medium">Watch the Break</p>
                    <p className="text-sm">YouTube Recording</p>
                  </div>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              {breakEvent.description && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">About This Break</h4>
                  <p className="text-sm text-muted-foreground">{breakEvent.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">Participants</CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => refetch()}
                data-testid="button-refresh-seats"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {seatsData && seatsData.length > 0 ? (
                <SeatsList seats={seatsData} currentUserId={currentUserId} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No participants yet. Be the first to join!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Your Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!currentUserId ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-4">Sign in to join this split</p>
                  <Button 
                    className="w-full" 
                    onClick={() => window.location.href = "/api/login"}
                    data-testid="button-signin-to-join"
                  >
                    Sign In
                  </Button>
                </div>
              ) : !mySeat ? (
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <p className="text-muted-foreground">You haven't joined this split yet</p>
                  </div>
                  {(split.status === "OPEN_INTEREST" || split.status === "PAYMENT_OPEN") && (
                    <Button 
                      className="w-full" 
                      onClick={() => joinMutation.mutate()}
                      disabled={joinMutation.isPending}
                      data-testid="button-join-split"
                    >
                      {joinMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Join Split
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-muted">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Your Seat</span>
                      <Badge variant={mySeat.status === "PAID" ? "default" : "secondary"}>
                        {mySeat.status}
                      </Badge>
                    </div>
                    {mySeat.assignment && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Assignment:</span>{" "}
                        <span className="font-medium">{mySeat.assignment}</span>
                      </p>
                    )}
                    {mySeat.priorityNumber && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Priority:</span>{" "}
                        <span className="font-medium">#{mySeat.priorityNumber}</span>
                      </p>
                    )}
                  </div>

                  {mySeat.status !== "PAID" && split.status === "PAYMENT_OPEN" && (
                    <Button 
                      className="w-full" 
                      onClick={() => checkoutMutation.mutate()}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-pay-now"
                    >
                      {checkoutMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pay {formatPrice(split.seatPriceCents)}
                        </>
                      )}
                    </Button>
                  )}

                  {mySeat.status === "PAID" && !mySeat.assignment && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200">
                      <CheckCircle className="w-5 h-5" />
                      <p className="text-sm">Payment confirmed! Waiting for assignments.</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {mySeat && !["LOCKED", "ORDERED", "SHIPPED", "IN_HAND", "BROKEN"].includes(split.status) && (
            <Card className={!mySeat.preferences || (mySeat.preferences as string[]).length === 0 ? "border-amber-300 dark:border-amber-700" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListOrdered className="w-4 h-4" />
                  Preferences
                  {(!mySeat.preferences || (mySeat.preferences as string[]).length === 0) && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {split.formatType === "TEAM_BUNDLE" 
                    ? "Rank your preferred bundles. Each bundle contains multiple teams. Earlier payers get priority."
                    : split.formatType === "DIVISIONAL" 
                    ? "Rank your preferred divisions. Earlier payers get priority for their preferences."
                    : "Rank your preferred teams. Earlier payers get priority for their preferences."}
                </p>
                <Link href={`/portfolio-builder/splits/${splitId}/preferences`}>
                  <Button 
                    variant={(!mySeat.preferences || (mySeat.preferences as string[]).length === 0) ? "default" : "outline"} 
                    className="w-full" 
                    data-testid="button-set-preferences"
                  >
                    {(!mySeat.preferences || (mySeat.preferences as string[]).length === 0) 
                      ? "Set Your Preferences" 
                      : "Edit Preferences"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
