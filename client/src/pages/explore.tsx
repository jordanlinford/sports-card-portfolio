import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  TrendingUp, 
  Clock, 
  Heart, 
  ImageIcon,
  LayoutGrid,
  ExternalLink,
  Flame
} from "lucide-react";
import type { DisplayCaseWithCards } from "@shared/schema";
import { format } from "date-fns";

type ExploreCase = DisplayCaseWithCards & { ownerName: string; likeCount: number };

function CaseCard({ displayCase }: { displayCase: ExploreCase }) {
  const cardCount = displayCase.cards?.length || 0;
  const previewCards = displayCase.cards?.slice(0, 4) || [];

  return (
    <Link href={`/case/${displayCase.id}`}>
      <Card className="group hover-elevate cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="aspect-[4/3] bg-muted rounded-lg mb-3 overflow-hidden relative">
            {previewCards.length > 0 ? (
              <div className="grid grid-cols-2 gap-1 p-2 h-full">
                {previewCards.map((card, i) => (
                  <div 
                    key={card.id} 
                    className="relative rounded overflow-hidden bg-background"
                  >
                    {card.imagePath ? (
                      <img
                        src={card.imagePath}
                        alt={card.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {previewCards.length < 4 && Array.from({ length: 4 - previewCards.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-background rounded" />
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <LayoutGrid className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            {cardCount > 4 && (
              <div className="absolute bottom-2 right-2">
                <Badge variant="secondary" className="text-xs">
                  +{cardCount - 4} more
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors" data-testid={`text-case-name-${displayCase.id}`}>
              {displayCase.name}
            </h3>
            {displayCase.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {displayCase.description}
              </p>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
              <span className="truncate">{displayCase.ownerName}</span>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {cardCount}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {displayCase.likeCount}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CaseGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="aspect-[4/3] rounded-lg mb-3" />
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
        <LayoutGrid className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No portfolios found</h3>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export default function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeTab, setActiveTab] = useState("trending");

  const { data: recentCases, isLoading: recentLoading } = useQuery<ExploreCase[]>({
    queryKey: ["/api/explore/recent"],
  });

  const { data: popularCases, isLoading: popularLoading } = useQuery<ExploreCase[]>({
    queryKey: ["/api/explore/popular"],
  });

  const { data: trendingCases, isLoading: trendingLoading } = useQuery<ExploreCase[]>({
    queryKey: ["/api/explore/trending"],
  });

  const { data: searchResults, isLoading: searchLoading, isFetching: searchFetching } = useQuery<ExploreCase[]>({
    queryKey: [`/api/explore/search?q=${encodeURIComponent(activeSearch)}`],
    enabled: activeSearch.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
  };

  const isSearchActive = activeSearch.length > 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Explore Portfolios</h1>
          <p className="text-muted-foreground">
            Discover amazing card portfolios from collectors around the world
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search portfolios by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-explore-search"
              />
            </div>
            <Button type="submit" data-testid="button-explore-search">
              Search
            </Button>
          </div>
        </form>

        {isSearchActive ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                Search results for "{activeSearch}"
              </h2>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setSearchQuery("");
                  setActiveSearch("");
                }}
                data-testid="button-clear-search"
              >
                Clear search
              </Button>
            </div>

            {searchLoading || searchFetching ? (
              <CaseGridSkeleton />
            ) : searchResults && searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {searchResults.map((displayCase) => (
                  <CaseCard key={displayCase.id} displayCase={displayCase} />
                ))}
              </div>
            ) : (
              <EmptyState message="Try a different search term" />
            )}
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="trending" className="gap-2" data-testid="tab-trending">
                <Flame className="h-4 w-4" />
                Trending
              </TabsTrigger>
              <TabsTrigger value="recent" className="gap-2" data-testid="tab-recent">
                <Clock className="h-4 w-4" />
                Recent
              </TabsTrigger>
              <TabsTrigger value="popular" className="gap-2" data-testid="tab-popular">
                <TrendingUp className="h-4 w-4" />
                Popular
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trending">
              {trendingLoading ? (
                <CaseGridSkeleton />
              ) : trendingCases && trendingCases.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {trendingCases.map((displayCase) => (
                    <CaseCard key={displayCase.id} displayCase={displayCase} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No trending collections yet. Engage with collections to see them trend!" />
              )}
            </TabsContent>

            <TabsContent value="recent">
              {recentLoading ? (
                <CaseGridSkeleton />
              ) : recentCases && recentCases.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {recentCases.map((displayCase) => (
                    <CaseCard key={displayCase.id} displayCase={displayCase} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No public collections yet. Be the first to share yours!" />
              )}
            </TabsContent>

            <TabsContent value="popular">
              {popularLoading ? (
                <CaseGridSkeleton />
              ) : popularCases && popularCases.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {popularCases.map((displayCase) => (
                    <CaseCard key={displayCase.id} displayCase={displayCase} />
                  ))}
                </div>
              ) : (
                <EmptyState message="No popular collections yet. Start liking collections to see them here!" />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
