import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shield, X } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "google-link-banner-dismissed";

export function GoogleLinkBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (!user) return null;
  if (user.googleId) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {}
  };

  return (
    <div
      className="flex items-center justify-center gap-3 flex-wrap px-4 py-2 bg-blue-500/10 border-b text-sm"
      data-testid="banner-google-link"
    >
      <div className="flex items-center gap-1.5" data-testid="text-google-link-prompt">
        <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span>
          Secure your account — add Google login so you're never locked out.
        </span>
      </div>
      <a href="/api/auth/google">
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-link-google">
          <SiGoogle className="h-3 w-3" />
          Connect Google
        </Button>
      </a>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-dismiss-google-link"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
