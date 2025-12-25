import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  DollarSign, 
  Package,
  Clock,
  ChevronRight,
  Layers,
  Star,
  Lock,
  Truck,
  Video,
  CheckCircle,
  Settings,
} from "lucide-react";
import type { BreakEventWithSplits, SplitInstance, SplitStatus } from "@shared/schema";
import { BREAKER_FEE_CENTS, SHIPPING_FEE_CENTS } from "@shared/schema";
import { AlertCircle, XCircle } from "lucide-react";

const STATUS_CONFIG: Record<SplitStatus, { label: string; color: string; icon: React.ReactNode }> = {
  OPEN_INTEREST: { label: "Open", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: <Users className="w-3 h-3" /> },
  PAYMENT_OPEN: { label: "Paying Now", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: <DollarSign className="w-3 h-3" /> },
  LOCKED: { label: "Locked", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", icon: <Lock className="w-3 h-3" /> },
  ORDERED: { label: "Ordered", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: <Package className="w-3 h-3" /> },
  SHIPPED: { label: "Shipped", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", icon: <Truck className="w-3 h-3" /> },
  IN_HAND: { label: "In Hand", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", icon: <CheckCircle className="w-3 h-3" /> },
  BROKEN: { label: "Complete", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", icon: <Video className="w-3 h-3" /> },
  CANCELED: { label: "Canceled", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: <XCircle className="w-3 h-3" /> },
  REFUNDED: { label: "Refunded", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: <AlertCircle className="w-3 h-3" /> },
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function SplitCard({ split, breakEvent }: { split: SplitInstance; breakEvent: BreakEventWithSplits }) {
  const statusConfig = STATUS_CONFIG[split.status as SplitStatus] || STATUS_CONFIG.OPEN_INTEREST;
  // Split the $50 breaker fee equally among all participants, plus $5 shipping per seat
  const breakerFeePerSeatCents = Math.ceil(BREAKER_FEE_CENTS / split.participantCount);
  const totalPriceCents = split.seatPriceCents + breakerFeePerSeatCents + SHIPPING_FEE_CENTS;

  return (
    <Card className="overflow-visible hover-elevate" data-testid={`card-split-${split.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge variant="secondary" className={statusConfig.color}>
            {statusConfig.icon}
            <span className="ml-1">{statusConfig.label}</span>
          </Badge>
          <Badge variant="outline">
            {split.formatType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{split.participantCount} spots</span>
          </div>
          <div className="text-right">
            <div className="font-semibold text-lg">
              {formatPrice(totalPriceCents)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatPrice(split.seatPriceCents)} + {formatPrice(breakerFeePerSeatCents)} fee + {formatPrice(SHIPPING_FEE_CENTS)} ship
            </div>
          </div>
        </div>
        {split.status === "PAYMENT_OPEN" && split.paymentWindowEndsAt && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <Clock className="w-4 h-4" />
            <span>Payment ends {new Date(split.paymentWindowEndsAt).toLocaleDateString()}</span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Link href={`/portfolio-builder/splits/${split.id}`} className="w-full">
          <Button 
            variant="outline" 
            className="w-full justify-between"
            data-testid={`button-view-split-${split.id}`}
          >
            View Details
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

function BreakEventCard({ event }: { event: BreakEventWithSplits }) {
  const activeSplits = event.splitInstances.filter(s => s.isEnabled);

  return (
    <Card className="overflow-visible" data-testid={`card-break-event-${event.id}`}>
      <CardHeader>
        <div className="flex items-start gap-4">
          {event.imageUrl && (
            <div className="flex-shrink-0">
              <img 
                src={event.imageUrl} 
                alt={event.title}
                className="w-24 h-24 object-cover rounded-md border border-border"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="flex-1 flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-xl">{event.title}</CardTitle>
              <CardDescription className="mt-1">
                {event.year} {event.brand} {event.sport}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              <Layers className="w-3 h-3 mr-1" />
              {activeSplits.length} splits
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {event.description && (
          <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
        )}

        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <DollarSign className="w-4 h-4" />
            <span className="font-medium">Fees included in all prices</span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            $50 breaker fee (split among participants) + $5 shipping per seat.
          </p>
        </div>
        
        {activeSplits.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSplits.map((split) => (
              <SplitCard key={split.id} split={split} breakEvent={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No active splits for this event yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakEventSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortfolioBuilderPage() {
  const { data: breakEvents, isLoading, error } = useQuery<BreakEventWithSplits[]>({
    queryKey: ["/api/breaks"],
  });

  const { data: mySeats } = useQuery<any[]>({
    queryKey: ["/api/my-seats"],
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Portfolio Builder</h1>
          <p className="text-muted-foreground mt-2">
            Split hobby boxes with other collectors. No pressure, no bidding wars.
          </p>
        </div>
        {adminCheck?.isAdmin && (
          <Link href="/admin/portfolio-builder">
            <Button variant="outline" data-testid="button-admin-link">
              <Settings className="w-4 h-4 mr-2" />
              Manage
            </Button>
          </Link>
        )}
      </div>

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">1</div>
              <div>
                <p className="font-medium">Browse Boxes</p>
                <p className="text-muted-foreground">Find a hobby box you want to split with others.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">2</div>
              <div>
                <p className="font-medium">Join a Split</p>
                <p className="text-muted-foreground">Pick your preferred teams or divisions and reserve your spot.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">3</div>
              <div>
                <p className="font-medium">Pay When Ready</p>
                <p className="text-muted-foreground">Only pay when enough collectors join. No risk.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">4</div>
              <div>
                <p className="font-medium">Get Your Cards</p>
                <p className="text-muted-foreground">Receive a YouTube video of your break, then your cards are shipped.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {mySeats && mySeats.length > 0 && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-primary" />
              Your Active Seats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mySeats.slice(0, 5).map((seat: any) => (
                <Link 
                  key={seat.id} 
                  href={`/portfolio-builder/splits/${seat.splitInstanceId}`}
                >
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer"
                    data-testid={`badge-my-seat-${seat.id}`}
                  >
                    {seat.splitInstance?.breakEvent?.title || 'Unknown'} - {seat.status}
                  </Badge>
                </Link>
              ))}
              {mySeats.length > 5 && (
                <Badge variant="outline">+{mySeats.length - 5} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-6">
          <BreakEventSkeleton />
          <BreakEventSkeleton />
        </div>
      )}

      {error && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="py-8 text-center">
            <p className="text-destructive">Failed to load break events. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {breakEvents && breakEvents.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Breaks</h3>
            <p className="text-muted-foreground">
              Check back soon for upcoming box break opportunities.
            </p>
          </CardContent>
        </Card>
      )}

      {breakEvents && breakEvents.length > 0 && (
        <div className="space-y-8">
          {breakEvents.map((event) => (
            <BreakEventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
