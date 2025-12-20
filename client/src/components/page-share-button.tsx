import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PageShareButtonProps {
  pageSlug: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
  className?: string;
}

export function PageShareButton({
  pageSlug,
  variant = "outline",
  size = "sm",
  className = "",
}: PageShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/share/${pageSlug}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Share link with preview image ready for social media.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (clipboardError) {
      toast({
        title: "Share link",
        description: shareUrl,
        duration: 10000,
      });
    }
  };

  return (
    <Button 
      variant={variant} 
      size={size} 
      className={className}
      onClick={copyShareLink}
      data-testid="button-share-page"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
      {size !== "icon" && <span className="ml-1">Share</span>}
    </Button>
  );
}
