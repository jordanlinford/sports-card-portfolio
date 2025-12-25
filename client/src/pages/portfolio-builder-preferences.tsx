import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  ArrowLeft,
  GripVertical,
  Save,
  RefreshCw,
  AlertCircle,
  Info,
} from "lucide-react";
import type { SplitInstanceWithSeats, SeatWithUser, BundleDefinition } from "@shared/schema";
import { MAX_SINGLE_TEAM_PARTICIPANTS, requiresBundleSelection } from "@shared/schema";

interface SortableItemProps {
  id: string;
  index: number;
  teams?: string[];
  isBundle?: boolean;
}

function SortableItem({ id, index, teams, isBundle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-md border bg-card ${
        isDragging ? "shadow-lg" : ""
      }`}
      data-testid={`preference-item-${id}`}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Badge variant="outline" className="w-6 justify-center text-xs">
        {index + 1}
      </Badge>
      <div className="flex-1">
        <span className="font-medium">{id}</span>
        {isBundle && teams && teams.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {teams.map((team, ti) => (
              <Badge key={ti} variant="secondary" className="text-xs">
                {team}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PortfolioBuilderPreferencesPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  
  const splitId = parseInt(id || "0");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: splitData, isLoading } = useQuery<{
    seats: any[];
    assignmentPool: string[];
    bundles: BundleDefinition[];
  } & SplitInstanceWithSeats>({
    queryKey: ["/api/splits", splitId],
    enabled: splitId > 0,
  });
  
  // Check if this is a bundle-based split
  const isBundle = splitData?.formatType === "TEAM_BUNDLE";
  const bundles = (splitData?.bundles || []) as BundleDefinition[];
  
  // Get bundle info by name
  const getBundleTeams = (bundleName: string): string[] => {
    const bundle = bundles.find(b => b.name === bundleName);
    return bundle?.teams || [];
  };

  const { data: seatsData } = useQuery<SeatWithUser[]>({
    queryKey: ["/api/splits", splitId, "seats"],
    enabled: splitId > 0,
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const saveMutation = useMutation({
    mutationFn: (prefs: string[]) => 
      apiRequest("POST", `/api/splits/${splitId}/preferences`, { preferences: prefs }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Your preferences have been updated" });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/splits", splitId, "seats"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save preferences", 
        variant: "destructive" 
      });
    },
  });

  const currentUserId = currentUser?.id;
  const mySeat = seatsData?.find(s => s.userId === currentUserId);
  const assignmentPool = (splitData?.assignmentPool || []) as string[];

  useEffect(() => {
    if (mySeat && assignmentPool.length > 0) {
      const existingPrefs = (mySeat.preferences || []) as string[];
      if (existingPrefs.length > 0) {
        setPreferences(existingPrefs);
      } else {
        setPreferences([...assignmentPool]);
      }
    }
  }, [mySeat, assignmentPool]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setPreferences((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        setHasChanges(true);
        return newOrder;
      });
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!splitData || !mySeat) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h3 className="text-xl font-semibold mb-2">Cannot Set Preferences</h3>
            <p className="text-muted-foreground mb-4">
              {!mySeat ? "You don't have a seat in this split." : "Split not found."}
            </p>
            <Link href={`/portfolio-builder/splits/${splitId}`}>
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Split
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (assignmentPool.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href={`/portfolio-builder/splits/${splitId}`} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Split
        </Link>
        
        <Card>
          <CardContent className="py-8 text-center">
            <Info className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Preferences Not Available</h3>
            <p className="text-muted-foreground">
              The assignment pool hasn't been set up yet. Check back later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/portfolio-builder/splits/${splitId}`} className="inline-flex items-center text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Split
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            Set Your {isBundle ? "Bundle" : splitData.formatType === "DIVISIONAL" ? "Division" : "Team"} Preferences
          </CardTitle>
          <CardDescription>
            {isBundle ? (
              <>
                Drag to reorder your preferred bundles. Each bundle contains multiple teams, 
                giving you broader exposure. The earlier you pay, the higher priority you get.
              </>
            ) : (
              <>
                Drag to reorder your preferred {splitData.formatType === "DIVISIONAL" ? "divisions" : "teams"}. 
                The earlier you pay, the higher priority you get for your preferences.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
            <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1">How Assignment Works</p>
              <p>
                {isBundle ? (
                  <>
                    When payment closes, we assign bundles in order of payment time. 
                    Each person receives one bundle containing multiple teams. Pay early 
                    to maximize your chances of getting your top picks!
                  </>
                ) : (
                  <>
                    When payment closes, we assign {splitData.formatType === "DIVISIONAL" ? "divisions" : "teams"} in order of payment time. 
                    Each person gets their highest-ranked available preference. Pay early 
                    to maximize your chances of getting your top picks!
                  </>
                )}
              </p>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={preferences}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {preferences.map((item, index) => (
                  <SortableItem 
                    key={item} 
                    id={item} 
                    index={index} 
                    isBundle={isBundle}
                    teams={isBundle ? getBundleTeams(item) : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() => saveMutation.mutate(preferences)}
              disabled={saveMutation.isPending || !hasChanges}
              className="flex-1"
              data-testid="button-save-preferences"
            >
              {saveMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Preferences
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPreferences([...assignmentPool]);
                setHasChanges(true);
              }}
              data-testid="button-reset-preferences"
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
