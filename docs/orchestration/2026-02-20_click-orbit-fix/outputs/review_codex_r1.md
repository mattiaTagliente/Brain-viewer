1. **Root cause analysis**

Claim: the click/orbit conflict is caused by same-pointerdown handling in both R3F and `TrackballControls`, with controls reacting before state-based disable takes effect.  
(a) evidence: `NodeMesh.tsx` sets `nodePointerActive` in `onPointerDown`; `GraphScene.tsx` passes `enabled={!nodePointerActive}` to `<TrackballControls />`, which is async React state. `TrackballControls` (three-stdlib) starts interaction in `onPointerDown` immediately when `enabled===true`.  
(b) contradiction / failure mode: if controls listener is already blocked via native propagation control, state timing alone would not matter.  
(c) confidence: HIGH, because the current code path exactly matches this timing hazard.

Claim: relying only on `stopImmediatePropagation()` is fragile unless controls and R3F are guaranteed on the same DOM target and expected listener order.  
(a) evidence: drei `TrackballControls` uses `domElement || events.connected || gl.domElement`; this can vary with lifecycle timing.  
(b) contradiction / failure mode: in many mounts, both do end up on the same target and `stopImmediatePropagation` can work.  
(c) confidence: MEDIUM, because target/order can be correct in many runs but is not robustly enforced in current code.

2. **Post-replay analysis**

Claim: replay transitions can leave pointer interaction state stale (`pendingRef`, drag flags, controls lock), causing broken click behavior after replay exits.  
(a) evidence: current `NodeMesh.tsx` has no replay-toggle reset of pending drag/click refs; it uses module-level `_didDrag`; cleanup does not force-interaction reset. KG prior finding also flags replay interaction reset as required.  
(b) contradiction / failure mode: if user never enters pointer-down state during replay transition, stale state may not occur.  
(c) confidence: MEDIUM-HIGH, because the missing reset is explicit in code and aligns with observed post-replay failures.

3. **Solution design**

Decision: enforce synchronous controls gating via imperative `controlsRef`, while retaining propagation stop and store flag.  
(a) evidence: imperative `controls.enabled = false` is immediate and bypasses React re-render latency.  
(b) contradiction / failure mode: if controls already saw pointerdown first, tiny motion can still happen; mitigation added by calling `controls.onMouseUp?.()` before disabling.  
(c) confidence: HIGH for eliminating async race; MEDIUM for eliminating all edge jitter in every browser.

Decision: make `TrackballControls` bind explicitly to `events.connected` (fallback `gl.domElement`) and share ref with `NodeMesh`.  
(a) evidence: this removes ambiguous target selection from implicit defaults and gives node code direct control access.  
(b) contradiction / failure mode: initial render may still use fallback before `events.connected` exists; component then updates to connected target.  
(c) confidence: HIGH.

Decision: reset node interaction refs on replay toggle and unmount.  
(a) evidence: prevents stale pending drag/click state across remount/filter cycles.  
(b) contradiction / failure mode: if replay toggles during active drag, drag is force-ended (intended tradeoff).  
(c) confidence: HIGH.

4. **Complete modified files**

### `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx`
```tsx
/**
 * InstancedMesh-based node rendering, grouped by entity type.
 * One InstancedMesh per entity type (9 draw calls max) — each group
 * uses a MeshStandardMaterial with the type's color.
 */

import { useRef, useMemo, useEffect, useCallback, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore, type ThemeConfig } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import type { Entity, EntityType, Severity, NodePosition } from "../lib/types";

const ENTITY_ANIM_MS = 500;
const OBSERVATION_PULSE_MS = 800;
const ELASTIC_RETURN_MS = 400;
const DRAG_THRESHOLD_PX = 5;

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

interface TrackballControlsLike {
  enabled: boolean;
  onMouseUp?: () => void;
}

/** Single InstancedMesh for one entity type */
function TypeGroup({
  group,
  positions,
  positionOverrides,
  themeConfig,
  hoveredEntityId,
  selectedEntityId,
  focusedConnected,
  onSelect,
  onNodePointerDown,
  onHover,
  onFocus,
  animatingEntities,
  pulsingEntities,
  reducedMotion,
  didDragRef,
}: {
  group: EntityGroup;
  positions: Record<string, { x: number; y: number; z: number }>;
  positionOverrides: Map<string, NodePosition>;
  themeConfig: ThemeConfig;
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  focusedConnected: Set<string> | null;
  onSelect: (id: string | null) => void;
  onNodePointerDown: (entityId: string, hitPoint: THREE.Vector3, screenX: number, screenY: number) => void;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  animatingEntities: Set<string>;
  pulsingEntities: Map<string, Severity>;
  reducedMotion: boolean;
  didDragRef: MutableRefObject<boolean>;
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
      const override = positionOverrides.get(entity.id);
      const pos = override ?? positions[entity.id];
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
    positionOverrides,
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
    const hasOverrides = positionOverrides.size > 0;
    if (!hasOverrides && reducedMotion) return;
    if (!hasOverrides && spawnStartRef.current.size === 0 && pulseStartRef.current.size === 0) return;
    updateInstances(performance.now());
  });

  const handlePointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      // Block other DOM listeners on the same target (notably TrackballControls)
      // for this pointerdown before they can start orbit mode.
      if (e.nativeEvent?.stopImmediatePropagation) {
        e.nativeEvent.stopImmediatePropagation();
      }
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId && e.point) {
          onNodePointerDown(
            entityId,
            e.point as THREE.Vector3,
            e.nativeEvent?.clientX ?? 0,
            e.nativeEvent?.clientY ?? 0,
          );
        }
      }
    },
    [entityIds, onNodePointerDown]
  );

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onSelect(entityId);
      }
    },
    [didDragRef, entityIds, onSelect]
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
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

interface PendingInteraction {
  entityId: string;
  hitPoint: THREE.Vector3;
  originalPos: NodePosition;
  screenX: number;
  screenY: number;
}

interface ElasticReturn {
  entityId: string;
  from: NodePosition;
  to: NodePosition;
  startTime: number;
}

export function NodeMesh({
  replayFilter = null,
  controlsRef = null,
}: {
  replayFilter?: Set<string> | null;
  controlsRef?: MutableRefObject<TrackballControlsLike | null> | null;
}) {
  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const hoveredEntityId = useGraphStore((s) => s.hoveredEntityId);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const reducedMotion = useGraphStore((s) => s.reducedMotion);
  const draggedEntityId = useGraphStore((s) => s.draggedEntityId);
  const dragPosition = useGraphStore((s) => s.dragPosition);

  const selectEntity = useGraphStore((s) => s.selectEntity);
  const hoverEntity = useGraphStore((s) => s.hoverEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);
  const setNodePointerActive = useGraphStore((s) => s.setNodePointerActive);
  const startDrag = useGraphStore((s) => s.startDrag);
  const updateDrag = useGraphStore((s) => s.updateDrag);
  const endDrag = useGraphStore((s) => s.endDrag);

  const replayActive = useReplayStore((s) => s.replayActive);
  const animatingEntities = useReplayStore((s) => s.animatingEntities);
  const pulsingEntities = useReplayStore((s) => s.pulsingEntities);

  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const dragPlane = useRef(new THREE.Plane());
  const pendingRef = useRef<PendingInteraction | null>(null);
  const dragActiveRef = useRef(false);
  const didDragRef = useRef(false);
  const returningEntities = useRef<Map<string, ElasticReturn>>(new Map());
  const positionOverridesRef = useRef<Map<string, NodePosition>>(new Map());
  const prevReplayActiveRef = useRef(replayActive);

  const setControlsEnabled = useCallback((enabled: boolean) => {
    const controls = controlsRef?.current;
    if (controls) {
      if (!enabled && typeof controls.onMouseUp === "function") {
        controls.onMouseUp();
      }
      controls.enabled = enabled;
    }
    setNodePointerActive(!enabled);
  }, [controlsRef, setNodePointerActive]);

  const resetInteractionState = useCallback(() => {
    pendingRef.current = null;
    dragActiveRef.current = false;
    didDragRef.current = false;
    returningEntities.current.clear();
    positionOverridesRef.current.clear();
    endDrag();
    setControlsEnabled(true);
  }, [endDrag, setControlsEnabled]);

  // Called by TypeGroup on pointerDown — records state for potential drag
  const handleNodePointerDown = useCallback(
    (entityId: string, hitPoint: THREE.Vector3, screenX: number, screenY: number) => {
      const pos = positions[entityId];
      if (!pos) return;

      pendingRef.current = {
        entityId,
        hitPoint: hitPoint.clone(),
        originalPos: { ...pos },
        screenX,
        screenY,
      };
      dragActiveRef.current = false;
      didDragRef.current = false;

      // Disable controls synchronously so a node click doesn't enter orbit mode.
      setControlsEnabled(false);
    },
    [positions, setControlsEnabled]
  );

  // Canvas-level pointer handlers for drag
  useEffect(() => {
    const domElement = gl.domElement;
    const mouse = new THREE.Vector2();
    const intersection = new THREE.Vector3();

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const dx = e.clientX - pending.screenX;
      const dy = e.clientY - pending.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Only activate drag after exceeding threshold
      if (!dragActiveRef.current) {
        if (dist < DRAG_THRESHOLD_PX) return;
        dragActiveRef.current = true;
        didDragRef.current = true;

        // Create drag plane perpendicular to camera at the hit point
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        dragPlane.current.setFromNormalAndCoplanarPoint(cameraDir, pending.hitPoint);

        startDrag(pending.entityId, pending.originalPos);
      }

      // Update drag position
      const rect = domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse, camera);
      if (raycaster.current.ray.intersectPlane(dragPlane.current, intersection)) {
        updateDrag({ x: intersection.x, y: intersection.y, z: intersection.z });
      }
    };

    const onPointerUpLike = () => {
      const pending = pendingRef.current;
      if (!pending) return;

      if (dragActiveRef.current) {
        // Was a drag — start elastic return
        const state = useGraphStore.getState();
        const currentDragPos = state.dragPosition;

        endDrag();

        if (currentDragPos) {
          returningEntities.current.set(pending.entityId, {
            entityId: pending.entityId,
            from: { ...currentDragPos },
            to: { ...pending.originalPos },
            startTime: performance.now(),
          });
        }
      }

      // For both click and drag, re-enable controls on pointer end.
      setControlsEnabled(true);

      pendingRef.current = null;
      dragActiveRef.current = false;
    };

    domElement.addEventListener("pointermove", onPointerMove);
    domElement.addEventListener("pointerup", onPointerUpLike);
    domElement.addEventListener("pointercancel", onPointerUpLike);

    return () => {
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUpLike);
      domElement.removeEventListener("pointercancel", onPointerUpLike);
    };
  }, [camera, gl, setControlsEnabled, startDrag, updateDrag, endDrag]);

  // Reset interaction state when replay mode toggles (mount/unmount/filter cycles)
  useEffect(() => {
    if (prevReplayActiveRef.current !== replayActive) {
      resetInteractionState();
      prevReplayActiveRef.current = replayActive;
    }
  }, [replayActive, resetInteractionState]);

  // Ensure controls are restored if this component unmounts mid-interaction
  useEffect(() => {
    return () => {
      resetInteractionState();
    };
  }, [resetInteractionState]);

  // Build position overrides map (drag + elastic returns) each frame
  useFrame(() => {
    const overrides = positionOverridesRef.current;

    // Apply drag position
    if (draggedEntityId && dragPosition) {
      const existing = overrides.get(draggedEntityId);
      if (!existing || existing.x !== dragPosition.x || existing.y !== dragPosition.y || existing.z !== dragPosition.z) {
        overrides.set(draggedEntityId, dragPosition);
      }
    }

    // Animate elastic returns
    const now = performance.now();
    for (const [entityId, ret] of returningEntities.current) {
      const elapsed = now - ret.startTime;
      const t = Math.min(1, elapsed / ELASTIC_RETURN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = ret.from.x + (ret.to.x - ret.from.x) * eased;
      const y = ret.from.y + (ret.to.y - ret.from.y) * eased;
      const z = ret.from.z + (ret.to.z - ret.from.z) * eased;
      overrides.set(entityId, { x, y, z });

      if (t >= 1) {
        returningEntities.current.delete(entityId);
        overrides.delete(entityId);
      }
    }

    // Clean up stale overrides
    if (!draggedEntityId) {
      for (const id of Array.from(overrides.keys())) {
        if (!returningEntities.current.has(id)) {
          overrides.delete(id);
        }
      }
    }
  });

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
          positionOverrides={positionOverridesRef.current}
          themeConfig={themeConfig}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          focusedConnected={focusedConnected}
          onSelect={(id) => { void selectEntity(id); }}
          onNodePointerDown={handleNodePointerDown}
          onHover={hoverEntity}
          onFocus={focusEntity}
          animatingEntities={animatingEntities}
          pulsingEntities={pulsingEntities}
          reducedMotion={reducedMotion}
          didDragRef={didDragRef}
        />
      ))}
    </>
  );
}
```

### `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx`
```tsx
/**
 * Main 3D scene: nodes, edges, lighting, camera controls.
 */

import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
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

// WASD navigation speed (units per second)
const NAV_SPEED = 150;

// Keys tracked for WASD+QE navigation
const NAV_KEYS = new Set(["w", "a", "s", "d", "q", "e"]);

/** Manages camera: auto-fit, persistence, home reset, WASD navigation. */
function CameraController({
  controlsEnabled = true,
  controlsRefExternal,
}: {
  controlsEnabled?: boolean;
  controlsRefExternal?: MutableRefObject<any | null>;
}) {
  const { camera, gl, events } = useThree();
  const controlsRef = useRef<any>(null);
  const positions = useGraphStore((s) => s.positions);
  const positionsValid = useGraphStore((s) => s.positionsValid);
  const hasAutoFit = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  // Store home view for reset
  const homeView = useRef<CameraState | null>(null);

  const setControlsRef = useCallback((instance: any | null) => {
    controlsRef.current = instance;
    if (controlsRefExternal) {
      controlsRefExternal.current = instance;
    }
  }, [controlsRefExternal]);

  const controlsDomElement = events.connected ?? gl.domElement;

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

  // WASD+QE key tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return;
      }
      const key = e.key.toLowerCase();
      if (NAV_KEYS.has(key)) {
        keysPressed.current.add(key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };
    const onBlur = () => keysPressed.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Apply WASD movement each frame
  const _forward = useRef(new THREE.Vector3());
  const _right = useRef(new THREE.Vector3());
  const _up = useRef(new THREE.Vector3());
  const _move = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (keysPressed.current.size === 0) return;
    const controls = controlsRef.current;
    if (!controls) return;

    // Compute camera-relative axes
    _forward.current.subVectors(controls.target, camera.position).normalize();
    _right.current.crossVectors(_forward.current, camera.up).normalize();
    // Up is perpendicular to both forward and right (camera-relative)
    _up.current.crossVectors(_right.current, _forward.current).normalize();

    const speed = NAV_SPEED * delta;
    _move.current.set(0, 0, 0);

    if (keysPressed.current.has("w")) _move.current.addScaledVector(_forward.current, speed);
    if (keysPressed.current.has("s")) _move.current.addScaledVector(_forward.current, -speed);
    if (keysPressed.current.has("d")) _move.current.addScaledVector(_right.current, speed);
    if (keysPressed.current.has("a")) _move.current.addScaledVector(_right.current, -speed);
    if (keysPressed.current.has("e")) _move.current.addScaledVector(_up.current, speed);
    if (keysPressed.current.has("q")) _move.current.addScaledVector(_up.current, -speed);

    camera.position.add(_move.current);
    controls.target.add(_move.current);
    controls.update();
  });

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
      ref={setControlsRef}
      domElement={controlsDomElement}
      enabled={controlsEnabled}
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
  const reducedMotion = useGraphStore((s) => s.reducedMotion);
  const focusEntity = useGraphStore((s) => s.focusEntity);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const nodePointerActive = useGraphStore((s) => s.nodePointerActive);

  const replayActive = useReplayStore((s) => s.replayActive);
  const visibleEntityIds = useReplayStore((s) => s.visibleEntityIds);
  const visibleRelationIds = useReplayStore((s) => s.visibleRelationIds);

  const controlsRef = useRef<any>(null);

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

      <NodeMesh
        replayFilter={replayActive ? visibleEntityIds : null}
        controlsRef={controlsRef}
      />
      <EdgeLines replayFilter={replayActive ? visibleRelationIds : null} />
      <NodeLabels replayFilter={replayActive ? visibleEntityIds : null} />

      {/* Invisible click plane for deselection */}
      <mesh onClick={handleMissClick} visible={false}>
        <sphereGeometry args={[50000, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>

      <CameraController controlsEnabled={!nodePointerActive} controlsRefExternal={controlsRef} />

      {bloom.enabled && !reducedMotion && (
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
  }, [entities, positionsValid]);

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
```

`graphStore.ts` needs no changes for this fix.