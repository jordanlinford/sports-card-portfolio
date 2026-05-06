/**
 * Verdict messaging utility for holder vs buyer differentiation.
 * Returns audience-appropriate label and takeaway for a given verdict.
 */

export interface VerdictMessage {
  label: string;
  takeaway: string;
}

type VerdictAction = 'BUY' | 'MONITOR' | 'WATCH' | 'AVOID' | 'SELL' | 'LONGSHOT_BET';

type AudienceMessages = { buyer: VerdictMessage; holder: VerdictMessage; };

const VERDICT_MESSAGES: Record<VerdictAction, AudienceMessages> = {
  BUY: { buyer: { label: 'BUY', takeaway: 'Good entry point' }, holder: { label: 'BUY', takeaway: 'Consider adding to position' } },
  MONITOR: { buyer: { label: 'MONITOR', takeaway: 'Neutral, watch for change' }, holder: { label: 'MONITOR', takeaway: 'Hold position' } },
  WATCH: { buyer: { label: 'WATCH', takeaway: 'Wait for clarity' }, holder: { label: 'WATCH', takeaway: 'Hold pending more info' } },
  AVOID: { buyer: { label: 'AVOID', takeaway: "Don't acquire, limited upside" }, holder: { label: 'Low Value Potential', takeaway: 'Hold for collection' } },
  SELL: { buyer: { label: 'AVOID', takeaway: "Don't acquire" }, holder: { label: 'SELL', takeaway: 'Consider reducing position' } },
  LONGSHOT_BET: { buyer: { label: 'LONGSHOT BET', takeaway: 'Speculative play, asymmetric upside' }, holder: { label: 'LONGSHOT BET', takeaway: 'Lottery ticket -- hold for potential breakout' } },
};

export function getVerdictMessage(verdictAction: string, isHolder: boolean): VerdictMessage {
  const messages = VERDICT_MESSAGES[verdictAction as VerdictAction];
  if (!messages) { return { label: verdictAction, takeaway: '' }; }
  return isHolder ? messages.holder : messages.buyer;
}

export function isHolderOf(playerName: string | null | undefined, portfolioCards: Array<{ title?: string | null }> | null | undefined): boolean {
  if (!playerName || !portfolioCards || portfolioCards.length === 0) return false;
  const normalizedName = playerName.trim().toLowerCase();
  return portfolioCards.some((card) => card.title?.trim().toLowerCase() === normalizedName);
}