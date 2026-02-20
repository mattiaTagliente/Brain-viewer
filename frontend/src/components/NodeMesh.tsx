/**
 * InstancedMesh-based node rendering, grouped by entity type.
 * One InstancedMesh per entity type (9 draw calls max) — each group
 * uses a MeshStandardMaterial with the type's color.
 */

import { useRef, useMemo, useEffect, useCallback, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";
import { useResolvedTheme } from "../store/settingsStore";
import type { ThemeConfig } from "../themes/registry";
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
}

/** Single InstancedMesh for one entity type */
function TypeGroup({
  group,
  maxCount,
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
  maxCount: number;
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

  // Stable material ref — properties updated in place to avoid changing args
  // (R3F v9 swapInstances has a bug: it doesn't call removeInteractivity for
  // the old mesh or add the new mesh to the interaction list when eventCount
  // stays the same, permanently breaking raycasting/click detection.)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  if (!materialRef.current) {
    const hex = themeConfig.nodeColors[type] || "#888888";
    const color = new THREE.Color(hex);
    materialRef.current = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: themeConfig.nodeMaterial.emissive,
      metalness: themeConfig.nodeMaterial.metalness,
      roughness: themeConfig.nodeMaterial.roughness,
    });
  }

  // Update material properties when theme changes (without recreating the object)
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const hex = themeConfig.nodeColors[type] || "#888888";
    const color = new THREE.Color(hex);
    mat.color.set(color);
    mat.emissive.set(color);
    mat.emissiveIntensity = themeConfig.nodeMaterial.emissive;
    mat.metalness = themeConfig.nodeMaterial.metalness;
    mat.roughness = themeConfig.nodeMaterial.roughness;
    mat.needsUpdate = true;
  }, [themeConfig, type]);

  // Dispose material only on component unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
    };
  }, []);

  const updateInstances = useCallback((nowMs: number) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Set visible instance count (mesh is allocated with maxCount but we
    // only render/raycast the entities currently in this group)
    mesh.count = entities.length;

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

    // Recompute bounding sphere so raycasting works after instance matrices change.
    // Without this, InstancedMesh caches a stale bounding sphere from identity matrices
    // (computed before useEffect sets real positions), permanently breaking hit-testing.
    mesh.computeBoundingSphere();
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

  if (entities.length === 0) return null;

  return (
    <instancedMesh
      key={maxCount}
      ref={meshRef}
      args={[sharedGeom, materialRef.current, maxCount]}
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
  const themeConfig = useResolvedTheme();
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

  // Synchronously toggle TrackballControls + store flag
  const setControlsEnabled = useCallback((enabled: boolean) => {
    const controls = controlsRef?.current;
    if (controls) {
      controls.enabled = enabled;
    }
    setNodePointerActive(!enabled);
  }, [controlsRef, setNodePointerActive]);

  // Reset all interaction state (used on replay toggle and unmount)
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
        // Was a drag — start elastic return while keeping drag state alive
        // so EdgeLines continues tracking via draggedEntityId/dragPosition.
        const state = useGraphStore.getState();
        const currentDragPos = state.dragPosition;

        if (currentDragPos) {
          returningEntities.current.set(pending.entityId, {
            entityId: pending.entityId,
            from: { ...currentDragPos },
            to: { ...pending.originalPos },
            startTime: performance.now(),
          });
          // Do NOT call endDrag() here — the useFrame elastic return loop
          // will call updateDrag() each frame and endDrag() on completion.
        } else {
          endDrag();
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

  // Reset interaction state when replay mode toggles
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

    // Animate elastic returns — update store drag position each frame so
    // EdgeLines tracks the returning node via draggedEntityId/dragPosition.
    const now = performance.now();
    for (const [entityId, ret] of returningEntities.current) {
      const elapsed = now - ret.startTime;
      const t = Math.min(1, elapsed / ELASTIC_RETURN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = ret.from.x + (ret.to.x - ret.from.x) * eased;
      const y = ret.from.y + (ret.to.y - ret.from.y) * eased;
      const z = ret.from.z + (ret.to.z - ret.from.z) * eased;
      const animatedPos = { x, y, z };

      overrides.set(entityId, animatedPos);

      // Keep store's dragPosition in sync so EdgeLines follows
      const dragState = useGraphStore.getState();
      if (dragState.draggedEntityId === entityId) {
        updateDrag(animatedPos);
      }

      if (t >= 1) {
        returningEntities.current.delete(entityId);
        overrides.delete(entityId);

        // Clear drag state now that the elastic return is complete
        const completedState = useGraphStore.getState();
        if (completedState.draggedEntityId === entityId) {
          endDrag();
        }
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

  // Pre-compute max counts per entity type from the FULL entity list.
  // This lets InstancedMesh allocate once and avoid R3F's buggy swapInstances
  // when the visible count grows during replay.
  const maxCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of entities) {
      counts.set(entity.entity_type, (counts.get(entity.entity_type) || 0) + 1);
    }
    return counts;
  }, [entities]);

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
          maxCount={maxCounts.get(group.type) || group.entities.length}
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
