import { useState } from 'react';
import { X } from 'lucide-react';

const DISMISS_KEY = 'verdict-update-banner-dismissed';
// 7-day window from publish date. Update this when shipping.
const PUBLISH_TIMESTAMP = new Date('2026-05-06').getTime();
const BANNER_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function VerdictUpdateBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Hide after 7 days from publish OR if dismissed
  if (dismissed || Date.now() > PUBLISH_TIMESTAMP + BANNER_EXPIRY_MS) {
    return null;
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-4">
      <p className="text-sm text-foreground">
        Verdict labels now adapt based on whether you own the card. Buyers see one perspective, holders see another.
      </p>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
