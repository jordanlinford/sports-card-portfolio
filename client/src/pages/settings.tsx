import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AtSign, Check, X, Loader2 } from "lucide-react";
import type { User } from "@shared/schema";

export default function Settings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [handle, setHandle] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: !!user,
  });

  useEffect(() => {
    if (currentUser?.handle) {
      setHandle(currentUser.handle);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!handle || handle.length < 3) {
      setIsAvailable(null);
      return;
    }

    if (handle === currentUser?.handle) {
      setIsAvailable(true);
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
        setIsAvailable(false);
        return;
      }

      setIsChecking(true);
      try {
        const response = await fetch(`/api/handle/check/${handle}`);
        const data = await response.json();
        setIsAvailable(data.available);
      } catch {
        setIsAvailable(null);
      } finally {
        setIsChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [handle, currentUser?.handle]);

  const updateHandleMutation = useMutation({
    mutationFn: async (newHandle: string) => {
      return apiRequest("PATCH", "/api/user/handle", { handle: newHandle });
    },
    onSuccess: () => {
      toast({
        title: "Handle updated",
        description: `Your handle is now @${handle}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to update handle",
        description: error.message,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAvailable && handle !== currentUser?.handle) {
      updateHandleMutation.mutate(handle);
    }
  };

  const isValidFormat = /^[a-zA-Z0-9_]{3,30}$/.test(handle);
  const canSubmit = isAvailable && handle !== currentUser?.handle && isValidFormat;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Please log in to access settings.</p>
              <a href="/api/login">
                <Button className="mt-4">Log In</Button>
              </a>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-settings-title">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="h-5 w-5" />
              Your Handle
            </CardTitle>
            <CardDescription>
              Choose a unique handle that will be displayed publicly instead of your real name.
              This helps protect your privacy while still letting you engage with the community.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="handle">Handle</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                  <Input
                    id="handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="YourHandle123"
                    className="pl-8 pr-10"
                    maxLength={30}
                    data-testid="input-handle"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!isChecking && isAvailable === true && handle.length >= 3 && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!isChecking && isAvailable === false && handle.length >= 3 && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  3-30 characters, letters, numbers, and underscores only.
                </p>
                {!isValidFormat && handle.length > 0 && handle.length < 3 && (
                  <p className="text-xs text-amber-500">Handle must be at least 3 characters.</p>
                )}
                {isAvailable === false && isValidFormat && (
                  <p className="text-xs text-destructive">This handle is already taken.</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Current handle:</span>
                  <Badge variant="secondary" data-testid="badge-current-handle">
                    @{currentUser?.handle || "Not set"}
                  </Badge>
                </div>
                <Button
                  type="submit"
                  disabled={!canSubmit || updateHandleMutation.isPending}
                  data-testid="button-save-handle"
                >
                  {updateHandleMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Handle"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Privacy Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your handle is displayed instead of your real name across the platform, including
              on comments, messages, follower lists, and in notifications. This helps keep your
              real identity private while still participating in the collector community.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
