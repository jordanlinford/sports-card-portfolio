import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowRight, Calendar, Video } from "lucide-react";
import type { BlogPostWithAuthor } from "@shared/schema";

export default function BlogListing() {
  const { data: posts, isLoading } = useQuery<BlogPostWithAuthor[]>({
    queryKey: ["/api/blog"],
  });

  useEffect(() => {
    document.title = "Blog | Sports Card Portfolio";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "News, updates, and insights about sports card collecting and investing. Expert tips on building and growing your card portfolio.");
    }
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", "Blog | Sports Card Portfolio");
    
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", "News, updates, and insights about sports card collecting and investing.");
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-blog-title">Blog</h1>
        <p className="text-muted-foreground" data-testid="text-blog-description">
          News, updates, and insights about sports card collecting and investing.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-blog-${post.id}`}>
                {post.heroImageUrl && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-md">
                    <img
                      src={post.heroImageUrl}
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {post.publishedAt && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {format(new Date(post.publishedAt), "MMM d, yyyy")}
                      </Badge>
                    )}
                    {post.videoEmbeds && post.videoEmbeds.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <Video className="h-3 w-3 mr-1" />
                        {post.videoEmbeds.length} video{post.videoEmbeds.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl" data-testid={`text-blog-title-${post.id}`}>{post.title}</CardTitle>
                  {post.excerpt && (
                    <CardDescription className="text-base" data-testid={`text-blog-excerpt-${post.id}`}>
                      {post.excerpt}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-primary">
                    Read more <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p data-testid="text-no-posts">No blog posts yet. Check back soon!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
