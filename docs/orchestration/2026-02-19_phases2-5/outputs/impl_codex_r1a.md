=== FILE: frontend/src/store/replayStore.ts ===
import { create } from "zustand";
import { fetchTimeline } from "../lib/api";
import type { Severity, TimelineEvent } from "../lib/types";

const ENTITY_ANIM_MS = 500;
const RELATION_ANIM_MS = 300;
const OBSERVATION_PULSE_MS = 800;
const GAP_PAUSE_MS = 500;
const MAX_EVENTS_PER_TICK = 1000;

function toMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSeverity(data: Record<string, unknown>): Severity {
  const value = asString(data.severity);
  if (value === "blocking" || value === "major" || value === "minor" || value === "info") {
    return value;
  }
  return "info";
}

function relationIdForEvent(event: TimelineEvent, index: number): string {
  const direct = asString(event.data.id) ?? asString(event.data.relation_id);
  if (direct) return direct;

  const subject = asString(event.data.subject_id) ?? "unknown-subject";
  const predicate = asString(event.data.predicate) ?? "related";
  const object = asString(event.data.object_id) ?? "unknown-object";
  return `${subject}|${predicate}|${object}|${event.timestamp}|${index}`;
}

function eventDelayMs(events: TimelineEvent[], currentIndex: number, nextIndex: number): number {
  if (nextIndex <= 0) return 0;
  const nextEvent = events[nextIndex];
  if (nextEvent.event_type === "GAP_SKIPPED") return GAP_PAUSE_MS;
  const currentEvent = events[currentIndex];
  const delta = toMs(nextEvent.timestamp) - toMs(currentEvent.timestamp);
  return Math.max(0, delta);
}

interface ReplayState {
  events: TimelineEvent[];
  currentIndex: number;
  playing: boolean;
  speed: number;
  compressIdle: boolean;
  gapThreshold: number;
  visibleEntityIds: Set<string>;
  visibleRelationIds: Set<string>;
  animatingEntities: Set<string>;
  animatingRelations: Set<string>;
  pulsingEntities: Map<string, Severity>;
  replayActive: boolean;
  loading: boolean;

  _lastTickMs: number | null;
  _accumulatedMs: number;

  loadTimeline: () => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  seekTo: (index: number) => void;
  setSpeed: (n: number) => void;
  setCompressIdle: (v: boolean) => void;
  setGapThreshold: (n: number) => void;
  startReplay: () => Promise<void>;
  exitReplay: () => void;
  reset: () => void;
  tick: (nowMs?: number) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  events: [],
  currentIndex: -1,
  playing: false,
  speed: 1,
  compressIdle: true,
  gapThreshold: 60,
  visibleEntityIds: new Set<string>(),
  visibleRelationIds: new Set<string>(),
  animatingEntities: new Set<string>(),
  animatingRelations: new Set<string>(),
  pulsingEntities: new Map<string, Severity>(),
  replayActive: false,
  loading: false,

  _lastTickMs: null,
  _accumulatedMs: 0,

  loadTimeline: async () => {
    const { compressIdle, gapThreshold } = get();
    set({ loading: true });
    try {
      const events = await fetchTimeline({
        compress: compressIdle,
        gapThreshold,
      });
      set({
        events,
        currentIndex: -1,
        playing: false,
        visibleEntityIds: new Set<string>(),
        visibleRelationIds: new Set<string>(),
        animatingEntities: new Set<string>(),
        animatingRelations: new Set<string>(),
        pulsingEntities: new Map<string, Severity>(),
        loading: false,
        _lastTickMs: null,
        _accumulatedMs: 0,
      });
    } catch {
      set({ loading: false, playing: false });
    }
  },

  play: () => {
    const { events, currentIndex } = get();
    if (events.length === 0 || currentIndex >= events.length - 1) return;
    set({ playing: true, _lastTickMs: null });
  },

  pause: () => set({ playing: false, _lastTickMs: null }),

  togglePlay: () => {
    if (get().playing) get().pause();
    else get().play();
  },

  stepForward: () => {
    const { currentIndex } = get();
    get().seekTo(currentIndex + 1);
  },

  stepBackward: () => {
    const { currentIndex } = get();
    get().seekTo(currentIndex - 1);
  },

  seekTo: (index: number) => {
    const { events } = get();
    if (events.length === 0) {
      set({
        currentIndex: -1,
        visibleEntityIds: new Set<string>(),
        visibleRelationIds: new Set<string>(),
        animatingEntities: new Set<string>(),
        animatingRelations: new Set<string>(),
        pulsingEntities: new Map<string, Severity>(),
        _accumulatedMs: 0,
        _lastTickMs: null,
      });
      return;
    }

    const clamped = Math.max(-1, Math.min(index, events.length - 1));
    const visibleEntityIds = new Set<string>();
    const visibleRelationIds = new Set<string>();

    for (let i = 0; i <= clamped; i += 1) {
      const event = events[i];
      if (event.event_type === "ENTITY_CREATED" && event.entity_id) {
        visibleEntityIds.add(event.entity_id);
      } else if (event.event_type === "RELATION_CREATED") {
        visibleRelationIds.add(relationIdForEvent(event, i));
      }
    }

    set({
      currentIndex: clamped,
      visibleEntityIds,
      visibleRelationIds,
      animatingEntities: new Set<string>(),
      animatingRelations: new Set<string>(),
      pulsingEntities: new Map<string, Severity>(),
      _accumulatedMs: 0,
      _lastTickMs: null,
    });
  },

  setSpeed: (n: number) => {
    const next = Number.isFinite(n) && n > 0 ? n : 1;
    set({ speed: next });
  },

  setCompressIdle: (v: boolean) => set({ compressIdle: v }),

  setGapThreshold: (n: number) => {
    const next = Number.isFinite(n) && n >= 0 ? n : 60;
    set({ gapThreshold: next });
  },

  startReplay: async () => {
    set({ replayActive: true });
    if (get().events.length === 0) {
      await get().loadTimeline();
    }
    get().seekTo(-1);
  },

  exitReplay: () =>
    set({
      replayActive: false,
      playing: false,
      currentIndex: -1,
      visibleEntityIds: new Set<string>(),
      visibleRelationIds: new Set<string>(),
      animatingEntities: new Set<string>(),
      animatingRelations: new Set<string>(),
      pulsingEntities: new Map<string, Severity>(),
      _lastTickMs: null,
      _accumulatedMs: 0,
    }),

  reset: () => get().seekTo(-1),

  tick: (nowMs?: number) => {
    const state = get();
    if (!state.playing || !state.replayActive) return;
    if (state.events.length === 0 || state.currentIndex >= state.events.length - 1) {
      set({ playing: false, _lastTickMs: null });
      return;
    }

    const now = nowMs ?? performance.now();
    const lastTick = state._lastTickMs ?? now;
    let accumulated = state._accumulatedMs + Math.max(0, now - lastTick);
    let nextIndex = state.currentIndex;
    const firedIndices: number[] = [];

    while (nextIndex + 1 < state.events.length && firedIndices.length < MAX_EVENTS_PER_TICK) {
      const candidate = nextIndex + 1;
      const delay = eventDelayMs(state.events, Math.max(nextIndex, 0), candidate);
      const scaledDelay = delay / Math.max(0.0001, state.speed);

      if (candidate === 0 || accumulated >= scaledDelay) {
        if (candidate !== 0) accumulated -= scaledDelay;
        nextIndex = candidate;
        firedIndices.push(candidate);
      } else {
        break;
      }
    }

    if (firedIndices.length === 0) {
      set({ _lastTickMs: now, _accumulatedMs: accumulated });
      return;
    }

    const animate = firedIndices.length <= 10;
    const visibleEntityIds = new Set(state.visibleEntityIds);
    const visibleRelationIds = new Set(state.visibleRelationIds);
    const animatingEntities = new Set(state.animatingEntities);
    const animatingRelations = new Set(state.animatingRelations);
    const pulsingEntities = new Map(state.pulsingEntities);

    for (const idx of firedIndices) {
      const event = state.events[idx];
      if (event.event_type === "ENTITY_CREATED") {
        const entityId = event.entity_id ?? asString(event.data.entity_id);
        if (entityId) {
          visibleEntityIds.add(entityId);
          if (animate) {
            animatingEntities.add(entityId);
            window.setTimeout(() => {
              const current = get();
              if (!current.animatingEntities.has(entityId)) return;
              const next = new Set(current.animatingEntities);
              next.delete(entityId);
              set({ animatingEntities: next });
            }, ENTITY_ANIM_MS);
          }
        }
      } else if (event.event_type === "RELATION_CREATED") {
        const relationId = relationIdForEvent(event, idx);
        visibleRelationIds.add(relationId);
        if (animate) {
          animatingRelations.add(relationId);
          window.setTimeout(() => {
            const current = get();
            if (!current.animatingRelations.has(relationId)) return;
            const next = new Set(current.animatingRelations);
            next.delete(relationId);
            set({ animatingRelations: next });
          }, RELATION_ANIM_MS);
        }
      } else if (event.event_type === "OBSERVATION_ADDED") {
        const entityId = event.entity_id ?? asString(event.data.entity_id);
        if (entityId && animate) {
          const severity = getSeverity(event.data);
          pulsingEntities.set(entityId, severity);
          window.setTimeout(() => {
            const current = get();
            if (!current.pulsingEntities.has(entityId)) return;
            const next = new Map(current.pulsingEntities);
            next.delete(entityId);
            set({ pulsingEntities: next });
          }, OBSERVATION_PULSE_MS);
        }
      }
    }

    const reachedEnd = nextIndex >= state.events.length - 1;
    set({
      currentIndex: nextIndex,
      visibleEntityIds,
      visibleRelationIds,
      animatingEntities,
      animatingRelations,
      pulsingEntities,
      playing: reachedEnd ? false : state.playing,
      _lastTickMs: reachedEnd ? null : now,
      _accumulatedMs: reachedEnd ? 0 : accumulated,
    });
  },
}));
=== END FILE ===

=== FILE: frontend/src/components/Timeline.tsx ===
import { useEffect, useMemo } from "react";
import { useReplayStore } from "../store/replayStore";

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 50, 100];

function formatTime(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gapHours(data: Record<string, unknown>): string {
  const seconds =
    asNumber(data.skipped_seconds) ??
    asNumber(data.gap_seconds) ??
    asNumber(data.skipped_duration_seconds);
  if (seconds === null) return "gap skipped";
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)}h skipped`;
  const minutes = seconds / 60;
  if (minutes >= 1) return `${minutes.toFixed(0)}m skipped`;
  return `${seconds.toFixed(0)}s skipped`;
}

export function Timeline() {
  const replayActive = useReplayStore((s) => s.replayActive);
  const playing = useReplayStore((s) => s.playing);
  const loading = useReplayStore((s) => s.loading);
  const events = useReplayStore((s) => s.events);
  const currentIndex = useReplayStore((s) => s.currentIndex);
  const speed = useReplayStore((s) => s.speed);
  const compressIdle = useReplayStore((s) => s.compressIdle);
  const gapThreshold = useReplayStore((s) => s.gapThreshold);

  const tick = useReplayStore((s) => s.tick);
  const loadTimeline = useReplayStore((s) => s.loadTimeline);
  const startReplay = useReplayStore((s) => s.startReplay);
  const exitReplay = useReplayStore((s) => s.exitReplay);
  const togglePlay = useReplayStore((s) => s.togglePlay);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBackward = useReplayStore((s) => s.stepBackward);
  const seekTo = useReplayStore((s) => s.seekTo);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setCompressIdle = useReplayStore((s) => s.setCompressIdle);
  const setGapThreshold = useReplayStore((s) => s.setGapThreshold);
  const reset = useReplayStore((s) => s.reset);

  useEffect(() => {
    if (!replayActive) return;
    let rafId = 0;
    const frame = (t: number) => {
      tick(t);
      rafId = window.requestAnimationFrame(frame);
    };
    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [replayActive, tick]);

  const progress = useMemo(() => {
    if (events.length <= 1 || currentIndex < 0) return 0;
    return Math.max(0, Math.min(1, currentIndex / (events.length - 1)));
  }, [events.length, currentIndex]);

  const gapMarkers = useMemo(() => {
    if (events.length <= 1) return [];
    return events
      .map((event, index) => ({ event, index }))
      .filter((item) => item.event.event_type === "GAP_SKIPPED")
      .map((item) => ({
        index: item.index,
        left: (item.index / (events.length - 1)) * 100,
        title: gapHours(item.event.data),
      }));
  }, [events]);

  if (!replayActive) {
    return (
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 44,
          zIndex: 25,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "auto",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <button
          onClick={() => {
            void startReplay();
          }}
          style={{
            background: "rgba(0,0,0,0.7)",
            color: "#888",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Start Replay
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 44,
        zIndex: 25,
        background: "rgba(0,0,0,0.7)",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "8px 10px",
        color: "#888",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 330px", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={togglePlay}
            disabled={events.length === 0 || loading}
            title={playing ? "Pause" : "Play"}
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#4a90d9",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {playing ? "||" : "▶"}
          </button>
          <button
            onClick={stepBackward}
            disabled={currentIndex <= -1 || loading}
            title="Step backward"
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            |&lt;
          </button>
          <button
            onClick={stepForward}
            disabled={events.length === 0 || currentIndex >= events.length - 1 || loading}
            title="Step forward"
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            &gt;|
          </button>
          <button
            onClick={reset}
            disabled={loading}
            style={{
              minWidth: 50,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Reset
          </button>
        </div>

        <div>
          <div
            onClick={(e) => {
              if (events.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
              const clamped = Math.max(0, Math.min(1, ratio));
              const targetIndex = Math.round(clamped * (events.length - 1));
              seekTo(targetIndex);
            }}
            style={{
              position: "relative",
              height: 16,
              borderRadius: 8,
              background: "#1f1f1f",
              border: "1px solid #333",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${progress * 100}%`,
                background: "rgba(74,144,217,0.35)",
              }}
            />
            {gapMarkers.map((marker) => (
              <div
                key={`gap-${marker.index}`}
                title={marker.title}
                style={{
                  position: "absolute",
                  left: `${marker.left}%`,
                  top: 1,
                  bottom: 1,
                  width: 1,
                  background: "#d8b45b",
                  opacity: 0.9,
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                left: `calc(${progress * 100}% - 5px)`,
                top: 2,
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#4a90d9",
                boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 5,
              display: "flex",
              justifyContent: "space-between",
              color: "#888",
              fontSize: 12,
            }}
          >
            <span>{Math.max(0, currentIndex + 1).toLocaleString()} / {events.length.toLocaleString()}</span>
            <span>{formatTime(events[currentIndex]?.timestamp)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <label style={{ color: "#888", fontSize: 12 }}>speed</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{
              height: 28,
              background: "#1b1b1b",
              color: "#888",
              border: "1px solid #444",
              borderRadius: 6,
              fontSize: 12,
              padding: "0 6px",
            }}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}x
              </option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#888", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={compressIdle}
              onChange={(e) => setCompressIdle(e.target.checked)}
              style={{ accentColor: "#4a90d9" }}
            />
            compress
          </label>

          <input
            type="number"
            min={0}
            step={1}
            value={gapThreshold}
            disabled={!compressIdle}
            onChange={(e) => setGapThreshold(Number(e.target.value))}
            title="Compress gaps longer than N seconds"
            style={{
              width: 68,
              height: 28,
              background: "#1b1b1b",
              color: "#888",
              border: "1px solid #444",
              borderRadius: 6,
              fontSize: 12,
              padding: "0 6px",
            }}
          />
          <span style={{ color: "#666", fontSize: 12 }}>s</span>

          <button
            onClick={() => {
              void loadTimeline();
            }}
            disabled={loading}
            style={{
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              fontSize: 12,
              cursor: "pointer",
              padding: "0 10px",
            }}
          >
            reload
          </button>

          <button
            onClick={exitReplay}
            style={{
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#4a90d9",
              fontSize: 12,
              cursor: "pointer",
              padding: "0 10px",
            }}
          >
            Exit Replay
          </button>
        </div>
      </div>
    </div>
  );
}
=== END FILE ===

=== FILE: frontend/src/hooks/useRealtime.ts ===
import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "../store/graphStore";
import type { Entity, EntityType, Relation } from "../lib/types";

const WS_URL = "ws://localhost:8000/ws/realtime";

type RowidKey = "entities" | "relations" | "observations";

interface LastSeenRowids {
  entities: number;
  relations: number;
  observations: number;
}

interface RealtimeMessage {
  type?: string;
  event_type?: string;
  data?: unknown;
  rowids?: Partial<Record<RowidKey, number>>;
  table?: string;
  rowid?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEntityType(value: unknown): EntityType {
  const v = asString(value);
  if (
    v === "concept" ||
    v === "method" ||
    v === "parameter" ||
    v === "dataset" ||
    v === "finding" ||
    v === "pitfall" ||
    v === "tool" ||
    v === "decision" ||
    v === "person"
  ) {
    return v;
  }
  return "concept";
}

function isRowidKey(value: string): value is RowidKey {
  return value === "entities" || value === "relations" || value === "observations";
}

function parseEntity(input: Record<string, unknown>): Entity | null {
  const id = asString(input.id);
  if (!id) return null;

  const nowIso = new Date().toISOString();
  return {
    id,
    name: asString(input.name) ?? id,
    entity_type: normalizeEntityType(input.entity_type),
    date_added: asString(input.date_added) ?? nowIso,
    date_modified: asString(input.date_modified) ?? asString(input.date_added) ?? nowIso,
    scope: asString(input.scope) ?? "global",
    metadata: asRecord(input.metadata) ?? {},
    observation_count: Math.max(0, asNumber(input.observation_count) ?? 0),
    community_id: asString(input.community_id),
    position: undefined,
  };
}

function parseRelation(input: Record<string, unknown>): Relation | null {
  const id = asString(input.id) ?? asString(input.relation_id);
  const subject_id = asString(input.subject_id);
  const object_id = asString(input.object_id);
  if (!id || !subject_id || !object_id) return null;

  const nowIso = new Date().toISOString();
  return {
    id,
    subject_id,
    object_id,
    predicate: asString(input.predicate) ?? "references",
    source_type: asString(input.source_type) ?? "other",
    source_ref: asString(input.source_ref) ?? "realtime_ws",
    date_added: asString(input.date_added) ?? nowIso,
    scope: asString(input.scope) ?? "global",
  };
}

function computeCentroid(
  entities: Entity[],
  positions: Record<string, { x: number; y: number; z: number }>,
  communityId: string | null
): { x: number; y: number; z: number } {
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (const entity of entities) {
    if (communityId !== null && entity.community_id !== communityId) continue;
    const pos = positions[entity.id];
    if (pos) points.push(pos);
  }

  if (points.length === 0 && communityId !== null) {
    for (const pos of Object.values(positions)) points.push(pos);
  }

  if (points.length === 0) return { x: 0, y: 0, z: 0 };

  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

export function useRealtime(enabled: boolean): { connected: boolean; lastHeartbeat: Date | null } {
  const [connected, setConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const closedRef = useRef(false);
  const lastSeenRowidsRef = useRef<LastSeenRowids>({
    entities: 0,
    relations: 0,
    observations: 0,
  });

  useEffect(() => {
    if (!enabled) {
      closedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    closedRef.current = false;

    const updateLastSeen = (message: RealtimeMessage) => {
      if (message.rowids) {
        for (const [key, value] of Object.entries(message.rowids)) {
          if (!isRowidKey(key)) continue;
          const numeric = asNumber(value);
          if (numeric !== null) {
            lastSeenRowidsRef.current[key] = Math.max(lastSeenRowidsRef.current[key], numeric);
          }
        }
      }

      const table = asString(message.table);
      const rowid = asNumber(message.rowid);
      if (table && rowid !== null && isRowidKey(table)) {
        lastSeenRowidsRef.current[table] = Math.max(lastSeenRowidsRef.current[table], rowid);
      }
    };

    const applyEntityCreated = (payload: Record<string, unknown>) => {
      const nested = asRecord(payload.entity);
      const entity = parseEntity(nested ?? payload);
      if (!entity) return;

      useGraphStore.setState((state) => {
        if (state.entities.some((item) => item.id === entity.id)) return {};

        const centroid = computeCentroid(state.entities, state.positions, entity.community_id);
        const jitter = () => (Math.random() - 0.5) * 20;

        return {
          entities: [...state.entities, entity],
          positions: {
            ...state.positions,
            [entity.id]: {
              x: centroid.x + jitter(),
              y: centroid.y + jitter(),
              z: centroid.z + jitter(),
            },
          },
        };
      });
    };

    const applyRelationCreated = (payload: Record<string, unknown>) => {
      const nested = asRecord(payload.relation);
      const relation = parseRelation(nested ?? payload);
      if (!relation) return;

      useGraphStore.setState((state) => {
        if (state.relations.some((item) => item.id === relation.id)) return {};
        return { relations: [...state.relations, relation] };
      });
    };

    const applyObservationAdded = (payload: Record<string, unknown>) => {
      const observation = asRecord(payload.observation);
      const entityId = asString(payload.entity_id) ?? (observation ? asString(observation.entity_id) : null);
      if (!entityId) return;

      useGraphStore.setState((state) => ({
        entities: state.entities.map((entity) =>
          entity.id === entityId
            ? { ...entity, observation_count: entity.observation_count + 1 }
            : entity
        ),
      }));
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (closedRef.current) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptRef.current = 0;
        ws.send(
          JSON.stringify({
            type: "resume",
            last_seen_rowids: lastSeenRowidsRef.current,
          })
        );
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        const parsed = (() => {
          try {
            return JSON.parse(event.data) as unknown;
          } catch {
            return null;
          }
        })();

        const message = asRecord(parsed) as RealtimeMessage | null;
        if (!message) return;

        updateLastSeen(message);

        const type = asString(message.type);
        if (type === "heartbeat") {
          setLastHeartbeat(new Date());
          return;
        }

        const eventType = asString(message.event_type) ?? type;
        const payload = asRecord(message.data) ?? (message as Record<string, unknown>);

        if (eventType === "ENTITY_CREATED") {
          applyEntityCreated(payload);
        } else if (eventType === "RELATION_CREATED") {
          applyRelationCreated(payload);
        } else if (eventType === "OBSERVATION_ADDED") {
          applyObservationAdded(payload);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled]);

  return { connected, lastHeartbeat };
}
=== END FILE ===

=== FILE: frontend/src/components/NodeLabels.tsx ===
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "troika-three-text";
import { useGraphStore } from "../store/graphStore";
import type { Entity } from "../lib/types";

interface LabelCandidate {
  entity: Entity;
  position: { x: number; y: number; z: number };
  distance: number;
  priority: number;
}

function nodeOffset(observationCount: number): number {
  if (observationCount <= 1) return 7;
  if (observationCount <= 5) return 8;
  if (observationCount <= 15) return 9;
  return 10;
}

function TextLabel({
  text,
  position,
  emphasized,
}: {
  text: string;
  position: [number, number, number];
  emphasized: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const textMesh = useMemo(() => new Text(), []);

  const width = Math.max(12, Math.min(46, text.length * 1.4));
  const height = 5.5;

  useEffect(() => {
    textMesh.text = text;
    textMesh.fontSize = 3;
    textMesh.color = 0xffffff;
    textMesh.anchorX = "center";
    textMesh.anchorY = "bottom";
    textMesh.textAlign = "center";
    textMesh.maxWidth = 120;
    textMesh.sync();

    return () => {
      textMesh.dispose();
    };
  }, [text, textMesh]);

  useFrame(({ camera }) => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 1.8, -0.05]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={emphasized ? "#111111" : "#000000"}
          transparent
          opacity={emphasized ? 0.5 : 0.35}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <primitive object={textMesh} position={[0, 0, 0]} />
    </group>
  );
}

export function NodeLabels() {
  const { camera } = useThree();

  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const hoveredEntityId = useGraphStore((s) => s.hoveredEntityId);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);

  const [cameraTick, setCameraTick] = useState(0);
  const tickAccumulatorRef = useRef(0);

  useFrame((_, delta) => {
    tickAccumulatorRef.current += delta;
    if (tickAccumulatorRef.current >= 0.15) {
      tickAccumulatorRef.current = 0;
      setCameraTick((value) => value + 1);
    }
  });

  const visibleEntities = useMemo(() => {
    if (filterEntityTypes.size === 0) return entities;
    return entities.filter((entity) => filterEntityTypes.has(entity.entity_type));
  }, [entities, filterEntityTypes]);

  const labels = useMemo(() => {
    const candidates: LabelCandidate[] = [];

    for (const entity of visibleEntities) {
      const pos = positions[entity.id];
      if (!pos) continue;

      const distance = camera.position.distanceTo(new THREE.Vector3(pos.x, pos.y, pos.z));
      const isSelected = entity.id === selectedEntityId;
      const isHovered = entity.id === hoveredEntityId;
      const inRange = distance < 150;

      if (!isSelected && !isHovered && !inRange) continue;

      const priority = isSelected ? 0 : isHovered ? 1 : 2;
      candidates.push({
        entity,
        position: pos,
        distance,
        priority,
      });
    }

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.distance - b.distance;
    });

    return candidates.slice(0, 30);
  }, [visibleEntities, positions, selectedEntityId, hoveredEntityId, camera, cameraTick]);

  if (labels.length === 0) return null;

  return (
    <>
      {labels.map((candidate) => {
        const yOffset = nodeOffset(candidate.entity.observation_count);
        const emphasized =
          candidate.entity.id === selectedEntityId || candidate.entity.id === hoveredEntityId;

        return (
          <TextLabel
            key={candidate.entity.id}
            text={candidate.entity.name}
            emphasized={emphasized}
            position={[
              candidate.position.x,
              candidate.position.y + yOffset,
              candidate.position.z,
            ]}
          />
        );
      })}
    </>
  );
}
=== END FILE ===