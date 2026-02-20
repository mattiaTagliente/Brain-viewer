/** Backend API client. */

const BASE_URL = "http://localhost:8000";

interface ApiResponse<T> {
  data: T;
  error: string | null;
  meta?: Record<string, unknown>;
}

interface FullApiResponse<T> {
  data: T;
  error: string | null;
  meta?: Record<string, unknown>;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const json: ApiResponse<T> = await res.json();
  if (json.error) throw new Error(json.error);
  return json.data;
}

async function fetchJsonFull<T>(path: string, init?: RequestInit): Promise<FullApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const json: FullApiResponse<T> = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

import type { GraphData, EntityDetail, TimelineEvent, NodePosition } from "./types";

export async function fetchGraph(scope?: string): Promise<GraphData> {
  const params = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return fetchJson<GraphData>(`/api/graph${params}`);
}

export async function fetchEntity(entityId: string): Promise<EntityDetail> {
  return fetchJson<EntityDetail>(`/api/entity/${encodeURIComponent(entityId)}`);
}

const TIMELINE_PAGE_SIZE = 50000;

export async function fetchTimeline(opts?: {
  compress?: boolean;
  gapThreshold?: number;
  since?: string;
  limit?: number;
  offset?: number;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<TimelineEvent[]> {
  const baseParams = new URLSearchParams();
  if (opts?.compress !== undefined) baseParams.set("compress", String(opts.compress));
  if (opts?.gapThreshold !== undefined) baseParams.set("gap_threshold", String(opts.gapThreshold));
  if (opts?.since) baseParams.set("since", opts.since);

  // If caller specified explicit limit/offset, do a single fetch
  if (opts?.limit !== undefined || opts?.offset !== undefined) {
    const params = new URLSearchParams(baseParams);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return fetchJson<TimelineEvent[]>(`/api/timeline${qs ? "?" + qs : ""}`);
  }

  // Auto-paginate: fetch all events in pages
  let allEvents: TimelineEvent[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(TIMELINE_PAGE_SIZE));
    params.set("offset", String(offset));
    const qs = params.toString();

    const response = await fetchJsonFull<TimelineEvent[]>(`/api/timeline${qs ? "?" + qs : ""}`);
    allEvents = allEvents.concat(response.data);
    total = (response.meta?.total as number) ?? allEvents.length;
    offset += TIMELINE_PAGE_SIZE;

    opts?.onProgress?.(allEvents.length, total);

    // Safety: if we got fewer events than requested, we're done
    if (response.data.length < TIMELINE_PAGE_SIZE) break;
  }

  return allEvents;
}

export async function fetchStatus(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>("/api/status");
}

export async function savePositions(
  positions: Record<string, NodePosition>,
  layoutHash: string,
  scope: string = "global"
): Promise<void> {
  await fetchJson("/api/layout/positions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positions, layout_hash: layoutHash, scope }),
  });
}

export async function recomputeLayout(): Promise<void> {
  await fetchJson("/api/layout/recompute", { method: "POST" });
}

export async function fetchSimilarity(
  entityIds: string[]
): Promise<{ matrix: Record<string, Record<string, number>>; ids: string[] }> {
  return fetchJson("/api/embeddings/similarity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_ids: entityIds }),
  });
}
