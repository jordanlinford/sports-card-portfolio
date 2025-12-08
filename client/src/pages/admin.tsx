import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Users, LayoutGrid, CreditCard, Image } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import type { User, DisplayCaseWithCards } from "@shared/schema";

interface PlatformStats {
  totalUsers: number;
  totalDisplayCases: number;
  totalCards: number;
  proUsers: number;
}

interface DisplayCaseWithOwner extends DisplayCaseWithCards {
  ownerName: string;
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: number; icon: any; description?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value.toLocaleString()}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function UserRow({ user }: { user: User }) {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n?.[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0" data-testid={`row-user-${user.id}`}>
      <Avatar>
        <AvatarImage src={user.profileImageUrl || undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Anonymous"}
        </p>
        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {user.isAdmin && (
          <Badge variant="default">Admin</Badge>
        )}
        <Badge variant={user.subscriptionStatus === "PRO" ? "default" : "secondary"}>
          {user.subscriptionStatus || "FREE"}
        </Badge>
      </div>
      {user.createdAt && (
        <span className="text-sm text-muted-foreground hidden md:block">
          Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}

function DisplayCaseRow({ displayCase }: { displayCase: DisplayCaseWithOwner }) {
  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0" data-testid={`row-case-${displayCase.id}`}>
      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
        {displayCase.cards && displayCase.cards.length > 0 && displayCase.cards[0].imagePath ? (
          <img
            src={displayCase.cards[0].imagePath}
            alt=""
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{displayCase.name}</p>
        <p className="text-sm text-muted-foreground truncate">by {displayCase.ownerName}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">
          {displayCase.cards?.length || 0} cards
        </Badge>
        <Badge variant={displayCase.isPublic ? "default" : "outline"}>
          {displayCase.isPublic ? "Public" : "Private"}
        </Badge>
      </div>
      {displayCase.createdAt && (
        <span className="text-sm text-muted-foreground hidden md:block">
          {format(new Date(displayCase.createdAt), "MMM d, yyyy")}
        </span>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    retry: false,
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const { data: displayCases, isLoading: casesLoading } = useQuery<DisplayCaseWithOwner[]>({
    queryKey: ["/api/admin/display-cases"],
    retry: false,
  });

  if (statsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>Return to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage users and monitor platform activity</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {statsLoading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : stats ? (
            <>
              <StatCard
                title="Total Users"
                value={stats.totalUsers}
                icon={Users}
                description="Registered users"
              />
              <StatCard
                title="Pro Users"
                value={stats.proUsers}
                icon={CreditCard}
                description="Paid subscribers"
              />
              <StatCard
                title="Display Cases"
                value={stats.totalDisplayCases}
                icon={LayoutGrid}
                description="Total collections"
              />
              <StatCard
                title="Total Cards"
                value={stats.totalCards}
                icon={Image}
                description="Cards uploaded"
              />
            </>
          ) : null}
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users">Users ({users?.length || 0})</TabsTrigger>
            <TabsTrigger value="cases" data-testid="tab-cases">Display Cases ({displayCases?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage platform users and their subscriptions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {usersLoading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : users && users.length > 0 ? (
                    users.map((user) => (
                      <UserRow key={user.id} user={user} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No users found
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases">
            <Card>
              <CardHeader>
                <CardTitle>All Display Cases</CardTitle>
                <CardDescription>View all display cases across the platform</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {casesLoading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : displayCases && displayCases.length > 0 ? (
                    displayCases.map((displayCase) => (
                      <DisplayCaseRow key={displayCase.id} displayCase={displayCase} />
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No display cases found
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
