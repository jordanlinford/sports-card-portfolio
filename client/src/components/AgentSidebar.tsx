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

const FOLLOW_UP_QUERIES = [
  "Dig deeper into my riskiest cards",
  "What should I sell first?",
  "Show me my best performing cards",
  "Any hidden gems I should look at?",
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
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isPro && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isPro]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [steps, result, error]);

  const handleSubmit = () => {
    sendQuery();
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendQuery(suggestion);
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          data-testid="button-agent-toggle"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 h-11 rounded-full px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold text-sm hover:scale-105 active:scale-95 transition-all border border-amber-400/30"
          style={{ boxShadow: "0 4px 20px rgba(245, 158, 11, 0.35)" }}
        >
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span>Agent</span>
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 sm:hidden"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 h-screen w-full sm:w-[400px] z-50 bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 p-4 sm:p-6 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
              data-testid="panel-agent-sidebar"
            >
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Command size={18} />
                </div>
                <div className="flex-1">
                  <h2 className="text-base sm:text-lg font-bold text-white leading-none">
                    Agent Mode
                  </h2>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
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
                  <X size={18} />
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
                  <div className="relative mb-3 sm:mb-4">
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && query.trim()) {
                          if (result || error) reset();
                          setTimeout(() => sendQuery(query), 50);
                        }
                      }}
                      placeholder={result ? "Ask a follow-up..." : "Ask about your portfolio..."}
                      disabled={isThinking}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-4 pr-14 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-50"
                      data-testid="input-agent-query"
                    />
                    <div className="absolute right-2 top-1.5 flex items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (result || error) reset();
                          setTimeout(() => sendQuery(query), 50);
                        }}
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
                          <button
                            onClick={() => sendQuery(query)}
                            className="block mt-2 text-xs text-amber-500 hover:text-amber-400 underline"
                          >
                            Retry
                          </button>
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
                            className="text-xs text-slate-400 leading-relaxed mb-4 whitespace-pre-wrap max-h-[300px] overflow-y-auto"
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

                  {(result || error) && !isThinking && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Ask another question
                      </p>
                      {FOLLOW_UP_QUERIES.map((suggestion, i) => (
                        <button
                          key={i}
                          className="w-full text-left p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-900 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                          onClick={() => {
                            reset();
                            setTimeout(() => sendQuery(suggestion), 50);
                          }}
                          data-testid={`button-agent-followup-${i}`}
                        >
                          {suggestion}
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={reset}
                        className="text-slate-500 hover:text-white text-xs gap-1.5 w-full justify-center mt-1"
                        data-testid="button-agent-reset"
                      >
                        <RotateCcw size={12} />
                        Clear & start over
                      </Button>
                    </div>
                  )}

                  {!isThinking && !result && !error && steps.length === 0 && (
                    <div className="mt-auto space-y-2 pt-2">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">
                        Suggested Queries
                      </p>
                      {SUGGESTED_QUERIES.map((suggestion, i) => (
                        <button
                          key={i}
                          className="w-full text-left p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-900/80 text-xs text-slate-400 hover:text-slate-300 transition-colors"
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
          </>
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
