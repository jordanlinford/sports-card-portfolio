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
  X
} from "lucide-react";
import type { DisplayCaseWithCards, Card as CardType } from "@shared/schema";
import { CardDetailModal } from "@/components/card-detail-modal";

const DISPLAY_CASE_THEMES = [
  { id: "classic", name: "Classic", bg: "bg-background", description: "Clean and minimal" },
  { id: "dark-wood", name: "Dark Wood", bg: "bg-amber-950", description: "Rich wooden display" },
  { id: "velvet", name: "Velvet", bg: "bg-red-950", description: "Luxurious velvet backdrop" },
  { id: "midnight", name: "Midnight", bg: "bg-slate-900", description: "Sleek dark theme" },
  { id: "gallery", name: "Gallery", bg: "bg-neutral-100 dark:bg-neutral-800", description: "Museum style" },
] as const;

const updateCaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  isPublic: z.boolean(),
  theme: z.string().optional(),
  showCardCount: z.boolean(),
  showTotalValue: z.boolean(),
});

const addCardSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  set: z.string().max(255).optional(),
  year: z.coerce.number().min(1800).max(new Date().getFullYear() + 1).optional().or(z.literal("")),
  grade: z.string().max(50).optional(),
  purchasePrice: z.coerce.number().min(0).optional().or(z.literal("")),
  estimatedValue: z.coerce.number().min(0).optional().or(z.literal("")),
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
      <div className="aspect-square" onClick={onClick}>
        <img
          src={card.imagePath}
          alt={card.title}
          className="w-full h-full object-cover pointer-events-none"
        />
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

  const form = useForm<UpdateCaseFormData>({
    resolver: zodResolver(updateCaseSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: true,
      theme: "classic",
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
      grade: "",
      purchasePrice: "",
      estimatedValue: "",
    },
  });

  useEffect(() => {
    if (displayCase) {
      form.reset({
        name: displayCase.name,
        description: displayCase.description || "",
        isPublic: displayCase.isPublic,
        theme: displayCase.theme || "classic",
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                        {DISPLAY_CASE_THEMES.map((theme) => (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => field.onChange(theme.id)}
                            className={`relative p-4 rounded-lg border-2 text-left transition-colors ${
                              field.value === theme.id
                                ? "border-primary"
                                : "border-transparent hover:border-muted-foreground/30"
                            }`}
                            data-testid={`button-theme-${theme.id}`}
                          >
                            <div className={`w-full h-12 rounded-md ${theme.bg} mb-2 border`} />
                            <p className="text-sm font-medium">{theme.name}</p>
                            <p className="text-xs text-muted-foreground">{theme.description}</p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cards</CardTitle>
                <CardDescription>
                  {displayCase.cards?.length || 0} cards in this display case
                </CardDescription>
              </div>
              <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-add-card">
                    <Plus className="h-4 w-4" />
                    Add Card
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add New Card</DialogTitle>
                    <DialogDescription>
                      Upload an image and add details about your card
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...cardForm}>
                    <form onSubmit={cardForm.handleSubmit(handleAddCard)} className="space-y-4">
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
                                data-testid="input-card-title"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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

                      <DialogFooter>
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
      />
    </div>
  );
}
