import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, LayoutGrid, Globe, Lock, Copy, Check } from "lucide-react";
import { Link } from "wouter";
import type { Card as CardType } from "@shared/schema";

type CardWithCase = CardType & { displayCaseName: string };

const createCaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  isPublic: z.boolean().default(true),
});

type CreateCaseFormData = z.infer<typeof createCaseSchema>;

export default function CaseNew() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allCards } = useQuery<CardWithCase[]>({
    queryKey: ["/api/cards"],
    enabled: isAuthenticated,
  });

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

  const form = useForm<CreateCaseFormData>({
    resolver: zodResolver(createCaseSchema),
    defaultValues: {
      name: "",
      description: "",
      isPublic: true,
    },
  });

  const toggleCard = (cardId: number) => {
    setSelectedCardIds(prev => 
      prev.includes(cardId) 
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  };

  const groupedCards = allCards?.reduce((acc, card) => {
    if (!acc[card.displayCaseName]) {
      acc[card.displayCaseName] = [];
    }
    acc[card.displayCaseName].push(card);
    return acc;
  }, {} as Record<string, CardWithCase[]>) || {};

  const copyCardsMutation = useMutation({
    mutationFn: async ({ caseId, cardIds }: { caseId: number; cardIds: number[] }) => {
      await apiRequest("POST", `/api/display-cases/${caseId}/copy-cards`, { cardIds });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateCaseFormData) => {
      const response = await apiRequest("POST", "/api/display-cases", data);
      return response;
    },
    onSuccess: async (data: any) => {
      let copyFailed = false;
      if (selectedCardIds.length > 0) {
        try {
          await copyCardsMutation.mutateAsync({ caseId: data.id, cardIds: selectedCardIds });
        } catch (err) {
          copyFailed = true;
          toast({
            title: "Cards could not be imported",
            description: "Your portfolio was created but some cards failed to import. You can add them manually.",
            variant: "destructive",
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
      if (!copyFailed) {
        toast({
          title: "Portfolio created",
          description: selectedCardIds.length > 0 
            ? `Your portfolio is ready with ${selectedCardIds.length} imported card${selectedCardIds.length === 1 ? '' : 's'}!`
            : "Your new portfolio is ready. Start adding cards!",
        });
      }
      setLocation(`/cases/${data.id}/edit`);
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
      
      if (error.message.includes("limit")) {
        toast({
          title: "Portfolio limit reached",
          description: "Upgrade to Pro for unlimited portfolios.",
          variant: "destructive",
        });
        setLocation("/upgrade");
        return;
      }

      toast({
        title: "Error creating portfolio",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateCaseFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <LayoutGrid className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Create Portfolio</CardTitle>
              <CardDescription>
                Set up a new portfolio for your collection
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="My Rookie Cards"
                        {...field}
                        data-testid="input-case-name"
                      />
                    </FormControl>
                    <FormDescription>
                      Give your portfolio a memorable name
                    </FormDescription>
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
                        placeholder="A collection of my favorite rookie cards from the 90s..."
                        className="resize-none"
                        {...field}
                        data-testid="input-case-description"
                      />
                    </FormControl>
                    <FormDescription>
                      Tell visitors what makes this collection special
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {allCards && allCards.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">Import existing cards</p>
                      <p className="text-muted-foreground text-sm">
                        Copy cards from your other portfolios
                      </p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="gap-2"
                          data-testid="button-import-cards"
                        >
                          <Copy className="h-4 w-4" />
                          Select Cards
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>Import Cards</DialogTitle>
                          <DialogDescription>
                            Select cards to copy into your new portfolio
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[400px] pr-4">
                          <div className="space-y-6">
                            {Object.entries(groupedCards).map(([caseName, caseCards]) => (
                              <div key={caseName} className="space-y-2">
                                <h4 className="font-medium text-sm text-muted-foreground">{caseName}</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {caseCards.map((card) => (
                                    <div
                                      key={card.id}
                                      onClick={() => toggleCard(card.id)}
                                      className={`relative cursor-pointer rounded-lg border p-2 transition-colors hover-elevate ${
                                        selectedCardIds.includes(card.id) 
                                          ? "border-primary bg-primary/5" 
                                          : ""
                                      }`}
                                      data-testid={`card-select-${card.id}`}
                                    >
                                      {selectedCardIds.includes(card.id) && (
                                        <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                          <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                      )}
                                      <div className="aspect-[3/4] bg-muted rounded overflow-hidden mb-1">
                                        {card.imagePath ? (
                                          <img
                                            src={card.imagePath}
                                            alt={card.title}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <LayoutGrid className="h-6 w-6 text-muted-foreground/30" />
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-xs font-medium truncate">{card.title}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                        <div className="flex items-center justify-between pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            {selectedCardIds.length} card{selectedCardIds.length !== 1 ? 's' : ''} selected
                          </p>
                          <Button onClick={() => setDialogOpen(false)} data-testid="button-done-selecting">
                            Done
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {selectedCardIds.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-primary">
                      <Check className="h-4 w-4" />
                      {selectedCardIds.length} card{selectedCardIds.length !== 1 ? 's' : ''} will be imported
                    </div>
                  )}
                </div>
              )}

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
                        data-testid="switch-is-public"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-4">
                <Link href="/" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending}
                  data-testid="button-create-case-submit"
                >
                  {createMutation.isPending ? "Creating..." : "Create Display Case"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
