import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/useAuth";
import { initGA } from "./lib/analytics";
import { useAnalytics } from "./hooks/use-analytics";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import CaseNew from "@/pages/case-new";
import CaseEdit from "@/pages/case-edit";
import CaseView from "@/pages/case-view";
import Upgrade from "@/pages/upgrade";
import BillingSuccess from "@/pages/billing-success";
import SearchPage from "@/pages/search";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import Explore from "@/pages/explore";
import AdminDashboard from "@/pages/admin";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  
  useAnalytics();

  return (
    <Switch>
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/explore" component={Explore} />
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/case/:id" component={CaseView} />
          <Route path="/cases/:id" component={CaseView} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/search" component={SearchPage} />
          <Route path="/cases/new" component={CaseNew} />
          <Route path="/cases/:id/edit" component={CaseEdit} />
          <Route path="/case/:id" component={CaseView} />
          <Route path="/cases/:id" component={CaseView} />
          <Route path="/upgrade" component={Upgrade} />
          <Route path="/billing/success" component={BillingSuccess} />
          <Route path="/admin" component={AdminDashboard} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    if (!import.meta.env.VITE_GA_MEASUREMENT_ID) {
      console.warn('Missing required Google Analytics key: VITE_GA_MEASUREMENT_ID');
    } else {
      initGA();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="mydisplaycase-theme">
        <TooltipProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navigation />
            <main className="flex-1">
              <Router />
            </main>
            <Footer />
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
