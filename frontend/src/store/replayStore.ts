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
