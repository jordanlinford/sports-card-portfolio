import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, DollarSign, Heart, MessageSquare, Trophy, UserPlus, TrendingUp, TrendingDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const getNotificationIcon = (type: string, data?: Record<string, unknown> | null) => {
    switch (type) {
      case "offer_received":
      case "offer_accepted":
      case "offer_declined":
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case "like_received":
        return <Heart className="h-4 w-4 text-red-500" />;
      case "comment_received":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "badge_earned":
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case "new_follower":
        return <UserPlus className="h-4 w-4 text-purple-500" />;
      case "price_alert":
        return data?.alertType === "above" 
          ? <TrendingUp className="h-4 w-4 text-green-500" />
          : <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getNotificationMessage = (notification: Notification) => {
    const data = notification.data as Record<string, unknown> | null;
    switch (notification.type) {
      case "offer_received":
        return `You received a $${data?.amount} offer on ${data?.cardTitle || "a card"}`;
      case "offer_accepted":
        return `Your offer on ${data?.cardTitle || "a card"} was accepted`;
      case "offer_declined":
        return `Your offer on ${data?.cardTitle || "a card"} was declined`;
      case "like_received":
        return `Someone liked your display case "${data?.caseName || ""}"`;
      case "comment_received":
        return `New comment on "${data?.caseName || "your case"}"`;
      case "badge_earned":
        return `You earned the "${data?.badgeName || ""}" badge!`;
      case "new_follower":
        return `${data?.followerName || "Someone"} started following you`;
      case "trade_received":
        return `You received a trade offer from ${data?.fromUserName || "someone"}`;
      case "trade_accepted":
        return `Your trade offer was accepted`;
      case "trade_declined":
        return `Your trade offer was declined`;
      case "price_alert":
        return data?.message as string || `Price alert triggered for ${data?.cardTitle || "a card"}`;
      default:
        return "New notification";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 p-2 border-b">
          <span className="font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 10).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex items-start gap-3 p-3 cursor-pointer ${
                  !notification.isRead ? "bg-accent/50" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getNotificationIcon(notification.type, notification.data as Record<string, unknown> | null)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-2">
                    {getNotificationMessage(notification)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!notification.isRead && (
                  <div className="flex-shrink-0">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
        
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="p-2 justify-center">
              <Link href="/offers" className="text-sm text-primary cursor-pointer">
                View all activity
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
