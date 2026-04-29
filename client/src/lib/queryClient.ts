import { QueryClient, QueryFunction } from "@tanstack/react-query";

// CSRF token management — token is returned in response headers
// and sent back on state-changing requests
let csrfToken: string | null = null;

function updateCsrfToken(res: Response) {
  const token = res.headers.get("x-csrf-token");
  if (token) csrfToken = token;
}

// Exposed so non-apiRequest fetches (e.g. multipart/scan endpoints) can
// attach the CSRF header and update the cached token after each response.
export function getCsrfToken(): string | null {
  return csrfToken;
}

export function captureCsrfToken(res: Response) {
  updateCsrfToken(res);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  updateCsrfToken(res);
  await throwIfResNotOk(res);

  // Return JSON if response has content
  const text = await res.text();
  if (text) {
    return JSON.parse(text);
  }
  return null;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    updateCsrfToken(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Retry up to 2 times for server errors, not for 4xx
        if (error instanceof Error && error.message.startsWith("4")) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
