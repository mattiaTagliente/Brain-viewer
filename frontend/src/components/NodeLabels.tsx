import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "troika-three-text";
import { useGraphStore } from "../store/graphStore";
import type { Entity } from "../lib/types";

const _tempVec3 = new THREE.Vector3();

/** Target apparent size — labels will look this big regardless of camera distance. */
const REFERENCE_DISTANCE = 200;

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
    const group = groupRef.current;
    if (!group) return;

    // Billboard: always face camera
    group.quaternion.copy(camera.quaternion);

    // Fixed screen-space size: scale proportional to camera distance
    // so the label appears the same size regardless of zoom level.
    const dist = camera.position.distanceTo(
      _tempVec3.set(position[0], position[1], position[2])
    );
    const scale = Math.max(0.2, dist / REFERENCE_DISTANCE);
    group.scale.setScalar(scale);
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

export function NodeLabels({ replayFilter = null }: { replayFilter?: Set<string> | null }) {
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
    let next = entities;
    if (filterEntityTypes.size > 0) {
      next = next.filter((entity) => filterEntityTypes.has(entity.entity_type));
    }
    if (replayFilter) {
      next = next.filter((entity) => replayFilter.has(entity.id));
    }
    return next;
  }, [entities, filterEntityTypes, replayFilter]);

  const labels = useMemo(() => {
    const candidates: LabelCandidate[] = [];

    for (const entity of visibleEntities) {
      const pos = positions[entity.id];
      if (!pos) continue;

      const distance = camera.position.distanceTo(_tempVec3.set(pos.x, pos.y, pos.z));
      const isSelected = entity.id === selectedEntityId;
      const isHovered = entity.id === hoveredEntityId;
      const inRange = distance < 250;

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

    return candidates.slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
