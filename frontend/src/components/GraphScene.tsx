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
import { useResolvedTheme, useSettingsStore } from "../store/settingsStore";
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
const NAV_SPEED = 500;

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
  const navSpeed = useSettingsStore((s) => s.navSpeed);
  const zoomSensitivity = useSettingsStore((s) => s.zoomSensitivity);
  const orbitSensitivity = useSettingsStore((s) => s.orbitSensitivity);
  const orbitDamping = useSettingsStore((s) => s.orbitDamping);
  const incrementNavSpeed = useSettingsStore((s) => s.incrementNavSpeed);
  const decrementNavSpeed = useSettingsStore((s) => s.decrementNavSpeed);
  const showSettings = useSettingsStore((s) => s.showSettings);
  const hasAutoFit = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  // Store home view for reset
  const homeView = useRef<CameraState | null>(null);

  // Forward controls ref to parent so NodeMesh can imperatively toggle enabled
  const setControlsRef = useCallback((instance: any | null) => {
    controlsRef.current = instance;
    if (controlsRefExternal) {
      controlsRefExternal.current = instance;
    }
  }, [controlsRefExternal]);

  // Explicit DOM target for TrackballControls — same element R3F uses
  const controlsDomElement = (events.connected ?? gl.domElement) as HTMLElement;

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

  // WASD+QE key tracking + speed controls (R/F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return;
      }

      const key = e.key.toLowerCase();

      if (key === "r" || key === "f") {
        if (showSettings) return;
        e.preventDefault();
        if (key === "r") incrementNavSpeed();
        else decrementNavSpeed();
        return;
      }

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
  }, [decrementNavSpeed, incrementNavSpeed, showSettings]);

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

    const speed = NAV_SPEED * navSpeed * delta;
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
      rotateSpeed={orbitSensitivity}
      zoomSpeed={zoomSensitivity}
      panSpeed={1}
      noRotate={false}
      noZoom={false}
      noPan={false}
      staticMoving={false}
      dynamicDampingFactor={orbitDamping}
      minDistance={1}
      maxDistance={50000}
      onChange={handleChange}
    />
  );
}

function SceneContent() {
  const themeConfig = useResolvedTheme();
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
  const themeConfig = useResolvedTheme();
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
