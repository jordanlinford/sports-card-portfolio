import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  MessageSquare, 
  Send, 
  ArrowLeft,
  Loader2,
  Inbox
} from "lucide-react";
import type { ConversationWithDetails, MessageWithSender } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function ConversationListItem({ 
  conversation, 
  onClick,
  isActive
}: { 
  conversation: ConversationWithDetails; 
  onClick: () => void;
  isActive?: boolean;
}) {
  const hasUnread = conversation.unreadCount > 0;
  
  return (
    <div 
      className={`p-4 cursor-pointer transition-colors hover-elevate active-elevate-2 border-b ${
        isActive ? 'bg-accent' : ''
      }`}
      onClick={onClick}
      data-testid={`conversation-item-${conversation.id}`}
    >
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.otherUser?.profileImageUrl || undefined} />
          <AvatarFallback>
            {conversation.otherUser?.handle?.slice(0, 2).toUpperCase() || conversation.otherUser?.firstName?.charAt(0)?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-medium truncate ${hasUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
              {conversation.otherUser?.handle ? `@${conversation.otherUser.handle}` : `${conversation.otherUser?.firstName || ""} ${conversation.otherUser?.lastName || ""}`.trim() || "Unknown"}
            </span>
            {hasUnread && (
              <Badge variant="default" className="flex-shrink-0">
                {conversation.unreadCount}
              </Badge>
            )}
          </div>
          <p className={`text-sm truncate mt-0.5 ${hasUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
            {conversation.lastMessagePreview || "No messages yet"}
          </p>
          <span className="text-xs text-muted-foreground">
            {conversation.lastMessageAt && formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ 
  message, 
  isOwn 
}: { 
  message: MessageWithSender; 
  isOwn: boolean;
}) {
  const initials = message.sender?.handle?.slice(0, 2).toUpperCase() || message.sender?.firstName?.charAt(0)?.toUpperCase() || "?";
  
  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={message.sender?.profileImageUrl || undefined} />
        <AvatarFallback className="text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div 
          className={`rounded-md px-3 py-2 ${
            isOwn 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted'
          }`}
          data-testid={`message-bubble-${message.id}`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1 block">
          {message.createdAt && formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function ConversationView({ 
  conversationId,
  onBack,
  userId
}: { 
  conversationId: number;
  onBack: () => void;
  userId: string;
}) {
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{
    conversation: any;
    messages: MessageWithSender[];
    otherUser: { id: string; firstName: string; lastName: string; handle: string | null; profileImageUrl: string | null } | null;
  }>({
    queryKey: ["/api/messages/conversations", conversationId],
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/messages/conversations/${conversationId}`, { content });
    },
    onSuccess: () => {
      setNewMessage("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to send message",
        description: error.message,
      });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleSend = () => {
    const trimmed = newMessage.trim();
    if (trimmed.length > 0) {
      sendMutation.mutate(trimmed);
    }
  };

  const isValidMessage = newMessage.trim().length > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && isValidMessage) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b">
          <Button size="icon" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-16 w-48 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-to-inbox">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={data?.otherUser?.profileImageUrl || undefined} />
          <AvatarFallback>
            {data?.otherUser?.handle?.slice(0, 2).toUpperCase() || data?.otherUser?.firstName?.charAt(0)?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium" data-testid="text-conversation-user">
          {data?.otherUser?.handle ? `@${data.otherUser.handle}` : `${data?.otherUser?.firstName || ""} ${data?.otherUser?.lastName || ""}`.trim() || "Unknown"}
        </span>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {data?.messages?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3" />
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            data?.messages?.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                isOwn={message.senderId === userId}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] resize-none"
            data-testid="input-message"
          />
          <Button 
            onClick={handleSend} 
            disabled={!isValidMessage || sendMutation.isPending}
            className="flex-shrink-0"
            data-testid="button-send-message"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border-b">
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessagesPage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const params = useParams<{ conversationId?: string }>();

  const { data: conversations, isLoading: inboxLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/messages/inbox"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (params.conversationId) {
      setSelectedConversation(parseInt(params.conversationId));
    }
  }, [params.conversationId]);

  // On desktop, auto-select the first conversation so the right panel isn't
  // an empty grey area on initial load.
  useEffect(() => {
    if (
      !params.conversationId &&
      selectedConversation === null &&
      conversations &&
      conversations.length > 0 &&
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
    ) {
      const first = conversations[0];
      setSelectedConversation(first.id);
      setLocation(`/messages/${first.id}`, { replace: true });
    }
  }, [conversations, params.conversationId, selectedConversation, setLocation]);

  if (authLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="p-0">
            <InboxSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation("/");
    return null;
  }

  const userId = user?.id || "";

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-messages-title">Messages</h1>
        <p className="text-muted-foreground mt-2">
          Chat with other collectors about trades and sales
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 h-[600px]">
          {selectedConversation ? (
            <ConversationView 
              conversationId={selectedConversation}
              onBack={() => {
                setSelectedConversation(null);
                setLocation("/messages");
              }}
              userId={userId}
            />
          ) : (
            <>
              {inboxLoading ? (
                <InboxSkeleton />
              ) : conversations?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                  <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
                  <CardTitle className="mb-2">No conversations yet</CardTitle>
                  <CardDescription className="max-w-sm">
                    Start a conversation by visiting a collector's profile and clicking the message button.
                  </CardDescription>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  {conversations?.map((conversation) => (
                    <ConversationListItem
                      key={conversation.id}
                      conversation={conversation}
                      onClick={() => {
                        setSelectedConversation(conversation.id);
                        setLocation(`/messages/${conversation.id}`);
                      }}
                      isActive={selectedConversation === conversation.id}
                    />
                  ))}
                </ScrollArea>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
