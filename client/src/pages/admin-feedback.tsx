import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Bug, Lightbulb, MessageCircle, Heart, ExternalLink, Check, Clock, Archive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface FeedbackItem {
  id: number;
  userId: string | null;
  type: "bug" | "feature" | "general" | "praise";
  message: string;
  page: string | null;
  status: string;
  createdAt: string;
}

const TYPE_CONFIG = {
  bug: { icon: Bug, label: "Bug Report", color: "text-red-500", bg: "bg-red-500/10" },
  feature: { icon: Lightbulb, label: "Feature Request", color: "text-amber-500", bg: "bg-amber-500/10" },
  general: { icon: MessageCircle, label: "General", color: "text-blue-500", bg: "bg-blue-500/10" },
  praise: { icon: Heart, label: "Praise", color: "text-pink-500", bg: "bg-pink-500/10" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  new: { label: "New", variant: "default" },
  reviewed: { label: "Reviewed", variant: "secondary" },
  resolved: { label: "Resolved", variant: "outline" },
};

function FeedbackCard({ item, onStatusChange }: { item: FeedbackItem; onStatusChange: (id: number, status: string) => void }) {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;

  return (
    <Card className="hover-elevate" data-testid={`card-feedback-${item.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${config.bg}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div>
              <CardTitle className="text-base">{config.label}</CardTitle>
              <CardDescription className="text-xs">
                {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusConfig.variant} data-testid={`badge-status-${item.id}`}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap" data-testid={`text-message-${item.id}`}>{item.message}</p>
        
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.page && (
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {item.page}
              </span>
            )}
            {item.userId && (
              <span>User: {item.userId.substring(0, 8)}...</span>
            )}
            {!item.userId && (
              <span className="italic">Anonymous</span>
            )}
          </div>
          
          <div className="flex gap-1">
            {item.status !== "reviewed" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStatusChange(item.id, "reviewed")}
                data-testid={`button-mark-reviewed-${item.id}`}
              >
                <Clock className="h-3 w-3 mr-1" />
                Mark Reviewed
              </Button>
            )}
            {item.status !== "resolved" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStatusChange(item.id, "resolved")}
                data-testid={`button-mark-resolved-${item.id}`}
              >
                <Check className="h-3 w-3 mr-1" />
                Resolve
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminFeedbackPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");

  const { data: feedback, isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/feedback"],
    enabled: isAuthenticated,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/feedback/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view feedback.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredFeedback = feedback?.filter(item => {
    if (activeTab === "all") return true;
    if (activeTab === "new") return item.status === "new";
    return item.type === activeTab;
  }) || [];

  const counts = {
    all: feedback?.length || 0,
    new: feedback?.filter(f => f.status === "new").length || 0,
    bug: feedback?.filter(f => f.type === "bug").length || 0,
    feature: feedback?.filter(f => f.type === "feature").length || 0,
    general: feedback?.filter(f => f.type === "general").length || 0,
    praise: feedback?.filter(f => f.type === "praise").length || 0,
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">User Feedback</h1>
        <p className="text-muted-foreground">Review and manage feedback from your users</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all" data-testid="tab-all">
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="new" data-testid="tab-new">
            New ({counts.new})
          </TabsTrigger>
          <TabsTrigger value="bug" data-testid="tab-bug">
            <Bug className="h-3 w-3 mr-1" />
            ({counts.bug})
          </TabsTrigger>
          <TabsTrigger value="feature" data-testid="tab-feature">
            <Lightbulb className="h-3 w-3 mr-1" />
            ({counts.feature})
          </TabsTrigger>
          <TabsTrigger value="general" data-testid="tab-general">
            <MessageCircle className="h-3 w-3 mr-1" />
            ({counts.general})
          </TabsTrigger>
          <TabsTrigger value="praise" data-testid="tab-praise">
            <Heart className="h-3 w-3 mr-1" />
            ({counts.praise})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Loading feedback...</p>
              </CardContent>
            </Card>
          ) : filteredFeedback.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Archive className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No feedback yet</p>
              </CardContent>
            </Card>
          ) : (
            filteredFeedback.map(item => (
              <FeedbackCard
                key={item.id}
                item={item}
                onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
