import { useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  Crown,
  LayoutGrid,
  Infinity,
  Star,
  Zap
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function BillingSuccess() {
  const search = useSearch();
  const sessionId = new URLSearchParams(search).get("session_id");
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/billing/success", sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/billing/success?session_id=${sessionId}`);
      if (!response.ok) {
        throw new Error("Failed to verify payment");
      }
      return response.json();
    },
    enabled: !!sessionId && isAuthenticated,
    retry: 3,
  });

  useEffect(() => {
    if (data?.success) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }
  }, [data]);

  if (isLoading || authLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card>
          <CardHeader className="text-center">
            <Skeleton className="w-16 h-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Payment Verification Failed</CardTitle>
            <CardDescription>
              We couldn't verify your payment. Please contact support if this persists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/" className="block">
              <Button className="w-full">Go to Dashboard</Button>
            </Link>
            <Link href="/upgrade" className="block">
              <Button variant="outline" className="w-full">Try Again</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Card>
        <CardHeader className="text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Crown className="h-6 w-6 text-primary" />
            Welcome to Pro!
          </CardTitle>
          <CardDescription className="text-base">
            Your upgrade was successful. Enjoy unlimited display cases!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              What's unlocked
            </h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Infinity className="h-4 w-4 text-primary" />
                Unlimited display cases
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Unlimited cards per case
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Priority support
              </li>
            </ul>
          </div>

          <Link href="/" className="block">
            <Button className="w-full gap-2" size="lg" data-testid="button-go-dashboard">
              <LayoutGrid className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
