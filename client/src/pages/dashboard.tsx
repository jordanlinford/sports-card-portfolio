import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  LayoutGrid, 
  Eye, 
  Pencil, 
  Calendar,
  ImageIcon,
  Crown,
  FolderOpen,
  Sparkles,
  TrendingUp
} from "lucide-react";
import type { DisplayCaseWithCards } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full rounded-md" />
              <div className="flex gap-2 mt-4">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-6">
        <FolderOpen className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No display cases yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Create your first display case to start showcasing your card collection to the world.
      </p>
      {canCreate && (
        <Link href="/cases/new">
          <Button className="gap-2" data-testid="button-create-first-case">
            <Plus className="h-4 w-4" />
            Create Your First Display Case
          </Button>
        </Link>
      )}
    </div>
  );
}

function DisplayCaseCard({ displayCase }: { displayCase: DisplayCaseWithCards }) {
  const cardCount = displayCase.cards?.length || 0;
  const previewImages = displayCase.cards?.slice(0, 4) || [];

  return (
    <Card className="group hover-elevate" data-testid={`card-display-case-${displayCase.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate" data-testid={`text-case-name-${displayCase.id}`}>
              {displayCase.name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="h-3 w-3" />
              {displayCase.createdAt
                ? format(new Date(displayCase.createdAt), "MMM d, yyyy")
                : "Unknown"}
            </CardDescription>
          </div>
          <Badge variant={displayCase.isPublic ? "secondary" : "outline"}>
            {displayCase.isPublic ? "Public" : "Private"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden mb-4">
          {previewImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 h-full p-1">
              {previewImages.map((card, index) => (
                <div
                  key={card.id}
                  className="bg-background rounded overflow-hidden"
                >
                  <img
                    src={card.imagePath}
                    alt={card.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {previewImages.length < 4 &&
                Array.from({ length: 4 - previewImages.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="bg-background/50 rounded flex items-center justify-center"
                  >
                    <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mb-2 opacity-30" />
              <span className="text-sm">No cards yet</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{cardCount} {cardCount === 1 ? "card" : "cards"}</span>
            <span className="flex items-center gap-1" data-testid={`text-views-${displayCase.id}`}>
              <Eye className="h-3 w-3" />
              {displayCase.viewCount || 0} {displayCase.viewCount === 1 ? "view" : "views"}
            </span>
          </div>
          <div className="flex gap-2">
            <Link href={`/cases/${displayCase.id}`}>
              <Button variant="outline" size="sm" className="gap-1" data-testid={`button-view-case-${displayCase.id}`}>
                <Eye className="h-3 w-3" />
                View
              </Button>
            </Link>
            <Link href={`/cases/${displayCase.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1" data-testid={`button-edit-case-${displayCase.id}`}>
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: displayCases, isLoading: casesLoading } = useQuery<DisplayCaseWithCards[]>({
    queryKey: ["/api/display-cases"],
    enabled: isAuthenticated,
  });

  const createTopCardsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/display-cases/top-cards", {
        limit: 12,
        name: "My Top Cards"
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", data.id] });
      toast({
        title: "Top Cards Case Created",
        description: `Created a showcase of your ${data.cards?.length || 0} most valuable cards!`,
      });
      setLocation(`/cases/${data.id}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: "Could not create case",
        description: error.message || "Failed to create top cards case",
        variant: "destructive",
      });
    },
  });

  const isLoading = authLoading || casesLoading;
  const caseCount = displayCases?.length || 0;
  const isPro = user?.subscriptionStatus === "PRO";
  const canCreate = isPro || caseCount < 3;
  
  // Check if user has any cards with values
  const hasValuableCards = displayCases?.some(dc => 
    dc.cards?.some(card => card.estimatedValue && card.estimatedValue > 0)
  ) ?? false;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-dashboard-title">
            My Display Cases
          </h1>
          <p className="text-muted-foreground mt-1">
            {isPro ? (
              <span className="flex items-center gap-1">
                <Crown className="h-4 w-4 text-primary" />
                Pro Account - Unlimited Cases
              </span>
            ) : (
              `${caseCount} of 3 free cases used`
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!isPro && caseCount >= 3 && (
            <Link href="/upgrade">
              <Button variant="outline" className="gap-2" data-testid="button-upgrade-dashboard">
                <Crown className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            </Link>
          )}
          {canCreate && hasValuableCards && (
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => createTopCardsMutation.mutate()}
              disabled={createTopCardsMutation.isPending}
              data-testid="button-create-top-cards"
            >
              <Sparkles className="h-4 w-4" />
              {createTopCardsMutation.isPending ? "Creating..." : "Create Top Cards Case"}
            </Button>
          )}
          {canCreate && (
            <Link href="/cases/new">
              <Button className="gap-2" data-testid="button-create-case">
                <Plus className="h-4 w-4" />
                New Display Case
              </Button>
            </Link>
          )}
        </div>
      </div>

      {!displayCases || displayCases.length === 0 ? (
        <EmptyState canCreate={canCreate} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayCases.map((displayCase) => (
            <DisplayCaseCard key={displayCase.id} displayCase={displayCase} />
          ))}
        </div>
      )}
    </div>
  );
}
