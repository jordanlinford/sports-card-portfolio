import { useQuery, useMutation } from "@tanstack/react-query";
import { sanitizeCardField } from "@/lib/sanitizeCardField";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bookmark, Trash2, ExternalLink, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { BookmarkWithCard } from "@shared/schema";
import { OutlookBadge } from "@/components/outlook-badge";
import { formatDistanceToNow } from "date-fns";

export default function BookmarksPage() {
  const { toast } = useToast();
  
  const { data: bookmarks, isLoading } = useQuery<BookmarkWithCard[]>({
    queryKey: ["/api/bookmarks"],
  });

  const removeBookmarkMutation = useMutation({
    mutationFn: async (cardId: number) => {
      await apiRequest("DELETE", `/api/cards/${cardId}/bookmark`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      toast({
        title: "Bookmark Removed",
        description: "Card removed from your bookmarks",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove bookmark",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bookmark className="h-6 w-6" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Bookmarks</h1>
        </div>
        <p className="text-muted-foreground">
          Cards you've bookmarked from other collectors
        </p>
      </div>

      {!bookmarks || bookmarks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No bookmarks yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Browse public collections and bookmark cards you're interested in
            </p>
            <Button asChild>
              <Link href="/explore">
                <ExternalLink className="h-4 w-4 mr-2" />
                Explore Collections
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bookmarks.map((bookmark) => (
            <Card key={bookmark.id} className="overflow-hidden" data-testid={`card-bookmark-${bookmark.id}`}>
              <div className="aspect-[4/3] relative overflow-hidden bg-muted">
                {bookmark.card.imagePath ? (
                  <img
                    src={bookmark.card.imagePath}
                    alt={bookmark.card.title}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No Image
                  </div>
                )}
                {bookmark.card.outlookAction && (
                  <div className="absolute top-2 left-2">
                    <OutlookBadge action={bookmark.card.outlookAction} size="sm" />
                  </div>
                )}
                {bookmark.card.openToOffers && (
                  <Badge className="absolute top-2 right-2 bg-green-600 text-white">
                    Open to Offers
                  </Badge>
                )}
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg line-clamp-1">
                  {bookmark.card.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  {bookmark.card.year && <span>{bookmark.card.year}</span>}
                  {sanitizeCardField(bookmark.card.set) && <span className="truncate">{sanitizeCardField(bookmark.card.set)}</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {bookmark.card.estimatedValue && (
                      <Badge variant="secondary" className="gap-1">
                        <DollarSign className="h-3 w-3" />
                        {bookmark.card.estimatedValue.toFixed(0)}
                      </Badge>
                    )}
                    {bookmark.card.minOfferAmount && (
                      <span className="text-xs text-muted-foreground">
                        Min: ${bookmark.card.minOfferAmount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {bookmark.createdAt && formatDistanceToNow(new Date(bookmark.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => removeBookmarkMutation.mutate(bookmark.cardId)}
                    disabled={removeBookmarkMutation.isPending}
                    data-testid={`button-remove-bookmark-${bookmark.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
