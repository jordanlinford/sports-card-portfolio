import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { Link } from "wouter";
import type { User } from "@shared/schema";

interface FollowStatsProps {
  userId: string;
  compact?: boolean;
}

interface FollowRecord {
  id: number;
  followerId: string;
  followedId: string;
  createdAt: Date;
  follower?: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'>;
  followed?: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'>;
}

function UserListItem({ user }: { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'profileImageUrl'> }) {
  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.firstName || "Collector";
    
  return (
    <div className="flex items-center gap-3 p-2 hover-elevate rounded-md">
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.profileImageUrl || undefined} />
        <AvatarFallback className="text-xs">
          {user.firstName?.charAt(0)?.toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium">{displayName}</span>
    </div>
  );
}

export function FollowStats({ userId, compact = false }: FollowStatsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"followers" | "following">("followers");

  const { data: followers, isLoading: followersLoading } = useQuery<FollowRecord[]>({
    queryKey: ["/api/users", userId, "followers"],
    enabled: showDialog,
  });

  const { data: following, isLoading: followingLoading } = useQuery<FollowRecord[]>({
    queryKey: ["/api/users", userId, "following"],
    enabled: showDialog,
  });

  const followerCount = followers?.length ?? 0;
  const followingCount = following?.length ?? 0;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-view-follow-stats"
      >
        <Users className="h-4 w-4" />
        <span>
          <strong className="text-foreground">{followerCount}</strong> followers
          {!compact && (
            <>
              <span className="mx-1">·</span>
              <strong className="text-foreground">{followingCount}</strong> following
            </>
          )}
        </span>
      </button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connections</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "followers" | "following")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="followers" data-testid="tab-followers">
                Followers ({followerCount})
              </TabsTrigger>
              <TabsTrigger value="following" data-testid="tab-following">
                Following ({followingCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="followers" className="mt-4 max-h-80 overflow-y-auto">
              {followersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              ) : followers?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No followers yet
                </p>
              ) : (
                <div className="space-y-1">
                  {followers?.map((f) => (
                    f.follower && <UserListItem key={f.id} user={f.follower} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="following" className="mt-4 max-h-80 overflow-y-auto">
              {followingLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              ) : following?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Not following anyone yet
                </p>
              ) : (
                <div className="space-y-1">
                  {following?.map((f) => (
                    f.followed && <UserListItem key={f.id} user={f.followed} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
