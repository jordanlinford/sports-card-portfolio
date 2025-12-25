import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  DollarSign,
  Users,
  Clock,
  Link as LinkIcon,
  ArrowLeft,
  Trash2,
  Edit,
  Play,
  Truck,
  Home,
  Video,
  AlertCircle,
} from "lucide-react";
import type { BreakEvent, SplitInstance, Seat } from "@shared/schema";
import { BREAKER_FEE_CENTS } from "@shared/schema";

type SplitStatus = "OPEN_INTEREST" | "PAYMENT_OPEN" | "LOCKED" | "ORDERED" | "SHIPPED" | "IN_HAND" | "BROKEN";

const STATUS_COLORS: Record<SplitStatus, string> = {
  OPEN_INTEREST: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  PAYMENT_OPEN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  LOCKED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  ORDERED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  SHIPPED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100",
  IN_HAND: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  BROKEN: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100",
};

const STATUS_LABELS: Record<SplitStatus, string> = {
  OPEN_INTEREST: "Gathering Interest",
  PAYMENT_OPEN: "Payment Open",
  LOCKED: "Locked",
  ORDERED: "Ordered",
  SHIPPED: "Shipped",
  IN_HAND: "In Hand",
  BROKEN: "Broken",
};

const NEXT_STATUS: Partial<Record<SplitStatus, SplitStatus>> = {
  LOCKED: "ORDERED",
  ORDERED: "SHIPPED",
  SHIPPED: "IN_HAND",
  IN_HAND: "BROKEN",
};

export default function AdminPortfolioBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("events");
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BreakEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [showSeatsDialog, setShowSeatsDialog] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState<SplitInstance | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showYoutubeDialog, setShowYoutubeDialog] = useState(false);

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/user/admin"],
    enabled: !!user,
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<BreakEvent[]>({
    queryKey: ["/api/admin/breaks"],
    enabled: adminCheck?.isAdmin,
  });

  const { data: splits = [], isLoading: splitsLoading } = useQuery<SplitInstance[]>({
    queryKey: ["/api/admin/splits"],
    enabled: adminCheck?.isAdmin,
  });

  const { data: seats = [] } = useQuery<Seat[]>({
    queryKey: ["/api/admin/splits", selectedSplit?.id, "seats"],
    enabled: !!selectedSplit?.id,
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/breaks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaks"] });
      setShowEventDialog(false);
      setEditingEvent(null);
      toast({ title: "Break event created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/admin/breaks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaks"] });
      setShowEventDialog(false);
      setEditingEvent(null);
      toast({ title: "Break event updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/breaks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaks"] });
      toast({ title: "Break event deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createSplitMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/admin/breaks/${data.breakEventId}/splits`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/splits"] });
      setShowSplitDialog(false);
      setSelectedEventId(null);
      toast({ title: "Split created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const triggerPaymentMutation = useMutation({
    mutationFn: async (splitId: number) => {
      return apiRequest("POST", `/api/admin/splits/${splitId}/open-payment`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/splits"] });
      toast({ title: "Payment window opened" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const advanceStatusMutation = useMutation({
    mutationFn: async ({ splitId, status }: { splitId: number; status: SplitStatus }) => {
      return apiRequest("POST", `/api/admin/splits/${splitId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/splits"] });
      toast({ title: "Status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setYoutubeUrlMutation = useMutation({
    mutationFn: async ({ splitId, url }: { splitId: number; url: string }) => {
      return apiRequest("POST", `/api/admin/splits/${splitId}/status`, { 
        status: "BROKEN",
        youtubeUrl: url,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/splits"] });
      setShowYoutubeDialog(false);
      setSelectedSplit(null);
      setYoutubeUrl("");
      toast({ title: "YouTube URL set" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !adminCheck?.isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You need admin access to view this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getEventById = (id: number) => events.find((e) => e.id === id);

  const handleEventSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      sport: formData.get("sport") as string,
      brand: formData.get("brand") as string,
      year: formData.get("year") as string,
      imageUrl: formData.get("imageUrl") as string || null,
      isActive: formData.get("isActive") === "true",
    };

    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data });
    } else {
      createEventMutation.mutate(data);
    }
  };

  const handleSplitSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const paymentWindowHours = parseInt(formData.get("paymentWindowHours") as string) || 24;
    const participantCount = parseInt(formData.get("participantCount") as string) || 10;
    const seatPriceCents = parseInt(formData.get("seatPriceCents") as string) || 5000;

    createSplitMutation.mutate({
      breakEventId: selectedEventId,
      paymentWindowHours,
      participantCount,
      seatPriceCents,
      formatType: "DIVISIONAL",
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portfolio-builder")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Portfolio Builder Admin</h1>
          <p className="text-muted-foreground">Manage break events and splits</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="events" data-testid="tab-events">Break Events</TabsTrigger>
          <TabsTrigger value="splits" data-testid="tab-splits">Active Splits</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowEventDialog(true)} data-testid="button-create-event">
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </div>

          {eventsLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted rounded-md" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No break events yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first break event to get started.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {events.map((event) => (
                <Card key={event.id} data-testid={`card-event-${event.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{event.title}</CardTitle>
                        <Badge variant={event.isActive ? "default" : "secondary"}>
                          {event.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">{event.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditingEvent(event);
                          setShowEventDialog(true);
                        }}
                        data-testid={`button-edit-event-${event.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this event?")) {
                            deleteEventMutation.mutate(event.id);
                          }
                        }}
                        data-testid={`button-delete-event-${event.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Package className="h-4 w-4" />
                        {event.year} {event.brand} {event.sport}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedEventId(event.id);
                          setShowSplitDialog(true);
                        }}
                        data-testid={`button-create-split-${event.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Split Instance
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="splits">
          {splitsLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-md" />
              ))}
            </div>
          ) : splits.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No splits yet</h3>
                  <p className="text-muted-foreground">Create a split from a break event to get started.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {splits.map((split) => {
                const event = getEventById(split.breakEventId);
                const nextStatus = NEXT_STATUS[split.status as SplitStatus];

                return (
                  <Card key={split.id} data-testid={`card-split-${split.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{event?.title || "Unknown Event"}</CardTitle>
                          <Badge className={STATUS_COLORS[split.status as SplitStatus]}>
                            {STATUS_LABELS[split.status as SplitStatus]}
                          </Badge>
                        </div>
                        <CardDescription className="mt-1">
                          Split #{split.id} - {event?.brand}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {split.participantCount} seats
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          ${(split.seatPriceCents / 100).toFixed(2)} per seat
                        </div>
                        {split.paymentWindowEndsAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Deadline: {new Date(split.paymentWindowEndsAt).toLocaleString()}
                          </div>
                        )}
                        {split.youtubeUrl && (
                          <a
                            href={split.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Video className="h-4 w-4" />
                            Watch Break
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSplit(split);
                            setShowSeatsDialog(true);
                          }}
                          data-testid={`button-view-seats-${split.id}`}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          View Seats
                        </Button>

                        {split.status === "OPEN_INTEREST" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => triggerPaymentMutation.mutate(split.id)}
                            disabled={triggerPaymentMutation.isPending}
                            data-testid={`button-trigger-payment-${split.id}`}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Open Payment Window
                          </Button>
                        )}

                        {nextStatus && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              advanceStatusMutation.mutate({ splitId: split.id, status: nextStatus })
                            }
                            disabled={advanceStatusMutation.isPending}
                            data-testid={`button-advance-${split.id}`}
                          >
                            {nextStatus === "ORDERED" && <Package className="h-4 w-4 mr-2" />}
                            {nextStatus === "SHIPPED" && <Truck className="h-4 w-4 mr-2" />}
                            {nextStatus === "IN_HAND" && <Home className="h-4 w-4 mr-2" />}
                            {nextStatus === "BROKEN" && <Video className="h-4 w-4 mr-2" />}
                            Mark as {STATUS_LABELS[nextStatus]}
                          </Button>
                        )}

                        {split.status === "BROKEN" && !split.youtubeUrl && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedSplit(split);
                              setShowYoutubeDialog(true);
                            }}
                            data-testid={`button-add-youtube-${split.id}`}
                          >
                            <LinkIcon className="h-4 w-4 mr-2" />
                            Add YouTube URL
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showEventDialog} onOpenChange={(open) => {
        setShowEventDialog(open);
        if (!open) setEditingEvent(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Break Event" : "Create Break Event"}</DialogTitle>
            <DialogDescription>
              Define the product for this break event.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEventSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={editingEvent?.title || ""}
                required
                data-testid="input-event-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={editingEvent?.description || ""}
                data-testid="input-event-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Box Image URL</Label>
              <Input
                id="imageUrl"
                name="imageUrl"
                defaultValue={editingEvent?.imageUrl || ""}
                placeholder="https://example.com/box-image.jpg"
                data-testid="input-event-image"
              />
              <p className="text-xs text-muted-foreground">
                Paste a URL to an image of the hobby box
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  name="year"
                  defaultValue={editingEvent?.year || new Date().getFullYear().toString()}
                  required
                  data-testid="input-event-year"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  name="brand"
                  defaultValue={editingEvent?.brand || ""}
                  placeholder="e.g., Panini Prizm"
                  required
                  data-testid="input-event-brand"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sport">Sport</Label>
                <Input
                  id="sport"
                  name="sport"
                  defaultValue={editingEvent?.sport || ""}
                  placeholder="e.g., Football"
                  required
                  data-testid="input-event-sport"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <Select name="isActive" defaultValue={editingEvent?.isActive !== false ? "true" : "false"}>
                <SelectTrigger data-testid="select-event-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createEventMutation.isPending || updateEventMutation.isPending} data-testid="button-submit-event">
                {editingEvent ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitDialog} onOpenChange={(open) => {
        setShowSplitDialog(open);
        if (!open) setSelectedEventId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Split Instance</DialogTitle>
            <DialogDescription>
              Create a new split for: {selectedEventId && getEventById(selectedEventId)?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSplitSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="participantCount">Number of Seats</Label>
              <Input
                id="participantCount"
                name="participantCount"
                type="number"
                min="2"
                defaultValue="10"
                required
                data-testid="input-split-participants"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seatPriceCents">Base Price Per Seat (cents)</Label>
              <Input
                id="seatPriceCents"
                name="seatPriceCents"
                type="number"
                min="100"
                defaultValue="5000"
                required
                data-testid="input-split-price"
              />
              <p className="text-xs text-muted-foreground">5000 = $50.00 (box cost share)</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <DollarSign className="h-4 w-4" />
                <span className="font-medium">+ ${(BREAKER_FEE_CENTS / 100).toFixed(2)} Breaker Fee</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                A $50 breaker fee is added to every seat to cover break hosting, shipping, and handling.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentWindowHours">Payment Window (hours)</Label>
              <Input
                id="paymentWindowHours"
                name="paymentWindowHours"
                type="number"
                min="1"
                defaultValue="24"
                required
                data-testid="input-split-window"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createSplitMutation.isPending} data-testid="button-submit-split">
                Create Split
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showYoutubeDialog} onOpenChange={(open) => {
        setShowYoutubeDialog(open);
        if (!open) {
          setSelectedSplit(null);
          setYoutubeUrl("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add YouTube URL</DialogTitle>
            <DialogDescription>
              Link the break recording for participants to watch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">YouTube URL</Label>
              <Input
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                data-testid="input-youtube-url"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  if (selectedSplit) {
                    setYoutubeUrlMutation.mutate({ splitId: selectedSplit.id, url: youtubeUrl });
                  }
                }}
                disabled={setYoutubeUrlMutation.isPending || !youtubeUrl}
                data-testid="button-submit-youtube"
              >
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSeatsDialog} onOpenChange={(open) => {
        setShowSeatsDialog(open);
        if (!open) setSelectedSplit(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seats for Split #{selectedSplit?.id}</DialogTitle>
            <DialogDescription>
              View all participants and their slot assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {seats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No seats have been claimed yet.
              </div>
            ) : (
              <div className="space-y-2">
                {seats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                    data-testid={`seat-${seat.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium">User: {seat.userId.slice(0, 8)}...</div>
                      <div className="text-sm text-muted-foreground">
                        {seat.assignment ? (
                          <span className="text-green-600 dark:text-green-400">
                            Assigned: {seat.assignment}
                          </span>
                        ) : (
                          <span>Pending assignment</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {seat.paidAt ? (
                        <Badge variant="default">Paid</Badge>
                      ) : (
                        <Badge variant="secondary">Unpaid</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
