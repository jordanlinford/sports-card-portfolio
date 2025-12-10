import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COLLECTOR_TIERS } from "@shared/schema";
import { 
  Trophy, 
  LayoutGrid, 
  Crown, 
  IdCard, 
  Layers, 
  Archive, 
  Vault,
  TrendingUp,
  DollarSign,
  Gem,
  Diamond,
  Star,
  Share2,
  MessageCircle,
  Heart,
  Eye,
  Sparkles,
  Bookmark,
  HandCoins,
  CheckCircle
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  trophy: Trophy,
  "layout-grid": LayoutGrid,
  crown: Crown,
  "id-card": IdCard,
  layers: Layers,
  archive: Archive,
  vault: Vault,
  "trending-up": TrendingUp,
  "dollar-sign": DollarSign,
  gem: Gem,
  diamond: Diamond,
  star: Star,
  "share-2": Share2,
  "message-circle": MessageCircle,
  heart: Heart,
  eye: Eye,
  sparkles: Sparkles,
  bookmark: Bookmark,
  "hand-coins": HandCoins,
  "check-circle": CheckCircle,
};

const RARITY_COLORS: Record<string, string> = {
  common: "bg-zinc-500",
  uncommon: "bg-green-600",
  rare: "bg-blue-600",
  epic: "bg-purple-600",
  legendary: "bg-orange-500",
};

interface BadgeData {
  id: number;
  badgeId: string;
  earnedAt: Date;
  badge: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    rarity: string;
    pointValue: number;
  };
}

interface PrestigeStats {
  score: number;
  tier: string;
  badgeCount: number;
  badges: BadgeData[];
}

interface CollectorTierBadgeProps {
  tier: string;
  score?: number;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
}

export function CollectorTierBadge({ tier, score, size = "md", showScore = false }: CollectorTierBadgeProps) {
  const tierData = COLLECTOR_TIERS[tier as keyof typeof COLLECTOR_TIERS] || COLLECTOR_TIERS.bronze;
  
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-0.5",
    lg: "text-base px-3 py-1",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          className={`${sizeClasses[size]} gap-1 cursor-default`}
          style={{ backgroundColor: tierData.color, color: tier === "platinum" || tier === "diamond" ? "#333" : "#fff" }}
          data-testid={`badge-tier-${tier}`}
        >
          <Crown className={size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          {tierData.name}
          {showScore && score !== undefined && (
            <span className="opacity-75">({score})</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{tierData.name} Collector</p>
        {score !== undefined && <p className="text-xs text-muted-foreground">{score} prestige points</p>}
      </TooltipContent>
    </Tooltip>
  );
}

interface UserBadgeProps {
  badge: BadgeData["badge"];
  size?: "sm" | "md" | "lg";
}

export function UserBadgeDisplay({ badge, size = "md" }: UserBadgeProps) {
  const IconComponent = ICON_MAP[badge.icon] || Trophy;
  const rarityColor = RARITY_COLORS[badge.rarity] || RARITY_COLORS.common;
  
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };
  
  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={`${sizeClasses[size]} ${rarityColor} rounded-full flex items-center justify-center text-white cursor-default`}
          data-testid={`badge-${badge.id}`}
        >
          <IconComponent className={iconSizes[size]} />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{badge.name}</p>
        <p className="text-xs text-muted-foreground">{badge.description}</p>
        <p className="text-xs mt-1">+{badge.pointValue} points</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface PrestigeDisplayProps {
  userId: string;
  compact?: boolean;
}

export function PrestigeDisplay({ userId, compact = false }: PrestigeDisplayProps) {
  const { data, isLoading } = useQuery<PrestigeStats>({
    queryKey: ["/api/prestige", userId],
    queryFn: async () => {
      const response = await fetch(`/api/prestige/${userId}`);
      if (!response.ok) throw new Error("Failed to fetch prestige");
      return response.json();
    },
  });

  if (isLoading || !data) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <CollectorTierBadge tier={data.tier} size="sm" />
        {data.badges.slice(0, 3).map((b) => (
          <UserBadgeDisplay key={b.id} badge={b.badge} size="sm" />
        ))}
        {data.badges.length > 3 && (
          <span className="text-xs text-muted-foreground">+{data.badges.length - 3}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <CollectorTierBadge tier={data.tier} score={data.score} showScore />
        <span className="text-sm text-muted-foreground">
          {data.badgeCount} badge{data.badgeCount !== 1 ? "s" : ""} earned
        </span>
      </div>
      
      {data.badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.badges.map((b) => (
            <UserBadgeDisplay key={b.id} badge={b.badge} size="md" />
          ))}
        </div>
      )}
    </div>
  );
}

interface MyPrestigeProps {
  showRecalculate?: boolean;
}

export function MyPrestige({ showRecalculate = false }: MyPrestigeProps) {
  const { data, isLoading, refetch } = useQuery<PrestigeStats>({
    queryKey: ["/api/prestige"],
  });

  if (isLoading || !data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CollectorTierBadge tier={data.tier} score={data.score} size="lg" showScore />
        </div>
      </div>
      
      <div className="text-sm text-muted-foreground">
        You've earned {data.badgeCount} badge{data.badgeCount !== 1 ? "s" : ""}
      </div>
      
      {data.badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.badges.map((b) => (
            <UserBadgeDisplay key={b.id} badge={b.badge} size="lg" />
          ))}
        </div>
      )}
    </div>
  );
}
