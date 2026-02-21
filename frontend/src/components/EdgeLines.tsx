/**
 * LineSegments-based edge rendering.
 * Batched geometry for all edges — one draw call.
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";
import { useResolvedTheme } from "../store/settingsStore";
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
  const themeConfig = useResolvedTheme();
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

  // Build geometry with final positions only — animation handled in useFrame
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
      verts[base] = pA.x;
      verts[base + 1] = pA.y;
      verts[base + 2] = pA.z;
      verts[base + 3] = pB.x;
      verts[base + 4] = pB.y;
      verts[base + 5] = pB.z;

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
  }, [visibleRelations, positions, themeConfig, connectedToFocused]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.geometry = geometry;
    }
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // Animation handled entirely in useFrame — no useEffect needed for tracking start times
  useFrame(() => {
    const validRelations = (geometry.userData.validRelations as Relation[] | undefined) ?? [];
    if (validRelations.length === 0) return;

    // Check for drag overrides from the store
    const { draggedEntityId, dragPosition } = useGraphStore.getState();

    if (reducedMotion && !draggedEntityId) {
      if (animationStartRef.current.size > 0) animationStartRef.current.clear();
      return;
    }

    const hasAnimating = animatingRelations.size > 0 || animationStartRef.current.size > 0;
    if (!hasAnimating && !draggedEntityId) return;

    const positionAttr = geometry.getAttribute("position");
    if (!(positionAttr instanceof THREE.BufferAttribute)) return;

    const now = performance.now();
    let changed = false;

    // Clean up finished animations no longer in the animating set
    for (const id of Array.from(animationStartRef.current.keys())) {
      if (!animatingRelations.has(id)) {
        animationStartRef.current.delete(id);
      }
    }

    for (let i = 0; i < validRelations.length; i += 1) {
      const rel = validRelations[i];
      let pA = positions[rel.subject_id];
      let pB = positions[rel.object_id];
      if (!pA || !pB) continue;

      // Apply drag position override
      if (draggedEntityId && dragPosition) {
        if (rel.subject_id === draggedEntityId) pA = dragPosition;
        if (rel.object_id === draggedEntityId) pB = dragPosition;
      }

      const base = i * 6;
      const isAnimating = animatingRelations.has(rel.id);

      if (isAnimating) {
        // Register start time on first encounter
        if (!animationStartRef.current.has(rel.id)) {
          animationStartRef.current.set(rel.id, now);
        }
        const start = animationStartRef.current.get(rel.id)!;
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
      } else {
        // Non-animated: ensure at correct position (including drag overrides)
        if (
          positionAttr.array[base] !== pA.x ||
          positionAttr.array[base + 1] !== pA.y ||
          positionAttr.array[base + 2] !== pA.z ||
          positionAttr.array[base + 3] !== pB.x ||
          positionAttr.array[base + 4] !== pB.y ||
          positionAttr.array[base + 5] !== pB.z
        ) {
          positionAttr.array[base] = pA.x;
          positionAttr.array[base + 1] = pA.y;
          positionAttr.array[base + 2] = pA.z;
          positionAttr.array[base + 3] = pB.x;
          positionAttr.array[base + 4] = pB.y;
          positionAttr.array[base + 5] = pB.z;
          changed = true;
        }
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
        fog
      />
    </lineSegments>
  );
}
