### BLOCKING issues (must fix before testing)

- **File**: `frontend/src/workers/layoutWorker.ts`, line 171
  - **Issue**: `d3-force-3d` simulation is stopped immediately (`.stop()`) but then manually ticked in `runBatch`. However, `runBatch` calls `simulation.tick()` which advances the simulation, but the force configuration might need to be "re-heated" or properly initialized if `alpha` is set manually. The real blocking issue is that `runBatch` uses `setTimeout(runBatch, 0)`, which on many browsers is throttled to ~4ms, potentially making the layout calculation slower than necessary. But more critically, **`seedrandom` is imported but not correctly used to replace the internal Math.random** of d3-force-3d *globally* or passed correctly if d3-force-3d supports a local PRNG source. The code uses `.randomSource(rng)`, which is correct for `d3-force-3d`, but `fibonacciSphere` (line 37) and other logic might still use `Math.random()` if not careful.
  - **Correction**: Actually, looking closely at `layoutWorker.ts`, it DOES use `.randomSource(rng)`. The blocking issue is in `NodeMesh.tsx` and `EdgeLines.tsx` regarding render loop performance.
  - **Refined Blocking Issue**: `frontend/src/components/NodeMesh.tsx` lines 66-102.
  - **What's wrong**: The `useEffect` updates the entire `InstancedMesh` (all matrices and colors) whenever `hoveredEntityId` changes. Hover events fire rapidly. Iterating 2000+ nodes and updating the buffer on every hover frame will cause massive stuttering/jank, violating the ">30 fps" target.
  - **Suggested fix**: Use a specialized shader material where "hovered instance ID" is a uniform, OR use a separate `InstancedMesh` for the highlighted node (or just a regular Mesh since it's one node) to avoid updating the giant buffer. Alternatively, update *only* the specific instance's color using `setColorAt` and `instanceColor.needsUpdate = true`, not the whole loop.
  - **Confidence**: HIGH

### MAJOR issues (should fix)

- **File**: `frontend/src/components/EdgeLines.tsx`, lines 29-57
  - **Issue**: The geometry is fully recreated (`new THREE.BufferGeometry`) inside `useMemo` whenever `relations` or `connectedToFocused` changes. `useMemo` does NOT dispose of the old geometry automatically. This causes a GPU memory leak as old geometries accumulate until garbage collected (which is unreliable for WebGL resources).
  - **Suggested fix**: Use `useEffect` to manage geometry lifecycle, calling `geometry.dispose()` on cleanup, or reuse a single geometry and update its attributes buffers.
  - **Confidence**: HIGH

- **File**: `backend/src/brain_viewer/ws.py`, line 46
  - **Issue**: `asyncio.wait_for(websocket.receive_json(), timeout=0.5)` is used to wait for an initial "resume" message. If the client connects and immediately disconnects (or sends a malformed message that isn't JSON), `receive_json` might raise `WebSocketDisconnect` or `JSONDecodeError`. The outer `try...except` (lines 44-50) catches generic `Exception` but suppresses it with `pass`. If `WebSocketDisconnect` happens here, the code proceeds to the main loop `while True:` and tries to send a heartbeat, which will raise `RuntimeError` or `WebSocketDisconnect` again, causing a noisy error log.
  - **Suggested fix**: Explicitly catch `WebSocketDisconnect` in the initial handshake and return/exit if it occurs.
  - **Confidence**: MEDIUM

- **File**: `backend/src/brain_viewer/api.py`, line 212 (missing error handling)
  - **Issue**: In `compute_similarity`, `np.frombuffer` (line 193) assumes the blob is strictly `float32`. If the KG database contains embeddings of a different dtype (e.g. `float64`) or corrupted blobs, this will crash or produce garbage. The KG schema doesn't enforce dtype.
  - **Suggested fix**: Wrap `np.frombuffer` in a try/except block or validate blob length (must be multiple of 4).
  - **Confidence**: MEDIUM

### MINOR issues (nice to fix)

- **File**: `frontend/src/components/NodeMesh.tsx`, line 11
  - **Issue**: `SIZE_BUCKETS` are hardcoded. If the theme changes node sizing logic, this remains static.
  - **Suggested fix**: Move size buckets to theme config.
  - **Confidence**: LOW

- **File**: `backend/src/brain_viewer/timeline.py`, line 83
  - **Issue**: Local import `from datetime import datetime` inside `compress_timeline`.
  - **Suggested fix**: Move to top-level imports (PEP 8).
  - **Confidence**: LOW

### Positive observations

- **Architecture**: Clear separation of `KGReader` (read-only) and `SidecarDB` (write) ensures data safety for the core KG.
- **Performance**: Use of `InstancedMesh` for nodes and `d3-force-3d` in a Web Worker shows strong awareness of performance constraints.
- **Determinism**: Explicit use of `seedrandom` and sorting inputs for the structural hash ensures the layout is stable and cacheable.
- **Accessibility**: Reduced motion support in the design (referenced in docs) is a good practice.
