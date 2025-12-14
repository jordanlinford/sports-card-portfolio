import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, Crown, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PriceAlert, Card } from "@shared/schema";

interface CardPriceAlertsPanelProps {
  card: Card;
  isPro: boolean;
}

interface AlertsData {
  alerts: PriceAlert[];
  userAlertCount: number;
  maxAlerts: number;
  canCreateMore: boolean;
}

export function CardPriceAlertsPanel({ card, isPro }: CardPriceAlertsPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [alertType, setAlertType] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const { toast } = useToast();

  const { data: alertsData, isLoading } = useQuery<AlertsData>({
    queryKey: ["/api/cards", card.id, "price-alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/cards/${card.id}/price-alerts`);
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
  });

  const createAlertMutation = useMutation({
    mutationFn: async (data: { cardId: number; alertType: string; threshold: number }) => {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to create alert" }));
        throw new Error(errorData.message || "Failed to create alert");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "price-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] });
      toast({
        title: "Alert Created",
        description: "You'll be notified when the price crosses your threshold.",
      });
      setShowAddForm(false);
      setThreshold("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create alert",
        variant: "destructive",
      });
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/price-alerts/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "price-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update alert",
        variant: "destructive",
      });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/price-alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cards", card.id, "price-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] });
      toast({
        title: "Alert Deleted",
        description: "Price alert has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete alert",
        variant: "destructive",
      });
    },
  });

  const handleCreateAlert = () => {
    const thresholdValue = parseFloat(threshold);
    if (isNaN(thresholdValue) || thresholdValue <= 0) {
      toast({
        title: "Invalid Threshold",
        description: "Please enter a valid price threshold.",
        variant: "destructive",
      });
      return;
    }

    createAlertMutation.mutate({
      cardId: card.id,
      alertType,
      threshold: thresholdValue,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const alerts = alertsData?.alerts || [];
  const canCreateMore = alertsData?.canCreateMore ?? true;
  const userAlertCount = alertsData?.userAlertCount ?? 0;
  const maxAlerts = alertsData?.maxAlerts ?? 3;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Price Alerts</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Price Alerts</span>
          {!isPro && (
            <Badge variant="outline" className="text-[10px]">
              {userAlertCount}/{maxAlerts} free
            </Badge>
          )}
        </div>
        {!showAddForm && canCreateMore && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setShowAddForm(true)}
            data-testid="button-add-price-alert"
          >
            <Plus className="h-3 w-3" />
            Add Alert
          </Button>
        )}
      </div>

      {alerts.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          Get notified when this card's price goes above or below your target.
        </p>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
          data-testid={`price-alert-${alert.id}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {alert.alertType === "above" ? (
              <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <span className="text-sm truncate">
              {alert.alertType === "above" ? "Above" : "Below"} {formatCurrency(alert.threshold)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch
              checked={alert.isActive}
              onCheckedChange={(checked) =>
                toggleAlertMutation.mutate({ id: alert.id, isActive: checked })
              }
              disabled={toggleAlertMutation.isPending}
              data-testid={`switch-alert-${alert.id}`}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deleteAlertMutation.mutate(alert.id)}
              disabled={deleteAlertMutation.isPending}
              data-testid={`button-delete-alert-${alert.id}`}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}

      {showAddForm && (
        <div className="space-y-3 p-3 rounded-md border bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Alert Type</Label>
              <Select
                value={alertType}
                onValueChange={(v) => setAlertType(v as "above" | "below")}
              >
                <SelectTrigger data-testid="select-alert-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Price goes above</SelectItem>
                  <SelectItem value="below">Price goes below</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Threshold ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={card.estimatedValue?.toString() || "0.00"}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                data-testid="input-alert-threshold"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreateAlert}
              disabled={createAlertMutation.isPending}
              data-testid="button-save-alert"
            >
              {createAlertMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Create Alert
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAddForm(false);
                setThreshold("");
              }}
              data-testid="button-cancel-alert"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!canCreateMore && !isPro && (
        <div className="p-3 rounded-md border bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Crown className="h-4 w-4 text-primary" />
            <span className="font-medium">Alert limit reached</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Free accounts can create up to {maxAlerts} price alerts. Upgrade to Pro for unlimited alerts.
          </p>
          <Link href="/upgrade">
            <Button size="sm" className="gap-1 mt-1" data-testid="button-upgrade-alerts">
              <Crown className="h-3 w-3" />
              Upgrade to Pro
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
