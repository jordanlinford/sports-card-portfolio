import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Command,
  Sparkles,
  Zap,
  ShieldAlert,
  TrendingUp,
  X,
  Send,
  RotateCcw,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgent } from "@/hooks/use-agent";
import { useAuth } from "@/hooks/useAuth";
import { hasProAccess } from "@shared/schema";

const SUGGESTED_QUERIES = [
  "Which cards in my collection are most at risk right now?",
  "Audit my portfolio for overexposure and concentration risk",
  "What are the best buy opportunities based on Hidden Gems?",
  "How does my portfolio compare to S&P 500 and Bitcoin?",
  "Which players have the hottest market momentum right now?",
];

export function AgentSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { query, setQuery, steps, result, isThinking, error, sendQuery, reset } =
    useAgent();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const isPro = hasProAccess(user);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [steps, result]);

  const handleSubmit = () => {
    if (!query.trim() || isThinking) return;
    sendQuery();
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendQuery(suggestion);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-agent-toggle"
        className={`fixed bottom-6 flex items-center gap-2 shadow-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold hover:scale-105 active:scale-95 transition-all z-50 border-2 border-amber-300/30 ${
          isOpen
            ? "right-[416px] h-10 w-10 rounded-full justify-center p-0"
            : "right-4 h-12 rounded-full px-4 sm:px-5"
        }`}
        style={{ boxShadow: "0 4px 24px rgba(245, 158, 11, 0.4)" }}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <Sparkles className="h-5 w-5 animate-pulse flex-shrink-0" />
            <span className="hidden sm:inline text-sm">Agent</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="fixed top-0 right-0 h-screen w-[400px] z-40 bg-slate-950/90 backdrop-blur-xl border-l border-slate-800 p-6 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            data-testid="panel-agent-sidebar"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Command size={20} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white leading-none">
                  Agent Mode
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Autonomous Portfolio Auditor
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white h-8 w-8 p-0"
                data-testid="button-agent-close"
              >
                <X size={16} />
              </Button>
            </div>

            {!isPro ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-4">
                <div className="p-4 rounded-full bg-amber-500/10">
                  <Lock className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="text-white font-bold text-lg">
                  Pro Feature
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Agent Mode is an AI-powered portfolio auditor that analyzes
                  your collection using real-time market data, player news, and
                  investment signals. Upgrade to Pro to unlock it.
                </p>
                <Button
                  className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
                  onClick={() => {
                    setIsOpen(false);
                    window.location.href = "/upgrade";
                  }}
                  data-testid="button-agent-upgrade"
                >
                  Upgrade to Pro
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mb-4">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    placeholder="Ask about your portfolio..."
                    disabled={isThinking}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-4 pr-20 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-50"
                    data-testid="input-agent-query"
                  />
                  <div className="absolute right-2 top-1.5 flex items-center gap-1">
                    <span className="text-[10px] text-slate-600 font-mono mr-1">
                      ⌘K
                    </span>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={isThinking || !query.trim()}
                      className="h-8 w-8 p-0 bg-amber-500 hover:bg-amber-600 text-black rounded-lg"
                      data-testid="button-agent-send"
                    >
                      <Send size={14} />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden" ref={scrollAreaRef}>
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3 text-sm items-start"
                        key={`step-${i}`}
                      >
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] shrink-0" />
                        <span className="text-slate-300 font-medium" data-testid={`text-agent-step-${i}`}>
                          {step}
                        </span>
                      </motion.div>
                    ))}

                    {isThinking && (
                      <div className="flex gap-3 items-center text-sm text-slate-500 italic pl-5">
                        <Zap className="text-amber-500/50 shrink-0 animate-pulse" size={14} />
                        Processing market signals...
                      </div>
                    )}

                    {error && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400"
                        data-testid="text-agent-error"
                      >
                        {error}
                      </motion.div>
                    )}

                    {result && (
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 relative overflow-hidden"
                        data-testid="card-agent-verdict"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                            Auditor Verdict
                          </span>
                          {result.alert && (
                            <ShieldAlert
                              className="text-red-500 animate-bounce"
                              size={18}
                            />
                          )}
                        </div>
                        <h3
                          className="text-white font-bold mb-2"
                          data-testid="text-verdict-title"
                        >
                          {result.title}
                        </h3>
                        <div
                          className="text-xs text-slate-400 leading-relaxed mb-4 whitespace-pre-wrap max-h-[300px] overflow-y-auto prose prose-invert prose-xs"
                          data-testid="text-verdict-description"
                        >
                          {formatDescription(result.description)}
                        </div>

                        {result.alpha && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-slate-700/50">
                            <div className="flex items-center gap-2">
                              <TrendingUp size={14} className="text-emerald-500" />
                              <span className="text-[11px] text-white font-mono">
                                Potential Alpha: {parseFloat(result.alpha) >= 0 ? "+" : ""}{result.alpha}%
                              </span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </ScrollArea>
                </div>

                {(result || error) && (
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={reset}
                      className="text-slate-400 hover:text-white text-xs gap-1.5"
                      data-testid="button-agent-reset"
                    >
                      <RotateCcw size={12} />
                      New Analysis
                    </Button>
                  </div>
                )}

                {!isThinking && !result && !error && steps.length === 0 && (
                  <div className="mt-auto space-y-2">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">
                      Suggested Queries
                    </p>
                    {SUGGESTED_QUERIES.map((suggestion, i) => (
                      <button
                        key={i}
                        className="w-full text-left p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-900/80 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                        onClick={() => handleSuggestionClick(suggestion)}
                        data-testid={`button-agent-suggestion-${i}`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function formatDescription(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/#{1,3}\s/g, "")
    .trim();
}
