/**
 * LineSegments-based edge rendering.
 * Batched geometry for all edges — one draw call.
 */

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";

export function EdgeLines() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const relations = useGraphStore((s) => s.relations);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useGraphStore((s) => s.themeConfig);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);

  // Connected set for focus mode
  const connectedToFocused = useMemo(() => {
    if (!focusedEntityId) return null;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of relations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId, relations]);

  // Build geometry from relations and positions
  const geometry = useMemo(() => {
    const verts: number[] = [];
    const colors: number[] = [];

    const edgeColor = new THREE.Color(themeConfig.edgeStyle.color);
    const dimColor = edgeColor.clone().multiplyScalar(0.2);

    for (const rel of relations) {
      const pA = positions[rel.subject_id];
      const pB = positions[rel.object_id];
      if (!pA || !pB) continue;

      // In focus mode, dim non-connected edges
      let color = edgeColor;
      if (connectedToFocused) {
        const isConnected =
          connectedToFocused.has(rel.subject_id) && connectedToFocused.has(rel.object_id);
        color = isConnected ? edgeColor : dimColor;
      }

      verts.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [relations, positions, themeConfig, connectedToFocused]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.geometry = geometry;
    }
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (relations.length === 0 || Object.keys(positions).length === 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={themeConfig.edgeStyle.opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}
