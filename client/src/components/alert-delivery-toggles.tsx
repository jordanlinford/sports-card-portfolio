import { useMutation, useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, Smartphone, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AlertSettings {
  id: number;
  userId: string;
  emailAlertsEnabled: boolean;
  inAppAlertsEnabled: boolean;
  weeklyDigestEnabled: boolean;
  lastDigestSentAt: string | null;
  createdAt: string | null;
}

interface AlertDeliveryTogglesProps {
  className?: string;
  compact?: boolean;
}

export function AlertDeliveryToggles({ className, compact }: AlertDeliveryTogglesProps) {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<AlertSettings>({
    queryKey: ["/api/user/alert-settings"],
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<Pick<AlertSettings, "emailAlertsEnabled" | "inAppAlertsEnabled">>) => {
      return await apiRequest("PUT", "/api/user/alert-settings", patch);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["/api/user/alert-settings"] });
      const previous = queryClient.getQueryData<AlertSettings>(["/api/user/alert-settings"]);
      if (previous) {
        queryClient.setQueryData<AlertSettings>(["/api/user/alert-settings"], {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/user/alert-settings"], context.previous);
      }
      toast({
        title: "Couldn't update delivery",
        description: "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/alert-settings"] });
    },
  });

  const emailEnabled = settings?.emailAlertsEnabled ?? true;
  const inAppEnabled = settings?.inAppAlertsEnabled ?? true;

  return (
    <div
      className={`rounded-md border bg-muted/30 p-3 space-y-2 ${className ?? ""}`}
      data-testid="alert-delivery-toggles"
    >
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Choose how you want to be notified when a price alert fires.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="toggle-email-alerts"
          className="flex items-center gap-2 text-sm font-normal cursor-pointer"
        >
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email me when a price alert fires
        </Label>
        <div className="flex items-center gap-2">
          {isLoading || (updateMutation.isPending && updateMutation.variables?.emailAlertsEnabled !== undefined) ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            id="toggle-email-alerts"
            checked={emailEnabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ emailAlertsEnabled: checked })}
            data-testid="switch-email-alerts-enabled"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="toggle-inapp-alerts"
          className="flex items-center gap-2 text-sm font-normal cursor-pointer"
        >
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          Show price alerts in-app
        </Label>
        <div className="flex items-center gap-2">
          {isLoading || (updateMutation.isPending && updateMutation.variables?.inAppAlertsEnabled !== undefined) ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : null}
          <Switch
            id="toggle-inapp-alerts"
            checked={inAppEnabled}
            disabled={isLoading || updateMutation.isPending}
            onCheckedChange={(checked) => updateMutation.mutate({ inAppAlertsEnabled: checked })}
            data-testid="switch-inapp-alerts-enabled"
          />
        </div>
      </div>
    </div>
  );
}
