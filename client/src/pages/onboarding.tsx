import { useState, useCallback, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { formatEnumLabel } from "@/lib/formatEnum";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, 
  ImageIcon, 
  Check,
  Copy,
  Clock,
  ArrowRight,
  ArrowLeft,
  Plus,
  ExternalLink,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Brain,
  Eye,
  ChevronRight,
  LayoutGrid,
  Search,
  Star,
  Target,
  Flame,
  Thermometer,
  Snowflake,
  Minus,
  Activity,
  AlertTriangle,
  ShoppingCart,
  Ban,
  Loader2,
  BookmarkPlus
} from "lucide-react";
import { DISPLAY_CASE_THEMES } from "@/lib/themes";
import { trackEvent } from "@/lib/analytics";
import { hasProAccess } from "@shared/schema";
import type { DisplayCaseWithCards, Card as CardType, PlayerOutlookResponse, MarketTemperature, VolatilityLevel, RiskLevel, PlayerVerdict, VerdictModifier } from "@shared/schema";

const ONBOARDING_THEMES = DISPLAY_CASE_THEMES.filter(t => 
  ["classic", "velvet", "wood"].includes(t.id)
);

const POPULAR_PLAYERS = [
  { name: "Victor Wembanyama", sport: "basketball", label: "Wemby" },
  { name: "Patrick Mahomes", sport: "football", label: "Mahomes" },
  { name: "Shohei Ohtani", sport: "baseball", label: "Ohtani" },
  { name: "Anthony Edwards", sport: "basketball", label: "Ant-Man" },
  { name: "CJ Stroud", sport: "football", label: "CJ Stroud" },
  { name: "Luka Doncic", sport: "basketball", label: "Luka" },
];

function getTemperatureIcon(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return <Flame className="h-4 w-4" />;
    case "WARM": return <Thermometer className="h-4 w-4" />;
    case "NEUTRAL": return <Minus className="h-4 w-4" />;
    case "COOLING": return <Snowflake className="h-4 w-4" />;
    default: return null;
  }
}

function getTemperatureColor(temp: MarketTemperature) {
  switch (temp) {
    case "HOT": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "WARM": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "NEUTRAL": return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    case "COOLING": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function getVerdictIcon(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return <ShoppingCart className="h-5 w-5" />;
    case "MONITOR": return <Eye className="h-5 w-5" />;
    case "AVOID": return <Ban className="h-5 w-5" />;
    default: return null;
  }
}

function getVerdictColor(verdict: PlayerVerdict) {
  switch (verdict) {
    case "BUY": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
    case "MONITOR": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "AVOID": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getModifierColor(modifier: VerdictModifier) {
  switch (modifier) {
    case "Speculative": return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "Momentum": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "Value": return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    case "Long-Term": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "Late Cycle": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function PlayerSearchStep({ 
  onPlayerSelected 
}: { 
  onPlayerSelected: (playerName: string, sport: string) => void 
}) {
  const [playerName, setPlayerName] = useState("");
  const [sport, setSport] = useState("basketball");

  const handleSearch = () => {
    if (playerName.trim().length >= 2) {
      onPlayerSelected(playerName.trim(), sport);
    }
  };

  const handlePopularPlayer = (player: typeof POPULAR_PLAYERS[0]) => {
    setPlayerName(player.name);
    setSport(player.sport);
    onPlayerSelected(player.name, player.sport);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to Sports Card Portfolio
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-onboarding-title">
            Who do you want to check out?
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Get AI-powered investment analysis on any player. See if now is the time to buy, hold, or sell their cards.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter player name..."
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="h-12 text-lg"
                    data-testid="input-player-name"
                  />
                </div>
                <Select value={sport} onValueChange={setSport}>
                  <SelectTrigger className="w-36 h-12" data-testid="select-sport">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basketball">Basketball</SelectItem>
                    <SelectItem value="football">Football</SelectItem>
                    <SelectItem value="baseball">Baseball</SelectItem>
                    <SelectItem value="hockey">Hockey</SelectItem>
                    <SelectItem value="soccer">Soccer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleSearch} 
                className="w-full h-12 text-lg gap-2"
                disabled={playerName.trim().length < 2}
                data-testid="button-analyze-player"
              >
                <Search className="h-5 w-5" />
                Analyze Player
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mb-4">
          <p className="text-sm text-muted-foreground">Or pick a popular player</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {POPULAR_PLAYERS.map((player) => (
            <Button
              key={player.name}
              variant="outline"
              className="h-auto py-3 px-4 flex flex-col items-center gap-1"
              onClick={() => handlePopularPlayer(player)}
              data-testid={`button-popular-${player.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="font-medium">{player.label}</span>
              <span className="text-xs text-muted-foreground capitalize">{player.sport}</span>
            </Button>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-skip-onboarding">
              Skip for now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function PlayerOutlookStep({ 
  playerName, 
  sport,
  onBack,
  onContinue
}: { 
  playerName: string;
  sport: string;
  onBack: () => void;
  onContinue: (outlook: PlayerOutlookResponse) => void;
}) {
  const { toast } = useToast();
  const [outlookData, setOutlookData] = useState<PlayerOutlookResponse | null>(null);

  const { data: imageData } = useQuery({
    queryKey: ["/api/player-image", playerName, sport],
    queryFn: async () => {
      const res = await fetch(`/api/player-image?name=${encodeURIComponent(playerName)}&sport=${encodeURIComponent(sport)}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!playerName,
  });

  const outlookMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/player-outlook", { playerName, sport });
    },
    onSuccess: (data) => {
      setOutlookData(data);
      trackEvent("onboarding_outlook_loaded", "onboarding", "outlook");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to get player outlook";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    outlookMutation.mutate();
  }, [playerName, sport]);

  const initials = playerName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  if (outlookMutation.isPending) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-background py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                {imageData?.imageUrl && (
                  <AvatarImage src={imageData.imageUrl} alt={playerName} />
                )}
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-2xl font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
                <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2" data-testid="text-analyzing">
              Analyzing {playerName}...
            </h2>
            <p className="text-muted-foreground text-center max-w-md">
              Checking market trends, career outlook, and investment signals
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!outlookData) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-background py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <div className="text-center py-16">
            <p className="text-muted-foreground" data-testid="text-outlook-error">Failed to load outlook. Please try again.</p>
            <Button onClick={onBack} className="mt-4" data-testid="button-retry-player">Try another player</Button>
          </div>
        </div>
      </div>
    );
  }

  const { player, snapshot, verdict, thesis } = outlookData;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        <Card className="mb-6" data-testid="card-player-outlook">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              <Avatar className="h-16 w-16 border-2 border-primary/20" data-testid="avatar-player">
                {imageData?.imageUrl && (
                  <AvatarImage src={imageData.imageUrl} alt={player.name} />
                )}
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-xl font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-2xl font-bold" data-testid="text-player-name">{player.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{player.sport.toUpperCase()}</span>
                  {player.position && player.position.toUpperCase() !== "UNKNOWN" && (
                    <><span className="text-border">|</span><span>{player.position}</span></>
                  )}
                  {player.team && player.team.toUpperCase() !== "UNKNOWN" && (
                    <><span className="text-border">|</span><span>{player.team}</span></>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={`${getTemperatureColor(snapshot.temperature)} gap-1`} data-testid="badge-temperature">
                  {getTemperatureIcon(snapshot.temperature)}
                  {formatEnumLabel(snapshot.temperature)}
                </Badge>
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${getVerdictColor(verdict.action)} mb-4`} data-testid="verdict-container">
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`p-2 rounded-lg ${getVerdictColor(verdict.action)}`} data-testid="verdict-icon">
                  {getVerdictIcon(verdict.action)}
                </div>
                <span className="text-2xl font-bold" data-testid="text-verdict-action">{formatEnumLabel(verdict.action)}</span>
                {verdict.modifier && (
                  <Badge className={`${getModifierColor(verdict.modifier)} text-sm`} data-testid="badge-verdict-modifier">
                    {verdict.modifier}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-3" data-testid="text-verdict-summary">
                {verdict.summary}
              </p>
            </div>

            {thesis && thesis.length > 0 && (
              <div className="space-y-2" data-testid="section-key-insights">
                <p className="text-sm font-medium">Key Insights:</p>
                <ul className="space-y-1.5" data-testid="list-thesis">
                  {thesis.slice(0, 3).map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-thesis-${i}`}>
                      <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Button 
            size="lg" 
            className="w-full gap-2 text-lg py-6"
            onClick={() => onContinue(outlookData)}
            data-testid="button-track-player"
          >
            <BookmarkPlus className="h-5 w-5" />
            Track {player.name} in My Portfolio
          </Button>
          <Button 
            variant="outline"
            size="lg" 
            className="w-full gap-2"
            onClick={onBack}
            data-testid="button-try-another"
          >
            <Search className="h-5 w-5" />
            Check another player
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateCaseStep({ 
  playerName,
  sport,
  onBack
}: { 
  playerName: string;
  sport: string;
  onBack: () => void;
}) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; subscriptionStatus: string }>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });
  const isPro = hasProAccess(user);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [caseName, setCaseName] = useState(`${playerName} Cards`);
  const [selectedTheme, setSelectedTheme] = useState("classic");
  const [isDragOver, setIsDragOver] = useState(false);
  const [createdCase, setCreatedCase] = useState<DisplayCaseWithCards | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [step, setStep] = useState<"setup" | "success">("setup");

  const isValidName = caseName.length >= 2 && caseName.length <= 40;
  const canCreate = isValidName && !uploading;

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

  // Add to watchlist
  const [watchlistAdded, setWatchlistAdded] = useState(false);
  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      // Player key must match server normalization: all lowercase, no spaces/special chars
      const playerKey = `${sport.toLowerCase()}:${playerName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      return await apiRequest("POST", "/api/unified-watchlist", {
        itemType: "player",
        playerKey,
        playerName,
        sport,
        source: "onboarding",
      });
    },
    onSuccess: () => {
      setWatchlistAdded(true);
    },
    onError: (error: any) => {
      // Ignore "already exists" errors - still mark as added
      if (error?.message?.includes("already")) {
        setWatchlistAdded(true);
      } else {
        console.error("Failed to add to watchlist:", error);
      }
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      // First add to watchlist
      await addToWatchlistMutation.mutateAsync().catch(() => {});
      
      const displayCase = await apiRequest("POST", "/api/display-cases", {
        name: caseName,
        description: `${playerName} card collection`,
        isPublic: true,
        theme: selectedTheme,
        layout: "grid",
        showCardCount: true,
        showTotalValue: false,
      });

      // If we have an uploaded image, add a card
      if (uploadedImagePath) {
        await apiRequest("POST", `/api/display-cases/${displayCase.id}/cards`, {
          title: `${playerName} Card`,
          imagePath: uploadedImagePath,
        });
      }

      const completeCase = await apiRequest("GET", `/api/display-cases/${displayCase.id}`);
      return completeCase;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/display-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unified-watchlist"] });
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
              You're all set!
            </h1>
            <p className="text-muted-foreground" data-testid="text-success-message">
              {watchlistAdded ? `${playerName} is now on your watchlist and your display case is ready` : `Your ${playerName} display case is ready`}
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              {createdCase.cards?.[0]?.imagePath && (
                <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-4">
                  <img
                    src={createdCase.cards[0].imagePath}
                    alt={createdCase.name}
                    className="w-full h-full object-cover"
                    data-testid="img-onboarding-preview"
                  />
                </div>
              )}
              <h2 className="text-xl font-semibold mb-2" data-testid="text-created-case-name">
                {createdCase.name}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {createdCase.cards?.length || 0} {createdCase.cards?.length === 1 ? "card" : "cards"}
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
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-skip-onboarding">
              Skip for now
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-onboarding-title">
            Create your {playerName} case
          </h1>
          <p className="text-muted-foreground">
            Start tracking your {playerName} cards (upload is optional)
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Upload a card image (optional)
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
              Choose a theme
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {ONBOARDING_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`relative p-3 rounded-lg border-2 transition-colors ${
                    selectedTheme === theme.id
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  data-testid={`button-theme-${theme.id}`}
                >
                  <div 
                    className="aspect-video rounded mb-2"
                    style={{ background: theme.preview }}
                  />
                  <span className="text-xs font-medium">{theme.name}</span>
                  {selectedTheme === theme.id && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={() => createCaseMutation.mutate()}
            disabled={!canCreate || createCaseMutation.isPending}
            data-testid="button-create-case"
          >
            {createCaseMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Display Case
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<"search" | "outlook" | "create">("search");
  const [selectedPlayer, setSelectedPlayer] = useState<{ name: string; sport: string } | null>(null);
  const [outlookData, setOutlookData] = useState<PlayerOutlookResponse | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isAuthenticated, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handlePlayerSelected = (playerName: string, sport: string) => {
    setSelectedPlayer({ name: playerName, sport });
    setStep("outlook");
    trackEvent("onboarding_player_selected", "onboarding", "player_search");
  };

  const handleOutlookContinue = (outlook: PlayerOutlookResponse) => {
    setOutlookData(outlook);
    setStep("create");
    trackEvent("onboarding_outlook_continue", "onboarding", "outlook");
  };

  const handleBack = () => {
    if (step === "outlook") {
      setStep("search");
      setSelectedPlayer(null);
    } else if (step === "create") {
      setStep("outlook");
    }
  };

  if (step === "search") {
    return <PlayerSearchStep onPlayerSelected={handlePlayerSelected} />;
  }

  if (step === "outlook" && selectedPlayer) {
    return (
      <PlayerOutlookStep 
        playerName={selectedPlayer.name}
        sport={selectedPlayer.sport}
        onBack={handleBack}
        onContinue={handleOutlookContinue}
      />
    );
  }

  if (step === "create" && selectedPlayer) {
    return (
      <CreateCaseStep 
        playerName={selectedPlayer.name}
        sport={selectedPlayer.sport}
        onBack={handleBack}
      />
    );
  }

  return <PlayerSearchStep onPlayerSelected={handlePlayerSelected} />;
}
