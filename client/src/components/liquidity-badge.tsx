import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Droplets, AlertTriangle, HelpCircle } from "lucide-react";
import type { LiquidityTier } from "@shared/schema";

interface LiquidityBadgeProps {
  tier: LiquidityTier;
  explanation?: string;
  showExplanation?: boolean;
  size?: "sm" | "default";
}

const tierConfig: Record<LiquidityTier, {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  className: string;
  icon: typeof Droplets;
  shortLabel: string;
}> = {
  VERY_HIGH: {
    label: "Very High Liquidity",
    shortLabel: "Very High",
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600",
    icon: Droplets,
  },
  HIGH: {
    label: "High Liquidity",
    shortLabel: "High",
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600",
    icon: Droplets,
  },
  MEDIUM: {
    label: "Medium Liquidity",
    shortLabel: "Medium",
    variant: "secondary",
    className: "bg-amber-500/90 hover:bg-amber-500/90 text-white border-amber-500",
    icon: Droplets,
  },
  LOW: {
    label: "Low Liquidity",
    shortLabel: "Low",
    variant: "destructive",
    className: "bg-red-500/90 hover:bg-red-500/90 text-white border-red-500",
    icon: AlertTriangle,
  },
  UNCERTAIN: {
    label: "Uncertain",
    shortLabel: "Unknown",
    variant: "outline",
    className: "border-muted-foreground/50 text-muted-foreground",
    icon: HelpCircle,
  },
};

export function LiquidityBadge({ 
  tier, 
  explanation, 
  showExplanation = false,
  size = "default"
}: LiquidityBadgeProps) {
  const config = tierConfig[tier] || tierConfig.UNCERTAIN;
  const Icon = config.icon;
  
  const badge = (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${size === "sm" ? "text-xs px-1.5 py-0" : ""} gap-1`}
      data-testid={`badge-liquidity-${tier.toLowerCase()}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {size === "sm" ? config.shortLabel : config.label}
    </Badge>
  );

  if (!showExplanation || !explanation) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-sm">{explanation}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface DivergenceWarningProps {
  priceDirection: "up" | "down" | "stable";
  liquidityTier: LiquidityTier;
  previousLiquidityTier?: LiquidityTier;
}

const TIER_RANK: Record<LiquidityTier, number> = {
  VERY_HIGH: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNCERTAIN: 0,
};

export function getDivergenceStatus(
  priceDirection: "up" | "down" | "stable",
  liquidityTier: LiquidityTier,
  trendSlope?: number
): { status: "healthy" | "caution" | "risk"; message: string } | null {
  if (liquidityTier === "UNCERTAIN") {
    return null;
  }

  const isRising = priceDirection === "up" || (trendSlope && trendSlope > 0.02);
  const isFalling = priceDirection === "down" || (trendSlope && trendSlope < -0.02);

  if (isRising && (liquidityTier === "HIGH" || liquidityTier === "VERY_HIGH")) {
    return {
      status: "healthy",
      message: "Healthy: Price rising with strong sales volume"
    };
  }

  if (isRising && liquidityTier === "MEDIUM") {
    return {
      status: "caution",
      message: "Caution: Price rising but moderate sales activity"
    };
  }

  if (isRising && liquidityTier === "LOW") {
    return {
      status: "risk",
      message: "Risk: Price rising on thin volume — could reverse quickly"
    };
  }

  if (isFalling && (liquidityTier === "HIGH" || liquidityTier === "VERY_HIGH")) {
    return {
      status: "caution",
      message: "Watch: Price declining despite active market"
    };
  }

  if (isFalling && liquidityTier === "LOW") {
    return {
      status: "risk",
      message: "Risk: Price falling with few buyers — exit may be difficult"
    };
  }

  return null;
}

export function DivergenceWarning({ 
  priceDirection, 
  liquidityTier 
}: DivergenceWarningProps) {
  const divergence = getDivergenceStatus(priceDirection, liquidityTier);
  
  if (!divergence) return null;

  const statusConfig = {
    healthy: {
      className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
      icon: Droplets,
    },
    caution: {
      className: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
      icon: AlertTriangle,
    },
    risk: {
      className: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
      icon: AlertTriangle,
    },
  };

  const config = statusConfig[divergence.status];
  const Icon = config.icon;

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-2 rounded-md border ${config.className}`}
      data-testid={`divergence-warning-${divergence.status}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm font-medium">{divergence.message}</span>
    </div>
  );
}
