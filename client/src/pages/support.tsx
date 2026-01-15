import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { MessageCircle, Plus, Send, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { SupportTicketWithRequester, SupportTicketWithMessages, SupportTicketStatus } from "@shared/schema";

const STATUS_CONFIG: Record<SupportTicketStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }> = {
  OPEN: { label: "Open", variant: "default", icon: AlertCircle },
  IN_PROGRESS: { label: "In Progress", variant: "secondary", icon: Clock },
  WAITING_ON_USER: { label: "Awaiting Your Reply", variant: "outline", icon: MessageCircle },
  RESOLVED: { label: "Resolved", variant: "secondary", icon: CheckCircle },
  CLOSED: { label: "Closed", variant: "outline", icon: CheckCircle },
};

export default function SupportPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const { data: tickets, isLoading } = useQuery<SupportTicketWithRequester[]>({
    queryKey: ["/api/support/tickets"],
    enabled: !!user,
  });

  const { data: selectedTicket, isLoading: ticketLoading } = useQuery<SupportTicketWithMessages>({
    queryKey: ["/api/support/tickets", selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/support/tickets", { subject: newSubject, body: newBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setShowNewTicket(false);
      setNewSubject("");
      setNewBody("");
      toast({
        title: "Ticket submitted",
        description: "We'll get back to you as soon as possible.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create ticket",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/support/tickets/${selectedTicketId}/messages`, { body: replyBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setReplyBody("");
      toast({
        title: "Reply sent",
        description: "Your message has been added to the ticket.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send reply",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-4 w-72 mb-8" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Sign in to contact support</h2>
            <p className="text-muted-foreground mb-4">
              Please sign in to submit a support ticket or view your existing tickets.
            </p>
            <Button asChild>
              <Link href="/api/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-support-title">Support</h1>
          <p className="text-muted-foreground" data-testid="text-support-description">
            Have a question or problem? We're here to help.
          </p>
        </div>
        <Button onClick={() => setShowNewTicket(true)} data-testid="button-new-ticket">
          <Plus className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : tickets && tickets.length > 0 ? (
        <div className="space-y-4">
          {tickets.map((ticket) => {
            const statusConfig = STATUS_CONFIG[ticket.status as SupportTicketStatus] || STATUS_CONFIG.OPEN;
            const StatusIcon = statusConfig.icon;
            
            return (
              <Card 
                key={ticket.id} 
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTicketId(ticket.id)}
                data-testid={`card-ticket-${ticket.id}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-lg" data-testid={`text-ticket-subject-${ticket.id}`}>
                      {ticket.subject}
                    </CardTitle>
                    <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    <span>Created {ticket.createdAt ? format(new Date(ticket.createdAt), "MMM d, yyyy 'at' h:mm a") : "recently"}</span>
                    {ticket.adminReplyCount > 0 && (
                      <span className="text-primary">
                        {ticket.adminReplyCount} {ticket.adminReplyCount === 1 ? "reply" : "replies"} from support
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-no-tickets">No support tickets yet</h3>
            <p className="text-muted-foreground mb-4">
              Have a question or need help? Create your first support ticket.
            </p>
            <Button onClick={() => setShowNewTicket(true)} data-testid="button-create-first-ticket">
              <Plus className="h-4 w-4 mr-2" />
              Create Ticket
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
            <DialogDescription>
              Describe your question or problem and we'll get back to you soon.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium">
                Subject
              </label>
              <Input
                id="subject"
                placeholder="Brief summary of your issue"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                maxLength={200}
                data-testid="input-ticket-subject"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="body" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="body"
                placeholder="Please describe your question or problem in detail..."
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
                data-testid="input-ticket-body"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewTicket(false)} data-testid="button-cancel-ticket">
              Cancel
            </Button>
            <Button 
              onClick={() => createTicketMutation.mutate()}
              disabled={!newSubject.trim() || !newBody.trim() || createTicketMutation.isPending}
              data-testid="button-submit-ticket"
            >
              {createTicketMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTicketId} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          {ticketLoading ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : selectedTicket ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle data-testid="text-ticket-detail-subject">{selectedTicket.subject}</DialogTitle>
                  <Badge 
                    variant={STATUS_CONFIG[selectedTicket.status as SupportTicketStatus]?.variant || "default"}
                  >
                    {STATUS_CONFIG[selectedTicket.status as SupportTicketStatus]?.label || selectedTicket.status}
                  </Badge>
                </div>
                <DialogDescription>
                  Opened {selectedTicket.createdAt ? format(new Date(selectedTicket.createdAt), "MMM d, yyyy 'at' h:mm a") : "recently"}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4 py-4">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={selectedTicket.requester.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {selectedTicket.requester.firstName?.[0] || selectedTicket.requester.handle?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {selectedTicket.requester.firstName && selectedTicket.requester.lastName
                                ? `${selectedTicket.requester.firstName} ${selectedTicket.requester.lastName}`
                                : selectedTicket.requester.handle || "You"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedTicket.createdAt && format(new Date(selectedTicket.createdAt), "MMM d 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-ticket-body">
                            {selectedTicket.body}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedTicket.messages.map((message) => (
                    <Card 
                      key={message.id} 
                      className={message.isAdminReply ? "border-primary/30 bg-primary/5" : "bg-muted/50"}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.sender.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {message.sender.firstName?.[0] || message.sender.handle?.[0] || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {message.sender.firstName && message.sender.lastName
                                  ? `${message.sender.firstName} ${message.sender.lastName}`
                                  : message.sender.handle || "Unknown"}
                              </span>
                              {message.isAdminReply && (
                                <Badge variant="secondary" className="text-xs">Support</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {message.createdAt && format(new Date(message.createdAt), "MMM d 'at' h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              {selectedTicket.status !== "CLOSED" && selectedTicket.status !== "RESOLVED" && (
                <CardFooter className="flex gap-2 pt-4 border-t">
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={2}
                    className="flex-1"
                    data-testid="input-ticket-reply"
                  />
                  <Button 
                    onClick={() => replyMutation.mutate()}
                    disabled={!replyBody.trim() || replyMutation.isPending}
                    size="icon"
                    data-testid="button-send-reply"
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </CardFooter>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
