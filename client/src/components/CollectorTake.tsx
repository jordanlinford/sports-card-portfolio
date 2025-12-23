import { Take } from "@/lib/takes";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface CollectorTakeProps {
  take: Take;
}

export function CollectorTake({ take }: CollectorTakeProps) {
  const getIcon = () => {
    switch (take.type) {
      case "STRUCTURAL":
        return <TrendingUp className="h-4 w-4 shrink-0" />;
      case "TIMING":
        return <Clock className="h-4 w-4 shrink-0" />;
      case "CAUTION":
        return <AlertTriangle className="h-4 w-4 shrink-0" />;
      default:
        return <Lightbulb className="h-4 w-4 shrink-0" />;
    }
  };

  const getStyles = () => {
    if (take.type === "CAUTION") {
      return {
        border: "border-yellow-500/30",
        bg: "bg-yellow-500/5",
        iconColor: "text-yellow-500",
      };
    }
    if (take.severity === "STRONG") {
      return {
        border: "border-primary/30",
        bg: "bg-primary/5",
        iconColor: "text-primary",
      };
    }
    return {
      border: "border-muted-foreground/20",
      bg: "bg-muted/30",
      iconColor: "text-muted-foreground",
    };
  };

  const styles = getStyles();

  return (
    <Card className={`${styles.border} ${styles.bg} border`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${styles.iconColor}`}>
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground mb-1 font-medium">
              Collector Take
            </div>
            <p className="text-sm leading-relaxed">
              {take.text}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
