import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Link2, Check, Loader2, Image } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type SnapshotType = 'card_outlook' | 'player_outlook' | 'portfolio_analytics' | 'portfolio_outlook';

interface ShareSnapshotButtonProps {
  snapshotType: SnapshotType;
  title: string;
  snapshotData: any;
  cardId?: number;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
  className?: string;
}

function getPlayerSlug(playerName: string): string {
  return playerName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function ShareSnapshotButton({
  snapshotType,
  title,
  snapshotData,
  cardId,
  variant = "ghost",
  size = "sm",
  className = "",
}: ShareSnapshotButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const createAndCopyLink = async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest("POST", "/api/snapshots", {
        snapshotType,
        title,
        snapshotData,
        cardId,
      });
      
      if (data.success && data.shareUrl) {
        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        
        // Try clipboard API first, fallback to manual copy prompt
        try {
          await navigator.clipboard.writeText(fullUrl);
          setCopied(true);
          toast({
            title: "Link copied",
            description: "Share link has been copied to your clipboard.",
          });
          setTimeout(() => setCopied(false), 2000);
        } catch (clipboardError) {
          // Clipboard failed (common on mobile) - show the link to copy manually
          toast({
            title: "Share link created",
            description: fullUrl,
            duration: 10000, // Show longer so user can copy
          });
        }
      }
    } catch (error) {
      console.error("Failed to create share link:", error);
      toast({
        title: "Failed to create share link",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copySocialLink = async () => {
    if (snapshotType !== 'player_outlook' || !snapshotData?.playerName) {
      toast({
        title: "Social sharing not available",
        description: "This feature is only available for player outlooks.",
        variant: "destructive",
      });
      return;
    }

    const playerSlug = getPlayerSlug(snapshotData.playerName);
    const socialUrl = `${window.location.origin}/share/player/${playerSlug}`;

    try {
      await navigator.clipboard.writeText(socialUrl);
      setCopied(true);
      toast({
        title: "Social link copied",
        description: "Link with preview image ready for social media.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (clipboardError) {
      toast({
        title: "Social link created",
        description: socialUrl,
        duration: 10000,
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          size={size} 
          className={className}
          data-testid="button-share-snapshot"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {size !== "icon" && <span className="ml-1">Share</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {snapshotType === 'player_outlook' && snapshotData?.playerName && (
          <>
            <DropdownMenuItem 
              onClick={copySocialLink}
              data-testid="menu-item-copy-social-link"
            >
              <Image className="mr-2 h-4 w-4" />
              Copy social link (with preview)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem 
          onClick={createAndCopyLink}
          disabled={isLoading}
          data-testid="menu-item-copy-link"
        >
          <Link2 className="mr-2 h-4 w-4" />
          Copy share link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
