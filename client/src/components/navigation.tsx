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
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, LogOut, User, Crown, Search, Compass, Shield, BarChart3, Bookmark, HandCoins } from "lucide-react";

export function Navigation() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: isAuthenticated,
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

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold" data-testid="text-logo">
                MyDisplayCase
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/explore">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="link-explore">
                <Compass className="h-4 w-4" />
                <span className="hidden sm:inline">Explore</span>
              </Button>
            </Link>
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
                      <Link href="/" className="flex items-center gap-2 cursor-pointer">
                        <LayoutGrid className="h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/search" className="flex items-center gap-2 cursor-pointer">
                        <Search className="h-4 w-4" />
                        Search Cards
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/analytics" className="flex items-center gap-2 cursor-pointer" data-testid="link-analytics">
                        <BarChart3 className="h-4 w-4" />
                        Analytics
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/bookmarks" className="flex items-center gap-2 cursor-pointer" data-testid="link-bookmarks">
                        <Bookmark className="h-4 w-4" />
                        My Bookmarks
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/offers" className="flex items-center gap-2 cursor-pointer" data-testid="link-offers">
                        <HandCoins className="h-4 w-4" />
                        Offers
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
      </div>
    </header>
  );
}
