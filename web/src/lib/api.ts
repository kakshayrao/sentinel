"use client";

import useSWR from "swr";

import type {
  ChatMessage,
  ChatMetrics,
  DiscoveredServer,
  HubBenchmark,
  LeaderboardRow,
  Model,
  Overview,
  Run,
  RunDetail,
  Suite,
  SuiteInfo,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function errorMessage(res: Response): Promise<string> {
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = await res.json();
    const detail = body?.detail ?? body;
    // FastAPI validation errors are a list of {loc, msg}
    message = Array.isArray(detail)
      ? detail.map((d) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`).join("; ")
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
  } catch {
    // non-JSON error body; keep statusText
  }
  if (res.status === 500 && message === "Internal Server Error") {
    message = "Can't reach the Sentinel API. Start it with: sentinel serve";
  }
  return message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};

export const fetcher = <T>(path: string) => request<T>(path);

const isActive = (r: Run) => r.status === "queued" || r.status === "running";

export function useHealth() {
  return useSWR<{ status: string; version: string }>("/health", fetcher, {
    refreshInterval: 10_000,
    shouldRetryOnError: false,
  });
}

export function useModels() {
  return useSWR<Model[]>("/models", fetcher);
}

export function useSuites() {
  return useSWR<SuiteInfo[]>("/suites", fetcher);
}

export function useSuite(id: string | null) {
  return useSWR<Suite>(id ? `/suites/${id}` : null, fetcher, { revalidateOnFocus: false });
}

export function useHub() {
  return useSWR<HubBenchmark[]>("/hub", fetcher, { revalidateOnFocus: false });
}

export function useDiscover() {
  return useSWR<DiscoveredServer[]>("/discover", fetcher, { revalidateOnFocus: false });
}

export function useOverview() {
  return useSWR<Overview>("/overview", fetcher, { refreshInterval: 5_000 });
}

export function useLeaderboard() {
  return useSWR<LeaderboardRow[]>("/arena/leaderboard", fetcher);
}

/** Polls while any run is still in progress. */
export function useRuns() {
  return useSWR<Run[]>("/runs", fetcher, {
    refreshInterval: (data) => (data?.some(isActive) ? 2_000 : 0),
  });
}

/** Polls while the run is queued or running. Pass null to skip. */
export function useRun(id: string | null) {
  return useSWR<RunDetail>(id ? `/runs/${id}` : null, fetcher, {
    refreshInterval: (data) => (data && isActive(data) ? 1_500 : 0),
  });
}

/** Streams a playground reply. Calls onDelta per answer chunk (and onReasoning for thinking
 * models) and resolves with the speed metrics. */
export async function streamChat(
  body: { model_id: string; messages: ChatMessage[]; temperature: number; max_tokens: number },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  onReasoning?: (text: string) => void,
): Promise<ChatMetrics | null> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, await errorMessage(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let metrics: ChatMetrics | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new ApiError(502, event.error);
      if (event.delta) onDelta(event.delta);
      if (event.reasoning) onReasoning?.(event.reasoning);
      if (event.done) metrics = event.metrics;
    }
  }
  return metrics;
}
