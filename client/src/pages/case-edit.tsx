import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Globe, 
  Lock, 
  Plus, 
  Trash2, 
  Eye,
  Upload,
  ImageIcon,
  Save,
  X,
  RefreshCw,
  Loader2
} from "lucide-react";
import type { DisplayCaseWithCards, Card as CardType } from "@shared/schema";
import { CardDetailModal } from "@/components/card-detail-modal";
import { Badge } from "@/components/ui/badge";
import { OutlookBadge } from "@/components/outlook-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Crown, AlertTriangle } from "lucide-react";
import { DISPLAY_CASE_THEMES } from "@/lib/themes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProFeatureGate } from "@/components/pro-feature-gate";

const LAYOUT_OPTIONS = [
  { id: "grid", name: "Grid", description: "Classic grid layout - cards displayed in rows and columns", icon: "grid" },
  { id: "row", name: "Row", description: "Horizontal scrolling row - great for smaller collections", icon: "row" },
  { id: "showcase", name: "Showcase", description: "Featured first card with smaller cards below", icon: "showcase" },
] as const;

const updateCaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  isPublic: z.boolean(),
  theme: z.string().optional(),
  layout: z.string().optional(),
  showCardCount: z.boolean(),
  showTotalValue: z.boolean(),
});

const addCardSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  set: z.string().max(255).optional(),
  year: z.coerce.number().min(1800).max(new Date().getFullYear() + 1).optional().or(z.literal("")),
  variation: z.string().max(255).optional(),
  grade: z.string().max(50).optional(),
  purchasePrice: z.coerce.number().min(0).optional().or(z.literal("")),
  estimatedValue: z.coerce.number().min(0).optional().or(z.literal("")),
  // Card category for outlook scoring
  cardCategory: z.enum(["sports", "tcg", "non_sport"]).default("sports"),
  // TCG/Non-Sport fields
  characterTier: z.string().optional(),
  rarityTier: z.string().optional(),
  eraPrestige: z.string().optional(),
  franchiseHeat: z.string().optional(),
});

type UpdateCaseFormData = z.infer<typeof updateCaseSchema>;
type AddCardFormData = z.infer<typeof addCardSchema>;

function SortableCardTile({ card, onDelete, onClick }: { card: CardType; onDelete: () => void; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative bg-muted rounded-lg overflow-hidden cursor-grab active:cursor-grabbing touch-none"
      data-testid={`card-tile-${card.id}`}
    >
      <div className="aspect-square relative" onClick={onClick}>
        <img
          src={card.imagePath}
          alt={card.title}
          className="w-full h-full object-cover pointer-events-none"
        />
        {card.outlookAction && (
          <div className="absolute top-1 left-1 pointer-events-none">
            <OutlookBadge action={card.outlookAction} size="sm" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white text-sm font-medium truncate">{card.title}</p>
          {card.estimatedValue && (
            <p className="text-white/80 text-xs">Est. ${card.estimatedValue.toFixed(2)}</p>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 w-8 h-8 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
        data-testid={`button-delete-card-${card.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function CaseEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showAddCard, setShowAddCard] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [duplicateCheckTitle, setDuplicateCheckTitle] = useState("");

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

  const { data: displayCase, isLoading } = useQuery<DisplayCaseWithCards>({
    queryKey: [`/api/display-cases/${id}`],
    enabled: isAuthenticated && !!id,
  });

  const { data: user } = useQuery<{ id: string; subscriptionStatus: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  const isPro = user?.subscriptionStatus === "PRO";

  // Duplicate detection - check when title changes
  const { data: duplicates } = useQuery<CardType[]>({
    queryKey: ["/api/cards/duplicates", duplicateCheckTitle],
    queryFn: async () => {
      const res = await fetch(`/api/cards/duplicates?title=${encodeURIComponent(duplicateCheckTitle)}`);
      if (!res.ok) throw new Error("Failed to check duplicates");
      return res.json();
    },
    enabled: isAuthenticated && duplicateCheckTitle.length >= 3,
  });

  const form = useForm<UpdateCaseFormData>({
    resolver: zodResolver(updateCaseSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: true,
      theme: "classic",
      layout: "grid",
      showCardCount: false,
      showTotalValue: false,
    },
  });

  const cardForm = useForm<AddCardFormData>({
    resolver: zodResolver(addCardSchema),
    defaultValues: {
      title: "",
      set: "",
      year: "",
      variation: "",
      grade: "",
      purchasePrice: "",
      estimatedValue: "",
      cardCategory: "sports",
      characterTier: "",
      rarityTier: "",
      eraPrestige: "",
      franchiseHeat: "",
    },
  });

  useEffect(() => {
    if (displayCase) {
      form.reset({
        name: displayCase.name,
        description: displayCase.description || "",
        isPublic: displayCase.isPublic,
        theme: displayCase.theme || "classic",
        layout: displayCase.layout || "grid",
        showCardCount: displayCase.showCardCount ?? false,
        showTotalValue: displayCase.showTotalValue ?? false,
      });
    }
  }, [displayCase, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateCaseFormData) => {
      return await apiRequest("PATCH", `/api/display-cases/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      toast({
        title: "Display case updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error updating display case",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const addCardMutation = useMutation({
    mutationFn: async (data: AddCardFormData & { imagePath: string }) => {
      const payload = {
        ...data,
        year: data.year === "" ? undefined : Number(data.year),
        purchasePrice: data.purchasePrice === "" ? undefined : Number(data.purchasePrice),
        estimatedValue: data.estimatedValue === "" ? undefined : Number(data.estimatedValue),
      };
      return await apiRequest("POST", `/api/display-cases/${id}/cards`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({
        title: "Card added",
        description: "Your card has been added to the display case.",
      });
      setShowAddCard(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      cardForm.reset();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error adding card",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: number) => {
      return await apiRequest("DELETE", `/api/display-cases/${id}/cards/${cardId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({
        title: "Card deleted",
        description: "The card has been removed from your display case.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error deleting card",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/display-cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      toast({
        title: "Display case deleted",
        description: "Your display case has been permanently deleted.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error deleting display case",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const refreshAllPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/display-cases/${id}/refresh-prices`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
      
      const updatedCount = data.results?.filter((r: any) => r.oldValue !== r.newValue).length || 0;
      toast({
        title: "Values Refreshed",
        description: `Processed ${data.cardsProcessed} cards. ${updatedCount} values updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh card values",
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (cardIds: number[]) => {
      return await apiRequest("POST", `/api/display-cases/${id}/cards/reorder`, { cardIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/display-cases/${id}`] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && displayCase?.cards) {
      const oldIndex = displayCase.cards.findIndex((c) => c.id === active.id);
      const newIndex = displayCase.cards.findIndex((c) => c.id === over.id);

      const newCards = arrayMove(displayCase.cards, oldIndex, newIndex);
      const cardIds = newCards.map((c) => c.id);
      reorderMutation.mutate(cardIds);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddCard = async (data: AddCardFormData) => {
    if (!selectedFile) {
      toast({
        title: "Image required",
        description: "Please select an image for your card.",
        variant: "destructive",
      });
      return;
    }

    try {
      const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = uploadUrlRes;

      await fetch(uploadURL, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type,
        },
      });

      const updateRes = await apiRequest("PUT", "/api/card-images", {
        cardImageURL: uploadURL,
      });

      addCardMutation.mutate({
        ...data,
        imagePath: updateRes.objectPath,
      });
    } catch (error) {
      toast({
        title: "Error uploading image",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-6 w-32 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!displayCase) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Display case not found</h2>
        <p className="text-muted-foreground mb-4">
          This display case doesn't exist or you don't have access to it.
        </p>
        <Link href="/">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <Link href={`/cases/${id}`}>
          <Button variant="outline" className="gap-2" data-testid="button-view-public">
            <Eye className="h-4 w-4" />
            View Public Page
          </Button>
        </Link>
      </div>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Display Case Details</CardTitle>
            <CardDescription>
              Update the name, description, and visibility of your display case
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-case-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          className="resize-none"
                          {...field}
                          data-testid="input-edit-case-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          {field.value ? (
                            <Globe className="h-4 w-4 text-primary" />
                          ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          )}
                          {field.value ? "Public" : "Private"}
                        </FormLabel>
                        <FormDescription>
                          {field.value
                            ? "Anyone with the link can view this display case"
                            : "Only you can see this display case"}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-is-public"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Theme</FormLabel>
                      <FormDescription>
                        Choose a background theme for your display case
                      </FormDescription>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                        {DISPLAY_CASE_THEMES.map((theme) => {
                          const buttonContent = (
                            <>
                              <div 
                                className="w-full h-12 rounded-md mb-2 border"
                                style={{ background: theme.preview }}
                              />
                              <p className="text-sm font-medium">{theme.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{theme.description}</p>
                            </>
                          );

                          const buttonClasses = `relative p-3 rounded-lg border-2 text-left transition-colors w-full ${
                            field.value === theme.id
                              ? "border-primary"
                              : "border-transparent hover:border-muted-foreground/30"
                          }`;

                          if (theme.isPremium) {
                            return (
                              <ProFeatureGate
                                key={theme.id}
                                isPro={isPro}
                                featureName="Premium Themes"
                                featureDescription="Unlock beautiful premium themes like velvet, wood, ocean, and more to make your display cases stand out."
                                onProClick={() => field.onChange(theme.id)}
                              >
                                <button
                                  type="button"
                                  className={buttonClasses}
                                  data-testid={`button-theme-${theme.id}`}
                                >
                                  {buttonContent}
                                </button>
                              </ProFeatureGate>
                            );
                          }

                          return (
                            <button
                              key={theme.id}
                              type="button"
                              onClick={() => field.onChange(theme.id)}
                              className={buttonClasses}
                              data-testid={`button-theme-${theme.id}`}
                            >
                              {buttonContent}
                            </button>
                          );
                        })}
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="layout"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Layout</FormLabel>
                      <FormDescription>
                        Choose how your cards are arranged in the display case
                      </FormDescription>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        {LAYOUT_OPTIONS.map((layout) => (
                          <button
                            key={layout.id}
                            type="button"
                            onClick={() => field.onChange(layout.id)}
                            className={`relative p-4 rounded-lg border-2 text-left transition-colors ${
                              field.value === layout.id
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/30"
                            }`}
                            data-testid={`button-layout-${layout.id}`}
                          >
                            <div className="w-full h-12 rounded-md bg-muted mb-2 flex items-center justify-center">
                              {layout.id === "grid" && (
                                <div className="grid grid-cols-3 gap-1 p-2">
                                  {[1,2,3,4,5,6].map(i => (
                                    <div key={i} className="w-2 h-3 bg-foreground/30 rounded-sm" />
                                  ))}
                                </div>
                              )}
                              {layout.id === "row" && (
                                <div className="flex gap-1 p-2">
                                  {[1,2,3,4].map(i => (
                                    <div key={i} className="w-3 h-4 bg-foreground/30 rounded-sm" />
                                  ))}
                                </div>
                              )}
                              {layout.id === "showcase" && (
                                <div className="flex flex-col items-center gap-1 p-2">
                                  <div className="w-4 h-5 bg-foreground/40 rounded-sm" />
                                  <div className="flex gap-0.5">
                                    {[1,2,3].map(i => (
                                      <div key={i} className="w-2 h-2.5 bg-foreground/20 rounded-sm" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-medium">{layout.name}</p>
                            <p className="text-xs text-muted-foreground">{layout.description}</p>
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Display Stats</h4>
                    <p className="text-sm text-muted-foreground">
                      Show collection statistics as a sub-header below the title
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="showCardCount"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Card Count</FormLabel>
                          <FormDescription>
                            Display total number of cards in the collection
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-card-count"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="showTotalValue"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Total Value</FormLabel>
                          <FormDescription>
                            Display estimated total value of the collection
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-total-value"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="gap-2"
                  data-testid="button-save-case"
                >
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>

            <Separator className="my-6" />

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this display case and all its cards
                </p>
              </div>
              <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2" data-testid="button-delete-case">
                    <Trash2 className="h-4 w-4" />
                    Delete Display Case
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Display Case</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete "{displayCase?.name}"? This will permanently remove the display case and all {displayCase?.cards?.length || 0} cards. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteConfirm(false)}
                      data-testid="button-cancel-delete"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => deleteCaseMutation.mutate()}
                      disabled={deleteCaseMutation.isPending}
                      data-testid="button-confirm-delete"
                    >
                      {deleteCaseMutation.isPending ? "Deleting..." : "Delete Forever"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Cards</CardTitle>
                <CardDescription>
                  {displayCase.cards?.length || 0} cards in this display case
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isPro && displayCase.cards && displayCase.cards.length > 0 && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => refreshAllPricesMutation.mutate()}
                    disabled={refreshAllPricesMutation.isPending}
                    data-testid="button-refresh-all-prices"
                  >
                    {refreshAllPricesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {refreshAllPricesMutation.isPending ? "Refreshing..." : "Refresh All Values"}
                  </Button>
                )}
                <Dialog open={showAddCard} onOpenChange={(open) => {
                  setShowAddCard(open);
                  if (!open) {
                    setDuplicateCheckTitle("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-add-card">
                      <Plus className="h-4 w-4" />
                      Add Card
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add New Card</DialogTitle>
                    <DialogDescription>
                      Upload an image and add details about your card
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...cardForm}>
                    <form onSubmit={cardForm.handleSubmit(handleAddCard)} className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      <div className="space-y-2">
                        <FormLabel>Card Image</FormLabel>
                        <div className="border-2 border-dashed rounded-lg p-4 text-center">
                          {previewUrl ? (
                            <div className="relative">
                              <img
                                src={previewUrl}
                                alt="Preview"
                                className="max-h-48 mx-auto rounded-lg object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedFile(null);
                                  setPreviewUrl(null);
                                }}
                                className="absolute top-2 right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer block py-8">
                              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">
                                Click to upload or drag and drop
                              </p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                data-testid="input-card-image"
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <FormField
                        control={cardForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Michael Jordan Rookie Card"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setDuplicateCheckTitle(e.target.value);
                                }}
                                data-testid="input-card-title"
                              />
                            </FormControl>
                            <FormMessage />
                            {duplicates && duplicates.length > 0 && (
                              <Alert className="mt-2 py-2">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                  Possible duplicate: You already have {duplicates.length} card{duplicates.length > 1 ? 's' : ''} with a similar title
                                  {duplicates.length <= 3 && (
                                    <span className="block text-muted-foreground mt-1">
                                      {duplicates.slice(0, 3).map(d => d.title).join(", ")}
                                    </span>
                                  )}
                                </AlertDescription>
                              </Alert>
                            )}
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={cardForm.control}
                        name="cardCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Card Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-card-category">
                                  <SelectValue placeholder="Select card type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="sports">Sports Card</SelectItem>
                                <SelectItem value="tcg">TCG (Pokemon, MTG, etc.)</SelectItem>
                                <SelectItem value="non_sport">Non-Sport (Marvel, Star Wars, etc.)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              Affects how Card Outlook AI analyzes this card
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {(cardForm.watch("cardCategory") === "tcg" || cardForm.watch("cardCategory") === "non_sport") && (
                        <div className="space-y-4 p-3 rounded-md bg-muted/50">
                          <p className="text-xs text-muted-foreground font-medium">TCG / Non-Sport Details (for AI Outlook)</p>
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={cardForm.control}
                              name="characterTier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Character Tier</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-character-tier">
                                        <SelectValue placeholder="Select tier" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="S_TIER_ICON">S-Tier Icon (Charizard, Pikachu)</SelectItem>
                                      <SelectItem value="A_TIER_FAVORITE">A-Tier Fan Favorite</SelectItem>
                                      <SelectItem value="B_TIER_POPULAR">B-Tier Popular</SelectItem>
                                      <SelectItem value="C_TIER_NICHE">C-Tier Niche</SelectItem>
                                      <SelectItem value="D_TIER_COMMON">D-Tier Common</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="rarityTier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Rarity</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-rarity-tier">
                                        <SelectValue placeholder="Select rarity" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="SECRET_RARE">Secret Rare / Alt Art</SelectItem>
                                      <SelectItem value="ULTRA_RARE">Ultra Rare / Full Art</SelectItem>
                                      <SelectItem value="RARE_HOLO">Rare Holo</SelectItem>
                                      <SelectItem value="RARE">Rare</SelectItem>
                                      <SelectItem value="UNCOMMON">Uncommon</SelectItem>
                                      <SelectItem value="COMMON">Common</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="eraPrestige"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Era</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-era-prestige">
                                        <SelectValue placeholder="Select era" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="VINTAGE_WOTC">Vintage (WotC 1999-2003)</SelectItem>
                                      <SelectItem value="EARLY_MODERN">Early Modern (2004-2015)</SelectItem>
                                      <SelectItem value="MODERN">Modern (2016+)</SelectItem>
                                      <SelectItem value="SPECIAL_SET">Special Set</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={cardForm.control}
                              name="franchiseHeat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">IP Popularity</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-franchise-heat">
                                        <SelectValue placeholder="Select heat" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="HOT">Hot (new releases, movies)</SelectItem>
                                      <SelectItem value="STABLE">Stable</SelectItem>
                                      <SelectItem value="COOLING">Cooling (declining interest)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={cardForm.control}
                          name="set"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Set (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Fleer"
                                  {...field}
                                  data-testid="input-card-set"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="year"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Year (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="1986"
                                  {...field}
                                  data-testid="input-card-year"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={cardForm.control}
                        name="variation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Variation (optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Cracked Ice 1/10"
                                {...field}
                                data-testid="input-card-variation"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={cardForm.control}
                          name="grade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Grade (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="PSA 10"
                                  {...field}
                                  data-testid="input-card-grade"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="purchasePrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Purchase Price</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="100.00"
                                  {...field}
                                  data-testid="input-card-purchase-price"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={cardForm.control}
                          name="estimatedValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Est. Value</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="500.00"
                                  {...field}
                                  data-testid="input-card-estimated-value"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      </div>

                      <DialogFooter className="mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowAddCard(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={addCardMutation.isPending || !selectedFile}
                          data-testid="button-submit-card"
                        >
                          {addCardMutation.isPending ? "Adding..." : "Add Card"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!displayCase.cards || displayCase.cards.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start building your display case by adding your first card.
                </p>
                <Button onClick={() => setShowAddCard(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Card
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayCase.cards.map((c) => c.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {displayCase.cards.map((card) => (
                      <SortableCardTile
                        key={card.id}
                        card={card}
                        onDelete={() => deleteCardMutation.mutate(card.id)}
                        onClick={() => setSelectedCard(card)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      </div>

      <CardDetailModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        displayCaseId={parseInt(id || "0")}
        canEdit={true}
        isPro={isPro}
      />
    </div>
  );
}
