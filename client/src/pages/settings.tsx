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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AtSign, Check, X, Loader2, Crown, Pause, Play, Users, Copy, Mail, Download, Trash2, Shield } from "lucide-react";
import type { User } from "@shared/schema";
import { hasProAccess } from "@shared/schema";

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

  const isPro = hasProAccess(currentUser);
  const isPaused = !!(currentUser as any)?.subscriptionPaused;

  const { data: referralData } = useQuery<{ code: string; referralCount: number }>({
    queryKey: ["/api/referral/code"],
    enabled: !!user,
  });

  const referralUrl = referralData?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${referralData.code}`
    : "";

  const [inviteEmail, setInviteEmail] = useState("");

  const pauseMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/subscription/pause", {}),
    onSuccess: () => {
      toast({ title: "Subscription paused", description: "It will auto-resume in 3 months." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to pause", description: e.message }),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/subscription/resume", {}),
    onSuccess: () => {
      toast({ title: "Subscription resumed", description: "Welcome back!" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to resume", description: e.message }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => apiRequest("POST", "/api/referral/invite", { email }),
    onSuccess: () => {
      toast({ title: "Invitation sent!", description: `We emailed ${inviteEmail} your referral link.` });
      setInviteEmail("");
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to send invite", description: e.message }),
  });

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const exportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/account/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Your data has been downloaded." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Export failed", description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  const deleteAccountMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", "/api/account"),
    onSuccess: () => {
      toast({ title: "Account deleted", description: "Your account and all data have been permanently removed." });
      window.location.href = "/";
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to delete account", description: e.message }),
  });

  const copyReferral = () => {
    if (referralUrl) {
      navigator.clipboard.writeText(referralUrl);
      toast({ title: "Copied!", description: "Referral link copied to clipboard." });
    }
  };

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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Subscription
            </CardTitle>
            <CardDescription>
              Manage your Pro subscription. Pause anytime — your data stays put.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Badge variant={isPro ? "default" : "secondary"} data-testid="badge-subscription-status">
                  {isPro ? (isPaused ? "Paused" : "Pro") : "Free"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {isPro
                    ? isPaused
                      ? "Auto-resumes within 90 days"
                      : "Active — thanks for supporting us!"
                    : "Upgrade to unlock unlimited cases & Pro features"}
                </span>
              </div>
              <div className="flex gap-2">
                {!isPro && (
                  <a href="/upgrade">
                    <Button size="sm" data-testid="button-upgrade-from-settings">Upgrade</Button>
                  </a>
                )}
                {isPro && !isPaused && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pauseMutation.isPending}
                        data-testid="button-pause-subscription"
                      >
                        {pauseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Pause className="h-4 w-4 mr-1" /> Pause for 90 days</>}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Pause your subscription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your subscription will be paused for up to 3 months. You'll keep access until the current billing period ends.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => pauseMutation.mutate()}>
                          Pause Subscription
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {isPro && isPaused && (
                  <Button
                    size="sm"
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending}
                    data-testid="button-resume-subscription"
                  >
                    {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" /> Resume</>}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Refer Friends
            </CardTitle>
            <CardDescription>
              Share your link with fellow collectors. Help us grow the community.
              {referralData?.referralCount ? ` You've referred ${referralData.referralCount} friend${referralData.referralCount === 1 ? "" : "s"} so far.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your referral link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={referralUrl || "Loading..."}
                  className="font-mono text-xs"
                  data-testid="input-referral-link"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyReferral}
                  disabled={!referralUrl}
                  data-testid="button-copy-referral"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inviteEmail.trim()) inviteMutation.mutate(inviteEmail.trim());
              }}
              className="space-y-2"
            >
              <Label htmlFor="invite-email">Email a friend an invitation</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviteMutation.isPending}
                  data-testid="input-invite-email"
                />
                <Button
                  type="submit"
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  data-testid="button-send-invite"
                >
                  {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4 mr-1" /> Invite</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Data &amp; Privacy
            </CardTitle>
            <CardDescription>
              Export your data or permanently delete your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Export My Data</p>
                <p className="text-xs text-muted-foreground">Download a JSON file with all your account data.</p>
              </div>
              <Button
                variant="outline"
                onClick={exportData}
                disabled={isExporting}
                data-testid="button-export-data"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                Export
              </Button>
            </div>

            <hr className="border-border" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently delete your account and all data. This cannot be undone.
                </p>
              </div>
              <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmText(""); }}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    data-testid="button-delete-account"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your account and all data. This cannot be undone.
                      Type <span className="font-mono font-bold">DELETE</span> below to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    placeholder='Type "DELETE" to confirm'
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    data-testid="input-delete-confirm"
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteConfirmText !== "DELETE" || deleteAccountMutation.isPending}
                      onClick={() => deleteAccountMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteAccountMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Permanently Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
