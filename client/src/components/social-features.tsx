import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MessageCircle, Trash2, Send, Share2, Link2, Check } from "lucide-react";
import { SiX, SiFacebook } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommentWithUser, User } from "@shared/schema";

function getVisitorId(): string {
  const key = "mydisplaycase_visitor_id";
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

interface LikeButtonProps {
  displayCaseId: number;
  user: User | null;
}

export function LikeButton({ displayCaseId, user }: LikeButtonProps) {
  const { toast } = useToast();
  const visitorId = getVisitorId();

  const { data: likeData, isLoading } = useQuery<{ count: number; hasLiked: boolean }>({
    queryKey: ["/api/display-cases", displayCaseId, "likes", visitorId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!user) {
        params.set("visitorId", visitorId);
      }
      const response = await fetch(`/api/display-cases/${displayCaseId}/likes?${params}`);
      if (!response.ok) throw new Error("Failed to fetch likes");
      return response.json();
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      const body: { visitorId?: string } = {};
      if (!user) {
        body.visitorId = visitorId;
      }
      await apiRequest("POST", `/api/display-cases/${displayCaseId}/likes`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", displayCaseId, "likes", visitorId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update like. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLike = () => {
    toggleLikeMutation.mutate();
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-20" />;
  }

  const count = likeData?.count || 0;
  const hasLiked = likeData?.hasLiked || false;

  return (
    <Button
      variant={hasLiked ? "default" : "outline"}
      size="sm"
      onClick={handleLike}
      disabled={toggleLikeMutation.isPending}
      className="gap-2"
      data-testid="button-like"
    >
      <Heart className={`h-4 w-4 ${hasLiked ? "fill-current" : ""}`} />
      <span data-testid="text-like-count">{count}</span>
    </Button>
  );
}

interface ShareButtonsProps {
  displayCaseId: number;
  caseName: string;
}

export function ShareButtons({ displayCaseId, caseName }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const productionDomain = "https://mydisplaycase.io";
  const shareUrl = `${productionDomain}/case/${displayCaseId}`;
  
  const shareText = `Check out "${caseName}" on MyDisplayCase!`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy link.",
        variant: "destructive",
      });
    }
  };

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyLink}
        className="gap-2"
        data-testid="button-copy-link"
      >
        {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {copied ? "Copied" : "Copy Link"}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={handleShareTwitter}
        data-testid="button-share-twitter"
      >
        <SiX className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={handleShareFacebook}
        data-testid="button-share-facebook"
      >
        <SiFacebook className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface CommentsProps {
  displayCaseId: number;
  user: User | null;
}

export function Comments({ displayCaseId, user }: CommentsProps) {
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();

  const { data: comments, isLoading } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/display-cases", displayCaseId, "comments"],
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/display-cases/${displayCaseId}/comments`, { content });
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", displayCaseId, "comments"] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to post comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases", displayCaseId, "comments"] });
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = "/api/login";
      return;
    }
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  const getUserName = (comment: CommentWithUser) => {
    if (comment.user.handle) {
      return `@${comment.user.handle}`;
    }
    if (comment.user.firstName && comment.user.lastName) {
      return `${comment.user.firstName} ${comment.user.lastName}`;
    }
    if (comment.user.firstName) {
      return comment.user.firstName;
    }
    return "Anonymous";
  };

  const getInitials = (comment: CommentWithUser) => {
    if (comment.user.handle) {
      return comment.user.handle.slice(0, 2).toUpperCase();
    }
    const name = comment.user.firstName || "?";
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold" data-testid="text-comments-header">
          Comments {comments && comments.length > 0 && `(${comments.length})`}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? "Write a comment..." : "Sign in to comment..."}
          className="resize-none"
          maxLength={1000}
          data-testid="input-comment"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!newComment.trim() || addCommentMutation.isPending}
            className="gap-2"
            data-testid="button-submit-comment"
          >
            <Send className="h-4 w-4" />
            {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </>
        ) : comments && comments.length > 0 ? (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="flex gap-3 p-4 rounded-lg bg-muted/30"
              data-testid={`comment-${comment.id}`}
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={comment.user.profileImageUrl || undefined} />
                <AvatarFallback>{getInitials(comment)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm" data-testid={`comment-author-${comment.id}`}>
                      {getUserName(comment)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {comment.createdAt && formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {user && user.id === comment.userId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCommentMutation.mutate(comment.id)}
                      disabled={deleteCommentMutation.isPending}
                      className="h-8 w-8"
                      data-testid={`button-delete-comment-${comment.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap break-words" data-testid={`comment-content-${comment.id}`}>
                  {comment.content}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface SocialFeaturesProps {
  displayCaseId: number;
  user: User | null;
  caseName?: string;
}

export function SocialFeatures({ displayCaseId, user, caseName = "Display Case" }: SocialFeaturesProps) {
  return (
    <div className="border-t mt-12 pt-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <LikeButton displayCaseId={displayCaseId} user={user} />
          <ShareButtons displayCaseId={displayCaseId} caseName={caseName} />
        </div>
        <Comments displayCaseId={displayCaseId} user={user} />
      </div>
    </div>
  );
}
