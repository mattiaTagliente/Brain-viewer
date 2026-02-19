# Design Review: Brain Viewer (Gemini R1)

**Review Date:** 2026-02-19
**Reviewer:** Antigravity (Gemini 3 Pro)
**Target:** C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md

## 1. Feasibility Assessment (Overall)

**Status: HIGH FEASIBILITY (with critical optimizations)**

The proposed architecture is generally sound and achievable within the constraints. The "Read-Only KG + Sidecar DB" pattern effectively isolates the viewer from the production data. However, the client-side layout engine for "low thousands" of entities (2000-5000) pushes the limits of standard browser performance without strict optimization (InstancedMesh, Web Workers).

The "Replay System" via multi-table UNION is feasible on SQLite for the projected dataset size (<50k rows total), but the "Realtime Mode" polling mechanism on Windows needs specific implementation care to avoid locking or exhaustion issues.

## 2. Per-Section Analysis

### 2.1. Architecture (Two-Process System)
- **(a) Pros:** Decouples visualization logic from the LLM Harness. Python backend leverages existing `llm_harness` library code for DB access.
- **(b) Alternatives:**
    - *Electron App:* Could simplify distribution but adds complexity to the build chain. Current browser-based approach is better for dev velocity.
    - *Server-Side Rendering (SSR) for Layout:* Running layout in Python (networkx/igraph) could be faster/stable, but 3D interactivity requires client-side state anyway.
- **(c) Feasibility:** **HIGH**. Standard pattern.

### 2.2. Data Source & Polling
- **(a) Pros:** `PRAGMA data_version` polling is lightweight and avoids file locks in WAL mode.
- **(b) Alternatives:** File system watchers (watchdog) are flaky on Windows (especially with SQLite's temp files). Polling `data_version` is more robust.
- **(c) Feasibility:** **HIGH**. See "Risk Inventory" for Windows-specific caveats.

### 2.3. Layout Engine (Deterministic Force-Directed)
- **(a) Pros:** `d3-force-3d` is standard and flexible. Fibonacci sphere seeding provides a good initial distribution.
- **(b) Alternatives:**
    - *Graphology / Sigma.js:* Faster for large 2D graphs, but less 3D support.
    - *GPU-based layout (fme3):* Much faster for >5k nodes, but harder to integrate with custom React logic.
- **(c) Feasibility:** **MEDIUM**.
    - **Risk:** `d3-force-3d` is CPU-bound. 5000 nodes will block the main thread if not offloaded to a **Web Worker**.
    - **Risk:** "Determinism" in `d3` requires explicit `randomSource` seeding, not just "fixed seed". Some forces (like collision) use internal randomness.

### 2.4. Structural Hash & Persistence
- **(a) Pros:** Avoids "popping" or re-layout on reload. Critical for user spatial memory.
- **(b) Alternatives:** Store positions in the main KG (violates read-only constraint).
- **(c) Feasibility:** **HIGH**. The hashing strategy (SHA-256 of sorted tuples) is robust.

### 2.5. Frontend (React Three Fiber)
- **(a) Pros:** R3F is excellent for declarative 3D.
- **(b) Alternatives:** Babylon.js (more built-in game features, but less React-y).
- **(c) Feasibility:** **HIGH**, provided **InstancedMesh** is used. Naive ` <mesh />` for 5000 nodes will run at <10 FPS.

### 2.6. Replay System
- **(a) Pros:** "Idle time compression" is a clever UX feature.
- **(b) Alternatives:** Linear playback (boring for long gaps).
- **(c) Feasibility:** **HIGH**. Python-side compression is fast enough for the target dataset size.

## 3. Risk Inventory

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Layout blocks UI thread** | High | High (Freeze) | Must move `d3-force-3d` to a **Web Worker**. |
| **Windows Socket Exhaustion** | Medium | Medium | Use `ProactorEventLoop` for `uvicorn` on Windows. |
| **Non-Deterministic Layout** | Medium | Medium | Must use `simulation.randomSource()` with a seeded PRNG (e.g., `seedrandom`), not just a constant. |
| **SQLite Locking on Windows** | Low | High (Crash) | Ensure `check_same_thread=False` and strictly read-only mode for main DB. |
| **Rendering Performance** | Medium | High (Lag) | **Mandatory:** Use `InstancedMesh` for nodes and edges. Do not use individual objects. |
| **Replay Query Slowness** | Low | Medium | Ensure `date_added` columns are indexed in the KG schema. |

## 4. Missing Considerations

1.  **Web Worker Integration:** The design doesn't explicitly mention running the simulation in a worker. For 2000+ nodes, this is mandatory to keep the UI responsive.
2.  **Edge Instancing:** Drawing 5000+ edges as individual lines is expensive. Needs `LineSegments` or a custom shader for performant instanced lines.
3.  **Label Rendering:** Rendering 5000 text labels is extremely expensive. Needs a strategy (LOD, only show on hover, or SDF fonts).
4.  **Z-Index/Depth Sorting:** Translucent nodes (unverified entities) cause depth sorting issues in WebGL. Needs "OIT" (Order Independent Transparency) or careful render order management.

## 5. Recommendations

1.  **Architecture:** Enforce **Web Worker** usage for the `d3-force-3d` simulation.
2.  **Frontend:** Mandate **InstancedMesh** for nodes and **LineSegments** for edges. Use `troika-three-text` or SDF fonts for labels, visible only at high zoom or hover.
3.  **Determinism:** Explicitly require `seedrandom` (or equivalent) connected to `simulation.randomSource()`.
4.  **Backend:** Implement the "Idle Time Compression" in Python (generator-based) rather than SQL.
5.  **Windows:** Explicitly configure `uvicorn` to use `loop="proactor"` in `main.py`.

## 6. Ambiguities

- **"Neighborhood of changed nodes moves significantly"**: This assumption in Section "Incremental updates" is dangerous. Force-directed graphs are chaotic; a small change *can* cascade.
    - *Clarification:* Define "neighborhood" (e.g., "fix positions of nodes > N hops away").
- **"Gap threshold (default: 60 seconds)"**: Is this "wall clock time" or "simulation time"? Assuming wall clock difference between `date_added` timestamps.
