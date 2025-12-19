import { TrendingUp, TrendingDown, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OutlookBadgeProps {
  action: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

export function OutlookBadge({ action, size = "sm", className = "" }: OutlookBadgeProps) {
  if (!action) return null;

  const normalizedAction = action.toUpperCase();

  const getActionConfig = () => {
    switch (normalizedAction) {
      case "BUY":
        return {
          icon: TrendingUp,
          bgColor: "bg-green-600 dark:bg-green-700",
          textColor: "text-white",
          label: "BUY",
        };
      case "SELL":
        return {
          icon: TrendingDown,
          bgColor: "bg-red-600 dark:bg-red-700",
          textColor: "text-white",
          label: "SELL",
        };
      case "MONITOR":
      default:
        return {
          icon: Eye,
          bgColor: "bg-yellow-500 dark:bg-yellow-600",
          textColor: "text-black dark:text-white",
          label: "MONITOR",
        };
    }
  };

  const config = getActionConfig();
  const Icon = config.icon;
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <Badge
      className={`${config.bgColor} ${config.textColor} ${padding} gap-0.5 no-default-hover-elevate no-default-active-elevate ${className}`}
      data-testid={`badge-outlook-${normalizedAction.toLowerCase()}`}
    >
      <Icon className={iconSize} />
      <span className={`font-semibold ${textSize}`}>{config.label}</span>
    </Badge>
  );
}
