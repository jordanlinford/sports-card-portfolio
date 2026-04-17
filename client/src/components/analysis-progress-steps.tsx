import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Circle } from "lucide-react";

const STEP_LABELS = [
  "Fetching product data",
  "Calculating hit odds and EV",
  "Scoring slots / grading value",
  "Generating verdict",
];

const STEP_TIMINGS_MS = [3000, 8000, 15000];

interface AnalysisProgressStepsProps {
  isAnalyzing: boolean;
  title?: string;
  subtitle?: string;
}

export function AnalysisProgressSteps({
  isAnalyzing,
  title = "Analyzing...",
  subtitle,
}: AnalysisProgressStepsProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) return;
    setElapsedMs(0);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const completed = [
    !isAnalyzing || elapsedMs >= STEP_TIMINGS_MS[0],
    !isAnalyzing || elapsedMs >= STEP_TIMINGS_MS[1],
    !isAnalyzing || elapsedMs >= STEP_TIMINGS_MS[2],
    !isAnalyzing,
  ];

  const activeIndex = completed.findIndex(c => !c);

  return (
    <div className="text-center py-8" data-testid="analysis-progress-steps">
      <h3 className="text-xl font-semibold mb-1">{title}</h3>
      {subtitle && (
        <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
      )}
      <ul className="max-w-sm mx-auto space-y-3 text-left">
        {STEP_LABELS.map((label, i) => {
          const isDone = completed[i];
          const isActive = !isDone && i === activeIndex;
          return (
            <li
              key={i}
              className="flex items-center gap-3"
              data-testid={`progress-step-${i + 1}`}
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <CheckCircle2
                    className="h-5 w-5 text-green-600 dark:text-green-400"
                    data-testid={`progress-step-${i + 1}-done`}
                  />
                ) : isActive ? (
                  <Loader2
                    className="h-5 w-5 text-primary animate-spin"
                    data-testid={`progress-step-${i + 1}-active`}
                  />
                ) : (
                  <Circle
                    className="h-5 w-5 text-muted-foreground/40"
                    data-testid={`progress-step-${i + 1}-pending`}
                  />
                )}
              </span>
              <span
                className={
                  isDone
                    ? "text-sm text-muted-foreground line-through"
                    : isActive
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
