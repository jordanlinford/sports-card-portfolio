import { GoogleGenAI } from "@google/genai";
import type { MatchedAttributes, MatchSample, CardMatchConfidence, MatchConfidenceTier } from "@shared/schema";

// Gemini for all AI features
const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export function isRawCard(grade?: string | null, grader?: string | null): boolean {
  if (!grade && !grader) return true;
  const g = (grade || "").toLowerCase().trim();
  const gr = (grader || "").toLowerCase().trim();
  return g === "" || g === "raw" || g === "ungraded" || g === "raw/ungraded" || gr === "raw" || gr === "ungraded";
}

// Helper to get current date in YYYY-MM-DD format for GPT prompts
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper to get a recent date (for example purposes in prompts)
function getRecentDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

interface CardInfo {
  title: string;
  set?: string | null;
  year?: number | null;
  cardNumber?: string | null;
  variation?: string | null;
  grade?: string | null;
  grader?: string | null; // Separate grader field (PSA, BGS, SGC, CGC)
}

interface ParallelCompData {
  parallel: string;
  estimatedValue: number | null;
  salesFound: number;
  confidence: "high" | "medium" | "low";
}

interface OneOfOneProjection {
  isOneOfOne: boolean;
  projectedValue: number | null;
  multiplierUsed: number | null;
  baseParallel: string | null;
  baseParallelValue: number | null;
  parallelComps: ParallelCompData[];
  projectionMethod: string;
}

interface PriceLookupResult {
  estimatedValue: number | null;
  source: string;
  searchQuery: string;
  salesFound: number;
  confidence: "high" | "medium" | "low";
  details?: string;
  oneOfOneProjection?: OneOfOneProjection;
}

// Enhanced price data for Card Outlook AI 2.0
interface PricePoint {
  date: string;
  price: number;
  source: string;
  url?: string;
}

interface EnhancedPriceLookupResult {
  estimatedValue: number | null;
  pricePoints: PricePoint[];
  salesFound: number;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
  details?: string;
  rawSearchResults?: Array<{ title: string; snippet: string; link: string }>;
  matchConfidence?: CardMatchConfidence;
  usedLooseFallback?: boolean; // Track if we fell back to loose comps
}

// Match confidence attribute weights (sum = 1.0)
const MATCH_WEIGHTS = {
  player: 0.30,
  year: 0.15,
  set: 0.20,
  variation: 0.15,
  grade: 0.15,
  rookie: 0.05,
};

// Grader normalization weights (PSA is baseline)
const GRADER_WEIGHTS: Record<string, number> = {
  psa: 1.00,
  bgs: 0.95,
  sgc: 0.90,
  cgc: 0.80,
  raw: 0.65,
};

// Grade qualifiers that reduce value (ST = stain, OC = off-center, etc.)
const GRADE_QUALIFIERS = ["st", "oc", "mc", "mk", "pd"];
const QUALIFIER_GRADE_PENALTY = 1.5; // Downgrade by 1.5 grade points

// Insert/parallel keywords to exclude when user hasn't specified a variation
// These are expensive variants that should not match base card searches
// Keywords that indicate a premium/parallel card vs base
// NOTE: Avoid single colors (gold, blue, red) as they cause false positives on price guide pages
// that list all variants. Use specific parallel names instead.
const PREMIUM_VARIATION_KEYWORDS = [
  // Premium inserts (highly valuable)
  "downtown", "kaboom", "disco", "stained glass", "color blast", "genesis",
  // Prizm/Refractor family
  "prizm", "refractor", "superfractor", "xfractor", "atomic",
  // Autograph/Memorabilia
  "auto", "autograph", "signature", "patch", "relic", "jersey", "memorabilia",
  // Numbered cards (explicit indicators)
  "numbered /", "/10", "/25", "/50", "/75", "/99", "/100", "/149", "/199", "/250",
  "1/1", "one of one",
  // Short prints
  "ssp", "case hit",
  // Specific parallel names (avoid bare colors)
  "gold prizm", "silver prizm", "blue prizm", "red prizm", "green prizm",
  "gold refractor", "silver refractor", "gold parallel", "silver parallel",
  "gold label", "black label",
  "cracked ice", "ice prizm", "fast break", "velocity", "hyper",
  "cosmic", "no huddle", "my house", "fireworks",
  "black finite", "gold finite",
  // Insert sets
  "rookie kings", "lombardi bound"
];

// Retail sites that show asking prices, not sold prices - exclude these
const RETAIL_ASKING_PRICE_DOMAINS = [
  "cardcollector2.com",
  "gamestop.com",
  "target.com",
  "walmart.com",
  "amazon.com",
  "all-u-re.com",
  "fanatics.com",
  "fanaticscollect.com",
  "ardenfair.com",
  "solisdepot.com",
  "aokarate.com",
  "gorctrails.com",
];

// Check if a URL is from a retail site that shows asking prices (not sold)
function isRetailAskingPrice(url: string): boolean {
  const lower = url.toLowerCase();
  return RETAIL_ASKING_PRICE_DOMAINS.some(domain => lower.includes(domain));
}

// Check if a result is from a different set than specified
// e.g., "Donruss" vs "Donruss Optic" are different products
function isWrongSet(resultText: string, cardSet: string | null | undefined): boolean {
  if (!cardSet) return false;
  
  const resultLower = resultText.toLowerCase();
  const setLower = cardSet.toLowerCase();
  
  // If card is "Donruss" (not Optic), exclude results that mention "Donruss Optic"
  if (setLower === "donruss" && !setLower.includes("optic")) {
    if (resultLower.includes("donruss optic") || resultLower.includes("optic")) {
      return true;
    }
  }
  
  // If card is "Prizm" (not Select), exclude results mentioning "Select"
  if (setLower === "prizm" && !setLower.includes("select")) {
    if (resultLower.includes("select")) {
      return true;
    }
  }
  
  // If card is "Topps" (not Chrome), exclude results mentioning "Topps Chrome"
  if (setLower === "topps" && !setLower.includes("chrome")) {
    if (resultLower.includes("topps chrome") || resultLower.includes("chrome")) {
      return true;
    }
  }
  
  return false;
}

// Baseline price ranges for common base cards when no comps found
// Format: { sport: { modern: { set_type: { graded_10: range, graded_9: range, raw: range } } } }
const BASE_CARD_PRICE_BASELINES: Record<string, Record<string, { psa10: [number, number]; psa9: [number, number]; raw: [number, number] }>> = {
  football: {
    donruss: { psa10: [15, 40], psa9: [8, 20], raw: [2, 8] },
    prizm: { psa10: [25, 60], psa9: [12, 30], raw: [5, 15] },
    topps: { psa10: [20, 50], psa9: [10, 25], raw: [3, 10] },
    select: { psa10: [20, 45], psa9: [10, 22], raw: [4, 12] },
    mosaic: { psa10: [18, 40], psa9: [9, 20], raw: [3, 10] },
    chronicles: { psa10: [12, 30], psa9: [6, 15], raw: [2, 6] },
    optic: { psa10: [20, 50], psa9: [10, 25], raw: [4, 12] },
  },
  basketball: {
    prizm: { psa10: [30, 80], psa9: [15, 40], raw: [8, 20] },
    donruss: { psa10: [12, 35], psa9: [6, 18], raw: [2, 8] },
    topps: { psa10: [25, 60], psa9: [12, 30], raw: [5, 15] },
    select: { psa10: [25, 55], psa9: [12, 28], raw: [5, 15] },
    mosaic: { psa10: [20, 50], psa9: [10, 25], raw: [4, 12] },
    optic: { psa10: [25, 60], psa9: [12, 30], raw: [5, 15] },
    hoops: { psa10: [10, 25], psa9: [5, 12], raw: [1, 5] },
  },
  baseball: {
    topps: { psa10: [15, 40], psa9: [8, 20], raw: [2, 8] },
    bowman: { psa10: [20, 50], psa9: [10, 25], raw: [4, 12] },
    donruss: { psa10: [10, 30], psa9: [5, 15], raw: [2, 6] },
    prizm: { psa10: [20, 50], psa9: [10, 25], raw: [4, 12] },
  },
};

// Check if a result contains premium variation keywords
function containsPremiumVariation(text: string): boolean {
  const lower = text.toLowerCase();
  return PREMIUM_VARIATION_KEYWORDS.some(keyword => lower.includes(keyword));
}

// Get baseline price range for a base card
function getBaselinePrice(card: CardInfo): { low: number; high: number; mid: number } | null {
  // Only use baseline for cards without specified variation
  if (card.variation) return null;
  
  // Determine sport from set or title
  let sport = "football"; // default
  const setLower = (card.set || "").toLowerCase();
  const titleLower = card.title.toLowerCase();
  
  if (setLower.includes("hoops") || titleLower.includes("nba") || titleLower.includes("basketball")) {
    sport = "basketball";
  } else if (setLower.includes("topps") && !setLower.includes("football") && !setLower.includes("chrome")) {
    sport = "baseball";
  } else if (setLower.includes("bowman")) {
    sport = "baseball";
  }
  
  const sportBaselines = BASE_CARD_PRICE_BASELINES[sport];
  if (!sportBaselines) return null;
  
  // Find matching set
  let setKey: string | null = null;
  for (const key of Object.keys(sportBaselines)) {
    if (setLower.includes(key)) {
      setKey = key;
      break;
    }
  }
  
  if (!setKey) {
    // Default to donruss-like pricing
    setKey = "donruss";
  }
  
  const setBaseline = sportBaselines[setKey];
  if (!setBaseline) return null;
  
  // Determine grade tier
  const grade = (card.grade || "").toLowerCase();
  let priceRange: [number, number];
  
  if (grade.includes("10")) {
    priceRange = setBaseline.psa10;
  } else if (grade.includes("9")) {
    priceRange = setBaseline.psa9;
  } else {
    priceRange = setBaseline.raw;
  }
  
  return {
    low: priceRange[0],
    high: priceRange[1],
    mid: Math.round((priceRange[0] + priceRange[1]) / 2),
  };
}

// Extract card number from title (e.g., "#10", "#304")
function extractCardNumber(text: string): string | null {
  const match = text.match(/#(\d+)/);
  return match ? match[1] : null;
}

// Parse grade info: grader, numeric grade, and qualifiers
function parseGradeInfo(gradeStr: string | null | undefined): {
  grader: string | null;
  gradeNum: number | null;
  hasQualifier: boolean;
  qualifiers: string[];
} {
  if (!gradeStr) {
    return { grader: null, gradeNum: null, hasQualifier: false, qualifiers: [] };
  }
  
  const lower = gradeStr.toLowerCase();
  
  // Detect qualifiers like (ST), (OC), etc.
  const qualifiers: string[] = [];
  for (const q of GRADE_QUALIFIERS) {
    if (lower.includes(`(${q})`) || lower.includes(` ${q} `) || lower.endsWith(` ${q}`)) {
      qualifiers.push(q.toUpperCase());
    }
  }
  
  // Extract grader
  let grader: string | null = null;
  for (const g of ["psa", "bgs", "sgc", "cgc"]) {
    if (lower.includes(g)) {
      grader = g;
      break;
    }
  }
  
  // Extract numeric grade
  const gradeMatch = lower.match(/(\d+\.?\d*)/);
  const gradeNum = gradeMatch ? parseFloat(gradeMatch[1]) : null;
  
  return {
    grader,
    gradeNum,
    hasQualifier: qualifiers.length > 0,
    qualifiers,
  };
}

// Get effective grade after qualifier penalty
function getEffectiveGrade(gradeNum: number | null, hasQualifier: boolean): number | null {
  if (gradeNum === null) return null;
  if (hasQualifier) {
    return Math.max(1, gradeNum - QUALIFIER_GRADE_PENALTY);
  }
  return gradeNum;
}

// Check if card is vintage (pre-2000) - grader matching must be strict for vintage
function isVintageCard(card: CardInfo): boolean {
  if (!card.year) return false; // If no year, assume modern (less strict)
  return card.year < 2000;
}

// Check if listing is a STRICT comp (exact match, eligible to define value)
function isStrictComp(
  listingTitle: string,
  listingSnippet: string,
  card: CardInfo,
  listingUrl?: string
): { isStrict: boolean; excludeReason: string | null } {
  const combined = `${listingTitle} ${listingSnippet}`.toLowerCase();
  const url = (listingUrl || "").toLowerCase();
  
  // HARD GATE 0: Exclude marketplace aggregators that show mixed listings (not sold prices)
  // These sites show multiple cards with different graders/conditions on one page
  if (url.includes("comc.com")) {
    return { isStrict: false, excludeReason: "COMC marketplace shows mixed listings, not reliable comps" };
  }
  
  // HARD GATE 0.5: Set prefix mismatches - "Clearly Donruss" vs "Donruss" are DIFFERENT products
  const setLower = (card.set || "").toLowerCase();
  const hasClearlyPrefix = combined.includes("clearly");
  const cardIsClearly = setLower.includes("clearly");
  if (hasClearlyPrefix && !cardIsClearly) {
    return { isStrict: false, excludeReason: "Set mismatch: 'Clearly Donruss' vs regular 'Donruss'" };
  }
  if (cardIsClearly && !hasClearlyPrefix) {
    return { isStrict: false, excludeReason: "Set mismatch: regular 'Donruss' vs 'Clearly Donruss'" };
  }
  
  // HARD GATE 1: Card number must match exactly if both have one
  // Use explicit cardNumber field if provided, otherwise extract from title
  const cardNumber = card.cardNumber || extractCardNumber(card.title);
  const listingNumber = extractCardNumber(listingTitle) || extractCardNumber(listingSnippet);
  
  if (cardNumber && listingNumber && cardNumber !== listingNumber) {
    return { isStrict: false, excludeReason: `Card number mismatch: #${cardNumber} vs #${listingNumber}` };
  }
  
  // HARD GATE 2: Qualifier comps are not strict
  const listingGrade = parseGradeInfo(combined);
  if (listingGrade.hasQualifier) {
    return { isStrict: false, excludeReason: `Has qualifier: ${listingGrade.qualifiers.join(", ")}` };
  }
  
  // HARD GATE 2.5: RAW listings don't match GRADED cards (and vice versa)
  const cardGrade = parseGradeInfo(card.grade);
  // Assume PSA if grade is just a number like "10" (most common grader)
  const effectiveCardGrader = card.grader?.toLowerCase() || cardGrade.grader || 
    (card.grade && /^\d+\.?\d*$/.test(card.grade.trim()) ? "psa" : null);
  const cardWantsGraded = effectiveCardGrader || (card.grade && /\d/.test(card.grade));
  
  // Check if the user's card is explicitly RAW/ungraded
  // Only treat as RAW if explicitly marked "raw" or has no grade AND no grader
  // Cards with grades like "NM", "Mint" without a grader are ambiguous - don't filter
  const graderLower = card.grader?.toLowerCase() || "";
  const gradeLower = card.grade?.toLowerCase() || "";
  const cardIsExplicitlyRaw = 
    graderLower === "raw" || 
    gradeLower === "raw" ||
    graderLower === "ungraded" ||
    gradeLower === "ungraded";
  // Only treat as raw if explicitly marked OR completely empty (no grade/grader at all)
  const cardIsRaw = cardIsExplicitlyRaw || (!card.grade && !card.grader);
  
  // CASE A: User wants GRADED, reject RAW listings
  if (cardWantsGraded && !cardIsRaw) {
    // Raw/ungraded detection keywords - ONLY explicit indicators
    const rawKeywords = [
      "raw condition", "raw card", "in raw", " raw ", "ungraded", 
      "not graded", "no grade"
    ];
    const hasRawKeyword = rawKeywords.some(kw => combined.includes(kw));
    const hasAnyGraderMention = ["psa", "bgs", "sgc", "cgc"].some(g => combined.includes(g));
    
    // If listing explicitly mentions "raw" AND no grader mentioned, reject
    if (hasRawKeyword && !hasAnyGraderMention) {
      return { isStrict: false, excludeReason: "RAW listing - user wants graded card" };
    }
    
    // If listing has no detected grader and user wants graded, it's likely raw
    if (!listingGrade.grader && effectiveCardGrader) {
      const graderInText = combined.includes(effectiveCardGrader);
      if (!graderInText) {
        return { isStrict: false, excludeReason: `No grader detected - user wants ${effectiveCardGrader.toUpperCase()} graded` };
      }
    }
  }
  
  // CASE B: User has RAW card, reject GRADED listings (PSA 10, BGS 9.5, etc.)
  // This prevents raw cards from getting inflated PSA 10 prices
  if (cardIsRaw) {
    const listingHasGrader = listingGrade.grader || ["psa", "bgs", "sgc", "cgc"].some(g => combined.includes(g));
    const listingHasGrade = /\b(psa|bgs|sgc|cgc)\s*\d+/i.test(combined) || /\b(gem\s*mint|mint)\s*\d+\b/i.test(combined);
    
    if (listingHasGrader || listingHasGrade) {
      return { isStrict: false, excludeReason: "GRADED listing - user has RAW card" };
    }
  }
  
  // HARD GATE 3: Grader must match for strict comp
  // VINTAGE (pre-2000): ALWAYS require exact grader match - PSA 9 vs PSA 10 can be thousands different
  // MODERN (2000+): Allow grader mismatch as loose comp (less price variance between graders)
  const isVintage = isVintageCard(card);
  
  if (effectiveCardGrader && listingGrade.grader && effectiveCardGrader !== listingGrade.grader) {
    if (isVintage) {
      // Vintage: strict grader match required - reject as non-comp entirely
      return { isStrict: false, excludeReason: `Vintage card grader mismatch: ${effectiveCardGrader.toUpperCase()} vs ${listingGrade.grader.toUpperCase()}` };
    } else {
      // Modern: allow as loose comp
      return { isStrict: false, excludeReason: `Grader mismatch (modern): ${effectiveCardGrader.toUpperCase()} vs ${listingGrade.grader.toUpperCase()}` };
    }
  }
  
  // HARD GATE 4: Variation/parallel mismatch - base cards should not match parallels
  // This is critical for pricing accuracy - all keywords must be lowercase for matching
  const parallelKeywords = [
    // Numbered parallels (most reliable indicator)
    "/10", "/15", "/25", "/35", "/49", "/50", "/75", "/99", "/100", "/149", "/150", "/175", "/199", "/250", "/299", "/349", "/399", "/499", "/599", "/749", "/799", "/999",
    "1/1", "one of one", "1 of 1",
    // Refractor/Prizm family
    "refractor", "prizm", "opti-chrome", "superfractor", "x-fractor", "xfractor", "atomic", "pulsar",
    // Autographs
    "auto", "autograph", "signature", "signed", "on-card auto", "on card auto",
    // Holo/Shimmer family  
    "holo", "holographic", "holofoil", "holo flash",
    "shimmer", "wave", "mojo", "kaboom", "downtown", "uptown", "disco",
    // NOTE: Removed bare "ice" - it matches "price" as substring! Use specific terms only
    "cracked ice", "ice prizm", "ice parallel", "fractured", "shock", "sparkle", "white sparkle", "red sparkle",
    "velocity", "hyper", "scope", "fast break", "neon", "laser", "fluorescent", "seismic",
    // Donruss Press Proofs and Optic variants
    "press proof", "blue press proof", "red press proof", "stat line", "season stat line",
    "optic", "donruss optic", "optic preview", "canvas",
    // Color parallels (Donruss Optic specific)
    "red yellow", "red/yellow", "red & yellow", "red and yellow", "red white blue", "rwb",
    // Color parallels - explicit parallel terms
    "gold parallel", "silver parallel", "red parallel", "blue parallel", "green parallel",
    "orange parallel", "purple parallel", "pink parallel", "black parallel", "white parallel",
    "neon green", "neon orange", "neon pink", "neon blue",
    // Premium colors (these are almost always parallels when in card titles)
    "sapphire", "ruby", "emerald", "platinum", "bronze", "copper", "peacock",
    // Mosaic/Panini specific
    "mosaic", "camo", "reactive", "genesis", "reactive blue", "reactive gold",
    "asia exclusive", "choice prizm", "mega box", "blaster exclusive",
    // Topps specific
    "sepia", "negative", "sp image", "photo variation",
    // Other parallels
    "silhouettes", "reverse holo", "full art", "secret rare", "ultra rare", "rainbow rare", "alt art",
    // Relics/Memorabilia
    "patch", "jersey", "relic", "game-used", "game used", "memorabilia", "swatch",
    // Inserts/Short prints
    "insert", "ssp", "case hit", "short print",
  ];
  
  // IMPORTANT: Filter out parallel keywords that match the card's set name
  // e.g., "Mosaic" is both a set name AND a parallel type - if set is Mosaic, don't flag "mosaic" as parallel
  const setNameLower = (card.set || "").toLowerCase();
  const filteredParallelKeywords = parallelKeywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    // If the keyword appears in the set name, don't use it for parallel detection
    return !setNameLower.includes(kwLower);
  });
  
  const listingHasParallel = filteredParallelKeywords.some(kw => combined.includes(kw.toLowerCase()));
  const userSpecifiedVariation = card.variation && card.variation.trim().length > 0;
  
  // These "variations" are actually just base subset names, NOT premium parallels
  // They should be treated as base cards for matching purposes
  const baseSubsetNames = [
    "rated rookie", "rr", "rookie", "rc", "base", "base set",
    "rookie card", "1st edition", "first edition",
  ];
  const variationLower = (card.variation || "").toLowerCase().trim();
  const isBaseSubsetName = baseSubsetNames.some(name => variationLower.includes(name) || variationLower === name);
  
  // Treat base subset names as equivalent to no variation
  const effectivelyHasVariation = userSpecifiedVariation && !isBaseSubsetName;
  
  if (!effectivelyHasVariation && listingHasParallel) {
    // User wants base card but listing is a parallel - not strict
    const detectedParallel = filteredParallelKeywords.find(kw => combined.includes(kw.toLowerCase()));
    return { isStrict: false, excludeReason: `Base card vs parallel mismatch: listing has "${detectedParallel}"` };
  }
  
  if (effectivelyHasVariation && !listingHasParallel) {
    // Check if listing contains the user's variation name (for insert sets like "Bomb Squad", "Downtown", etc.)
    const variationLowerCheck = (card.variation || "").toLowerCase().trim();
    if (variationLowerCheck && combined.includes(variationLowerCheck)) {
      // Listing has the variation name, so it's a match even without parallel keywords
      // This handles insert sets that aren't color parallels
    } else {
      // User wants specific parallel but listing appears to be base card - not strict
      return { isStrict: false, excludeReason: `Parallel "${card.variation}" vs base card mismatch` };
    }
  }
  
  return { isStrict: true, excludeReason: null };
}

// Extract player name from card title (first 2-3 words typically)
function extractPlayerName(title: string): string {
  const cleanTitle = title.replace(/#\d+/g, "").trim();
  const words = cleanTitle.split(/\s+/);
  // Most player names are 2-3 words
  return words.slice(0, 3).join(" ").toLowerCase();
}

// Normalize text for comparison
function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Check if text contains any variation of a search term
function containsTerm(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const normalized = normalizeText(needle);
  const haystackNorm = normalizeText(haystack);
  const terms = normalized.split(/\s+/).filter(t => t.length > 2);
  return terms.some(term => haystackNorm.includes(term));
}

// Compute match score for a single listing against the card
function computeListingMatchScore(
  listingTitle: string,
  listingSnippet: string,
  card: CardInfo
): { score: number; matched: MatchedAttributes } {
  const combined = `${listingTitle} ${listingSnippet}`.toLowerCase();
  
  const matched: MatchedAttributes = {
    player: false,
    year: false,
    set: false,
    variation: false,
    grade: false,
    rookie: false,
  };

  // Player match - check if player name appears in listing
  const playerName = extractPlayerName(card.title);
  const playerNameParts = playerName.split(/\s+/).filter(p => p.length > 2);
  const playerMatches = playerNameParts.filter(part => combined.includes(part)).length;
  matched.player = playerMatches >= Math.min(2, playerNameParts.length);

  // Year match - exact year, multi-year format (2018-19), or ±1 tolerance
  let yearScore = 0;
  if (card.year) {
    const yearStr = String(card.year);
    const yearNum = card.year;
    const prevYear = String(yearNum - 1);
    const nextYear = String(yearNum + 1);
    
    // Multi-year format check (e.g., "2018-19" contains both 2018 and 2019)
    const multiYearPattern = new RegExp(`(${prevYear}|${yearStr})[\\-/](${yearStr.slice(-2)}|${nextYear.slice(-2)})`);
    
    if (combined.includes(yearStr)) {
      yearScore = 1.0; // Exact match
    } else if (multiYearPattern.test(combined)) {
      yearScore = 1.0; // Multi-year format containing the year
    } else if (combined.includes(prevYear) || combined.includes(nextYear)) {
      yearScore = 0.7; // ±1 year tolerance gets partial credit
    }
    matched.year = yearScore > 0;
  } else {
    yearScore = 1.0;
    matched.year = true; // No year to match
  }

  // Set match - check if set name appears
  if (card.set) {
    const setTerms = normalizeText(card.set).split(/\s+/).filter(t => t.length > 2);
    const setMatches = setTerms.filter(term => combined.includes(term)).length;
    matched.set = setMatches >= Math.ceil(setTerms.length * 0.6);
  } else {
    matched.set = true; // No set to match
  }

  // Variation match - critical for parallels like Refractor, Prizm, /25, Auto
  if (card.variation) {
    const variationLower = card.variation.toLowerCase();
    // Check for exact variation terms
    const variationTerms = variationLower.split(/[\s\/]+/).filter(t => t.length > 1);
    const variationMatches = variationTerms.filter(term => combined.includes(term)).length;
    matched.variation = variationMatches >= Math.ceil(variationTerms.length * 0.5);
    
    // Strict check for numbered parallels (/25, /99, etc.)
    const numberedMatch = variationLower.match(/\/(\d+)/);
    if (numberedMatch) {
      matched.variation = combined.includes(numberedMatch[0]) || combined.includes(`/${numberedMatch[1]}`);
    }
  } else {
    // No variation specified - penalize if listing has a parallel/variation keyword
    // Matching the isStrictComp function - all keywords lowercase
    const parallelKeywords = [
      // Numbered parallels (most reliable indicator)
      "/10", "/15", "/25", "/35", "/49", "/50", "/75", "/99", "/100", "/149", "/150", "/175", "/199", "/250", "/299", "/349", "/399", "/499", "/599", "/749", "/799", "/999",
      "1/1", "one of one", "1 of 1",
      // Refractor/Prizm family
      "refractor", "prizm", "opti-chrome", "superfractor", "x-fractor", "xfractor", "atomic", "pulsar",
      // Autographs
      "auto", "autograph", "signature", "signed", "on-card auto", "on card auto",
      // Holo/Shimmer family  
      "holo", "holographic", "holofoil", "holo flash",
      "shimmer", "wave", "mojo", "kaboom", "downtown", "uptown", "disco",
      "ice", "cracked ice", "fractured", "shock", "sparkle", "white sparkle", "red sparkle",
      "velocity", "hyper", "scope", "fast break", "flash", "neon", "laser", "fluorescent", "seismic",
      // Color parallels (Donruss Optic specific)
      "red yellow", "red/yellow", "red & yellow", "red and yellow", "red white blue", "rwb",
      // Color parallels - explicit parallel terms
      "gold parallel", "silver parallel", "red parallel", "blue parallel", "green parallel",
      "orange parallel", "purple parallel", "pink parallel", "black parallel", "white parallel",
      "neon green", "neon orange", "neon pink", "neon blue",
      // Premium colors (these are almost always parallels when in card titles)
      "sapphire", "ruby", "emerald", "platinum", "bronze", "copper", "peacock",
      // Mosaic/Panini specific
      "mosaic", "camo", "reactive", "genesis", "reactive blue", "reactive gold",
      "asia exclusive", "choice prizm", "mega box", "blaster exclusive",
      // Topps specific
      "sepia", "negative", "sp image", "photo variation",
      // Other parallels
      "silhouettes", "reverse holo", "full art", "secret rare", "ultra rare", "rainbow rare", "alt art", "alternate art",
      // Relics/Memorabilia
      "patch", "jersey", "relic", "game-used", "game used", "memorabilia", "swatch",
      // Inserts/Short prints
      "insert", "ssp", "case hit", "short print",
    ];
    // Also check for standalone color words that indicate parallels when near "parallel" or after set name
    const colorParallels = ["red", "blue", "green", "gold", "silver", "pink", "purple", "orange", "yellow", "black", "white"];
    const combinedLower = combined.toLowerCase();
    
    // Check for explicit parallel keywords first
    let hasParallel = parallelKeywords.some(kw => combinedLower.includes(kw.toLowerCase()));
    
    // Check for color + parallel context (e.g., "red parallel", "gold /99", "blue prizm")
    if (!hasParallel) {
      for (const color of colorParallels) {
        // Check if color appears near parallel-indicating words
        if (combinedLower.includes(color)) {
          const colorRegex = new RegExp(`${color}\\s*(parallel|prizm|refractor|wave|shimmer|/\\d+|\\d+/\\d+)`, 'i');
          if (colorRegex.test(combinedLower)) {
            hasParallel = true;
            break;
          }
        }
      }
    }
    
    matched.variation = !hasParallel; // True if base card, false if listing has parallel
  }

  // Grade match - PSA 10, BGS 9.5, etc. with near-grade equivalence
  let gradeScore = 0;
  if (card.grade) {
    const gradeLower = card.grade.toLowerCase();
    
    // Extract grader and numeric grade from card
    const cardGradeMatch = gradeLower.match(/(psa|bgs|sgc|cgc)?\s*(\d+\.?\d*)/);
    const cardGrader = cardGradeMatch?.[1] || "";
    const cardGradeNum = cardGradeMatch?.[2] ? parseFloat(cardGradeMatch[2]) : null;
    
    // Check for exact match first
    if (combined.includes(gradeLower)) {
      gradeScore = 1.0;
    } else if (cardGradeNum !== null) {
      // Near-grade equivalence table for top grades
      // PSA 10 ~ BGS 9.5 ~ SGC 10 (gem mint equivalents)
      const gemMintGrades = [
        { grader: "psa", score: 10 },
        { grader: "bgs", score: 9.5 },
        { grader: "sgc", score: 10 },
        { grader: "cgc", score: 10 },
      ];
      
      const nearMintGrades = [
        { grader: "psa", score: 9 },
        { grader: "bgs", score: 9 },
        { grader: "sgc", score: 9.5 },
        { grader: "cgc", score: 9 },
      ];
      
      // Check if card grade is in gem mint tier
      const isCardGemMint = gemMintGrades.some(g => 
        (cardGrader === g.grader || !cardGrader) && cardGradeNum === g.score
      );
      
      // Check if card grade is in near mint tier
      const isCardNearMint = nearMintGrades.some(g => 
        (cardGrader === g.grader || !cardGrader) && cardGradeNum === g.score
      );
      
      // Check what grades are in the listing
      const listingHasGemMint = gemMintGrades.some(g => 
        combined.includes(`${g.grader} ${g.score}`) || combined.includes(`${g.grader}${g.score}`)
      );
      const listingHasNearMint = nearMintGrades.some(g => 
        combined.includes(`${g.grader} ${g.score}`) || combined.includes(`${g.grader}${g.score}`)
      );
      
      // Exact grader + score match
      if (cardGrader && combined.includes(cardGrader) && combined.includes(String(cardGradeNum))) {
        gradeScore = 1.0;
      }
      // Cross-grader equivalence (gem mint tier)
      else if (isCardGemMint && listingHasGemMint) {
        gradeScore = 0.75; // Partial credit for equivalent gem mint grades across graders
      }
      // Cross-grader equivalence (near mint tier)
      else if (isCardNearMint && listingHasNearMint) {
        gradeScore = 0.75;
      }
      // Same grader, slightly different grade (e.g., 9 vs 9.5)
      else if (cardGrader) {
        const gradePattern = new RegExp(`${cardGrader}\\s*(\\d+\\.?\\d*)`, "i");
        const listingGradeMatch = combined.match(gradePattern);
        if (listingGradeMatch) {
          const listingGradeNum = parseFloat(listingGradeMatch[1]);
          const diff = Math.abs(cardGradeNum - listingGradeNum);
          if (diff <= 0.5) gradeScore = 0.6; // Close grade, same grader
          else if (diff <= 1) gradeScore = 0.4; // Within 1 grade point
        }
      }
    }
    matched.grade = gradeScore > 0;
  } else {
    // Raw/ungraded - check if listing is also raw
    const gradeKeywords = ["psa", "bgs", "sgc", "cgc", "graded"];
    const isGraded = gradeKeywords.some(kw => combined.includes(kw));
    gradeScore = isGraded ? 0 : 1.0;
    matched.grade = !isGraded; // True if both are raw
  }

  // Rookie match - check for rookie keywords
  const titleLower = card.title.toLowerCase();
  const cardIsRookie = titleLower.includes("rookie") || titleLower.includes("rc");
  const listingIsRookie = combined.includes("rookie") || combined.includes(" rc ");
  matched.rookie = cardIsRookie === listingIsRookie;

  // Calculate weighted score - use proportional scores for year/grade
  let score = 0;
  score += matched.player ? MATCH_WEIGHTS.player : 0;
  score += yearScore * MATCH_WEIGHTS.year; // Proportional year score
  score += matched.set ? MATCH_WEIGHTS.set : 0;
  score += matched.variation ? MATCH_WEIGHTS.variation : 0;
  score += gradeScore * MATCH_WEIGHTS.grade; // Proportional grade score
  score += matched.rookie ? MATCH_WEIGHTS.rookie : 0;

  return { score, matched };
}

// Filter listings to strict comps only (for value calculation)
function filterToStrictComps(
  listings: Array<{ title: string; snippet: string; link: string; price?: number }>,
  card: CardInfo
): { strict: typeof listings; loose: typeof listings } {
  const strict: typeof listings = [];
  const loose: typeof listings = [];
  
  for (const listing of listings) {
    const { isStrict, excludeReason } = isStrictComp(listing.title, listing.snippet, card, listing.link);
    if (isStrict) {
      strict.push(listing);
    } else {
      loose.push(listing);
      console.log(`[LOOSE COMP] ${listing.title.substring(0, 50)}... - ${excludeReason}`);
    }
  }
  
  console.log(`[STRICT/LOOSE SPLIT] ${card.title}: ${strict.length} strict, ${loose.length} loose`);
  return { strict, loose };
}

// Compute overall card match confidence from multiple listings
function computeCardMatchConfidence(
  listings: Array<{ title: string; snippet: string; link: string; price?: number }>,
  card: CardInfo
): CardMatchConfidence {
  if (listings.length === 0) {
    return {
      tier: "LOW",
      score: 0,
      reason: "No exact matches found for this specific card variation",
      matchedComps: 0,
      totalComps: 0,
      samples: [],
    };
  }

  const { strict: strictComps, loose: looseComps } = filterToStrictComps(listings, card);
  
  // Use strict comps for scoring if available, otherwise fall back to loose comps
  const primaryComps = strictComps.length > 0 ? strictComps : looseComps;
  const usingFallback = strictComps.length === 0 && looseComps.length > 0;
  
  const samples: MatchSample[] = [];
  let totalScore = 0;
  let highMatchCount = 0;

  // Score primary comps (strict preferred, loose as fallback)
  for (const listing of primaryComps) {
    const { score, matched } = computeListingMatchScore(listing.title, listing.snippet, card);
    totalScore += score;
    if (score >= 0.8) highMatchCount++;

    if (samples.length < 5) {
      samples.push({
        title: listing.title,
        snippet: listing.snippet,
        source: extractSourceFromUrl(listing.link),
        url: listing.link,
        price: listing.price,
        matchScore: Math.round(score * 100) / 100,
        matched,
      });
    }
  }

  // If using strict comps, add some loose comps to samples for context
  if (!usingFallback && samples.length < 5) {
    for (const listing of looseComps) {
      if (samples.length >= 5) break;
      const { score, matched } = computeListingMatchScore(listing.title, listing.snippet, card);
      samples.push({
        title: listing.title,
        snippet: listing.snippet,
        source: extractSourceFromUrl(listing.link),
        url: listing.link,
        price: listing.price,
        matchScore: Math.round(score * 100) / 100,
        matched,
      });
    }
  }

  // Calculate score from primary comps
  const effectiveScore = primaryComps.length > 0 
    ? totalScore / primaryComps.length 
    : 0;

  // Determine tier - degraded when using fallback (loose comps)
  let tier: MatchConfidenceTier;
  let reason: string;

  if (usingFallback) {
    // Using loose comps only - cap tier at MEDIUM max, explain why
    const { excludeReason } = looseComps[0] 
      ? isStrictComp(looseComps[0].title, looseComps[0].snippet, card, looseComps[0].link)
      : { excludeReason: null };
    
    if (effectiveScore >= 0.7 && highMatchCount >= 2) {
      tier = "MEDIUM";
      reason = `No strict comps (${excludeReason || "card #/grader mismatch"}) - using ${looseComps.length} loose comps`;
    } else {
      tier = "LOW";
      reason = excludeReason || "No strict comps - loose data may be inaccurate";
    }
  } else if (strictComps.length >= 3 && effectiveScore >= 0.8 && highMatchCount >= 2) {
    tier = "HIGH";
    reason = `${strictComps.length} strict comps match exactly (card #, grade, grader)`;
  } else if (strictComps.length >= 1 && (effectiveScore >= 0.6 || highMatchCount >= 1)) {
    tier = "MEDIUM";
    reason = `${strictComps.length} strict + ${looseComps.length} loose comps found`;
  } else {
    tier = "LOW";
    if (samples.length > 0 && !samples[0].matched.player) {
      reason = "Player name mismatch detected";
    } else if (samples.length > 0 && !samples[0].matched.variation) {
      reason = "Card variation/parallel mismatch detected";
    } else {
      reason = `Only ${strictComps.length} strict comps found`;
    }
  }

  console.log(`[MATCH CONFIDENCE] ${card.title}: ${strictComps.length} strict, ${looseComps.length} loose${usingFallback ? " (FALLBACK)" : ""} -> ${tier}`);

  return {
    tier,
    score: Math.round(effectiveScore * 100) / 100,
    reason,
    matchedComps: strictComps.length > 0 ? strictComps.length : looseComps.length,
    totalComps: listings.length,
    samples: samples.sort((a, b) => b.matchScore - a.matchScore),
  };
}

// Extract source name from URL
function extractSourceFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("ebay")) return "eBay";
    if (hostname.includes("psa")) return "PSA";
    if (hostname.includes("130point")) return "130point";
    if (hostname.includes("sportscardspro")) return "SportsCardsPro";
    if (hostname.includes("pricecharting")) return "PriceCharting";
    return hostname.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

// Use Gemini with Google Search grounding for price lookups (replaces Serper)
async function searchAndAnalyzeCardPrice(card: CardInfo): Promise<PriceLookupResult | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  // Build grade string with grader if available
  const isRaw = isRawCard(card.grade, card.grader);
  const gradeString = card.grader && !isRaw
    ? `${card.grader.toUpperCase()} ${card.grade}` 
    : (isRaw ? "Raw/Ungraded" : (card.grade || "Raw/Ungraded"));
  
  // Build variation-aware search query hints
  const variationStr = card.variation || "Base";
  const setLowerForHints = (card.set || "").toLowerCase();
  const isNumbered = variationStr.match(/\/\d+/);
  const isAutoFromSet = /\b(signature|autograph|auto|ink|penmanship)\b/.test(setLowerForHints);
  const isAutoFromVariation = /\b(auto|autograph|signature|signed)\b/.test(variationStr.toLowerCase());
  const isAutoCard = isAutoFromSet || isAutoFromVariation;
  
  let searchHints = "";
  if (isAutoCard && isNumbered) {
    searchHints = `This is a NUMBERED AUTOGRAPH card (${variationStr} from ${card.set || "unknown set"}) — this is a PREMIUM card combining autograph + numbered parallel. These are typically HIGH VALUE. Search specifically for this exact parallel, not base versions.`;
  } else if (isAutoCard) {
    searchHints = `This is an AUTOGRAPH card (${card.set || ""} ${variationStr}) — autographs are significantly more valuable than base cards. Search for autograph-specific prices.`;
  } else if (isNumbered) {
    searchHints = `This is a NUMBERED parallel (${variationStr}) — it is significantly more valuable than a base card. Search specifically for this parallel.`;
  } else if (variationStr.toLowerCase() !== "base") {
    searchHints = `This is a ${variationStr} parallel — search for this specific variation, not the base card.`;
  }

  const hasMissingIdentity = !card.set || variationStr === "Base";
  const specificityWarning = hasMissingIdentity
    ? `\nWARNING — INCOMPLETE CARD IDENTITY: ${!card.set ? "The card SET is unknown." : ""} ${variationStr === "Base" ? "The variation may be a base card or unknown insert." : ""}
When card identity is incomplete:
- Do NOT assume this is the player's most popular or valuable card
- Search for the MOST COMMON/CHEAPEST version matching the known details
- If you can't identify the specific card, set confidence to "low" and salesFound to 0
- NEVER return prices for premium rookies/autos when the set/variation is unspecified
- A star player's cheap insert card ($0.50-$3) is far more common than their $50+ rookie`
    : "";

  const rawGradeWarning = isRaw
    ? `\nRAW CARD — CRITICAL PRICING RULES:
This card is RAW (ungraded). Follow these rules EXACTLY:
1. Only use raw/ungraded completed eBay sales for estimatedValue, minPrice, maxPrice, and rawPrice.
2. NEVER include PSA 9 or PSA 10 graded sale prices in estimatedValue/minPrice/maxPrice.
3. SSP/SHORT PRINT EXCLUSION: If a listing title contains "SSP", "Short Print", "SP", or "Case Hit", it is a DIFFERENT, more valuable variation — EXCLUDE it. Do not use SSP sales as comps.
4. Use the MEDIAN of the raw non-SSP sales you find — do NOT skew low or high. Report it accurately.
5. If you cannot find raw non-SSP sales, set estimatedValue to null and soldCount to 0.
VIOLATION: Using graded or SSP sale prices as estimatedValue/minPrice is WRONG.`
    : "";

  const searchPrompt = `Search for recent sold listings and current market value for this sports card:

Player: ${card.title}
Set: ${card.set || "Unknown"}
Year: ${card.year || "Unknown"}
Variation: ${variationStr}
Grade: ${gradeString}

${card.grader ? `GRADING: This card is graded by ${card.grader.toUpperCase()}, NOT PSA. Adjust value accordingly.` : ""}
${searchHints}
${specificityWarning}
${rawGradeWarning}

SEARCH STRATEGY:
1. Search eBay sold/completed listings for this EXACT card (player + year + set + variation + grade)
2. Try queries like: "${card.title} ${card.year || ""} ${card.set || ""} ${variationStr} ${isRaw ? "raw" : gradeString} sold"
3. Check 130point.com, PSA card facts, and card pricing sites for recent sales data
4. For numbered parallels (/10, /25, /50): These are RARE and command premium prices — do not confuse with base cards
5. CRITICAL: Only price the EXACT card described — different sets/years/variations of the same player have VASTLY different values

PRICING RULES:
- Report ACTUAL recent sold prices, not deflated estimates
- If recent solds show a range (e.g., $400-$600), report the market midpoint ($500), not the low end
- Lower-tier grading companies (BCCG, CGC) are worth less than PSA/BGS
- ACCURACY matters more than caution. Users rely on these values for investment decisions.

CRITICAL — PLAYER PERFORMANCE MATTERS:
- A numbered parallel of a BUST or underperforming player is worth FAR LESS than the same parallel of a star
- Example: A /2 National Treasures RPA of a QB who lost his starting job might sell for $200-$1000, NOT $10,000+
- The card's rarity ALONE does not determine value — demand driven by player performance is the primary driver
- Always factor in whether the player is currently a star, a role player, injured, or a bust
- If you cannot find ACTUAL sold listings for this specific card, set confidence to "low" and be conservative
- NEVER extrapolate from other players' card prices for the same parallel — a Patrick Mahomes /2 and a Trey Lance /2 are vastly different values

Return ONLY a JSON object:
{
  "estimatedValue": <number based on actual market data>,
  "minPrice": <lowest sale price found>,
  "maxPrice": <highest sale price found>,
  "rawPrice": <average price for RAW/UNGRADED copies specifically, or null if unknown>,
  "salesFound": <number of price references found>,
  "confidence": "high" | "medium" | "low",
  "details": "<cite specific sold listings with prices and dates when possible>"
}

IMPORTANT: rawPrice should reflect ONLY ungraded/raw copies. estimatedValue can include all conditions.
You MUST return an estimatedValue if you find ANY price information.`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Price Lookup] Attempt ${attempt} for: ${card.title}`);
      
      const response = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      const responseText = response.text || "";
      console.log(`[Price Lookup] Gemini response length: ${responseText.length}`);
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.estimatedValue && parsed.estimatedValue > 0) {
            let finalValue = parsed.estimatedValue;
            
            // SANITY CHECK: Flag suspiciously high values with low evidence
            if (finalValue > 5000 && (parsed.salesFound || 0) <= 1 && parsed.confidence !== "high") {
              console.warn(`[Price Lookup] SANITY WARNING: $${finalValue} with only ${parsed.salesFound} sales and ${parsed.confidence} confidence for ${card.title}. Marking as low confidence.`);
              parsed.confidence = "low";
              parsed.details = (parsed.details || "") + " [Warning: High estimated value with limited sales evidence. Verify manually.]";
            }
            
            // RAW CARD CORRECTION: Use raw-specific price when available
            if (isRaw) {
              if (parsed.rawPrice && parsed.rawPrice > 0) {
                console.log(`[Price Lookup] RAW CARD: Using rawPrice $${parsed.rawPrice} (overall est was $${finalValue})`);
                finalValue = parsed.rawPrice;
              } else if (parsed.minPrice && parsed.minPrice > 0) {
                const ratio = finalValue / parsed.minPrice;
                if (ratio > 2) {
                  const corrected = Math.round(parsed.minPrice * 1.3 * 100) / 100;
                  console.warn(`[Price Lookup] RAW CORRECTION: est $${finalValue} is ${ratio.toFixed(1)}x min $${parsed.minPrice}. Using $${corrected}`);
                  finalValue = corrected;
                }
              }
            }
            
            return {
              estimatedValue: finalValue,
              source: "Market Data (AI + Google Search)",
              searchQuery: `${card.title} ${card.set || ""} ${card.grade || ""}`,
              salesFound: parsed.salesFound || 0,
              confidence: parsed.confidence || "medium",
              details: parsed.details || "",
            };
          }
        } catch (parseError) {
          console.error(`[Price Lookup] Failed to parse JSON:`, responseText.substring(0, 200));
        }
      }
      
      // If no valid price found, return null to try next approach
      return null;
      
    } catch (error: any) {
      lastError = error;
      console.error(`[Price Lookup] Gemini error (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[Price Lookup] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("Price lookup failed after retries");
}

function cleanCardTitle(title: string): string {
  // Remove card numbers like #190, #304, etc. - these are often not in eBay listings
  let cleaned = title.replace(/#\d+/g, "").trim();
  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

// Normalize grade to include grader prefix (assume PSA if just a number)
function normalizeGradeForSearch(grade: string | undefined | null, grader: string | undefined | null): string {
  if (!grade) return "";
  
  const gradeLower = grade.toLowerCase();
  const hasGrader = ["psa", "bgs", "sgc", "cgc"].some(g => gradeLower.includes(g));
  
  if (hasGrader) {
    return grade; // Already has grader
  }
  
  // If explicit grader provided, use it
  if (grader) {
    return `${grader.toUpperCase()} ${grade}`;
  }
  
  // If just a number (like "10", "9"), assume PSA (most common)
  if (/^\d+\.?\d*$/.test(grade.trim())) {
    return `PSA ${grade}`;
  }
  
  return grade;
}

// Infer card type from free-form variation text and build appropriate search terms
function buildVariationSearchTerm(card: CardInfo): { term: string; excludeTerms: string[] } {
  const variation = (card.variation || "").toLowerCase().trim();
  const setLower = (card.set || "").toLowerCase().trim();
  
  // Default exclusions for base/insert cards - removes premium variants from results
  const premiumExclusions = ["-auto", "-autograph", "-patch", "-relic", "-jersey", "-memorabilia", "-/10", "-/25", "-/50", "-ssp", "-case"];
  
  // If no variation specified, default to base with exclusions
  if (!variation) {
    return { term: "base", excludeTerms: premiumExclusions };
  }
  
  // Detect auto/memorabilia cards (highest priority - these are premium)
  // Check both variation AND set name for auto indicators (e.g., "Donruss Signature Series" has auto in set name)
  const combinedText = `${variation} ${setLower}`;
  const hasAuto = /\b(auto|autograph|signature|signed)\b/.test(combinedText);
  const hasPatch = /\b(patch|relic|jersey|memorabilia|game.?used|player.?worn)\b/.test(combinedText);
  const hasRPA = /\brpa\b/.test(combinedText) || (hasAuto && hasPatch);
  
  if (hasRPA) {
    // RPA / Auto + Patch combo
    return { term: card.variation || "", excludeTerms: [] };
  }
  if (hasAuto) {
    // Autograph card
    return { term: card.variation || "", excludeTerms: [] };
  }
  if (hasPatch) {
    // Memorabilia card (no auto)
    return { term: card.variation || "", excludeTerms: [] };
  }
  
  // Detect case hits (Downtown, Kaboom, The Man, etc.) — check both variation AND set name
  const caseHitPattern = /\b(downtown|uptown|kaboom|disco|stained.?glass|color.?blast|genesis|case.?hit|ssp|the\s*man|warp\s*speed|interstellar|eye\s*of\s*the\s*tiger|supernova|magician|phenomenon|street\s*art|art\s*deco|aurora|ascension|wood|silk|sapphire|platinum|vintage\s*stock|clear|superfractor)\b/i;
  const isCaseHit = caseHitPattern.test(variation) || caseHitPattern.test(setLower);
  if (isCaseHit) {
    return { term: card.variation || "", excludeTerms: [] };
  }
  
  // Detect numbered parallels (/99, /199, etc.)
  const isNumbered = /\/\d+|1\/1|\bone of one\b/.test(variation);
  if (isNumbered) {
    return { term: card.variation || "", excludeTerms: ["-auto", "-autograph", "-patch", "-relic"] };
  }
  
  // Detect base cards (user explicitly says "base")
  const isBase = /\bbase\b/.test(variation);
  if (isBase) {
    // Use full variation text (might include "Rated Rookie base") but exclude premium
    return { term: card.variation || "base", excludeTerms: premiumExclusions };
  }
  
  // Detect base inserts (common inserts from standard products - NOT premium SSPs)
  const isBaseInsert = /\b(insert|rookie wave|laser|my house|velocity|hyper|fast break|deep space|warp speed|instant impact|fireworks|emergent|sensational|freshman phenoms|rookie revolution)\b/.test(variation);
  if (isBaseInsert) {
    // Use insert name but exclude premium variants
    return { term: card.variation || "", excludeTerms: premiumExclusions };
  }
  
  // Detect parallels (Silver Prizm, Refractor, etc.)
  const isParallel = /\b(prizm|refractor|parallel|silver|gold|blue|red|green|pink|purple|orange|ice|cosmic|atomic|cracked)\b/.test(variation);
  if (isParallel) {
    return { term: card.variation || "", excludeTerms: ["-auto", "-autograph", "-patch", "-relic"] };
  }
  
  // Default: use variation text as-is, exclude premium variants to be safe
  return { term: card.variation || "", excludeTerms: premiumExclusions };
}

function buildSearchQueries(card: CardInfo): string[] {
  const queries: string[] = [];
  const cleanTitle = cleanCardTitle(card.title);
  
  // Build variation search term based on variationType
  const { term: variationTerm, excludeTerms } = buildVariationSearchTerm(card);
  
  // Normalize grade to include grader (assume PSA if just a number like "10")
  const normalizedGrade = normalizeGradeForSearch(card.grade, card.grader);
  
  // Build exclusion string for queries (e.g., "-auto -patch -/10")
  const exclusions = excludeTerms.join(" ");
  
  // Primary query: player name + set + year + variation + grade + "value" or "price" for pricing info
  const primaryParts: string[] = [];
  if (cleanTitle) primaryParts.push(cleanTitle);
  if (card.set) primaryParts.push(card.set);
  if (card.year) primaryParts.push(String(card.year));
  primaryParts.push(variationTerm);
  if (normalizedGrade) primaryParts.push(normalizedGrade);
  queries.push(primaryParts.join(" ") + " value price " + exclusions);
  
  // Secondary query: search auction prices specifically
  queries.push(`${cleanTitle} ${card.year || ""} ${card.set || ""} ${variationTerm} ${normalizedGrade} auction price sold ${exclusions}`);
  
  // Tertiary query: player name + year + variation + grade + "rookie card value"
  queries.push(`${cleanTitle} ${card.year || ""} ${variationTerm} ${normalizedGrade} rookie card value ${exclusions}`);
  
  // Fourth query: simpler version targeting price guides
  queries.push(`${cleanTitle} ${card.set || ""} ${variationTerm} ${normalizedGrade} price guide ${exclusions}`);
  
  return queries;
}

function buildSearchQuery(card: CardInfo): string {
  const queries = buildSearchQueries(card);
  return queries[0]; // Return primary query for backward compatibility
}

// Note: trySearchQuery removed - now using searchAndAnalyzeCardPrice with Gemini + Google Search

// ==================== 1-of-1 Detection & Parallel Comp Fallback ====================

const ONE_OF_ONE_PATTERNS = [
  /\b1\s*\/\s*1\b/,
  /\bone\s+of\s+one\b/i,
  /\b1\s+of\s+1\b/i,
  /\bsuperfractor\b/i,
];

export function isOneOfOneCard(card: CardInfo & { serialNumber?: number | string | null }): boolean {
  const variation = (card.variation || "").toLowerCase();
  const title = (card.title || "").toLowerCase();
  const combined = `${variation} ${title}`;
  
  if (ONE_OF_ONE_PATTERNS.some(pattern => pattern.test(combined))) {
    return true;
  }
  
  const serial = String(card.serialNumber || "").trim();
  if (serial === "1" || serial === "1/1") {
    return true;
  }
  
  return false;
}

const PARALLEL_TIERS = [
  { label: "/5", searchTerm: "/5", multiplier: 1.5 },
  { label: "/10", searchTerm: "/10", multiplier: 2.0 },
  { label: "/25", searchTerm: "/25", multiplier: 3.0 },
  { label: "/50", searchTerm: "/50", multiplier: 4.0 },
  { label: "/99", searchTerm: "/99", multiplier: 5.0 },
];

async function lookupParallelComps(card: CardInfo): Promise<OneOfOneProjection> {
  console.log(`[1/1 Fallback] Starting parallel comp search for: ${card.title}`);
  
  const parallelComps: ParallelCompData[] = [];
  
  const strip1of1Tokens = (text: string) => text
    .replace(/1\s*\/\s*1/gi, "")
    .replace(/one[\s-]+of[\s-]+one/gi, "")
    .replace(/1\s+of\s+1/gi, "")
    .replace(/superfractor/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  
  const cleanVariation = strip1of1Tokens(card.variation || "");
  const cleanTitle = strip1of1Tokens(card.title || "");
  
  for (const tier of PARALLEL_TIERS) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const parallelVariation = cleanVariation 
        ? `${cleanVariation} ${tier.searchTerm}`.trim()
        : tier.searchTerm;
      
      const parallelCard: CardInfo = {
        ...card,
        title: cleanTitle,
        variation: parallelVariation,
      };
      
      console.log(`[1/1 Fallback] Searching parallel: ${tier.label} (variation: "${parallelVariation}")`);
      const result = await searchAndAnalyzeCardPrice(parallelCard);
      
      if (result && result.estimatedValue && result.estimatedValue > 0) {
        parallelComps.push({
          parallel: tier.label,
          estimatedValue: result.estimatedValue,
          salesFound: result.salesFound,
          confidence: result.confidence,
        });
        console.log(`[1/1 Fallback] Found ${tier.label} comp: $${result.estimatedValue} (${result.salesFound} sales, ${result.confidence} confidence)`);
      }
      
      if (parallelComps.length >= 2) {
        console.log(`[1/1 Fallback] Found 2 parallel comps, stopping search`);
        break;
      }
    } catch (error) {
      console.error(`[1/1 Fallback] Error searching ${tier.label}:`, error);
    }
  }
  
  if (parallelComps.length === 0) {
    console.log(`[1/1 Fallback] No parallel comps found`);
    return {
      isOneOfOne: true,
      projectedValue: null,
      multiplierUsed: null,
      baseParallel: null,
      baseParallelValue: null,
      parallelComps: [],
      projectionMethod: "No parallel comps found for projection",
    };
  }
  
  const bestComp = parallelComps.reduce((best, comp) => {
    if (comp.confidence === "high" && best.confidence !== "high") return comp;
    if (comp.salesFound > best.salesFound) return comp;
    return best;
  }, parallelComps[0]);
  
  const tier = PARALLEL_TIERS.find(t => t.label === bestComp.parallel);
  const multiplier = tier?.multiplier || 3.0;
  
  let projectedValue = Math.round(bestComp.estimatedValue! * multiplier);
  
  console.log(`[1/1 Fallback] Raw projection: $${bestComp.estimatedValue} (${bestComp.parallel}) × ${multiplier} = $${projectedValue}`);
  
  // SANITY CHECK: Ask Gemini directly what this 1/1 card is worth
  // The multiplier approach can wildly overshoot for high-value parallels
  try {
    const directResult = await searchAndAnalyzeCardPrice(card);
    if (directResult && directResult.estimatedValue && directResult.estimatedValue > 0) {
      console.log(`[1/1 Fallback] Gemini direct valuation for 1/1: $${directResult.estimatedValue}`);
      // Use Gemini's direct estimate if lower than our projection
      // Gemini has broader market context and won't blindly multiply
      if (directResult.estimatedValue < projectedValue) {
        console.log(`[1/1 Fallback] Using Gemini direct value ($${directResult.estimatedValue}) instead of projection ($${projectedValue})`);
        projectedValue = directResult.estimatedValue;
      }
    }
  } catch (err) {
    console.warn(`[1/1 Fallback] Gemini sanity check failed, using projection: ${err}`);
  }
  
  console.log(`[1/1 Fallback] Final projected 1/1 value: $${projectedValue}`);
  
  return {
    isOneOfOne: true,
    projectedValue,
    multiplierUsed: multiplier,
    baseParallel: bestComp.parallel,
    baseParallelValue: bestComp.estimatedValue,
    parallelComps,
    projectionMethod: `Projected from ${bestComp.parallel} parallel (${bestComp.salesFound} sales, ${bestComp.confidence} confidence) × ${multiplier}x multiplier`,
  };
}

export async function lookupCardPrice(card: CardInfo): Promise<PriceLookupResult> {
  try {
    const is1of1 = isOneOfOneCard(card);
    
    // Use Gemini with Google Search grounding (no Serper needed)
    const result = await searchAndAnalyzeCardPrice(card);
    
    if (result && result.estimatedValue) {
      if (is1of1) {
        result.oneOfOneProjection = {
          isOneOfOne: true,
          projectedValue: result.estimatedValue,
          multiplierUsed: null,
          baseParallel: null,
          baseParallelValue: null,
          parallelComps: [],
          projectionMethod: "Direct 1/1 sales data found",
        };
      }
      return result;
    }

    if (is1of1) {
      console.log(`[Price Lookup] No direct 1/1 comps found, trying parallel fallback for: ${card.title}`);
      const projection = await lookupParallelComps(card);
      
      if (projection.projectedValue) {
        return {
          estimatedValue: projection.projectedValue,
          source: "Projected from Parallel Comps",
          searchQuery: `${card.title} ${card.set || ""} ${card.grade || ""}`,
          salesFound: projection.parallelComps.reduce((sum, c) => sum + c.salesFound, 0),
          confidence: "low",
          details: projection.projectionMethod,
          oneOfOneProjection: projection,
        };
      }
      
      return {
        estimatedValue: null,
        source: "No comps available",
        searchQuery: `${card.title} ${card.set || ""} ${card.grade || ""}`,
        salesFound: 0,
        confidence: "low",
        details: "No direct 1/1 sales or parallel comps found. This is a truly unique card — consider setting a manual value.",
        oneOfOneProjection: projection,
      };
    }

    return {
      estimatedValue: null,
      source: "eBay (no sales found)",
      searchQuery: `${card.title} ${card.set || ""} ${card.grade || ""}`,
      salesFound: 0,
      confidence: "low",
      details: "No recent sold listings found. Try adding more card details.",
    };
  } catch (error) {
    console.error("Price lookup error:", error);
    throw error;
  }
}

export async function lookupMultipleCardPrices(
  cards: CardInfo[]
): Promise<Map<string, PriceLookupResult>> {
  const results = new Map<string, PriceLookupResult>();
  
  for (const card of cards) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await lookupCardPrice(card);
      results.set(card.title, result);
    } catch (error) {
      console.error(`Failed to lookup price for ${card.title}:`, error);
      results.set(card.title, {
        estimatedValue: null,
        source: "Error",
        searchQuery: buildSearchQuery(card),
        salesFound: 0,
        confidence: "low",
        details: `Lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
  
  return results;
}

// Enhanced price lookup for Card Outlook AI 2.0
// Extracts 8-20 individual price points with dates, sources, and URLs
// Note: Using Gemini + Google Search grounding (Serper removed)
async function tryEnhancedSearchQuery(query: string, card: CardInfo): Promise<EnhancedPriceLookupResult | null> {
  // Use the basic lookup - enhanced search will be reimplemented later
  const basicResult = await searchAndAnalyzeCardPrice(card);
  if (!basicResult || !basicResult.estimatedValue) {
    return null;
  }
  
  // Convert basic result to enhanced format with a single price point
  return {
    estimatedValue: basicResult.estimatedValue,
    pricePoints: [{
      date: new Date().toISOString().split('T')[0],
      price: basicResult.estimatedValue,
      source: basicResult.source,
    }],
    salesFound: basicResult.salesFound,
    confidence: basicResult.confidence,
    confidenceReason: basicResult.details || "Based on market data analysis",
    details: basicResult.details,
    rawSearchResults: [],
  };
  
  // Original Serper-based code below is deprecated
  const searchResults = { organic: [] } as any; // Placeholder
  
  const organicResults = searchResults.organic || [];
  const relevantResults = organicResults.filter((result: any) => {
    const title = (result.title || "").toLowerCase();
    const snippet = (result.snippet || "").toLowerCase();
    const link = (result.link || "").toLowerCase();
    return title.includes("price") || title.includes("sold") || title.includes("value") ||
           title.includes("auction") || 
           snippet.includes("$") || snippet.includes("price") || snippet.includes("sold") ||
           link.includes("ebay.com") || link.includes("psacard.com") || 
           link.includes("sportscardspro.com") || link.includes("130point.com") ||
           link.includes("pricecharting.com");
  });

  if (relevantResults.length === 0) {
    return null;
  }

  let rawResults = relevantResults.slice(0, 15).map((r: any) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
  }));

  // CRITICAL: When no variation specified, exclude premium variations from search results
  // This prevents Downtown/Refractor/Auto results from contaminating base card pricing
  // IMPORTANT: Only check TITLE and URL, not snippet - price guide pages list ALL variants
  // in their content, so snippet will always mention Gold/Blue/etc even for base card results
  if (!card.variation) {
    const beforeFilter = rawResults.length;
    rawResults = rawResults.filter((r: any) => {
      // Only filter if the TITLE or URL contains premium keywords
      // Snippets often list all variants on the page, so we ignore them
      const titleAndUrl = `${r.title} ${r.link}`.toLowerCase();
      const isPremium = containsPremiumVariation(titleAndUrl);
      if (isPremium) {
        console.log(`[SEARCH FILTER] Excluded premium result: "${r.title.substring(0, 60)}..."`);
      }
      return !isPremium;
    });
    if (beforeFilter > rawResults.length) {
      console.log(`[SEARCH FILTER] Removed ${beforeFilter - rawResults.length} premium variation results, ${rawResults.length} remain`);
    }
    
    // If all results were premium, return null - let baseline fallback handle it
    if (rawResults.length === 0) {
      console.log(`[SEARCH FILTER] All results were premium variations - deferring to baseline fallback`);
      return null;
    }
  }

  // Filter to STRICT comps only for GPT price extraction
  const { strict: strictResults, loose: looseResults } = filterToStrictComps(rawResults, card);
  
  // Use strict results for pricing, fall back to loose if no strict found
  const resultsForPricing = strictResults.length > 0 ? strictResults : looseResults;
  const usingLooseFallback = strictResults.length === 0;

  // DEBUG: Log raw search results for match analysis
  console.log("\n========== RAW COMP DATA FOR MATCH ANALYSIS ==========");
  console.log(`Card: ${card.title} | Set: ${card.set} | Year: ${card.year} | Grade: ${card.grade}`);
  console.log(`STRICT: ${strictResults.length} | LOOSE: ${looseResults.length}`);
  console.log("--------------------------------------------------------");
  rawResults.forEach((r: any, i: number) => {
    const { isStrict } = isStrictComp(r.title, r.snippet, card, r.link);
    console.log(`[${i + 1}] ${isStrict ? "STRICT" : "LOOSE"} - ${r.title}`);
    console.log(`    Snippet: ${r.snippet?.substring(0, 150)}...`);
    console.log(`    URL: ${r.link}`);
    console.log("");
  });
  console.log("========================================================\n");

  // Send comps to GPT for price extraction (strict preferred, loose as fallback)
  // Pre-process snippets to help GPT find prices in various formats
  const preprocessSnippet = (snippet: string): string => {
    if (!snippet) return "";
    // Add spaces around concatenated prices like "Last Sale$48.45" → "Last Sale $48.45"
    let cleaned = snippet.replace(/([a-zA-Z])(\$\d)/g, '$1 $2');
    // Add spaces around date+price patterns like "12/15/2025$48.45" → "12/15/2025 $48.45"
    cleaned = cleaned.replace(/(\d{1,2}\/\d{1,2}\/\d{4})(\$)/g, '$1 $2');
    // Highlight multiple prices in sold listings
    cleaned = cleaned.replace(/\$(\d+(?:\.\d{2})?)/g, 'PRICE:$$$1');
    return cleaned;
  };
  
  const searchContext = resultsForPricing
    .map((r: any) => `Title: ${r.title}\nSnippet: ${preprocessSnippet(r.snippet)}\nURL: ${r.link}`)
    .join("\n\n");

  // Get dynamic dates for GPT examples (so they're always recent)
  const todayStr = getTodayDate();
  const recentDate1 = getRecentDate(2); // 2 days ago
  const recentDate2 = getRecentDate(5); // 5 days ago
  
  // Adjust prompt based on whether we have strict comps or using loose fallback
  const systemPrompt = usingLooseFallback
    ? `You are a sports card pricing expert. Extract ALL price points from search results.
    
NOTE: No exact matches found, using approximate comps. Extract all relevant prices but acknowledge this is approximate data.

Today's date is: ${todayStr}

Your task:
1. Find prices from the best matching listings available
2. IMPORTANT: Extract EVERY price you see - if a snippet shows multiple prices like "SOLD FOR $79...SOLD FOR $61", extract BOTH as separate price points
3. For each price, extract: price amount, approximate date (if visible), source name, and source URL
4. Look for: eBay sold prices, auction results, price guide values, recent sales

Return ONLY a JSON object with:
{
  "pricePoints": [
    { "date": "${recentDate1}", "price": 79, "source": "eBay Sold", "url": "https://...", "listingTitle": "2023 Donruss Bijan Robinson RC" },
    { "date": "${recentDate2}", "price": 61, "source": "eBay Sold", "url": "https://...", "listingTitle": "2023 Donruss Rated Rookie Bijan Robinson" }
  ],
  "estimatedValue": number (average of prices found),
  "salesFound": number (total price points extracted),
  "confidence": "low" | "medium" (never high for approximate data),
  "confidenceReason": string (explain data is approximate and why)
}

IMPORTANT: Include "listingTitle" with the exact card name from each listing - this is required.

RULES:
- Extract up to 20 individual price points
- EXTRACT ALL PRICES from each snippet - don't stop at the first one!
- A single search result may contain multiple sold prices - extract them all
- PRICE FORMATS TO EXTRACT (all are valid):
  * "Last Sale$48.45" or "Last Sale PRICE:$48.45" → extract $48.45
  * "Last 14 Avg$43.33" → extract $43.33 as average price
  * "PSA 10 $35.00" or "PSA 10: $35" → extract $35
  * "12/15/2025 $48.45" (date + price) → extract $48.45 with that date
  * eBay sold: "$39.95 shipping" → extract $39.95 (ignore shipping cost)
  * Price guide range: "$35-$48" → extract midpoint $41.50
- Price ranges like "$400-$600" count as ONE price point at the midpoint ($500)
- CRITICAL: If no date is visible in the snippet, use TODAY'S DATE: ${todayStr}
- Most price guide sites show RECENT prices - assume they are from the last few days unless a specific date is shown
- Note in confidenceReason that exact match data was not available`
    : `You are a sports card pricing expert. Extract ALL INDIVIDUAL price points from search results.

Today's date is: ${todayStr}

CRITICAL MATCHING RULES (STRICT COMPS ONLY):
1. GRADE IS CRITICAL - NEVER MIX GRADES:
   - If the target card is "PSA 10", ONLY extract prices labeled "PSA 10"
   - NEVER include "Raw", "Ungraded", or prices without a grade designation
   - PSA 10 ≠ PSA 9 ≠ PSA 8 - each grade has DIFFERENT values
   - When a snippet shows "Raw $27; PSA 9 $46; PSA 10 $108", extract ONLY the PSA 10 price ($108)
2. CARD NUMBER: If target card has #10, ONLY use listings with #10. Card #81 is a DIFFERENT card.
3. GRADER: For PSA cards, only use PSA prices for value. CGC/SGC are different graders.
4. QUALIFIERS: Exclude cards with (ST), (OC), (MC), (MK), (PD) - these are damaged/flawed.
5. VARIATION: Base cards are NOT the same as parallels (Prizm, Refractor, Holo, numbered /99, etc.)

Your task:
1. Find STRICT MATCH prices only - same card number, same grader, same grade, same variation, no qualifiers
2. IMPORTANT: Extract EVERY price you see - if a snippet shows "SOLD FOR $79...SOLD FOR $61", extract BOTH as separate price points
3. For each price, extract: price amount, approximate date (if visible), source name, and source URL
4. Look for: eBay sold prices, auction results, price guide values, recent sales

Return ONLY a JSON object with:
{
  "pricePoints": [
    { "date": "${recentDate1}", "price": 79, "source": "eBay Sold", "url": "https://...", "listingTitle": "2023 Donruss #305 Bijan Robinson RC PSA 10" },
    { "date": "${recentDate2}", "price": 61, "source": "eBay Sold", "url": "https://...", "listingTitle": "2023 Donruss Rated Rookie Bijan Robinson PSA 10" }
  ],
  "estimatedValue": number (average of STRICT matches only),
  "salesFound": number (total STRICT price points extracted),
  "confidence": "high" | "medium" | "low",
  "confidenceReason": string (explain why this confidence level)
}

IMPORTANT: Include "listingTitle" with the exact card name from the listing for EACH price point - this is required for validation.

RULES:
- Extract up to 20 individual price points
- EXTRACT ALL PRICES from each snippet - don't stop at the first one!
- A single search result may contain multiple sold prices (e.g., auction history) - extract them all
- PRICE FORMATS TO EXTRACT (all are valid):
  * "Last Sale$48.45" or "Last Sale PRICE:$48.45" → extract $48.45
  * "Last 14 Avg$43.33" → extract $43.33 as average price
  * "PSA 10 $35.00" or "PSA 10: $35" → extract $35
  * "12/15/2025 $48.45" (date + price) → extract $48.45 with that date
  * Price tables: "PSA 10: $35 | PSA 9: $20" → extract ONLY the matching grade price
  * eBay sold: "$39.95 shipping" → extract $39.95 (ignore shipping cost)
  * Price guide range: "$35-$48" → extract midpoint $41.50
- EXCLUDE different card numbers (e.g., #81 Team Leaders vs #10 Base)
- EXCLUDE different graders for value calculation (CGC 8 ≠ PSA 8)
- EXCLUDE qualifier grades like PSA 8 (ST) - these are worth much less
- EXCLUDE parallels/variations when searching for base cards (Prizm, Refractor, Holo, /99, etc.)
- Price ranges like "$400-$600" count as ONE price point at the midpoint ($500)
- CRITICAL: If no date is visible in the snippet, use TODAY'S DATE: ${todayStr}
- Most price guide sites show RECENT prices - assume they are from the last few days unless a specific date is shown
- eBay sold listings are most reliable`;

  const isBaseCard = !card.variation || card.variation.trim().length === 0;
  
  const userPrompt = usingLooseFallback
    ? `Extract ALL price points for this card (no exact matches found):
Card: ${card.title}
Set: ${card.set || "Unknown"}
Year: ${card.year || "Unknown"}
Variation: ${card.variation || "Base card (no parallel)"}
Grade: ${card.grade || "Raw/Ungraded"}

IMPORTANT: Extract EVERY sold price you find in the snippets - some snippets contain multiple prices!
For example, if you see "SOLD FOR $79...SOLD FOR $61", create TWO price points ($79 and $61).

Search results:
${searchContext}

Return JSON with pricePoints array (all prices found), estimatedValue, salesFound, confidence (max "medium"), and confidenceReason.`
    : `Extract ALL STRICT MATCH price points for this card:
Card: ${card.title}
Card Number: ${card.cardNumber || extractCardNumber(card.title) || "Not specified"}
Set: ${card.set || "Unknown"}
Year: ${card.year || "Unknown"}
Variation: ${card.variation || "BASE CARD (no parallel/refractor/prizm/holo/numbered)"}
Grade: ${card.grade || "Raw/Ungraded"}

CRITICAL MATCHING RULES:

1. GRADE MATCHING - EXACT GRADE ONLY:
- This card is: ${card.grade || "Raw/Ungraded"}
- ONLY extract prices that match this EXACT grade
- If snippets show multiple grades like "Raw $27; PSA 9 $46; PSA 10 $108", extract ONLY ${card.grade || "the matching grade"} prices
- NEVER include "Raw", "Ungraded", "Raw condition", "NM-MT", "Near Mint" prices when the card is graded
- SKIP any listing that mentions "raw condition" or is clearly for an ungraded card
- ${card.grade} ≠ lower grades (a PSA 10 is worth MORE than PSA 9)
- Extract price RANGES like "$80-$250" as ONE price point at the midpoint ($165)

2. GRADER MATCHING - DO NOT MIX GRADERS:
- This card is graded by: ${(card.grader || parseGradeInfo(card.grade).grader || "any grader").toUpperCase()}
- ONLY include prices from the SAME grading company
- PSA 10 ≠ BGS 10 ≠ SGC 10 ≠ CGC 10 (these are DIFFERENT)

3. VARIATION MATCHING - ${isBaseCard ? "BASE CARDS ONLY" : `MATCH: ${card.variation}`}:
${isBaseCard ? `- This is a BASE CARD - EXCLUDE all parallels, prizms, refractors, holos, numbered cards
- EXCLUDE: Silver, Gold, Red, Blue, Green, Orange, Purple, Pink, Black, White parallels
- EXCLUDE: Refractor, Prizm, Holo, Shimmer, Wave, Mojo, Ice, Shock, Velocity, Cracked Ice
- EXCLUDE: Any numbered cards (/25, /50, /99, /199, /299, /499, etc.)
- EXCLUDE: Auto, Autograph, Patch, Jersey, Relic, Memorabilia cards
- ONLY include plain base card sales` : `- This is a ${card.variation} parallel - ONLY include prices for this exact variation
- EXCLUDE base cards and other variations`}

3. EXTRACT ALL PRICES:
- IMPORTANT: Some snippets contain multiple sold prices - extract ALL of them!
- If you see "SOLD FOR $79...SOLD FOR $61", create TWO separate price points

Search results:
${searchContext}

Return JSON with pricePoints array (all prices found), estimatedValue, salesFound, confidence, and confidenceReason.`;

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `${systemPrompt}\n\n${userPrompt}`,
  });

  const responseText = response.text || "";
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const cardGrader = card.grader?.toLowerCase() || parseGradeInfo(card.grade).grader;
      // Premium variation keywords that indicate higher-value parallels
      // NOTE: "pristine" removed - handled by isBGSPremium() to avoid false positives on "pristineauction.com"
      const PREMIUM_KEYWORDS = [
        "black label", "gold label",
        "silver", "gold", "hyper", "shimmer", "wave", "camo", 
        "kaboom", "downtown", "uptown", "case hit", "ssp", "sp ",
        "refractor", "prizm", "auto", "autograph", "numbered", "/10", "/25", "/50", "/99",
        "1/1", "one of one", "superfractor", "atomic",
        // Insert set names (these are premium even without numbered)
        "rookie kings", "lombardi bound", "dynamic patch", "elite series"
      ];
      
      // Check if text contains premium variation keywords
      const hasPremiumKeyword = (text: string): string | null => {
        const lower = text.toLowerCase();
        for (const kw of PREMIUM_KEYWORDS) {
          if (lower.includes(kw)) return kw;
        }
        // Also check for insert set card numbers like #D-10 (Downtown), #RK-1 (Rookie Kings), etc.
        // These indicate premium inserts even if the set name isn't in the title
        const insertNumberMatch = lower.match(/#[a-z]+-?\d+/); // Matches #D-10, #RK-1, #LB-PM10, etc.
        if (insertNumberMatch) {
          // Check if it's a known insert prefix
          const insertPrefixes = ['d-', 'rk-', 'lb-', 'dp-', 'dk-', 'sk-', 'dt-']; // Downtown, Rookie Kings, Lombardi Bound, Dynamic Patch, etc.
          for (const prefix of insertPrefixes) {
            if (insertNumberMatch[0].includes(prefix)) {
              return `insert ${insertNumberMatch[0]}`;
            }
          }
        }
        return null;
      };
      
      // Check for BGS Pristine/Black Label which command huge premiums
      const isBGSPremium = (text: string): boolean => {
        const lower = text.toLowerCase();
        return (lower.includes("bgs") || lower.includes("beckett")) && 
               (lower.includes("pristine") || lower.includes("black label") || lower.includes("10.0") || lower.includes("gem mint"));
      };
      
      const pricePoints: PricePoint[] = (parsed.pricePoints || []).map((pp: any) => ({
        date: pp.date || new Date().toISOString().split('T')[0],
        price: typeof pp.price === 'number' ? pp.price : parseFloat(pp.price) || 0,
        source: pp.source || "Unknown",
        url: pp.url,
        listingTitle: pp.listingTitle || "", // Capture listing title for validation
      })).filter((pp: PricePoint & { listingTitle?: string }) => {
        if (pp.price <= 0) return false;
        
        // CRITICAL: Use listingTitle for variation filtering - this is the actual card name
        const combinedText = `${pp.listingTitle || ""} ${pp.source} ${pp.url || ""}`;
        
        // Filter 1: Exclude BGS Pristine/Black Label (commands 2-5x premium)
        if (isBGSPremium(combinedText)) {
          console.log(`[BGS PREMIUM FILTER] Excluded "${pp.source}" ($${pp.price}) - BGS Pristine/Black Label`);
          return false;
        }
        
        // Filter 2: Grader mismatch - If card is PSA, exclude BGS/SGC/CGC prices
        if (cardGrader) {
          const sourceGrade = parseGradeInfo(combinedText);
          if (sourceGrade.grader && sourceGrade.grader !== cardGrader) {
            console.log(`[GRADER FILTER] Excluded "${pp.source}" ($${pp.price}) - grader mismatch: ${sourceGrade.grader.toUpperCase()} vs ${cardGrader.toUpperCase()}`);
            return false;
          }
        }
        
        // Filter 3: Premium variations (only if card is a base card)
        // Don't filter if the original card has these keywords
        const cardHasPremium = hasPremiumKeyword(card.title + " " + (card.variation || ""));
        if (!cardHasPremium) {
          const premiumFound = hasPremiumKeyword(combinedText);
          if (premiumFound) {
            console.log(`[VARIATION FILTER] Excluded "$${pp.price}" - listing "${(pp as any).listingTitle || pp.source}" has premium: ${premiumFound}`);
            return false;
          }
        }
        
        return true;
      });
      
      if (pricePoints.length > 0 || parsed.estimatedValue > 0) {
        return {
          estimatedValue: parsed.estimatedValue || (pricePoints.length > 0 
            ? pricePoints.reduce((sum, pp) => sum + pp.price, 0) / pricePoints.length 
            : null),
          pricePoints,
          salesFound: pricePoints.length || parsed.salesFound || 0,
          confidence: parsed.confidence || "medium",
          confidenceReason: usingLooseFallback 
            ? `${pricePoints.length} price points (loose/approximate comps)` 
            : (parsed.confidenceReason || `${pricePoints.length} price points found`),
          rawSearchResults: rawResults,
          usedLooseFallback: usingLooseFallback, // Track if we used loose comps
        };
      }
    } catch {
      console.error("Failed to parse enhanced price response:", responseText);
    }
  }

  return null;
}

// Filter out EXTREME price outliers using IQR method
// Only removes truly anomalous prices (>2x IQR from quartiles) to preserve trend data
// This is more conservative than fixed % to avoid masking legitimate price growth/decline
function filterExtremeOutliers(
  pricePoints: PricePoint[]
): { filtered: PricePoint[]; removed: PricePoint[]; mean: number | null } {
  if (pricePoints.length < 4) {
    // Need at least 4 points for IQR to be meaningful
    const mean = pricePoints.length > 0 
      ? pricePoints.reduce((sum, pp) => sum + pp.price, 0) / pricePoints.length 
      : null;
    return { filtered: pricePoints, removed: [], mean };
  }
  
  const prices = pricePoints.map(p => p.price).sort((a, b) => a - b);
  const n = prices.length;
  
  // Calculate quartiles
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = prices[q1Index];
  const q3 = prices[q3Index];
  const iqr = q3 - q1;
  
  // Use 1.5x IQR for outlier bounds (standard IQR method)
  // This filters outliers more aggressively for consistent valuations
  const lowerBound = q1 - (1.5 * iqr);
  const upperBound = q3 + (1.5 * iqr);
  
  const filtered: PricePoint[] = [];
  const removed: PricePoint[] = [];
  
  for (const pp of pricePoints) {
    if (pp.price >= lowerBound && pp.price <= upperBound) {
      filtered.push(pp);
    } else {
      removed.push(pp);
      console.log(`[EXTREME OUTLIER] Excluded "$${pp.price}" from "${pp.source}" - outside IQR bounds ($${lowerBound.toFixed(0)}-$${upperBound.toFixed(0)})`);
    }
  }
  
  // Calculate mean from filtered points
  const mean = filtered.length > 0 
    ? filtered.reduce((sum, pp) => sum + pp.price, 0) / filtered.length 
    : null;
  
  // If we removed too many, fall back to original
  if (filtered.length < 2) {
    console.log(`[EXTREME OUTLIER] Too aggressive - reverting to original ${pricePoints.length} comps`);
    const originalMean = pricePoints.reduce((sum, pp) => sum + pp.price, 0) / pricePoints.length;
    return { filtered: pricePoints, removed: [], mean: originalMean };
  }
  
  return { filtered, removed, mean };
}

interface PriceLookupCache {
  data: EnhancedPriceLookupResult;
  cachedAt: number;
}
const enhancedPriceCache = new Map<string, PriceLookupCache>();
const PRICE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function getPriceCacheKey(card: CardInfo): string {
  return [
    card.title.toLowerCase().trim(),
    card.year?.toString() || "",
    (card.set || "").toLowerCase().trim(),
    (card.variation || "").toLowerCase().trim(),
    (card.grade || "").toLowerCase().trim(),
    (card.grader || "").toLowerCase().trim(),
  ].join("|");
}

export async function lookupEnhancedCardPrice(card: CardInfo): Promise<EnhancedPriceLookupResult> {
  const cacheKey = getPriceCacheKey(card);
  const cached = enhancedPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) {
    console.log(`[Enhanced Price] Cache hit for: ${card.title} (${Math.round((Date.now() - cached.cachedAt) / 1000 / 60)}min old)`);
    return cached.data;
  }

  const queries = buildSearchQueries(card);
  const strictPricePoints: PricePoint[] = [];
  const loosePricePoints: PricePoint[] = [];
  const allRawResults: Array<{ title: string; snippet: string; link: string }> = [];
  
  try {
    // Try multiple queries to gather more price data
    // IMPORTANT: Track strict vs loose separately, only use loose if NO strict found across ALL queries
    for (const query of queries.slice(0, 2)) { // Use first 2 queries
      console.log(`[Enhanced] Trying search query: ${query}`);
      const result = await tryEnhancedSearchQuery(query, card);
      
      if (result) {
        // Check if this result came from strict or loose comps using the explicit flag
        const isFromStrictComps = !(result as any).usedLooseFallback;
        
        // Merge price points into appropriate bucket, avoiding duplicates by URL
        for (const pp of result.pricePoints) {
          const isDuplicateStrict = strictPricePoints.some(
            existing => existing.url && pp.url && existing.url === pp.url
          );
          const isDuplicateLoose = loosePricePoints.some(
            existing => existing.url && pp.url && existing.url === pp.url
          );
          
          if (isFromStrictComps && !isDuplicateStrict) {
            strictPricePoints.push(pp);
          } else if (!isFromStrictComps && !isDuplicateLoose && !isDuplicateStrict) {
            loosePricePoints.push(pp);
          }
        }
        
        // Merge raw results
        if (result.rawSearchResults) {
          for (const raw of result.rawSearchResults) {
            const isDuplicate = allRawResults.some(existing => existing.link === raw.link);
            if (!isDuplicate) {
              allRawResults.push(raw);
            }
          }
        }
      }
      
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    // CRITICAL: Prioritize strict comps across ALL queries
    // Only fall back to loose if NO strict comps found from ANY query
    let allPricePoints = strictPricePoints.length > 0 ? strictPricePoints : loosePricePoints;
    const usingLooseFallback = strictPricePoints.length === 0 && loosePricePoints.length > 0;
    
    if (usingLooseFallback) {
      console.log(`[Enhanced] WARNING: No strict comps found, using ${loosePricePoints.length} loose comps`);
    } else if (strictPricePoints.length > 0) {
      console.log(`[Enhanced] Using ${strictPricePoints.length} strict comps (ignored ${loosePricePoints.length} loose)`);
    }

    // FILTER 1: Exclude retail asking prices (not sold prices)
    // Sites like CardCollector2 show $900 asking prices that inflate estimates
    const beforeRetailFilter = allPricePoints.length;
    allPricePoints = allPricePoints.filter(pp => {
      const url = pp.url || "";
      if (isRetailAskingPrice(url)) {
        console.log(`[RETAIL FILTER] Excluded asking price from retail site: "${pp.source}" - $${pp.price} (${url})`);
        return false;
      }
      return true;
    });
    if (beforeRetailFilter > allPricePoints.length) {
      console.log(`[RETAIL FILTER] Removed ${beforeRetailFilter - allPricePoints.length} retail asking prices, ${allPricePoints.length} remain`);
    }

    // FILTER 2: Exclude results from wrong sets (Donruss vs Donruss Optic, etc.)
    // Check source text, URL, and listing title for set mismatches
    const beforeSetFilter = allPricePoints.length;
    allPricePoints = allPricePoints.filter(pp => {
      const combinedText = `${pp.source || ""} ${pp.url || ""} ${(pp as any).listingTitle || ""}`;
      if (isWrongSet(combinedText, card.set)) {
        console.log(`[SET FILTER] Excluded wrong set: "${pp.source}" - $${pp.price} (URL: ${pp.url})`);
        return false;
      }
      return true;
    });
    if (beforeSetFilter > allPricePoints.length) {
      console.log(`[SET FILTER] Removed ${beforeSetFilter - allPricePoints.length} wrong-set results, ${allPricePoints.length} remain`);
    }

    // FILTER 3: When no variation is specified, filter out premium variations
    // This prevents Downtown ($400) from contaminating base card ($25) estimates
    if (!card.variation) {
      const beforeFilter = allPricePoints.length;
      allPricePoints = allPricePoints.filter(pp => {
        const sourceText = pp.source.toLowerCase();
        const isPremium = containsPremiumVariation(sourceText);
        if (isPremium) {
          console.log(`[BASE CARD FILTER] Excluded premium variation: "${pp.source}" - $${pp.price}`);
        }
        return !isPremium;
      });
      if (beforeFilter > allPricePoints.length) {
        console.log(`[BASE CARD FILTER] Filtered ${beforeFilter - allPricePoints.length} premium variation comps, ${allPricePoints.length} remain`);
      }
    }

    // BASELINE FALLBACK: When no valid comps found for base cards, use baseline range
    if (allPricePoints.length === 0 && !card.variation) {
      const baseline = getBaselinePrice(card);
      if (baseline) {
        console.log(`[BASELINE] No comps found, using baseline estimate: $${baseline.low}-$${baseline.high} (mid: $${baseline.mid})`);
        const baselineResult: EnhancedPriceLookupResult = {
          estimatedValue: baseline.mid,
          pricePoints: [{
            date: new Date().toISOString().split('T')[0],
            price: baseline.mid,
            source: `Baseline estimate for ${card.set || 'base'} cards ($${baseline.low}-$${baseline.high} range)`,
          }],
          salesFound: 0,
          confidence: "low",
          confidenceReason: `Baseline estimate used (no recent comps found). Typical range: $${baseline.low}-$${baseline.high}`,
          rawSearchResults: allRawResults.slice(0, 15),
          matchConfidence: {
            tier: "LOW" as const,
            score: 0.3,
            reason: "Baseline estimate - no live comps",
            matchedComps: 0,
            totalComps: 0,
            samples: [],
          },
        };
        enhancedPriceCache.set(cacheKey, { data: baselineResult, cachedAt: Date.now() });
        return baselineResult;
      }
    }

    // Apply IQR-based extreme outlier filter
    // Uses 2x IQR bounds to only remove truly anomalous prices (preserves legitimate trends)
    const { filtered: filteredPricePoints, removed: removedOutliers, mean } = 
      filterExtremeOutliers(allPricePoints);
    
    if (removedOutliers.length > 0) {
      console.log(`[EXTREME OUTLIER] Removed ${removedOutliers.length} of ${allPricePoints.length} comps (outside IQR bounds)`);
    }

    // Calculate final values using filtered price points
    const salesFound = filteredPricePoints.length;
    const estimatedValue = mean; // Use mean from filter (calculated before filtering)
    
    // Compute card match confidence from raw search results
    const matchConfidence = computeCardMatchConfidence(allRawResults, card);
    
    // Determine confidence based on data quality
    let confidence: "high" | "medium" | "low";
    let confidenceReason: string;
    
    if (salesFound >= 10) {
      confidence = "high";
      confidenceReason = `${salesFound} price points from multiple sources`;
    } else if (salesFound >= 4) {
      confidence = "medium";
      confidenceReason = `${salesFound} price points found - moderate data coverage`;
    } else if (salesFound >= 1) {
      confidence = "low";
      confidenceReason = `Only ${salesFound} price point(s) found - sparse data`;
    } else {
      confidence = "low";
      confidenceReason = "No sold listings found";
    }
    
    // Note if outliers were removed
    if (removedOutliers.length > 0) {
      confidenceReason = `${confidenceReason} (${removedOutliers.length} outliers filtered)`;
    }
    
    // Downgrade market confidence if match confidence is LOW
    if (matchConfidence.tier === "LOW" && confidence !== "low") {
      confidence = matchConfidence.tier === "LOW" && confidence === "high" ? "medium" : "low";
      confidenceReason = `${confidenceReason}. Match confidence: ${matchConfidence.reason}`;
    }

    const finalResult: EnhancedPriceLookupResult = {
      estimatedValue,
      pricePoints: filteredPricePoints.slice(0, 20),
      salesFound,
      confidence,
      confidenceReason,
      rawSearchResults: allRawResults.slice(0, 15),
      matchConfidence,
    };
    enhancedPriceCache.set(cacheKey, { data: finalResult, cachedAt: Date.now() });
    return finalResult;
  } catch (error) {
    console.error("Enhanced price lookup error:", error);
    return {
      estimatedValue: null,
      pricePoints: [],
      salesFound: 0,
      confidence: "low",
      confidenceReason: `Lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      matchConfidence: {
        tier: "LOW" as const,
        score: 0,
        reason: "Lookup failed",
        matchedComps: 0,
        totalComps: 0,
        samples: [],
      },
    };
  }
}

// Filter outliers using IQR method to tighten price ranges
// Returns { filteredPrices, min, max, median }
function filterPriceOutliers(pricePoints: PricePoint[]): {
  filteredPrices: PricePoint[];
  min: number | null;
  max: number | null;
  median: number | null;
  originalCount: number;
  removedCount: number;
} {
  if (pricePoints.length === 0) {
    return { filteredPrices: [], min: null, max: null, median: null, originalCount: 0, removedCount: 0 };
  }

  const prices = pricePoints.map(p => p.price).sort((a, b) => a - b);
  const n = prices.length;
  
  // Need at least 4 comps for IQR filtering
  if (n < 4) {
    const median = prices[Math.floor(n / 2)];
    return {
      filteredPrices: pricePoints,
      min: prices[0],
      max: prices[n - 1],
      median,
      originalCount: n,
      removedCount: 0,
    };
  }

  // Calculate quartiles
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = prices[q1Index];
  const q3 = prices[q3Index];
  const iqr = q3 - q1;

  // Use 1.5x IQR for outlier detection (standard Tukey method)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  // Filter to keep only non-outliers
  const filteredPrices = pricePoints.filter(p => p.price >= lowerBound && p.price <= upperBound);
  
  // If filtering removes too many (>50%), fall back to less aggressive filtering
  if (filteredPrices.length < n * 0.5 && filteredPrices.length < 3) {
    // Use 2.5x IQR instead
    const looseLower = q1 - 2.5 * iqr;
    const looseUpper = q3 + 2.5 * iqr;
    const looseFiltered = pricePoints.filter(p => p.price >= looseLower && p.price <= looseUpper);
    
    if (looseFiltered.length >= 3) {
      const loosePrices = looseFiltered.map(p => p.price).sort((a, b) => a - b);
      return {
        filteredPrices: looseFiltered,
        min: loosePrices[0],
        max: loosePrices[loosePrices.length - 1],
        median: loosePrices[Math.floor(loosePrices.length / 2)],
        originalCount: n,
        removedCount: n - looseFiltered.length,
      };
    }
    
    // Fall back to original
    const median = prices[Math.floor(n / 2)];
    return {
      filteredPrices: pricePoints,
      min: prices[0],
      max: prices[n - 1],
      median,
      originalCount: n,
      removedCount: 0,
    };
  }

  const filteredSorted = filteredPrices.map(p => p.price).sort((a, b) => a - b);
  const removedCount = n - filteredPrices.length;
  
  if (removedCount > 0) {
    console.log(`[PriceService] Outlier filtering: removed ${removedCount} of ${n} comps (bounds: $${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)})`);
  }

  return {
    filteredPrices,
    min: filteredSorted[0],
    max: filteredSorted[filteredSorted.length - 1],
    median: filteredSorted[Math.floor(filteredSorted.length / 2)],
    originalCount: n,
    removedCount,
  };
}

export { type EnhancedPriceLookupResult, type PricePoint, type OneOfOneProjection, type ParallelCompData, computeCardMatchConfidence, filterPriceOutliers };
