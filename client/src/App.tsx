import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/navigation";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import CaseNew from "@/pages/case-new";
import CaseEdit from "@/pages/case-edit";
import CaseView from "@/pages/case-view";
import Upgrade from "@/pages/upgrade";
import BillingSuccess from "@/pages/billing-success";
import SearchPage from "@/pages/search";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/cases/:id" component={CaseView} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/search" component={SearchPage} />
          <Route path="/cases/new" component={CaseNew} />
          <Route path="/cases/:id/edit" component={CaseEdit} />
          <Route path="/cases/:id" component={CaseView} />
          <Route path="/upgrade" component={Upgrade} />
          <Route path="/billing/success" component={BillingSuccess} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="mydisplaycase-theme">
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <Navigation />
            <main>
              <Router />
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
