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
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Navigation() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

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
                MyDisplayCase
              </span>
            </div>
          </Link>

          {/* Main Navigation - Only show when authenticated */}
          {isAuthenticated && user && (
            <nav className="hidden md:flex items-center gap-1">
              {/* Dashboard */}
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

              {/* Portfolio Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-1",
                      isActiveSection(["/cases", "/analytics", "/search"]) && "bg-accent"
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
                      <BarChart3 className="h-4 w-4" />
                      Analytics
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Market Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn(
                      "gap-1",
                      isActiveSection(["/outlook", "/hidden-gems"]) && "bg-accent"
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
                      Quick Card Check
                    </Link>
                  </DropdownMenuItem>
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
                      isActiveSection(["/player-outlook", "/watchlist"]) && "bg-accent"
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

              {/* Messages Dropdown */}
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
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Explore for non-authenticated users */}
            {!isAuthenticated && (
              <Link href="/explore">
                <Button variant="ghost" size="sm" className="gap-2" data-testid="link-explore">
                  <Compass className="h-4 w-4" />
                  <span className="hidden sm:inline">Explore</span>
                </Button>
              </Link>
            )}
            
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
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-2 cursor-pointer" data-testid="link-admin">
                          <Shield className="h-4 w-4" />
                          Admin Dashboard
                        </Link>
                      </DropdownMenuItem>
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

        {/* Mobile Navigation - Simplified dropdown for all features */}
        {isAuthenticated && user && (
          <nav className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
            <Link href="/">
              <Button variant="ghost" size="sm" className={cn(isActive("/") && "bg-accent")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="ghost" size="sm" className={cn(isActive("/search") && "bg-accent")}>
                <Search className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/outlook">
              <Button variant="ghost" size="sm" className={cn(isActive("/outlook") && "bg-accent")}>
                <Zap className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/player-outlook">
              <Button variant="ghost" size="sm" className={cn(isActive("/player-outlook") && "bg-accent")}>
                <TrendingUp className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/explore">
              <Button variant="ghost" size="sm" className={cn(isActive("/explore") && "bg-accent")}>
                <Compass className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/messages">
              <Button variant="ghost" size="sm" className={cn("relative", isActive("/messages") && "bg-accent")}>
                <MessageSquare className="h-4 w-4" />
                {unreadCount?.count && unreadCount.count > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
                )}
              </Button>
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
