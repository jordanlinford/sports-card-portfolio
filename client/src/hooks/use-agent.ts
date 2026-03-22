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
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
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

    let receivedAnyData = false;

    eventSource.onmessage = (event) => {
      try {
        receivedAnyData = true;
        retryCountRef.current = 0;
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
      eventSource.close();
      eventSourceRef.current = null;

      if (!receivedAnyData && retryCountRef.current < 1) {
        retryCountRef.current++;
        setSteps(["Reconnecting..."]);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          sendQuery(q);
        }, 2000);
        return;
      }

      if (!receivedAnyData) {
        setError("Could not connect to Agent. Please refresh the page and try again.");
      } else {
        setError("Connection to Agent was interrupted. Please try again.");
      }
      setIsThinking(false);
    };
  }, [query, cancel]);

  const reset = useCallback(() => {
    cancel();
    setSteps([]);
    setResult(null);
    setError(null);
    setQuery("");
    retryCountRef.current = 0;
  }, [cancel]);

  return { query, setQuery, steps, result, isThinking, error, sendQuery, reset, cancel };
}
