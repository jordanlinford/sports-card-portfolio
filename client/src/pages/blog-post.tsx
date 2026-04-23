import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Video, Share2, Link2, Check } from "lucide-react";
import { useState } from "react";
import { SiX, SiFacebook } from "react-icons/si";
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

function looksLikeHtml(content: string): boolean {
  if (!content) return false;
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<p[\s>]|<h[1-6][\s>]|<div[\s>]|<style[\s>]/i.test(content);
}

// Scope a CSS string so every rule applies only inside the given selector.
// Handles comma-separated selectors, nested @media / @supports blocks, and
// remaps `body`/`html` to the scope wrapper itself.
function scopeCss(css: string, scope: string): string {
  // Strip comments first so they don't confuse the brace walker.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < stripped.length) {
    // Skip whitespace
    while (i < stripped.length && /\s/.test(stripped[i])) i++;
    if (i >= stripped.length) break;

    const selectorStart = i;
    while (i < stripped.length && stripped[i] !== "{" && stripped[i] !== "}") i++;
    if (i >= stripped.length) break;
    if (stripped[i] === "}") {
      i++;
      continue;
    }

    const selector = stripped.slice(selectorStart, i).trim();
    i++; // past '{'

    let depth = 1;
    const bodyStart = i;
    while (i < stripped.length && depth > 0) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") depth--;
      i++;
    }
    const body = stripped.slice(bodyStart, i - 1);

    if (/^@(media|supports|container)\b/.test(selector)) {
      out += `${selector} {\n${scopeCss(body, scope)}\n}\n`;
    } else if (selector.startsWith("@")) {
      // @keyframes, @font-face, @page, @charset, @import — leave alone.
      out += `${selector} {${body}}\n`;
    } else {
      const scoped = selector
        .split(",")
        .map(part => {
          const s = part.trim();
          if (!s) return s;
          if (s === "body" || s === "html" || s === ":root") return scope;
          if (s.startsWith("body ") || s.startsWith("html ")) {
            return `${scope} ${s.split(/\s+/).slice(1).join(" ")}`;
          }
          return `${scope} ${s}`;
        })
        .filter(Boolean)
        .join(", ");
      out += `${scoped} { ${body.trim()} }\n`;
    }
  }
  return out;
}

function prepareHtmlForRender(raw: string): { html: string; styles: string } {
  if (!raw) return { html: "", styles: "" };

  const rawStyleBlocks: string[] = [];
  let html = raw.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css) => {
    rawStyleBlocks.push(String(css));
    return "";
  });

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    html = bodyMatch[1];
  } else {
    html = html
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<\/?html\b[^>]*>/gi, "")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  }

  const scopedStyles = rawStyleBlocks
    .map(css => scopeCss(css, ".blog-html-scope"))
    .join("\n");

  // Readability overrides: blog HTML is often authored with a dark-theme
  // palette (white text, white-ish links). When we render it inside a
  // forced white card, that turns into white-on-white invisible text.
  // These rules target the scope wrapper with high specificity so they
  // override anything the source <style> block set, forcing legible
  // colors against the white card background.
  const readabilityOverrides = `
.blog-html-scope, .blog-html-scope * { color: rgb(23 23 23); }
.blog-html-scope h1, .blog-html-scope h2, .blog-html-scope h3,
.blog-html-scope h4, .blog-html-scope h5, .blog-html-scope h6 { color: rgb(23 23 23); }
.blog-html-scope a, .blog-html-scope a:visited { color: rgb(37 99 235); text-decoration: underline; }
.blog-html-scope a:hover { color: rgb(29 78 216); text-decoration: none; }
.blog-html-scope strong, .blog-html-scope b { color: rgb(23 23 23); }
.blog-html-scope blockquote { color: rgb(64 64 64); border-left: 4px solid rgb(229 229 229); padding-left: 1rem; }
.blog-html-scope code { color: rgb(23 23 23); background: rgb(245 245 245); padding: 0.1em 0.3em; border-radius: 0.25rem; }
.blog-html-scope pre { color: rgb(23 23 23); background: rgb(245 245 245); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
.blog-html-scope pre code { background: transparent; padding: 0; }
.blog-html-scope hr { border-color: rgb(229 229 229); }
.blog-html-scope table { border-collapse: collapse; }
.blog-html-scope th, .blog-html-scope td { border: 1px solid rgb(229 229 229); padding: 0.5rem 0.75rem; color: rgb(23 23 23); }
.blog-html-scope th { background: rgb(250 250 250); }
`;

  return { html: html.trim(), styles: scopedStyles + "\n" + readabilityOverrides };
}

function parseTextWithLinks(text: string): (string | JSX.Element)[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?'"\])>])/g;
  
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;
  
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`link-${keyCounter++}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:no-underline"
      >
        {linkText}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  const finalParts: (string | JSX.Element)[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      let urlLastIndex = 0;
      let urlMatch;
      const tempUrlRegex = new RegExp(urlRegex.source, 'g');
      while ((urlMatch = tempUrlRegex.exec(part)) !== null) {
        if (urlMatch.index > urlLastIndex) {
          finalParts.push(part.slice(urlLastIndex, urlMatch.index));
        }
        const url = urlMatch[1];
        finalParts.push(
          <a
            key={`autolink-${keyCounter++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
          >
            {url}
          </a>
        );
        urlLastIndex = urlMatch.index + urlMatch[0].length;
      }
      if (urlLastIndex < part.length) {
        finalParts.push(part.slice(urlLastIndex));
      }
    } else {
      finalParts.push(part);
    }
  }
  
  return finalParts;
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

  useEffect(() => {
    if (post) {
      document.title = `${post.title} | Sports Card Portfolio`;
      
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute("content", post.excerpt || post.content.substring(0, 160));
      }
      
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", post.title);
      
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) ogDescription.setAttribute("content", post.excerpt || post.content.substring(0, 160));
      
      if (post.heroImageUrl) {
        let ogImage = document.querySelector('meta[property="og:image"]');
        if (!ogImage) {
          ogImage = document.createElement('meta');
          ogImage.setAttribute('property', 'og:image');
          document.head.appendChild(ogImage);
        }
        ogImage.setAttribute("content", post.heroImageUrl);
      }
      
      const existingJsonLd = document.querySelector('script[type="application/ld+json"][data-blog-post]');
      if (existingJsonLd) existingJsonLd.remove();
      
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.excerpt || post.content.substring(0, 160),
        "datePublished": post.publishedAt,
        "dateModified": post.updatedAt,
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": window.location.href
        },
        ...(post.heroImageUrl && { "image": post.heroImageUrl }),
        "publisher": {
          "@type": "Organization",
          "name": "Sports Card Portfolio"
        }
      };
      
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-blog-post', 'true');
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
      
      return () => {
        const scriptToRemove = document.querySelector('script[type="application/ld+json"][data-blog-post]');
        if (scriptToRemove) scriptToRemove.remove();
      };
    }
  }, [post]);

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
          {(post.contentFormat === "html" || looksLikeHtml(post.content)) ? (
            (() => {
              const { html, styles } = prepareHtmlForRender(post.content);
              return (
                <>
                  {styles && <style dangerouslySetInnerHTML={{ __html: styles }} />}
                  <div
                    className="blog-html-scope rounded-xl bg-white text-neutral-900 px-6 py-8 sm:px-10 sm:py-12 shadow-sm"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </>
              );
            })()
          ) : (
            <div className="whitespace-pre-line">
              {parseTextWithLinks(post.content)}
            </div>
          )}
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

        <ShareSection title={post.title} />
      </article>
    </div>
  );
}

function ShareSection({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareToTwitter = () => {
    const text = encodeURIComponent(title);
    const shareUrl = encodeURIComponent(url);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, "_blank");
  };

  const shareToFacebook = () => {
    const shareUrl = encodeURIComponent(url);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, "_blank");
  };

  return (
    <div className="mt-12 pt-8 border-t">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          Share this post
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            data-testid="button-copy-link"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-1" />
                Copy link
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={shareToTwitter}
            data-testid="button-share-twitter"
          >
            <SiX className="h-4 w-4 mr-1" />
            X
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={shareToFacebook}
            data-testid="button-share-facebook"
          >
            <SiFacebook className="h-4 w-4 mr-1" />
            Facebook
          </Button>
        </div>
      </div>
    </div>
  );
}
