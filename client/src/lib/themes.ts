export interface ThemeConfig {
  id: string;
  name: string;
  description: string;
  isPremium: boolean;
  background: string;
  cardBackground: string;
  textColor: string;
  accentColor: string;
  borderColor: string;
  preview: string;
}

export const DISPLAY_CASE_THEMES: ThemeConfig[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Clean, minimal design",
    isPremium: false,
    background: "bg-background",
    cardBackground: "bg-card",
    textColor: "text-foreground",
    accentColor: "text-primary",
    borderColor: "border-border",
    preview: "linear-gradient(135deg, hsl(0 0% 98%) 0%, hsl(0 0% 95%) 100%)",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Dark and elegant",
    isPremium: false,
    background: "bg-slate-900",
    cardBackground: "bg-slate-800",
    textColor: "text-slate-100",
    accentColor: "text-blue-400",
    borderColor: "border-slate-700",
    preview: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
  },
  {
    id: "wood",
    name: "Wood Grain",
    description: "Warm wooden display",
    isPremium: true,
    background: "bg-amber-950",
    cardBackground: "bg-amber-900/80",
    textColor: "text-amber-50",
    accentColor: "text-amber-300",
    borderColor: "border-amber-800",
    preview: "linear-gradient(135deg, #451a03 0%, #78350f 50%, #451a03 100%)",
  },
  {
    id: "velvet",
    name: "Velvet Red",
    description: "Luxurious red velvet",
    isPremium: true,
    background: "bg-red-950",
    cardBackground: "bg-red-900/80",
    textColor: "text-red-50",
    accentColor: "text-red-300",
    borderColor: "border-red-800",
    preview: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #450a0a 100%)",
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    description: "Deep sea inspired",
    isPremium: true,
    background: "bg-blue-950",
    cardBackground: "bg-blue-900/80",
    textColor: "text-blue-50",
    accentColor: "text-cyan-300",
    borderColor: "border-blue-800",
    preview: "linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #0c4a6e 100%)",
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Rich green display",
    isPremium: true,
    background: "bg-emerald-950",
    cardBackground: "bg-emerald-900/80",
    textColor: "text-emerald-50",
    accentColor: "text-emerald-300",
    borderColor: "border-emerald-800",
    preview: "linear-gradient(135deg, #022c22 0%, #064e3b 50%, #022c22 100%)",
  },
  {
    id: "gold",
    name: "Gold Luxury",
    description: "Premium gold accents",
    isPremium: true,
    background: "bg-yellow-950",
    cardBackground: "bg-yellow-900/80",
    textColor: "text-yellow-50",
    accentColor: "text-yellow-300",
    borderColor: "border-yellow-700",
    preview: "linear-gradient(135deg, #422006 0%, #854d0e 50%, #713f12 100%)",
  },
  {
    id: "purple",
    name: "Royal Purple",
    description: "Regal purple theme",
    isPremium: true,
    background: "bg-purple-950",
    cardBackground: "bg-purple-900/80",
    textColor: "text-purple-50",
    accentColor: "text-purple-300",
    borderColor: "border-purple-800",
    preview: "linear-gradient(135deg, #3b0764 0%, #581c87 50%, #3b0764 100%)",
  },
];

// Map legacy theme IDs to new ones for backward compatibility
const LEGACY_THEME_MAP: Record<string, string> = {
  "dark-wood": "wood",
  "gallery": "classic",
  "neon": "purple",
  "vintage": "classic", 
  "minimal": "classic",
};

export function getThemeById(themeId: string): ThemeConfig {
  // Check for legacy theme IDs and map to new ones
  const mappedId = LEGACY_THEME_MAP[themeId] || themeId;
  return DISPLAY_CASE_THEMES.find(t => t.id === mappedId) || DISPLAY_CASE_THEMES[0];
}

export function getThemeClasses(themeId: string): string {
  const theme = getThemeById(themeId);
  return `${theme.background} ${theme.textColor}`;
}

export function getThemeCardClasses(themeId: string): string {
  const theme = getThemeById(themeId);
  return `${theme.cardBackground} ${theme.borderColor} border`;
}
