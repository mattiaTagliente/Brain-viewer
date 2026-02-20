## Round 1 Synthesis

### Cross-Model Consensus (Opus + Codex)

Both analyses agree on:

1. **Root cause**: TrackballControls sees the pointerdown event before React state update (`nodePointerActive`) can disable it. The async state approach is fundamentally flawed for same-event arbitration.

2. **stopImmediatePropagation works**: R3F and TrackballControls both register listeners on the same wrapper div (`events.connected`). R3F registers first (in `onCreated` layout effect), TrackballControls second (in `useEffect`). So `stopImmediatePropagation()` on the nativeEvent from R3F's handler blocks TrackballControls.

3. **Imperative ref toggling is the belt-and-suspenders**: passing the controls ref from CameraController to NodeMesh and synchronously setting `controls.enabled = false` in the pointerdown handler eliminates the race completely, regardless of DOM element resolution.

4. **Post-replay fix**: stale interaction state (pending refs, drag flags) survives replay mode toggle and prevents clicks from working. A `resetInteractionState` on replay toggle fixes this.

### Codex-Only Findings

- **Explicit domElement prop**: Codex recommends passing `domElement={events.connected ?? gl.domElement}` to TrackballControls to remove ambiguity from implicit fallback chain. Confidence: HIGH. Applied.
- **pointercancel listener**: added for robustness when pointer is lost mid-drag. Applied.
- **didDragRef as React ref**: replaced module-level `_didDrag` with a React ref passed as prop, cleaner lifecycle. Applied.
- **Unmount cleanup**: `resetInteractionState` runs on unmount to prevent stale state if NodeMesh unmounts mid-interaction. Applied.

### Decision

CONVERGED. All findings applied. TypeScript and Vite build pass. Ready for user testing.

### Changes Applied

1. **NodeMesh.tsx**: accepts `controlsRef` prop, uses `setControlsEnabled()` for synchronous imperative toggling + store flag, resets state on replay toggle and unmount, uses `didDragRef` React ref instead of module-level `_didDrag`, adds `pointercancel` listener
2. **GraphScene.tsx**: creates `controlsRef` in SceneContent, passes to both CameraController (via `controlsRefExternal`) and NodeMesh, CameraController uses callback ref to forward, explicit `domElement` on TrackballControls
3. **graphStore.ts**: no changes needed
