import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FollowButtonProps {
  userId: string;
  compact?: boolean;
}

export function FollowButton({ userId, compact = false }: FollowButtonProps) {
  const { toast } = useToast();
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);

  const { data: followStatus, isLoading } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/users", userId, "is-following"],
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/users/${userId}/follow`);
    },
    onMutate: () => {
      setOptimisticFollowing(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "is-following"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "followers"] });
      toast({
        title: "Following",
        description: "You are now following this collector.",
      });
    },
    onError: (error: Error) => {
      setOptimisticFollowing(null);
      toast({
        variant: "destructive",
        title: "Failed to follow",
        description: error.message,
      });
    },
    onSettled: () => {
      setOptimisticFollowing(null);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/users/${userId}/follow`);
    },
    onMutate: () => {
      setOptimisticFollowing(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "is-following"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "followers"] });
      toast({
        title: "Unfollowed",
        description: "You are no longer following this collector.",
      });
    },
    onError: (error: Error) => {
      setOptimisticFollowing(null);
      toast({
        variant: "destructive",
        title: "Failed to unfollow",
        description: error.message,
      });
    },
    onSettled: () => {
      setOptimisticFollowing(null);
    },
  });

  const isFollowing = optimisticFollowing ?? followStatus?.isFollowing ?? false;
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  if (isLoading) {
    return (
      <Button variant="outline" size={compact ? "sm" : "default"} disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (isFollowing) {
    return (
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => unfollowMutation.mutate()}
        disabled={isPending}
        className="gap-2"
        data-testid="button-unfollow"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserMinus className="h-4 w-4" />
        )}
        {!compact && "Following"}
      </Button>
    );
  }

  return (
    <Button
      size={compact ? "sm" : "default"}
      onClick={() => followMutation.mutate()}
      disabled={isPending}
      className="gap-2"
      data-testid="button-follow"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {!compact && "Follow"}
    </Button>
  );
}
