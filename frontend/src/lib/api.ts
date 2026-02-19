/** Backend API client. */

const BASE_URL = "http://localhost:8000";

interface ApiResponse<T> {
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

import type { GraphData, EntityDetail, TimelineEvent, NodePosition } from "./types";

export async function fetchGraph(scope?: string): Promise<GraphData> {
  const params = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return fetchJson<GraphData>(`/api/graph${params}`);
}

export async function fetchEntity(entityId: string): Promise<EntityDetail> {
  return fetchJson<EntityDetail>(`/api/entity/${encodeURIComponent(entityId)}`);
}

export async function fetchTimeline(opts?: {
  compress?: boolean;
  gapThreshold?: number;
  since?: string;
  limit?: number;
  offset?: number;
}): Promise<TimelineEvent[]> {
  const params = new URLSearchParams();
  if (opts?.compress !== undefined) params.set("compress", String(opts.compress));
  if (opts?.gapThreshold !== undefined) params.set("gap_threshold", String(opts.gapThreshold));
  if (opts?.since) params.set("since", opts.since);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return fetchJson<TimelineEvent[]>(`/api/timeline${qs ? "?" + qs : ""}`);
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
