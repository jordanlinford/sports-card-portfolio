import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, Bug, Lightbulb, MessageCircle, Heart, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report", icon: Bug, color: "text-red-500" },
  { value: "feature", label: "Feature Request", icon: Lightbulb, color: "text-amber-500" },
  { value: "general", label: "General Feedback", icon: MessageCircle, color: "text-blue-500" },
  { value: "praise", label: "Praise", icon: Heart, color: "text-pink-500" },
] as const;

type FeedbackType = typeof FEEDBACK_TYPES[number]["value"];

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const submitFeedback = useMutation({
    mutationFn: async (data: { type: FeedbackType; message: string; page: string }) => {
      return apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted.",
      });
      setIsOpen(false);
      setSelectedType(null);
      setMessage("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!selectedType || !message.trim()) return;
    
    submitFeedback.mutate({
      type: selectedType,
      message: message.trim(),
      page: window.location.pathname,
    });
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="icon"
        variant="outline"
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg hover-elevate"
        data-testid="button-feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5" />
              Send Feedback
            </DialogTitle>
            <DialogDescription>
              Help us improve! Your feedback goes directly to our team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.value;
                return (
                  <Button
                    key={type.value}
                    variant={isSelected ? "default" : "outline"}
                    className={`flex items-center gap-2 justify-start ${!isSelected ? type.color : ""}`}
                    onClick={() => setSelectedType(type.value)}
                    data-testid={`button-feedback-type-${type.value}`}
                  >
                    <Icon className="h-4 w-4" />
                    {type.label}
                  </Button>
                );
              })}
            </div>

            {selectedType && (
              <>
                <Textarea
                  placeholder={
                    selectedType === "bug" 
                      ? "Describe the bug you encountered..."
                      : selectedType === "feature"
                      ? "Describe the feature you'd like to see..."
                      : selectedType === "praise"
                      ? "What do you love about the app?"
                      : "Share your thoughts..."
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[120px] resize-none"
                  maxLength={2000}
                  data-testid="input-feedback-message"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {message.length}/2000
                  </span>
                  <Button
                    onClick={handleSubmit}
                    disabled={!message.trim() || submitFeedback.isPending}
                    data-testid="button-submit-feedback"
                  >
                    {submitFeedback.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Feedback
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
