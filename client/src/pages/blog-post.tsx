import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Video } from "lucide-react";
import type { BlogPostWithAuthor } from "@shared/schema";

function extractVideoId(url: string, provider: string): string | null {
  if (provider === "youtube") {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }
  if (provider === "vimeo") {
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

function VideoEmbed({ provider, url, caption }: { provider: string; url: string; caption?: string }) {
  const videoId = extractVideoId(url, provider);
  
  if (!videoId) {
    return (
      <div className="p-4 bg-muted rounded-md text-center text-muted-foreground">
        Invalid video URL
      </div>
    );
  }

  const embedUrl = provider === "youtube"
    ? `https://www.youtube.com/embed/${videoId}`
    : `https://player.vimeo.com/video/${videoId}`;

  return (
    <div className="space-y-2">
      <div className="aspect-video w-full rounded-md overflow-hidden">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={caption || "Embedded video"}
        />
      </div>
      {caption && (
        <p className="text-sm text-muted-foreground text-center italic">{caption}</p>
      )}
    </div>
  );
}

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  
  const { data: post, isLoading, error } = useQuery<BlogPostWithAuthor>({
    queryKey: ["/api/blog", params.slug],
    enabled: !!params.slug,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/blog">
          <Button variant="ghost" className="mb-6" data-testid="button-back-to-blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p data-testid="text-post-not-found">Blog post not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/blog">
        <Button variant="ghost" className="mb-6" data-testid="button-back-to-blog">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Blog
        </Button>
      </Link>

      <article>
        {post.heroImageUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-md mb-6">
            <img
              src={post.heroImageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
              data-testid="img-hero"
            />
          </div>
        )}

        <header className="mb-8">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {post.publishedAt && (
              <Badge variant="outline">
                <Calendar className="h-3 w-3 mr-1" />
                {format(new Date(post.publishedAt), "MMMM d, yyyy")}
              </Badge>
            )}
            {post.videoEmbeds && post.videoEmbeds.length > 0 && (
              <Badge variant="secondary">
                <Video className="h-3 w-3 mr-1" />
                {post.videoEmbeds.length} video{post.videoEmbeds.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-post-title">{post.title}</h1>
          {post.excerpt && (
            <p className="text-lg text-muted-foreground" data-testid="text-post-excerpt">{post.excerpt}</p>
          )}
        </header>

        <div className="prose prose-neutral dark:prose-invert max-w-none" data-testid="text-post-content">
          {post.content.split('\n').map((paragraph, index) => (
            paragraph.trim() ? (
              <p key={index}>{paragraph}</p>
            ) : (
              <br key={index} />
            )
          ))}
        </div>

        {post.videoEmbeds && post.videoEmbeds.length > 0 && (
          <div className="mt-8 space-y-6">
            <h2 className="text-xl font-semibold">Videos</h2>
            {post.videoEmbeds.map((video, index) => (
              <VideoEmbed
                key={index}
                provider={video.provider}
                url={video.url}
                caption={video.caption}
              />
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
