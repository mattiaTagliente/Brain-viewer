=== FILE: frontend/src/lib/types.ts ===
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
=== END FILE ===

=== FILE: frontend/src/store/graphStore.ts ===
import { create } from "zustand";
import type { Entity, Relation, Community, Observation, NodePosition, EntityDetail, EntityType } from "../lib/types";
import { fetchGraph, fetchEntity, savePositions } from "../lib/api";

import neuralTheme from "../themes/neural.json";
import cleanTheme from "../themes/clean.json";
import organicTheme from "../themes/organic.json";

export interface ThemeConfig {
  name: string;
  gpuCost: string;
  background: string;
  fog: { color: string; near: number; far: number } | null;
  ambientLight: { color: string; intensity: number };
  directionalLight: { color: string; intensity: number };
  nodeColors: Record<EntityType, string>;
  nodeMaterial: { emissive: number; metalness: number; roughness: number };
  edgeStyle: { color: string; opacity: number; linewidth: number };
  postProcessing: { bloom: { enabled: boolean; intensity: number; luminanceThreshold: number } };
}

export const THEMES: Record<string, ThemeConfig> = {
  neural: neuralTheme as ThemeConfig,
  clean: cleanTheme as unknown as ThemeConfig,
  organic: organicTheme as ThemeConfig,
};

const initialReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface GraphState {
  // Data
  entities: Entity[];
  relations: Relation[];
  communities: Community[];
  observations: Observation[];
  layoutHash: string;
  positionsValid: boolean;
  positions: Record<string, NodePosition>;

  // UI state
  selectedEntityId: string | null;
  selectedEntityDetail: EntityDetail | null;
  hoveredEntityId: string | null;
  focusedEntityId: string | null;
  theme: string;
  themeConfig: ThemeConfig;
  loading: boolean;
  error: string | null;
  layoutProgress: number;
  reducedMotion: boolean;

  // Filters
  filterEntityTypes: Set<string>;
  filterScope: string | null;

  // Actions
  loadGraph: (scope?: string) => Promise<void>;
  selectEntity: (id: string | null) => Promise<void>;
  hoverEntity: (id: string | null) => void;
  focusEntity: (id: string | null) => void;
  setTheme: (name: string) => void;
  setIntermediatePositions: (positions: Record<string, NodePosition>) => void;
  setFinalPositions: (positions: Record<string, NodePosition>) => void;
  persistPositions: () => Promise<void>;
  setLayoutProgress: (p: number) => void;
  setError: (error: string | null) => void;
  toggleEntityTypeFilter: (type: string) => void;
  setFilterScope: (scope: string | null) => void;
  addEntity: (entity: Entity) => void;
  addRelation: (relation: Relation) => void;
  updateEntityObsCount: (entityId: string, delta: number) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  entities: [],
  relations: [],
  communities: [],
  observations: [],
  layoutHash: "",
  positionsValid: false,
  positions: {},
  selectedEntityId: null,
  selectedEntityDetail: null,
  hoveredEntityId: null,
  focusedEntityId: null,
  theme: "clean",
  themeConfig: cleanTheme as unknown as ThemeConfig,
  loading: false,
  error: null,
  layoutProgress: 0,
  reducedMotion: initialReducedMotion,
  filterEntityTypes: new Set(),
  filterScope: null,

  loadGraph: async (scope?: string) => {
    set({ loading: true, error: null });
    try {
      const data = await fetchGraph(scope);
      const positions: Record<string, NodePosition> = {};
      for (const e of data.entities) {
        if (e.position) positions[e.id] = e.position;
      }
      set({
        entities: data.entities,
        observations: data.observations,
        relations: data.relations,
        communities: data.communities,
        layoutHash: data.layout_hash,
        positionsValid: data.positions_valid,
        positions,
        loading: false,
        layoutProgress: data.positions_valid ? 1 : 0,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  selectEntity: async (id: string | null) => {
    if (!id) {
      set({ selectedEntityId: null, selectedEntityDetail: null });
      return;
    }
    set({ selectedEntityId: id });
    try {
      const detail = await fetchEntity(id);
      set({ selectedEntityDetail: detail });
    } catch {
      // Keep selection but no detail
    }
  },

  hoverEntity: (id) => set({ hoveredEntityId: id }),

  focusEntity: (id) => set({ focusedEntityId: id }),

  setTheme: (name) => {
    const config = THEMES[name];
    if (config) set({ theme: name, themeConfig: config });
  },

  setIntermediatePositions: (positions) => set({ positions }),

  setFinalPositions: (positions) => set({ positions, positionsValid: true }),

  persistPositions: async () => {
    const { positions, layoutHash } = get();
    if (Object.keys(positions).length > 0) {
      await savePositions(positions, layoutHash);
    }
  },

  setLayoutProgress: (p) => set({ layoutProgress: p }),

  setError: (error: string | null) => set({ error }),

  toggleEntityTypeFilter: (type) => {
    const current = new Set(get().filterEntityTypes);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    set({ filterEntityTypes: current });
  },

  setFilterScope: (scope) => set({ filterScope: scope }),

  addEntity: (entity) =>
    set((state) => ({
      entities: [...state.entities, entity],
    })),

  addRelation: (relation) =>
    set((state) => ({
      relations: [...state.relations, relation],
    })),

  updateEntityObsCount: (entityId, delta) =>
    set((state) => ({
      entities: state.entities.map((entity) =>
        entity.id === entityId
          ? { ...entity, observation_count: Math.max(0, entity.observation_count + delta) }
          : entity
      ),
      selectedEntityDetail:
        state.selectedEntityDetail && state.selectedEntityDetail.id === entityId
          ? {
              ...state.selectedEntityDetail,
              observation_count: Math.max(0, state.selectedEntityDetail.observation_count + delta),
            }
          : state.selectedEntityDetail,
    })),
}));
=== END FILE ===

=== FILE: frontend/src/App.tsx ===
import { useEffect } from "react";
import { GraphScene } from "./components/GraphScene";
import { DetailPanel } from "./components/DetailPanel";
import { ThemePicker } from "./components/ThemePicker";
import { Filters } from "./components/Filters";
import { Timeline } from "./components/Timeline";
import { useGraphStore } from "./store/graphStore";
import { useUIStore } from "./store/uiStore";
import { useReplayStore } from "./store/replayStore";
import { useRealtime } from "./hooks/useRealtime";

function LoadingOverlay() {
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const entities = useGraphStore((s) => s.entities);
  const layoutProgress = useGraphStore((s) => s.layoutProgress);
  const positionsValid = useGraphStore((s) => s.positionsValid);

  if (error) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.85)", color: "#ef4444",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
        flexDirection: "column", gap: 8,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Error</div>
        <div style={{ maxWidth: 500, textAlign: "center" }}>{error}</div>
        <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
          Check the browser console (F12) for details
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.85)", color: "#888",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
      }}>
        Loading graph data...
      </div>
    );
  }

  if (entities.length > 0 && !positionsValid && layoutProgress < 1) {
    const pct = Math.round(layoutProgress * 100);
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", color: "#aaa",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
        flexDirection: "column", gap: 8,
      }}>
        <div>Computing layout for {entities.length} entities...</div>
        <div style={{
          width: 200, height: 4, background: "#333", borderRadius: 2,
        }}>
          <div style={{
            width: `${pct}%`, height: "100%", background: "#4a90d9",
            borderRadius: 2, transition: "width 0.3s",
          }} />
        </div>
        <div style={{ color: "#666", fontSize: 12 }}>{pct}%</div>
      </div>
    );
  }

  return null;
}

function HomeButton() {
  return (
    <button
      onClick={() => (window as any).__brainViewerGoHome?.()}
      title="Reset camera to home view"
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 20,
        background: "rgba(0,0,0,0.6)",
        border: "1px solid #555",
        borderRadius: 8,
        padding: "6px 14px",
        color: "#aaa",
        fontSize: 12,
        cursor: "pointer",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      Home
    </button>
  );
}

function StatusBar({
  realtimeConnected,
  showTimeline,
}: {
  realtimeConnected: boolean;
  showTimeline: boolean;
}) {
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const layoutProgress = useGraphStore((s) => s.layoutProgress);

  const pct = Math.round(layoutProgress * 100);

  return (
    <div
      style={{
        position: "absolute",
        bottom: showTimeline ? 12 : 12,
        left: 12,
        zIndex: 20,
        background: "rgba(0,0,0,0.6)",
        padding: "4px 12px",
        borderRadius: 8,
        fontSize: 12,
        color: "#888",
        display: "flex",
        gap: 16,
        alignItems: "center",
      }}
    >
      <span>{entities.length} entities</span>
      <span>{relations.length} relations</span>
      {layoutProgress < 1 && <span>layout: {pct}%</span>}
      {realtimeConnected && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#7cd992" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#22c55e",
              boxShadow: "0 0 8px rgba(34,197,94,0.8)",
            }}
          />
          Live
        </span>
      )}
    </div>
  );
}

function shouldIgnoreKeyEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
}

export default function App() {
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const entities = useGraphStore((s) => s.entities);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);

  const showDetailPanel = useUIStore((s) => s.showDetailPanel);
  const setShowDetailPanel = useUIStore((s) => s.setShowDetailPanel);
  const showTimeline = useUIStore((s) => s.showTimeline);

  const replayActive = useReplayStore((s) => s.replayActive);
  const toggleReplayPlay = useReplayStore((s) => s.togglePlay);

  const { connected: realtimeConnected } = useRealtime(!replayActive);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (selectedEntityId) {
          void selectEntity(null);
          return;
        }
        if (focusedEntityId) {
          focusEntity(null);
          return;
        }
        if (showDetailPanel) {
          setShowDetailPanel(false);
        }
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        toggleReplayPlay();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (entities.length === 0) return;
        event.preventDefault();

        const direction = event.key === "ArrowDown" ? 1 : -1;
        const currentId = focusedEntityId ?? selectedEntityId;
        let index = entities.findIndex((entity) => entity.id === currentId);
        if (index < 0) index = direction > 0 ? -1 : 0;

        const next = entities[(index + direction + entities.length) % entities.length];
        if (next) {
          focusEntity(next.id);
        }
        return;
      }

      if (event.key === "Enter") {
        const currentId = focusedEntityId ?? selectedEntityId;
        if (!currentId) return;
        event.preventDefault();
        setShowDetailPanel(true);
        void selectEntity(currentId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    entities,
    focusedEntityId,
    selectedEntityId,
    selectEntity,
    focusEntity,
    showDetailPanel,
    setShowDetailPanel,
    toggleReplayPlay,
  ]);

  return (
    <>
      <GraphScene />
      <LoadingOverlay />
      {showDetailPanel && <DetailPanel />}
      <ThemePicker />
      <Filters />
      {showTimeline && <Timeline />}
      <HomeButton />
      <StatusBar realtimeConnected={realtimeConnected} showTimeline={showTimeline} />
    </>
  );
}
=== END FILE ===

=== FILE: frontend/src/components/GraphScene.tsx ===
/**
 * Main 3D scene: nodes, edges, lighting, camera controls.
 */

import { useEffect, useCallback, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { NodeMesh } from "./NodeMesh";
import { EdgeLines } from "./EdgeLines";
import { NodeLabels } from "./NodeLabels";
import { useGraphStore } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import type { LayoutWorkerInput, LayoutWorkerOutput } from "../lib/types";

const CAMERA_STORAGE_KEY = "brain-viewer-camera";
const SAVE_DEBOUNCE_MS = 500;

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

function saveCameraState(state: CameraState) {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

function loadCameraState(): CameraState | null {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Compute bounding sphere of all positions, return camera distance to fit. */
function computeAutoFit(
  positions: Record<string, { x: number; y: number; z: number }>,
  fov: number
): { center: THREE.Vector3; distance: number } {
  const pts = Object.values(positions);
  if (pts.length === 0) {
    return { center: new THREE.Vector3(), distance: 300 };
  }

  const box = new THREE.Box3();
  for (const p of pts) {
    box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
  }
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  const halfFov = (fov / 2) * (Math.PI / 180);
  const distance = sphere.radius / Math.sin(halfFov) * 1.2;

  return { center: sphere.center, distance: Math.max(distance, 50) };
}

/** Manages camera: auto-fit, persistence, home reset. */
function CameraController() {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const positions = useGraphStore((s) => s.positions);
  const positionsValid = useGraphStore((s) => s.positionsValid);
  const hasAutoFit = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store home view for reset
  const homeView = useRef<CameraState | null>(null);

  // Expose goHome on the window for the Home button
  useEffect(() => {
    (window as any).__brainViewerGoHome = () => {
      if (homeView.current && controlsRef.current) {
        const h = homeView.current;
        camera.position.set(...h.position);
        camera.up.set(...h.up);
        controlsRef.current.target.set(...h.target);
        controlsRef.current.update();
        saveCameraState(h);
      }
    };
    return () => { delete (window as any).__brainViewerGoHome; };
  }, [camera]);

  // Auto-fit camera when positions first become valid
  useEffect(() => {
    if (!positionsValid || hasAutoFit.current) return;
    if (Object.keys(positions).length === 0) return;

    // Check for saved camera state first
    const saved = loadCameraState();
    if (saved) {
      camera.position.set(...saved.position);
      camera.up.set(...saved.up);
      if (controlsRef.current) {
        controlsRef.current.target.set(...saved.target);
        controlsRef.current.update();
      }
      // Still compute home view for the reset button
      const { center, distance } = computeAutoFit(positions, 60);
      homeView.current = {
        position: [center.x, center.y, center.z + distance],
        target: [center.x, center.y, center.z],
        up: [0, 1, 0],
      };
      hasAutoFit.current = true;
      return;
    }

    // No saved state — auto-fit to graph bounds
    const { center, distance } = computeAutoFit(positions, 60);
    camera.position.set(center.x, center.y, center.z + distance);
    camera.up.set(0, 1, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(center.x, center.y, center.z);
      controlsRef.current.update();
    }
    homeView.current = {
      position: [center.x, center.y, center.z + distance],
      target: [center.x, center.y, center.z],
      up: [0, 1, 0],
    };
    hasAutoFit.current = true;
  }, [positionsValid, positions, camera]);

  // Debounced save on camera change
  const handleChange = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos = camera.position;
      const up = camera.up;
      const target = controlsRef.current?.target;
      if (target) {
        saveCameraState({
          position: [pos.x, pos.y, pos.z],
          target: [target.x, target.y, target.z],
          up: [up.x, up.y, up.z],
        });
      }
    }, SAVE_DEBOUNCE_MS);
  }, [camera]);

  return (
    <TrackballControls
      ref={controlsRef}
      rotateSpeed={3}
      zoomSpeed={2}
      panSpeed={1}
      noRotate={false}
      noZoom={false}
      noPan={false}
      staticMoving={false}
      dynamicDampingFactor={0.15}
      minDistance={1}
      maxDistance={50000}
      onChange={handleChange}
    />
  );
}

function SceneContent() {
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const focusEntity = useGraphStore((s) => s.focusEntity);
  const selectEntity = useGraphStore((s) => s.selectEntity);

  const replayActive = useReplayStore((s) => s.replayActive);
  const visibleEntityIds = useReplayStore((s) => s.visibleEntityIds);
  const visibleRelationIds = useReplayStore((s) => s.visibleRelationIds);

  const handleMissClick = useCallback(() => {
    void selectEntity(null);
    focusEntity(null);
  }, [selectEntity, focusEntity]);

  const bloom = themeConfig.postProcessing.bloom;

  return (
    <>
      <ambientLight
        color={themeConfig.ambientLight.color}
        intensity={themeConfig.ambientLight.intensity}
      />
      <directionalLight
        color={themeConfig.directionalLight.color}
        intensity={themeConfig.directionalLight.intensity}
        position={[100, 100, 100]}
      />

      {themeConfig.fog && (
        <fog attach="fog" args={[themeConfig.fog.color, themeConfig.fog.near, themeConfig.fog.far]} />
      )}

      <NodeMesh replayFilter={replayActive ? visibleEntityIds : null} />
      <EdgeLines replayFilter={replayActive ? visibleRelationIds : null} />
      <NodeLabels />

      {/* Invisible click plane for deselection */}
      <mesh onClick={handleMissClick} visible={false}>
        <sphereGeometry args={[50000, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>

      <CameraController />

      {bloom.enabled && (
        <EffectComposer>
          <Bloom
            intensity={bloom.intensity}
            luminanceThreshold={bloom.luminanceThreshold}
            luminanceSmoothing={0.9}
          />
        </EffectComposer>
      )}
    </>
  );
}

export function GraphScene() {
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const communities = useGraphStore((s) => s.communities);
  const positions = useGraphStore((s) => s.positions);
  const positionsValid = useGraphStore((s) => s.positionsValid);
  const setIntermediatePositions = useGraphStore((s) => s.setIntermediatePositions);
  const setFinalPositions = useGraphStore((s) => s.setFinalPositions);
  const persistPositions = useGraphStore((s) => s.persistPositions);
  const setLayoutProgress = useGraphStore((s) => s.setLayoutProgress);
  const setError = useGraphStore((s) => s.setError);

  // Run layout worker when positions are not valid
  useEffect(() => {
    if (entities.length === 0) return;
    if (positionsValid && Object.keys(positions).length > 0) return;

    const posCount = Object.keys(positions).length;
    const missingCount = entities.length - posCount;

    // Fast path: if most entities already have positions (stale cache),
    // just place the few missing ones near their community centroids
    // and skip the expensive force simulation entirely.
    if (posCount > 0 && missingCount / entities.length < 0.1) {
      console.log(`[GraphScene] Fast-placing ${missingCount} new entities (${posCount} cached)`);

      // Build community centroid map from existing positions
      const commMembers: Record<string, { x: number; y: number; z: number }[]> = {};
      for (const entity of entities) {
        const pos = positions[entity.id];
        const cid = entity.community_id;
        if (pos && cid) {
          if (!commMembers[cid]) commMembers[cid] = [];
          commMembers[cid].push(pos);
        }
      }
      const commCentroids: Record<string, { x: number; y: number; z: number }> = {};
      for (const [cid, pts] of Object.entries(commMembers)) {
        const n = pts.length;
        commCentroids[cid] = {
          x: pts.reduce((s, p) => s + p.x, 0) / n,
          y: pts.reduce((s, p) => s + p.y, 0) / n,
          z: pts.reduce((s, p) => s + p.z, 0) / n,
        };
      }

      const merged = { ...positions };
      for (const entity of entities) {
        if (!merged[entity.id]) {
          const centroid = entity.community_id ? commCentroids[entity.community_id] : null;
          merged[entity.id] = {
            x: (centroid?.x ?? 0) + (Math.random() - 0.5) * 30,
            y: (centroid?.y ?? 0) + (Math.random() - 0.5) * 30,
            z: (centroid?.z ?? 0) + (Math.random() - 0.5) * 30,
          };
        }
      }

      setFinalPositions(merged);
      setLayoutProgress(1);
      void persistPositions();
      return;
    }

    // Full/incremental layout via Web Worker
    console.log("[GraphScene] Starting layout worker for", entities.length, "entities",
      posCount > 0 ? `(incremental, ${posCount} cached)` : "(full)");

    const worker = new Worker(
      new URL("../workers/layoutWorker.ts", import.meta.url),
      { type: "module" }
    );

    const input: LayoutWorkerInput = {
      type: "compute",
      entities,
      relations,
      communities,
      existingPositions: positions,
      isIncremental: posCount > 0,
    };

    worker.postMessage(input);

    worker.onmessage = (event: MessageEvent<LayoutWorkerOutput>) => {
      const msg = event.data;
      if (msg.type === "progress" && msg.positions) {
        setIntermediatePositions(msg.positions);
        setLayoutProgress(msg.progress || 0);
      } else if (msg.type === "positions" && msg.positions) {
        console.log("[GraphScene] Layout complete:", Object.keys(msg.positions).length, "positions");
        setFinalPositions(msg.positions);
        setLayoutProgress(1);
        void persistPositions();
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error("[GraphScene] Layout worker error:", err);
      setError(`Layout worker failed: ${err.message}`);
    };

    return () => worker.terminate();
  }, [entities, positionsValid, positions, relations, communities, setIntermediatePositions, setLayoutProgress, setFinalPositions, persistPositions, setError]);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 300], fov: 60, near: 0.1, far: 100000 }}
        style={{ background: themeConfig.background }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
=== END FILE ===

=== FILE: frontend/src/components/NodeMesh.tsx ===
/**
 * InstancedMesh-based node rendering, grouped by entity type.
 * One InstancedMesh per entity type (9 draw calls max) — each group
 * uses a MeshStandardMaterial with the type's color.
 */

import { useRef, useMemo, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore, type ThemeConfig } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import type { Entity, EntityType, Severity } from "../lib/types";

const ENTITY_ANIM_MS = 500;
const OBSERVATION_PULSE_MS = 800;

const SIZE_BUCKETS = [0.8, 1.2, 1.8, 2.5];
function getNodeSize(obsCount: number): number {
  if (obsCount <= 1) return SIZE_BUCKETS[0];
  if (obsCount <= 5) return SIZE_BUCKETS[1];
  if (obsCount <= 15) return SIZE_BUCKETS[2];
  return SIZE_BUCKETS[3];
}

const PULSE_COLORS: Record<Severity, THREE.Color> = {
  blocking: new THREE.Color("#ef4444"),
  major: new THREE.Color("#f59e0b"),
  minor: new THREE.Color("#3b82f6"),
  info: new THREE.Color("#60a5fa"),
};

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

// Shared sphere geometry
const sharedGeom = new THREE.SphereGeometry(3, 16, 16);

interface EntityGroup {
  type: EntityType;
  entities: Entity[];
  /** Maps local instance index to global entity id */
  entityIds: string[];
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Single InstancedMesh for one entity type */
function TypeGroup({
  group,
  positions,
  themeConfig,
  hoveredEntityId,
  selectedEntityId,
  focusedConnected,
  onSelect,
  onHover,
  onFocus,
  animatingEntities,
  pulsingEntities,
  reducedMotion,
}: {
  group: EntityGroup;
  positions: Record<string, { x: number; y: number; z: number }>;
  themeConfig: ThemeConfig;
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  focusedConnected: Set<string> | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  animatingEntities: Set<string>;
  pulsingEntities: Map<string, Severity>;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spawnStartRef = useRef<Map<string, number>>(new Map());
  const pulseStartRef = useRef<Map<string, { start: number; severity: Severity }>>(new Map());

  const { entities, entityIds, type } = group;
  const count = entities.length;

  // Material: one per group, colored by entity type
  const material = useMemo(() => {
    const hex = themeConfig.nodeColors[type] || "#888888";
    const color = new THREE.Color(hex);
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: themeConfig.nodeMaterial.emissive,
      metalness: themeConfig.nodeMaterial.metalness,
      roughness: themeConfig.nodeMaterial.roughness,
    });
  }, [themeConfig, type]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  const updateInstances = useCallback((nowMs: number) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const baseColor = new THREE.Color(themeConfig.nodeColors[type] || "#888888");

    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      const pos = positions[entity.id];
      if (!pos) continue;

      const baseScale = getNodeSize(entity.observation_count);
      let scale = baseScale;

      if (!reducedMotion) {
        const spawnStart = spawnStartRef.current.get(entity.id);
        if (spawnStart !== undefined) {
          const t = clamp01((nowMs - spawnStart) / ENTITY_ANIM_MS);
          scale = baseScale * t;
        }
      }

      tempObject.position.set(pos.x, pos.y, pos.z);
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      tempColor.copy(baseColor);

      if (focusedConnected && !focusedConnected.has(entity.id)) {
        tempColor.multiplyScalar(0.3);
      }

      if (!reducedMotion) {
        const pulse = pulseStartRef.current.get(entity.id);
        if (pulse) {
          const pulseT = clamp01((nowMs - pulse.start) / OBSERVATION_PULSE_MS);
          const pulseStrength = 1 - pulseT;
          if (pulseStrength > 0) {
            tempColor.lerp(PULSE_COLORS[pulse.severity], 0.7 * pulseStrength);
            tempColor.multiplyScalar(1 + 0.35 * pulseStrength);
          }
        }
      }

      if (entity.id === hoveredEntityId || entity.id === selectedEntityId) {
        tempColor.multiplyScalar(1.5);
      }

      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [
    entities,
    focusedConnected,
    hoveredEntityId,
    positions,
    reducedMotion,
    selectedEntityId,
    themeConfig,
    type,
  ]);

  useEffect(() => {
    if (reducedMotion) {
      spawnStartRef.current.clear();
      pulseStartRef.current.clear();
      updateInstances(performance.now());
      return;
    }

    const now = performance.now();

    for (const entityId of animatingEntities) {
      if (!spawnStartRef.current.has(entityId)) {
        spawnStartRef.current.set(entityId, now);
      }
    }
    for (const id of Array.from(spawnStartRef.current.keys())) {
      if (!animatingEntities.has(id)) {
        spawnStartRef.current.delete(id);
      }
    }

    for (const [entityId, severity] of pulsingEntities) {
      const existing = pulseStartRef.current.get(entityId);
      if (!existing || existing.severity !== severity) {
        pulseStartRef.current.set(entityId, { start: now, severity });
      }
    }
    for (const id of Array.from(pulseStartRef.current.keys())) {
      if (!pulsingEntities.has(id)) {
        pulseStartRef.current.delete(id);
      }
    }

    updateInstances(now);
  }, [animatingEntities, pulsingEntities, reducedMotion, updateInstances]);

  useEffect(() => {
    updateInstances(performance.now());
  }, [positions, themeConfig, hoveredEntityId, selectedEntityId, focusedConnected, updateInstances]);

  useFrame(() => {
    if (reducedMotion) return;
    if (spawnStartRef.current.size === 0 && pulseStartRef.current.size === 0) return;
    updateInstances(performance.now());
  });

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onSelect(entityId);
      }
    },
    [entityIds, onSelect]
  );

  const handleDoubleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onFocus(entityId);
      }
    },
    [entityIds, onFocus]
  );

  const handlePointerOver = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onHover(entityId);
      }
    },
    [entityIds, onHover]
  );

  const handlePointerOut = useCallback(() => {
    onHover(null);
  }, [onHover]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedGeom, material, count]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

export function NodeMesh({ replayFilter = null }: { replayFilter?: Set<string> | null }) {
  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const hoveredEntityId = useGraphStore((s) => s.hoveredEntityId);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const reducedMotion = useGraphStore((s) => s.reducedMotion);

  const selectEntity = useGraphStore((s) => s.selectEntity);
  const hoverEntity = useGraphStore((s) => s.hoverEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);

  const animatingEntities = useReplayStore((s) => s.animatingEntities);
  const pulsingEntities = useReplayStore((s) => s.pulsingEntities);

  // Filter entities
  const visibleEntities = useMemo(() => {
    let next = entities;

    if (filterEntityTypes.size > 0) {
      next = next.filter((e) => filterEntityTypes.has(e.entity_type));
    }

    if (replayFilter) {
      next = next.filter((e) => replayFilter.has(e.id));
    }

    return next;
  }, [entities, filterEntityTypes, replayFilter]);

  // Group by entity type
  const entityGroups = useMemo(() => {
    const groups = new Map<EntityType, Entity[]>();
    for (const entity of visibleEntities) {
      const t = entity.entity_type;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(entity);
    }
    return Array.from(groups.entries()).map(
      ([type, ents]): EntityGroup => ({
        type,
        entities: ents,
        entityIds: ents.map((e) => e.id),
      })
    );
  }, [visibleEntities]);

  // Build connected set for focus mode
  const focusedConnected = useMemo(() => {
    if (!focusedEntityId) return null;
    const relations = useGraphStore.getState().relations;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of relations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId]);

  if (visibleEntities.length === 0) return null;

  return (
    <>
      {entityGroups.map((group) => (
        <TypeGroup
          key={group.type}
          group={group}
          positions={positions}
          themeConfig={themeConfig}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          focusedConnected={focusedConnected}
          onSelect={(id) => { void selectEntity(id); }}
          onHover={hoverEntity}
          onFocus={focusEntity}
          animatingEntities={animatingEntities}
          pulsingEntities={pulsingEntities}
          reducedMotion={reducedMotion}
        />
      ))}
    </>
  );
}
=== END FILE ===

=== FILE: frontend/src/components/EdgeLines.tsx ===
/**
 * LineSegments-based edge rendering.
 * Batched geometry for all edges — one draw call.
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import type { Relation } from "../lib/types";

const RELATION_ANIM_MS = 300;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function EdgeLines({ replayFilter = null }: { replayFilter?: Set<string> | null }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const animationStartRef = useRef<Map<string, number>>(new Map());

  const relations = useGraphStore((s) => s.relations);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const reducedMotion = useGraphStore((s) => s.reducedMotion);

  const animatingRelations = useReplayStore((s) => s.animatingRelations);

  const visibleRelations = useMemo(() => {
    if (!replayFilter) return relations;
    return relations.filter((relation) => replayFilter.has(relation.id));
  }, [relations, replayFilter]);

  // Connected set for focus mode
  const connectedToFocused = useMemo(() => {
    if (!focusedEntityId) return null;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of visibleRelations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId, visibleRelations]);

  const geometry = useMemo(() => {
    const edgeColor = new THREE.Color(themeConfig.edgeStyle.color);
    const dimColor = edgeColor.clone().multiplyScalar(0.2);

    const validRelations: Relation[] = [];
    for (const rel of visibleRelations) {
      const pA = positions[rel.subject_id];
      const pB = positions[rel.object_id];
      if (!pA || !pB) continue;
      validRelations.push(rel);
    }

    const verts = new Float32Array(validRelations.length * 6);
    const colors = new Float32Array(validRelations.length * 6);

    for (let i = 0; i < validRelations.length; i += 1) {
      const rel = validRelations[i];
      const pA = positions[rel.subject_id]!;
      const pB = positions[rel.object_id]!;

      let color = edgeColor;
      if (connectedToFocused) {
        const isConnected =
          connectedToFocused.has(rel.subject_id) && connectedToFocused.has(rel.object_id);
        color = isConnected ? edgeColor : dimColor;
      }

      const base = i * 6;
      const animate = !reducedMotion && animatingRelations.has(rel.id);

      verts[base] = pA.x;
      verts[base + 1] = pA.y;
      verts[base + 2] = pA.z;
      verts[base + 3] = animate ? pA.x : pB.x;
      verts[base + 4] = animate ? pA.y : pB.y;
      verts[base + 5] = animate ? pA.z : pB.z;

      colors[base] = color.r;
      colors[base + 1] = color.g;
      colors[base + 2] = color.b;
      colors[base + 3] = color.r;
      colors[base + 4] = color.g;
      colors[base + 5] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.userData.validRelations = validRelations;
    return geo;
  }, [visibleRelations, positions, themeConfig, connectedToFocused, reducedMotion, animatingRelations]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.geometry = geometry;
    }
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    if (reducedMotion) {
      animationStartRef.current.clear();
      return;
    }

    const now = performance.now();
    const currentRelationIds = new Set(
      ((geometry.userData.validRelations as Relation[] | undefined) ?? []).map((r) => r.id)
    );

    for (const id of animatingRelations) {
      if (currentRelationIds.has(id) && !animationStartRef.current.has(id)) {
        animationStartRef.current.set(id, now);
      }
    }

    for (const id of Array.from(animationStartRef.current.keys())) {
      if (!animatingRelations.has(id) || !currentRelationIds.has(id)) {
        animationStartRef.current.delete(id);
      }
    }
  }, [animatingRelations, geometry, reducedMotion]);

  useFrame(() => {
    if (reducedMotion) return;
    const validRelations = (geometry.userData.validRelations as Relation[] | undefined) ?? [];
    if (validRelations.length === 0) return;
    if (animationStartRef.current.size === 0) return;

    const positionAttr = geometry.getAttribute("position");
    if (!(positionAttr instanceof THREE.BufferAttribute)) return;

    const now = performance.now();
    let changed = false;

    for (let i = 0; i < validRelations.length; i += 1) {
      const rel = validRelations[i];
      const pA = positions[rel.subject_id];
      const pB = positions[rel.object_id];
      if (!pA || !pB) continue;

      const base = i * 6;
      const start = animationStartRef.current.get(rel.id);

      if (start === undefined) {
        if (
          positionAttr.array[base + 3] !== pB.x ||
          positionAttr.array[base + 4] !== pB.y ||
          positionAttr.array[base + 5] !== pB.z
        ) {
          positionAttr.array[base + 3] = pB.x;
          positionAttr.array[base + 4] = pB.y;
          positionAttr.array[base + 5] = pB.z;
          changed = true;
        }
        continue;
      }

      const t = clamp01((now - start) / RELATION_ANIM_MS);
      const endX = pA.x + (pB.x - pA.x) * t;
      const endY = pA.y + (pB.y - pA.y) * t;
      const endZ = pA.z + (pB.z - pA.z) * t;

      if (
        positionAttr.array[base + 3] !== endX ||
        positionAttr.array[base + 4] !== endY ||
        positionAttr.array[base + 5] !== endZ
      ) {
        positionAttr.array[base + 3] = endX;
        positionAttr.array[base + 4] = endY;
        positionAttr.array[base + 5] = endZ;
        changed = true;
      }

      if (t >= 1) {
        animationStartRef.current.delete(rel.id);
      }
    }

    if (changed) {
      positionAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
  });

  if (visibleRelations.length === 0 || Object.keys(positions).length === 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={themeConfig.edgeStyle.opacity}
        depthWrite={false}
        fog={false}
      />
    </lineSegments>
  );
}
=== END FILE ===