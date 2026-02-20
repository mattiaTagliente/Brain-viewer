/** Core data types matching the backend API. */

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  date_added: string;
  date_modified: string;
  scope: string;
  metadata: Record<string, unknown>;
  observation_count: number;
  community_id: string | null;
  position?: { x: number; y: number; z: number };
}

export type EntityType =
  | "concept"
  | "method"
  | "parameter"
  | "dataset"
  | "finding"
  | "pitfall"
  | "tool"
  | "decision"
  | "person";

export interface Observation {
  id: string;
  entity_id: string;
  text: string;
  severity: Severity;
  source_type: string;
  source_ref: string;
  verification_status: "unverified" | "agent_verified" | "human_verified";
  date_added: string;
  tags: string[];
  scope: string;
}

export type Severity = "blocking" | "major" | "minor" | "info";

export interface Relation {
  id: string;
  subject_id: string;
  predicate: string;
  object_id: string;
  source_type: string;
  source_ref: string;
  date_added: string;
  scope: string;
}

export interface Community {
  id: string;
  level: number;
  member_entity_ids: string[];
  summary: string;
  date_computed: string;
  scope: string;
}

export interface GraphData {
  entities: Entity[];
  observations: Observation[];
  relations: Relation[];
  communities: Community[];
  layout_hash: string;
  positions_valid: boolean;
}

export interface TimelineEvent {
  timestamp: string;
  event_type: "ENTITY_CREATED" | "OBSERVATION_ADDED" | "RELATION_CREATED" | "GAP_SKIPPED";
  entity_id: string | null;
  data: Record<string, unknown>;
}

export interface RealtimeEvent {
  event_type: "ENTITY_CREATED" | "OBSERVATION_ADDED" | "RELATION_CREATED";
  timestamp: string;
  entity_id: string | null;
  data: Record<string, unknown>;
}

export type RealtimeMessage =
  | {
      type: "events";
      seq: number;
      events: RealtimeEvent[];
      watermarks: Partial<Record<"entities" | "relations" | "observations", number>>;
    }
  | {
      type: "heartbeat";
      seq: number;
    }
  | {
      type: "error";
      seq?: number;
      code?: string;
      message: string;
    };

export interface EntityDetail extends Entity {
  observations: Observation[];
  relations: Relation[];
  aliases: { alias: string; scope: string }[];
}

export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

/** Messages between main thread and layout Web Worker */
export interface LayoutWorkerInput {
  type: "compute";
  entities: Entity[];
  relations: Relation[];
  communities: Community[];
  existingPositions: Record<string, NodePosition>;
  similarityMatrix?: Record<string, Record<string, number>>;
  isIncremental: boolean;
}

export interface LayoutWorkerOutput {
  type: "positions" | "progress";
  positions?: Record<string, NodePosition>;
  progress?: number; // 0-1
}
