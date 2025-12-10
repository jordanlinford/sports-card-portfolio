import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface MessageButtonProps {
  userId: string;
  compact?: boolean;
  className?: string;
}

export function MessageButton({ userId, compact = false, className }: MessageButtonProps) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/messages/conversations", { recipientId: userId });
    },
    onSuccess: (data: { id: number }) => {
      setLocation(`/messages/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to start conversation",
      });
    },
  });

  if (!isAuthenticated || user?.id === userId) {
    return null;
  }

  const handleClick = () => {
    createConversationMutation.mutate();
  };

  if (compact) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={createConversationMutation.isPending}
        className={className}
        data-testid="button-message-user"
      >
        {createConversationMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <MessageSquare className="h-4 w-4 mr-1" />
            Message
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={createConversationMutation.isPending}
      className={className}
      data-testid="button-message-user"
    >
      {createConversationMutation.isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <MessageSquare className="h-4 w-4 mr-2" />
      )}
      Message
    </Button>
  );
}
