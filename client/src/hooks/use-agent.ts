import { useState, useCallback, useRef } from "react";

interface AgentResult {
  title: string;
  description: string;
  alert: boolean;
  alpha: string | null;
}

export function useAgent() {
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsThinking(false);
  }, []);

  const sendQuery = useCallback((overrideQuery?: string) => {
    const q = (overrideQuery || query).trim();
    if (!q) return;

    cancel();

    setSteps([]);
    setResult(null);
    setError(null);
    setIsThinking(true);
    if (overrideQuery) setQuery(overrideQuery);

    const eventSource = new EventSource(
      `/api/agent/stream?q=${encodeURIComponent(q)}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === "step") {
          setSteps((prev) => [...prev, data.message]);
        }

        if (data.status === "complete") {
          setResult(data.payload);
          setIsThinking(false);
          eventSource.close();
          eventSourceRef.current = null;
        }

        if (data.status === "error") {
          setError(data.message);
          setIsThinking(false);
          eventSource.close();
          eventSourceRef.current = null;
        }
      } catch {
        // Ignore parse errors from SSE
      }
    };

    eventSource.onerror = () => {
      setError("Connection to Agent lost. Please try again.");
      setIsThinking(false);
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [query, cancel]);

  const reset = useCallback(() => {
    cancel();
    setSteps([]);
    setResult(null);
    setError(null);
    setQuery("");
  }, [cancel]);

  return { query, setQuery, steps, result, isThinking, error, sendQuery, reset, cancel };
}
