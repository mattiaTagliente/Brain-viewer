/**
 * InstancedMesh-based node rendering.
 * One draw call for all nodes — mandatory for performance.
 */

import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGraphStore, type ThemeConfig } from "../store/graphStore";
import type { EntityType } from "../lib/types";

const SIZE_BUCKETS = [0.8, 1.2, 1.8, 2.5]; // small, medium, large, xlarge
function getNodeSize(obsCount: number): number {
  if (obsCount <= 1) return SIZE_BUCKETS[0];
  if (obsCount <= 5) return SIZE_BUCKETS[1];
  if (obsCount <= 15) return SIZE_BUCKETS[2];
  return SIZE_BUCKETS[3];
}

function getNodeColor(entityType: EntityType, theme: ThemeConfig): THREE.Color {
  const hex = theme.nodeColors[entityType] || "#888888";
  return new THREE.Color(hex);
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export function NodeMesh() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const hoveredEntityId = useGraphStore((s) => s.hoveredEntityId);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const hoverEntity = useGraphStore((s) => s.hoverEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);

  // Filter entities
  const visibleEntities = useMemo(() => {
    if (filterEntityTypes.size === 0) return entities;
    return entities.filter((e) => filterEntityTypes.has(e.entity_type));
  }, [entities, filterEntityTypes]);

  // Entity index map for raycasting
  const entityIndexMap = useMemo(() => {
    const map = new Map<number, string>();
    visibleEntities.forEach((e, i) => map.set(i, e.id));
    return map;
  }, [visibleEntities]);

  // Build connected set for focus mode
  const connectedToFocused = useMemo(() => {
    if (!focusedEntityId) return null;
    const relations = useGraphStore.getState().relations;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of relations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId]);

  // Update instance matrices when positions or entities change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || visibleEntities.length === 0) return;

    visibleEntities.forEach((entity, i) => {
      const pos = positions[entity.id];
      const scale = getNodeSize(entity.observation_count);

      tempObject.position.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }, [visibleEntities, positions]);

  // Update instance colors (separate from matrices for hover performance)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || visibleEntities.length === 0) return;

    visibleEntities.forEach((entity, i) => {
      const color = getNodeColor(entity.entity_type, themeConfig);

      if (entity.id === hoveredEntityId || entity.id === selectedEntityId) {
        tempColor.set(color).multiplyScalar(1.5);
      } else if (connectedToFocused && !connectedToFocused.has(entity.id)) {
        tempColor.set(color).multiplyScalar(0.3);
      } else {
        tempColor.set(color);
      }

      mesh.setColorAt(i, tempColor);
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visibleEntities, themeConfig, hoveredEntityId, selectedEntityId, connectedToFocused]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined) {
      const entityId = entityIndexMap.get(instanceId);
      if (entityId) selectEntity(entityId);
    }
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined) {
      const entityId = entityIndexMap.get(instanceId);
      if (entityId) focusEntity(entityId);
    }
  };

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined) {
      const entityId = entityIndexMap.get(instanceId);
      if (entityId) hoverEntity(entityId);
    }
  };

  const handlePointerOut = () => {
    hoverEntity(null);
  };

  if (visibleEntities.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, visibleEntities.length]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[3, 16, 16]} />
      <meshStandardMaterial
        vertexColors
        emissive={new THREE.Color(0x000000)}
        emissiveIntensity={themeConfig.nodeMaterial.emissive}
        metalness={themeConfig.nodeMaterial.metalness}
        roughness={themeConfig.nodeMaterial.roughness}
      />
    </instancedMesh>
  );
}
