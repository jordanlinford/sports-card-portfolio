import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutGrid, 
  LogOut, 
  Crown, 
  Compass, 
  Shield, 
  BarChart3, 
  Bookmark, 
  MessageSquare, 
  Settings, 
  Zap, 
  Star, 
  Gem, 
  TrendingUp,
  Briefcase,
  FolderPlus,
  Tag,
  Search,
  Lightbulb,
  Users,
  HandCoins,
  ChevronDown,
  Target,
  LineChart,
  Package,
  Newspaper,
  Menu,
  GitCompareArrows,
  History,
  Trophy
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: isAuthenticated,
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const isAdmin = adminCheck?.isAdmin || false;

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName[0].toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "U";
  };

  // Check if current path matches
  const isActive = (path: string) => location === path;
  const isActiveSection = (paths: string[]) => paths.some(p => location.startsWith(p));

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold hidden sm:inline" data-testid="text-logo">
                Sports Card Portfolio
              </span>
            </div>
          </Link>

          {/* Public Navigation - Always visible */}
          <nav className="hidden md:flex items-center gap-1">
            {/* Dashboard - auth only */}
            {isAuthenticated && user && (
              <Link href="/">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("gap-2", isActive("/") && "bg-accent")}
                  data-testid="nav-dashboard"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            )}

            {/* Portfolio Dropdown - auth only */}
            {isAuthenticated && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-1",
                      isActiveSection(["/cases", "/analytics", "/search", "/portfolio", "/portfolio-builder"]) && "bg-accent"
                    )}
                    data-testid="nav-portfolio"
                  >
                    <Briefcase className="h-4 w-4" />
                    Portfolio
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Your collection, organized like a real portfolio
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio/outlook" className="flex items-center gap-2 cursor-pointer">
                      <BarChart3 className="h-4 w-4" />
                      Portfolio Outlook
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/cases/new" className="flex items-center gap-2 cursor-pointer">
                      <FolderPlus className="h-4 w-4" />
                      Create Portfolio
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/search" className="flex items-center gap-2 cursor-pointer">
                      <Search className="h-4 w-4" />
                      My Cards
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/analytics" className="flex items-center gap-2 cursor-pointer">
                      <LineChart className="h-4 w-4" />
                      Analytics
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/analytics/growth" className="flex items-center gap-2 cursor-pointer">
                      <TrendingUp className="h-4 w-4" />
                      Growth Projections
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">Pro</Badge>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio-builder" className="flex items-center gap-2 cursor-pointer">
                      <Package className="h-4 w-4" />
                      Box Breaks
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Market Dropdown - Public */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-1",
                      isActiveSection(["/outlook", "/hidden-gems", "/scan-history"]) && "bg-accent"
                    )}
                    data-testid="nav-market"
                  >
                    <Zap className="h-4 w-4" />
                    Market
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    AI-powered market intelligence
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/outlook" className="flex items-center gap-2 cursor-pointer">
                      <Zap className="h-4 w-4" />
                      Market Outlook
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/hidden-gems" className="flex items-center gap-2 cursor-pointer">
                      <Gem className="h-4 w-4" />
                      Hidden Gems
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/outlook" className="flex items-center gap-2 cursor-pointer">
                      <Lightbulb className="h-4 w-4" />
                      Card Analysis
                    </Link>
                  </DropdownMenuItem>
                  {isAuthenticated && user && (
                    <DropdownMenuItem asChild>
                      <Link href="/scan-history" className="flex items-center gap-2 cursor-pointer" data-testid="nav-scan-history">
                        <History className="h-4 w-4" />
                        Scan History
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Players Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-1",
                      isActiveSection(["/player-outlook", "/watchlist", "/compare"]) && "bg-accent"
                    )}
                    data-testid="nav-players"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Players
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Research before buying
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/player-outlook" className="flex items-center gap-2 cursor-pointer">
                      <TrendingUp className="h-4 w-4" />
                      Player Analysis
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/compare" className="flex items-center gap-2 cursor-pointer" data-testid="nav-compare">
                      <GitCompareArrows className="h-4 w-4" />
                      Compare
                      <Badge variant="secondary" className="ml-auto text-xs">Pro</Badge>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/watchlist" className="flex items-center gap-2 cursor-pointer">
                      <Star className="h-4 w-4" />
                      Player Watchlist
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Explore */}
              <Link href="/explore">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("gap-2", isActive("/explore") && "bg-accent")}
                  data-testid="nav-explore"
                >
                  <Compass className="h-4 w-4" />
                  Explore
                </Button>
              </Link>

              {/* Leaderboards */}
              <Link href="/leaderboards">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("gap-2", isActive("/leaderboards") && "bg-accent")}
                  data-testid="nav-leaderboards"
                >
                  <Trophy className="h-4 w-4" />
                  Leaderboards
                </Button>
              </Link>

              {/* Blog */}
              <Link href="/blog">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn("gap-2", isActive("/blog") && "bg-accent")}
                  data-testid="nav-blog"
                >
                  <Newspaper className="h-4 w-4" />
                  Blog
                </Button>
              </Link>

              {/* Messages Dropdown - auth only */}
              {isAuthenticated && user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn(
                        "gap-1 relative",
                        isActiveSection(["/messages", "/offers"]) && "bg-accent"
                      )}
                      data-testid="nav-messages"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Messages
                      {unreadCount?.count && unreadCount.count > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                          {unreadCount.count > 9 ? "9+" : unreadCount.count}
                        </span>
                      )}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href="/offers" className="flex items-center gap-2 cursor-pointer">
                        <HandCoins className="h-4 w-4" />
                        Offers
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/messages" className="flex items-center gap-2 cursor-pointer">
                        <MessageSquare className="h-4 w-4" />
                        Chats
                        {unreadCount?.count && unreadCount.count > 0 && (
                          <Badge variant="default" className="ml-auto text-xs">{unreadCount.count}</Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {isLoading ? (
              <div className="h-9 w-20 bg-muted animate-pulse rounded-md" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                {user.subscriptionStatus === "PRO" ? (
                  <Badge variant="default" className="gap-1">
                    <Crown className="h-3 w-3" />
                    Pro
                  </Badge>
                ) : user.trialEnd && new Date(user.trialEnd) > new Date() ? (
                  <Badge variant="secondary" className="gap-1">
                    <Crown className="h-3 w-3" />
                    Trial
                  </Badge>
                ) : (
                  <Link href="/upgrade">
                    <Button variant="outline" size="sm" data-testid="button-upgrade-nav">
                      Upgrade to Pro
                    </Button>
                  </Link>
                )}

                <NotificationBell />

                {/* Profile Menu - Simplified */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-9 w-9 rounded-full"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={user.profileImageUrl || undefined}
                          alt={user.firstName || user.email || "User"}
                          className="object-cover"
                        />
                        <AvatarFallback>
                          {getInitials(user.firstName, user.lastName, user.email)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="flex items-center gap-2 p-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={user.profileImageUrl || undefined}
                          alt={user.firstName || user.email || "User"}
                          className="object-cover"
                        />
                        <AvatarFallback>
                          {getInitials(user.firstName, user.lastName, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {user.firstName
                            ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
                            : "User"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/bookmarks" className="flex items-center gap-2 cursor-pointer" data-testid="link-bookmarks">
                        <Bookmark className="h-4 w-4" />
                        My Bookmarks
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex items-center gap-2 cursor-pointer" data-testid="link-settings">
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="flex items-center gap-2 cursor-pointer" data-testid="link-admin">
                            <Shield className="h-4 w-4" />
                            Admin Dashboard
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/admin/feedback" className="flex items-center gap-2 cursor-pointer" data-testid="link-admin-feedback">
                            <MessageSquare className="h-4 w-4" />
                            User Feedback
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a
                        href="/api/logout"
                        className="flex items-center gap-2 cursor-pointer text-destructive"
                        data-testid="button-logout"
                      >
                        <LogOut className="h-4 w-4" />
                        Log out
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <a href="/api/login">
                  <Button variant="ghost" data-testid="button-login">
                    Log in
                  </Button>
                </a>
                <a href="/api/login">
                  <Button data-testid="button-signup">Get Started</Button>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden pb-2">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-mobile-menu">
                <Menu className="h-5 w-5" />
                Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  Sports Card Portfolio
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-6">
                {/* Dashboard - auth only */}
                {isAuthenticated && user && (
                  <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant="ghost" 
                      className={cn("w-full justify-start gap-3", isActive("/") && "bg-accent")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                )}

                {/* Portfolio Section - auth only */}
                {isAuthenticated && user && (
                  <>
                    <div className="mt-4 mb-2">
                      <span className="text-xs font-medium text-muted-foreground px-4">Portfolio</span>
                    </div>
                    <Link href="/portfolio/outlook" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/portfolio/outlook") && "bg-accent")}>
                        <BarChart3 className="h-4 w-4" />
                        Portfolio Outlook
                      </Button>
                    </Link>
                    <Link href="/cases/new" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/cases/new") && "bg-accent")}>
                        <FolderPlus className="h-4 w-4" />
                        Create Portfolio
                      </Button>
                    </Link>
                    <Link href="/search" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/search") && "bg-accent")}>
                        <Search className="h-4 w-4" />
                        My Cards
                      </Button>
                    </Link>
                    <Link href="/analytics" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/analytics") && "bg-accent")}>
                        <LineChart className="h-4 w-4" />
                        Analytics
                      </Button>
                    </Link>
                    <Link href="/analytics/growth" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/analytics/growth") && "bg-accent")}>
                        <TrendingUp className="h-4 w-4" />
                        Growth Projections
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">Pro</Badge>
                      </Button>
                    </Link>
                    <Link href="/portfolio-builder" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/portfolio-builder") && "bg-accent")}>
                        <Package className="h-4 w-4" />
                        Box Breaks
                      </Button>
                    </Link>
                  </>
                )}

                {/* Market Section - Public */}
                <div className="mt-4 mb-2">
                  <span className="text-xs font-medium text-muted-foreground px-4">Market</span>
                </div>
                <Link href="/outlook" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/outlook") && "bg-accent")}>
                    <Zap className="h-4 w-4" />
                    Card Analysis
                  </Button>
                </Link>
                <Link href="/hidden-gems" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/hidden-gems") && "bg-accent")}>
                    <Gem className="h-4 w-4" />
                    Hidden Gems
                  </Button>
                </Link>
                {isAuthenticated && user && (
                  <Link href="/scan-history" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/scan-history") && "bg-accent")} data-testid="nav-scan-history-mobile">
                      <History className="h-4 w-4" />
                      Scan History
                    </Button>
                  </Link>
                )}

                {/* Players Section - Public */}
                <div className="mt-4 mb-2">
                  <span className="text-xs font-medium text-muted-foreground px-4">Players</span>
                </div>
                <Link href="/player-outlook" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/player-outlook") && "bg-accent")}>
                    <TrendingUp className="h-4 w-4" />
                    Player Analysis
                  </Button>
                </Link>
                <Link href="/compare" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/compare") && "bg-accent")} data-testid="nav-compare-mobile">
                    <GitCompareArrows className="h-4 w-4" />
                    Compare
                    <Badge variant="secondary" className="ml-auto text-xs">Pro</Badge>
                  </Button>
                </Link>
                <Link href="/watchlist" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/watchlist") && "bg-accent")}>
                    <Star className="h-4 w-4" />
                    Player Watchlist
                  </Button>
                </Link>

                {/* Explore & Social - Public */}
                <div className="mt-4 mb-2">
                  <span className="text-xs font-medium text-muted-foreground px-4">Explore</span>
                </div>
                <Link href="/explore" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/explore") && "bg-accent")}>
                    <Compass className="h-4 w-4" />
                    Explore
                  </Button>
                </Link>
                <Link href="/leaderboards" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/leaderboards") && "bg-accent")} data-testid="nav-leaderboards-mobile">
                    <Trophy className="h-4 w-4" />
                    Leaderboards
                  </Button>
                </Link>
                <Link href="/blog" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/blog") && "bg-accent")}>
                    <Newspaper className="h-4 w-4" />
                    Blog
                  </Button>
                </Link>

                {/* Messages & Account - auth only */}
                {isAuthenticated && user && (
                  <>
                    <div className="mt-4 mb-2">
                      <span className="text-xs font-medium text-muted-foreground px-4">Messages</span>
                    </div>
                    <Link href="/offers" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/offers") && "bg-accent")}>
                        <HandCoins className="h-4 w-4" />
                        Offers
                      </Button>
                    </Link>
                    <Link href="/messages" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/messages") && "bg-accent")}>
                        <MessageSquare className="h-4 w-4" />
                        Chats
                        {unreadCount?.count && unreadCount.count > 0 && (
                          <Badge variant="default" className="ml-auto text-xs">{unreadCount.count}</Badge>
                        )}
                      </Button>
                    </Link>

                    <div className="mt-4 mb-2">
                      <span className="text-xs font-medium text-muted-foreground px-4">Account</span>
                    </div>
                    <Link href="/bookmarks" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/bookmarks") && "bg-accent")}>
                        <Bookmark className="h-4 w-4" />
                        My Bookmarks
                      </Button>
                    </Link>
                    <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/settings") && "bg-accent")}>
                        <Settings className="h-4 w-4" />
                        Settings
                      </Button>
                    </Link>
                    {isAdmin && (
                      <>
                        <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/admin") && "bg-accent")}>
                            <Shield className="h-4 w-4" />
                            Admin Dashboard
                          </Button>
                        </Link>
                        <Link href="/admin/feedback" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className={cn("w-full justify-start gap-3", isActive("/admin/feedback") && "bg-accent")}>
                            <MessageSquare className="h-4 w-4" />
                            User Feedback
                          </Button>
                        </Link>
                      </>
                    )}
                    <a href="/api/logout" className="mt-2">
                      <Button variant="ghost" className="w-full justify-start gap-3 text-destructive hover:text-destructive">
                        <LogOut className="h-4 w-4" />
                        Log out
                      </Button>
                    </a>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
