import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VerdictSnapshot {
  verdict: string | null;
  price: number | null;
  date: string | null;
  isFlip: boolean | null;
}

const VERDICT_COLORS: Record<string, string> = {
  ACCUMULATE: "bg-green-500",
  HOLD_CORE: "bg-blue-500",
  TRADE_THE_HYPE: "bg-yellow-500",
  SPECULATIVE_FLYER: "bg-purple-500",
  AVOID_NEW_MONEY: "bg-red-500",
  AVOID_STRUCTURAL: "bg-red-700",
  SELL: "bg-red-500",
  LONGSHOT_BET: "bg-fuchsia-500",
};

export function VerdictHistory({ playerKey }: { playerKey: string }) {
  const { data: history, isLoading } = useQuery<VerdictSnapshot[]>({
    queryKey: ["/api/players", playerKey, "verdict-history"],
    queryFn: async () => {
      const res = await fetch(
        `/api/players/${encodeURIComponent(playerKey)}/verdict-history`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!playerKey,
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading history...</div>
    );
  }

  if (!history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Verdict History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {history.slice(0, 12).map((entry, i) => {
            const date = entry.date
              ? new Date(entry.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                })
              : "Unknown";
            const price = entry.price != null ? `$${entry.price.toFixed(2)}` : "N/A";
            const verdict = (typeof entry.verdict==="string"?entry.verdict:(entry.verdict as any)?.verdict)||"N/A";
            const colorClass = VERDICT_COLORS[verdict] || "bg-gray-500";

            return (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-20 text-muted-foreground text-xs">{date}</div>
                <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                <Badge
                  variant={entry.isFlip ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {verdict.replace(/_/g, " ")}
                </Badge>
                <span className="text-muted-foreground ml-auto">{price}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
