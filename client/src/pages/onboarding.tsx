import { useState, useCallback, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  ImageIcon, 
  Check,
  Copy,
  Clock,
  ArrowRight,
  Plus,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Brain,
  Eye,
  ChevronRight,
  LayoutGrid
} from "lucide-react";
import { DISPLAY_CASE_THEMES } from "@/lib/themes";
import { trackEvent } from "@/lib/analytics";
import type { DisplayCaseWithCards, Card as CardType } from "@shared/schema";
import { ProFeatureGate } from "@/components/pro-feature-gate";
import { OutlookBadge } from "@/components/outlook-badge";

const ONBOARDING_THEMES = DISPLAY_CASE_THEMES.filter(t => 
  ["classic", "velvet", "wood"].includes(t.id)
);

type DemoCase = DisplayCaseWithCards & { ownerName: string; likeCount: number };

function DemoPortfolioCard({ card, onClick }: { card: CardType; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative text-left cursor-pointer transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg"
      data-testid={`card-demo-${card.id}`}
    >
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-2 shadow-lg">
        <div className="relative rounded overflow-hidden shadow-inner bg-black/20">
          <div style={{ paddingBottom: '140%' }} className="relative">
            <img
              src={card.imagePath || undefined}
              alt={card.title}
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          {card.outlookAction && (
            <div className="absolute top-1 left-1">
              <OutlookBadge action={card.outlookAction} size="sm" />
            </div>
          )}
        </div>
        <div className="mt-2 px-1">
          <p className="font-medium text-sm truncate text-white">{card.title}</p>
          {card.estimatedValue && (
            <p className="text-xs text-slate-400">${card.estimatedValue.toLocaleString()}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function DemoExploreStep({ onContinue }: { onContinue: () => void }) {
  const [, setLocation] = useLocation();
  
  const { data: trendingCases, isLoading } = useQuery<DemoCase[]>({
    queryKey: ["/api/explore/trending"],
  });

  const demoCase = trendingCases?.find(c => c.cards && c.cards.length >= 4);
  const previewCards = demoCase?.cards?.slice(0, 6) || [];

  const handleCardClick = (card: CardType) => {
    if (demoCase) {
      setLocation(`/case/${demoCase.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-background py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-5 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!demoCase) {
    onContinue();
    return null;
  }

  const cardsWithOutlooks = demoCase.cards?.filter(c => c.outlookAction) || [];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to Sports Card Portfolio
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-demo-title">
            See what your collection could look like
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore this sample portfolio to see AI-powered insights, investment verdicts, and more. 
            Then create your own in just one minute.
          </p>
        </div>

        <Card className="mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white" data-testid="text-demo-case-name">
                  {demoCase.name}
                </h2>
                <p className="text-slate-400 text-sm">by {demoCase.ownerName}</p>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <span className="flex items-center gap-1">
                  <LayoutGrid className="h-4 w-4" />
                  {demoCase.cards?.length || 0} cards
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 mb-4">
              {previewCards.map((card) => (
                <DemoPortfolioCard 
                  key={card.id} 
                  card={card} 
                  onClick={() => handleCardClick(card)}
                />
              ))}
            </div>

            {(demoCase.cards?.length || 0) > 6 && (
              <div className="text-center">
                <Link href={`/case/${demoCase.id}`}>
                  <Button variant="secondary" className="gap-2" data-testid="button-view-full-demo">
                    View all {demoCase.cards?.length} cards
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>

        {cardsWithOutlooks.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle>AI-Powered Investment Insights</CardTitle>
              </div>
              <CardDescription>
                Every card gets an AI analysis with buy/hold/sell recommendations based on real market data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {cardsWithOutlooks.slice(0, 3).map((card) => (
                  <div 
                    key={card.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="w-12 h-16 rounded overflow-hidden flex-shrink-0 bg-muted">
                      {card.imagePath && (
                        <img 
                          src={card.imagePath} 
                          alt={card.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{card.title}</p>
                      {card.outlookExplanationShort && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {card.outlookExplanationShort}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <OutlookBadge action={card.outlookAction!} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-4">
          <Button 
            size="lg" 
            className="w-full gap-2 text-lg py-6"
            onClick={onContinue}
            data-testid="button-start-collection"
          >
            <Plus className="h-5 w-5" />
            Start My Own Collection
          </Button>
          <Link href={`/case/${demoCase.id}`}>
            <Button variant="outline" size="lg" className="w-full gap-2" data-testid="button-explore-more">
              <Eye className="h-5 w-5" />
              Explore this portfolio first
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CreateCaseStep() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; subscriptionStatus: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });
  const isPro = user?.subscriptionStatus === "PRO";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [caseName, setCaseName] = useState("My First Case");
  const [selectedTheme, setSelectedTheme] = useState("classic");
  const [isDragOver, setIsDragOver] = useState(false);
  const [createdCase, setCreatedCase] = useState<DisplayCaseWithCards | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [step, setStep] = useState<"setup" | "success">("setup");

  const isValidName = caseName.length >= 2 && caseName.length <= 40;
  const canCreate = uploadedImagePath && isValidName && !uploading;

  const handleFileSelect = useCallback(async (file: File) => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    trackEvent("onboarding_upload_started", "onboarding", "upload");

    setUploading(true);
    try {
      const uploadUrlRes = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = uploadUrlRes;

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      const updateRes = await apiRequest("PUT", "/api/card-images", {
        cardImageURL: uploadURL,
      });

      setUploadedImagePath(updateRes.objectPath);
      trackEvent("onboarding_upload_success", "onboarding", "upload");
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Please try again.",
        variant: "destructive",
      });
      setSelectedFile(null);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedImagePath) {
        throw new Error("Please upload a card image first");
      }
      
      const displayCase = await apiRequest("POST", "/api/display-cases", {
        name: caseName,
        description: "",
        isPublic: true,
        theme: selectedTheme,
        layout: "grid",
        showCardCount: true,
        showTotalValue: false,
      });

      await apiRequest("POST", `/api/display-cases/${displayCase.id}/cards`, {
        title: "My First Card",
        imagePath: uploadedImagePath,
      });

      const completeCase = await apiRequest("GET", `/api/display-cases/${displayCase.id}`);
      return completeCase;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      setCreatedCase(data);
      setStep("success");
      trackEvent("onboarding_case_created", "onboarding", "create");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create case",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = useCallback(async () => {
    if (!createdCase) return;
    const link = `${window.location.origin}/case/${createdCase.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      trackEvent("onboarding_share_copied", "onboarding", "share");
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  }, [createdCase, toast]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/api/login";
    return null;
  }

  if (step === "success" && createdCase) {
    const shareLink = `${window.location.origin}/case/${createdCase.id}`;
    
    return (
      <div className="min-h-[calc(100vh-64px)] bg-background py-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-onboarding-success-title">
              Your display case is ready
            </h1>
            <p className="text-muted-foreground">
              Share your collection with the world
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-4">
                {createdCase.cards?.[0]?.imagePath && (
                  <img
                    src={createdCase.cards[0].imagePath}
                    alt={createdCase.name}
                    className="w-full h-full object-cover"
                    data-testid="img-onboarding-preview"
                  />
                )}
              </div>
              <h2 className="text-xl font-semibold mb-2" data-testid="text-created-case-name">
                {createdCase.name}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                1 card
              </p>

              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input
                  value={shareLink}
                  readOnly
                  className="flex-1 bg-transparent border-0 text-sm"
                  data-testid="input-share-link"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyLink}
                  data-testid="button-copy-link"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Link href={`/cases/${createdCase.id}/edit`}>
              <Button className="w-full gap-2" data-testid="button-add-more-cards">
                <Plus className="w-4 h-4" />
                Add more cards
              </Button>
            </Link>
            <Link href={`/case/${createdCase.id}`}>
              <Button variant="outline" className="w-full gap-2" data-testid="button-view-case">
                <ExternalLink className="w-4 h-4" />
                View my display case
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="w-full" data-testid="button-go-dashboard">
                Go to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background py-8">
      <div className="max-w-xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Setup: 1 minute</span>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-skip-onboarding">
              Skip for now
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-onboarding-title">
            Now add your first card
          </h1>
          <p className="text-muted-foreground">
            Upload a card to start getting AI-powered insights
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Upload a card image <span className="text-destructive">*</span>
            </Label>
            <div
              className={`relative border-2 border-dashed rounded-lg transition-colors ${
                isDragOver 
                  ? "border-primary bg-primary/5" 
                  : uploadedImagePath 
                    ? "border-primary/50 bg-primary/5" 
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              data-testid="dropzone-card-upload"
            >
              {previewUrl ? (
                <div className="relative aspect-square max-h-64 mx-auto">
                  <img
                    src={previewUrl}
                    alt="Card preview"
                    className="w-full h-full object-contain rounded-lg"
                    data-testid="img-upload-preview"
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Uploading...</span>
                      </div>
                    </div>
                  )}
                  {uploadedImagePath && !uploading && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center py-12 cursor-pointer">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    {uploading ? (
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm font-medium mb-1">
                    Drop your card image here
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, or WebP (max 10MB)
                  </p>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileInputChange}
                    className="sr-only"
                    data-testid="input-file-upload"
                  />
                </label>
              )}
            </div>
            {previewUrl && !uploading && (
              <div className="mt-2 text-center">
                <label className="text-sm text-primary cursor-pointer hover:underline">
                  Choose a different image
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileInputChange}
                    className="sr-only"
                    data-testid="input-file-change"
                  />
                </label>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="case-name" className="text-sm font-medium mb-2 block">
              Name your display case
            </Label>
            <Input
              id="case-name"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder="My First Case"
              maxLength={40}
              data-testid="input-case-name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {caseName.length}/40 characters
            </p>
          </div>

          <div>
            <Label className="text-sm font-medium mb-3 block">
              Pick a theme
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {ONBOARDING_THEMES.map((theme) => {
                const buttonContent = (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{ background: theme.preview }}
                    />
                    <div className="absolute inset-0 flex items-end justify-center p-2">
                      <span className="text-xs font-medium text-white drop-shadow-md">
                        {theme.name}
                      </span>
                    </div>
                    {selectedTheme === theme.id && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </>
                );

                const buttonClasses = `relative rounded-lg overflow-hidden aspect-square transition-all w-full ${
                  selectedTheme === theme.id
                    ? "ring-2 ring-primary ring-offset-2"
                    : "hover:ring-1 hover:ring-muted-foreground/50"
                }`;

                if (theme.isPremium) {
                  return (
                    <ProFeatureGate
                      key={theme.id}
                      isPro={isPro}
                      featureName="Premium Themes"
                      featureDescription="Unlock beautiful premium themes to make your display cases stand out."
                      onProClick={() => setSelectedTheme(theme.id)}
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
                    onClick={() => setSelectedTheme(theme.id)}
                    className={buttonClasses}
                    data-testid={`button-theme-${theme.id}`}
                  >
                    {buttonContent}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={!canCreate || createCaseMutation.isPending}
            onClick={() => createCaseMutation.mutate()}
            data-testid="button-create-case"
          >
            {createCaseMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create my display case
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<"demo" | "create">("demo");
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/api/login";
    return null;
  }

  if (currentStep === "demo") {
    return <DemoExploreStep onContinue={() => setCurrentStep("create")} />;
  }

  return <CreateCaseStep />;
}
