import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface CardOfDay {
  playerName: string;
  sport: string;
  verdict: string;
  confidence: number;
  summary: string;
  playerKey: string;
}

const VERDICT_STYLES: Record<string, { color: string; bg: string }> = {
  ACCUMULATE: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950" },
  HOLD_CORE: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950" },
  TRADE_THE_HYPE: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950" },
  SPECULATIVE_FLYER: { color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950" },
  AVOID_NEW_MONEY: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950" },
};

export function CardOfDay() {
  const { data, isLoading } = useQuery<CardOfDay>({
    queryKey: ["/api/market/card-of-day"],
  });

  if (isLoading || !data) return null;

  if (typeof data.verdict !== "string" || typeof data.playerKey !== "string") return null;

  const style = VERDICT_STYLES[typeof data.verdict==="string"?data.verdict:(data.verdict as any)?.verdict] || { color: "text-gray-700", bg: "bg-gray-50" };
  const [sport, slug] = data.playerKey.split(":");

  return (
    <Card className={`${style.bg} border-none`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-background/80">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Card of the Day</span>
              <Badge variant="outline" className="text-xs">{data.sport}</Badge>
            </div>
            <h3 className="font-semibold text-base truncate">{data.playerName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${style.color} bg-background/50 text-xs`}>
                {(typeof data.verdict==="string"?data.verdict:(data.verdict as any)?.verdict??"").replace(/_/g," ")}
              </Badge>
              <span className="text-xs text-muted-foreground">{data.confidence}% confidence</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{data.summary}</p>
            {slug && (
              <Link href={`/outlook/${sport}/${slug}`} className="inline-flex items-center gap-1 text-xs text-primary mt-2 hover:underline">
                View full outlook <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
