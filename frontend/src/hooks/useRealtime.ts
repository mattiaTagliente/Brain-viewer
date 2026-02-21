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

/** Backend sends {type: "events", seq, events: [...], watermarks: {...}} or {type: "heartbeat", seq} */
interface WsEventsMessage {
  type: "events";
  seq: number;
  events: WsEvent[];
  watermarks: Partial<Record<RowidKey, number>>;
}

interface WsEvent {
  event_type: string;
  timestamp: string;
  entity_id: string | null;
  data: Record<string, unknown>;
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

function parseEntity(data: Record<string, unknown>, entityId: string | null): Entity | null {
  const id = entityId ?? asString(data.id);
  if (!id) return null;

  const nowIso = new Date().toISOString();
  return {
    id,
    name: asString(data.name) ?? id,
    entity_type: normalizeEntityType(data.entity_type),
    date_added: asString(data.date_added) ?? nowIso,
    date_modified: asString(data.date_modified) ?? nowIso,
    scope: asString(data.scope) ?? "global",
    metadata: asRecord(data.metadata) ?? {},
    observation_count: Math.max(0, asNumber(data.observation_count) ?? 0),
    community_id: asString(data.community_id),
    position: undefined,
  };
}

function parseRelation(data: Record<string, unknown>): Relation | null {
  const id = asString(data.relation_id) ?? asString(data.id);
  const subject_id = asString(data.subject_id);
  const object_id = asString(data.object_id);
  if (!id || !subject_id || !object_id) return null;

  const nowIso = new Date().toISOString();
  return {
    id,
    subject_id,
    object_id,
    predicate: asString(data.predicate) ?? "references",
    source_type: asString(data.source_type) ?? "other",
    source_ref: asString(data.source_ref) ?? "realtime_ws",
    date_added: asString(data.date_added) ?? nowIso,
    scope: asString(data.scope) ?? "global",
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
  const lastSeenSeqRef = useRef(0);
  const seenObservationIdsRef = useRef(new Set<string>());

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

    const updateWatermarks = (watermarks: Partial<Record<RowidKey, number>>) => {
      for (const [key, value] of Object.entries(watermarks)) {
        if (!isRowidKey(key)) continue;
        const numeric = asNumber(value);
        if (numeric !== null) {
          lastSeenRowidsRef.current[key] = Math.max(lastSeenRowidsRef.current[key], numeric);
        }
      }
    };

    /** Batch all events from one WS message into a single setState to prevent render storms. */
    const applyEventsBatch = (events: WsEvent[]) => {
      const newEntities: Entity[] = [];
      const newPositions: Record<string, { x: number; y: number; z: number }> = {};
      const newRelations: Relation[] = [];
      const obsIncrements = new Map<string, number>();

      for (const event of events) {
        if (event.event_type === "ENTITY_CREATED") {
          const entity = parseEntity(event.data, event.entity_id);
          if (entity) newEntities.push(entity);
        } else if (event.event_type === "RELATION_CREATED") {
          const relation = parseRelation(event.data);
          if (relation) newRelations.push(relation);
        } else if (event.event_type === "OBSERVATION_ADDED") {
          const obsId = asString(event.data.observation_id) ?? asString(event.data.id);
          if (obsId && seenObservationIdsRef.current.has(obsId)) continue;
          if (obsId) seenObservationIdsRef.current.add(obsId);
          const entityId = event.entity_id ?? asString(event.data.entity_id);
          if (entityId) obsIncrements.set(entityId, (obsIncrements.get(entityId) ?? 0) + 1);
        }
      }

      if (newEntities.length === 0 && newRelations.length === 0 && obsIncrements.size === 0) return;

      useGraphStore.setState((state) => {
        const existingEntityIds = new Set(state.entities.map((e) => e.id));
        const existingRelationIds = new Set(state.relations.map((r) => r.id));

        const uniqueEntities = newEntities.filter((e) => !existingEntityIds.has(e.id));
        const uniqueRelations = newRelations.filter((r) => !existingRelationIds.has(r.id));

        for (const entity of uniqueEntities) {
          const centroid = computeCentroid(state.entities, state.positions, entity.community_id);
          const jitter = () => (Math.random() - 0.5) * 20;
          newPositions[entity.id] = {
            x: centroid.x + jitter(),
            y: centroid.y + jitter(),
            z: centroid.z + jitter(),
          };
        }

        let entities = state.entities;
        if (uniqueEntities.length > 0) entities = [...entities, ...uniqueEntities];
        if (obsIncrements.size > 0) {
          entities = entities.map((e) => {
            const delta = obsIncrements.get(e.id);
            return delta ? { ...e, observation_count: e.observation_count + delta } : e;
          });
        }

        return {
          entities,
          relations: uniqueRelations.length > 0 ? [...state.relations, ...uniqueRelations] : state.relations,
          positions: Object.keys(newPositions).length > 0 ? { ...state.positions, ...newPositions } : state.positions,
        };
      });
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
            last_seen_rowids: lastSeenRowidsRef.current,
          })
        );
      };

      ws.onmessage = (msgEvent: MessageEvent<string>) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(msgEvent.data);
        } catch {
          return;
        }

        const message = asRecord(parsed);
        if (!message) return;

        const type = asString(message.type);

        if (type === "heartbeat") {
          setLastHeartbeat(new Date());
          return;
        }

        if (type === "events") {
          const eventsMsg = message as unknown as WsEventsMessage;
          // Skip duplicate/out-of-order messages
          if (eventsMsg.seq <= lastSeenSeqRef.current) return;
          lastSeenSeqRef.current = eventsMsg.seq;
          // Update watermarks
          if (eventsMsg.watermarks) {
            updateWatermarks(eventsMsg.watermarks);
          }
          // Batch all events into a single setState
          if (Array.isArray(eventsMsg.events) && eventsMsg.events.length > 0) {
            applyEventsBatch(eventsMsg.events);
          }
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
