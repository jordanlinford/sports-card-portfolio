import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PlayerSuggestion {
  name: string;
  sport: string;
  position: string;
  stage: string;
}

interface PlayerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (player: PlayerSuggestion) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
  onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
}

export function PlayerAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Enter player name...",
  className,
  id,
  "data-testid": dataTestId,
  onKeyDown,
}: PlayerAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: suggestions = [] } = useQuery<PlayerSuggestion[]>({
    queryKey: ["/api/player-suggestions", value],
    queryFn: async () => {
      if (value.length < 2) return [];
      const res = await fetch(`/api/player-suggestions?q=${encodeURIComponent(value)}`);
      return res.json();
    },
    enabled: value.length >= 2,
    staleTime: 30000,
  });

  useEffect(() => {
    setIsOpen(suggestions.length > 0 && value.length >= 2);
    setHighlightedIndex(-1);
  }, [suggestions, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (player: PlayerSuggestion) => {
    onChange(player.name);
    onSelect?.(player);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      onKeyDown?.(e);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          handleSelect(suggestions[highlightedIndex]);
        } else {
          onKeyDown?.(e);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
      default:
        onKeyDown?.(e);
    }
  };

  const getSportColor = (sport: string) => {
    switch (sport.toLowerCase()) {
      case "basketball": return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "football": return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "baseball": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "hockey": return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
      case "soccer": return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className={className}
        data-testid={dataTestId}
        autoComplete="off"
      />
      
      {isOpen && suggestions.length > 0 && (
        <div 
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto"
          data-testid="autocomplete-dropdown"
        >
          {suggestions.map((player, index) => (
            <button
              key={`${player.name}-${player.sport}`}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover-elevate transition-colors",
                highlightedIndex === index && "bg-accent"
              )}
              onClick={() => handleSelect(player)}
              onMouseEnter={() => setHighlightedIndex(index)}
              data-testid={`suggestion-${index}`}
            >
              <span className="font-medium truncate">{player.name}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {player.position && (
                  <Badge variant="outline" className="text-xs">
                    {player.position}
                  </Badge>
                )}
                <Badge className={cn("text-xs", getSportColor(player.sport))}>
                  {player.sport}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
