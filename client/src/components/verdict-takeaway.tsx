import { getVerdictMessage } from "@/lib/verdictMessages";

interface VerdictTakeawayProps {
  verdict: string | null | undefined;
  isHolder: boolean;
  /** "card" = rounded card callout (default); "inline" = compact text below a label */
  variant?: "card" | "inline";
}

/**
 * Audience-aware action guidance rendered below the main verdict display.
 * Shows different label+takeaway copy for holders vs buyers.
 */
export function VerdictTakeaway({
  verdict,
  isHolder,
  variant = "card",
}: VerdictTakeawayProps) {
  if (!verdict) return null;
  const msg = getVerdictMessage(verdict, isHolder);
  if (!msg.takeaway) return null;

  if (variant === "card") {
    return (
      <div
        className="rounded-md bg-muted/50 border px-4 py-3 text-sm"
        data-testid="verdict-takeaway"
      >
        <span className="font-medium text-foreground">{msg.label}</span>
        <span className="text-muted-foreground ml-2">— {msg.takeaway}</span>
      </div>
    );
  }

  return (
    <p
      className="text-xs text-muted-foreground mt-1"
      data-testid="verdict-takeaway"
    >
      {msg.takeaway}
    </p>
  );
}