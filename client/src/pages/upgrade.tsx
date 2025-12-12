import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIOSStandalone } from "@/hooks/use-ios-standalone";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Check, 
  Crown,
  Zap,
  Shield,
  Infinity,
  Star,
  Gift,
  Loader2
} from "lucide-react";

export default function Upgrade() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { shouldHidePayments, isIOSPWA } = useIOSStandalone();
  const [promoCode, setPromoCode] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const promoMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/promo/redeem", { code });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success!",
        description: data.message || "Promo code redeemed! You now have Pro access.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setPromoCode("");
      setTimeout(() => {
        setLocation("/");
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Invalid promo code",
        description: error.message || "Please check your code and try again.",
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/create-checkout-session");
      return response;
    },
    onSuccess: (data: any) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error starting checkout",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (user?.subscriptionStatus === "PRO") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Crown className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-4">You're Already Pro!</h1>
        <p className="text-muted-foreground mb-8">
          You have unlimited display cases and all Pro features.
        </p>
        <Link href="/">
          <Button className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="text-center mb-12">
        <Badge className="mb-4 gap-1">
          <Zap className="h-3 w-3" />
          Upgrade
        </Badge>
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          Unlock Unlimited Display Cases
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          You've reached the free tier limit of 3 display cases. 
          Upgrade to Pro to create unlimited cases and showcase your entire collection.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              Free Plan
            </CardTitle>
            <div className="text-3xl font-bold">$0</div>
            <CardDescription>Your current plan</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Up to 3 display cases</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Unlimited cards per case</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Public sharing links</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Beautiful grid display</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-primary relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="gap-1">
              <Star className="h-3 w-3" />
              Recommended
            </Badge>
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Pro Plan
            </CardTitle>
            <div className="text-3xl font-bold">
              $12<span className="text-lg font-normal text-muted-foreground">/month</span>
            </div>
            <CardDescription>For serious collectors</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 mb-6">
              <li className="flex items-center gap-2">
                <Infinity className="h-4 w-4 text-primary" />
                <span className="font-medium">Unlimited display cases</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Unlimited cards per case</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Public sharing links</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Beautiful grid display</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Priority support</span>
              </li>
            </ul>
            {shouldHidePayments ? (
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  To upgrade to Pro, please visit mydisplaycase.io in your browser.
                </p>
                <p className="text-xs text-muted-foreground">
                  Subscriptions are managed through our website.
                </p>
              </div>
            ) : (
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
                data-testid="button-upgrade-checkout"
              >
                <Zap className="h-4 w-4" />
                {checkoutMutation.isPending ? "Starting checkout..." : "Upgrade with Stripe"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Promo Code Section */}
      <Card className="max-w-md mx-auto mb-8">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-lg">
            <Gift className="h-5 w-5 text-primary" />
            Have a Promo Code?
          </CardTitle>
          <CardDescription>
            Enter your code to unlock Pro features for free
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (promoCode.trim()) {
                promoMutation.mutate(promoCode.trim());
              }
            }}
            className="flex gap-2"
          >
            <div className="flex-1">
              <Label htmlFor="promo-code" className="sr-only">Promo Code</Label>
              <Input
                id="promo-code"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                disabled={promoMutation.isPending}
                data-testid="input-promo-code"
              />
            </div>
            <Button
              type="submit"
              disabled={!promoCode.trim() || promoMutation.isPending}
              data-testid="button-apply-promo"
            >
              {promoMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Apply"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>
          Secure payment powered by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
