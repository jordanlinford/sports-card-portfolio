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
import AnalyticsPage from "@/pages/analytics";
import BookmarksPage from "@/pages/bookmarks";
import OffersPage from "@/pages/offers";
import MessagesPage from "@/pages/messages";
import SettingsPage from "@/pages/settings";
import OnboardingPage from "@/pages/onboarding";
import CardOutlookPage from "@/pages/card-outlook";
import OutlookOverviewPage from "@/pages/outlook-overview";
import PlayerOutlookPage from "@/pages/player-outlook";
import WatchlistPage from "@/pages/watchlist";
import HiddenGemsPage from "@/pages/hidden-gems";
import PortfolioOutlookPage from "@/pages/portfolio-outlook";
import NextBuysPage from "@/pages/next-buys";
import GrowthProjectionsPage from "@/pages/growth-projections";
import ShareViewer from "@/pages/share-viewer";
import PortfolioBuilderPage from "@/pages/portfolio-builder";
import PortfolioBuilderSplitPage from "@/pages/portfolio-builder-split";
import PortfolioBuilderPreferencesPage from "@/pages/portfolio-builder-preferences";
import AdminPortfolioBuilderPage from "@/pages/admin-portfolio-builder";
import BlogListing from "@/pages/blog";
import BlogPostPage from "@/pages/blog-post";
import PublicPlayerOutlookPage from "@/pages/public-player-outlook";
import SupportPage from "@/pages/support";
import ComparePage from "@/pages/compare";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  
  useAnalytics();

  return (
    <Switch>
      {/* Public routes - render immediately without auth check */}
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/explore" component={Explore} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/billing/success" component={BillingSuccess} />
      <Route path="/share/:token" component={ShareViewer} />
      <Route path="/blog" component={BlogListing} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/player-outlook" component={PlayerOutlookPage} />
      <Route path="/outlook/:sport/:slug" component={PublicPlayerOutlookPage} />
      <Route path="/portfolio-builder/splits/:id" component={PortfolioBuilderSplitPage} />
      <Route path="/portfolio-builder" component={PortfolioBuilderPage} />
      <Route path="/card/:cardId/outlook" component={CardOutlookPage} />
      {/* Show loading only for auth-dependent routes */}
      {isLoading ? (
        <Route>
          {() => (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}
        </Route>
      ) : !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/case/:id" component={CaseView} />
          <Route path="/cases/:id" component={CaseView} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/analytics/growth" component={GrowthProjectionsPage} />
          <Route path="/bookmarks" component={BookmarksPage} />
          <Route path="/offers" component={OffersPage} />
          <Route path="/messages" component={MessagesPage} />
          <Route path="/messages/:conversationId" component={MessagesPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/outlook" component={OutlookOverviewPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/hidden-gems" component={HiddenGemsPage} />
          <Route path="/portfolio/outlook" component={PortfolioOutlookPage} />
          <Route path="/portfolio/next-buys" component={NextBuysPage} />
          <Route path="/compare" component={ComparePage} />
          <Route path="/portfolio-builder/splits/:id/preferences" component={PortfolioBuilderPreferencesPage} />
          <Route path="/admin/portfolio-builder" component={AdminPortfolioBuilderPage} />
          <Route path="/search" component={SearchPage} />
          <Route path="/cases/new" component={CaseNew} />
          <Route path="/cases/:id/edit" component={CaseEdit} />
          <Route path="/case/:id" component={CaseView} />
          <Route path="/cases/:id" component={CaseView} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/card/:cardId/outlook" component={CardOutlookPage} />
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
