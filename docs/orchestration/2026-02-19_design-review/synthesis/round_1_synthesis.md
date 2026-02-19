# Round 1 Synthesis

## Cross-Model Consensus

**BLOCKING: Layout runtime mismatch.** The design assigns layout computation to the Python backend but specifies `d3-force-3d`, which is a JavaScript library. Both agents flag this. Codex calls it "critical" (HIGH probability x HIGH impact). Gemini recommends Web Worker for the simulation. Resolution: move force layout to the frontend running in a Web Worker. The backend only stores/serves persisted positions and computes the structural hash.

**BLOCKING: Web Worker is mandatory.** Both agents agree that running `d3-force-3d` on the main thread will freeze the UI for 2000+ nodes. The simulation must run in a dedicated Web Worker.

**MAJOR: InstancedMesh is mandatory.** Both agents confirm that per-node mesh objects will not perform. Must use Three.js `InstancedMesh` for nodes and `LineSegments` (or instanced lines) for edges.

**MAJOR: Deterministic seeding requires `randomSource()`.** Both agents note that d3-force-3d uses internal randomness in some forces (collision, centering). Simply using a "fixed seed" is insufficient — must explicitly provide a seeded PRNG via `simulation.randomSource()` using a library like `seedrandom`.

**MAJOR: Missing `date_added` index.** Both agents observe that the KG schema has no index on `date_added` for entities, observations, or relations. Polling queries will do full table scans. Options: add indexes to the KG (requires LLM_Harness change) or cache the last-seen rowid as watermark instead.

**MAJOR: Incremental update "neighborhood" is underspecified.** Both agents flag that force-directed graphs are chaotic — a small structural change can cascade across the entire layout. "Only the neighborhood moves" is an assumption, not a guarantee. Need explicit stability controls (freeze nodes > N hops away, or max displacement cap).

## Codex-Only Findings (confidence: MEDIUM)

- **Event ordering**: need deterministic tie-breaking for equal timestamps (table priority + rowid)
- **Sidecar schema underspecified**: needs `scope`, `params_hash`, `schema_version`, `created_at` columns and indexes
- **Structural hash misses visual changes**: observation/alias updates affect node size and displayed content but don't change the hash — stale visual state
- **API contract typing**: no shared types between frontend and backend
- **Accessibility**: no reduced-motion mode, keyboard-only navigation, or screen-reader strategy
- **MVP milestone split**: recommends phased delivery (static graph first, then replay, then realtime, then themes)

## Gemini-Only Findings (confidence: MEDIUM)

- **Label rendering**: 5000 text labels in 3D is extremely expensive; needs LOD strategy (show on hover only, or `troika-three-text` / SDF fonts)
- **Depth sorting**: translucent nodes (unverified entities with reduced opacity) cause WebGL depth sorting artifacts; needs OIT or careful render order
- **Edge instancing**: must use `LineSegments` or custom shader, not individual `Line` objects
- **Windows-specific**: should use `loop="proactor"` for uvicorn on Windows to avoid socket exhaustion
- **`PRAGMA data_version` polling**: suggested as a lightweight alternative to timestamp-based polling

## Disagreements

None — the reviews are complementary without contradiction.

## Decision

**CORRECTIONS_NEEDED**

The two BLOCKING findings require restructuring: layout computation moves to the frontend Web Worker, and the backend becomes a pure data server (graph data, position persistence, timeline events). This is a significant architectural change that affects sections 2, 6, and 7 of the design document.

## Corrections to Apply

1. **Move layout engine to frontend Web Worker** — d3-force-3d runs client-side. Backend only reads/writes persisted positions from the sidecar DB.
2. **Add Web Worker architecture to frontend design** — explicit worker for simulation, postMessage protocol for positions.
3. **Require `seedrandom` + `simulation.randomSource()`** — not just "fixed seed."
4. **Add InstancedMesh + LineSegments requirement** — explicit in the frontend section.
5. **Add label rendering strategy** — LOD, hover-only, or troika-three-text.
6. **Define incremental update stability controls** — freeze radius (N hops), max displacement cap.
7. **Expand sidecar schema** — add scope, params_hash, schema_version, created_at.
8. **Add `date_added` index note** — document that either KG indexes need adding or use rowid watermark.
9. **Add event ordering spec** — timestamp + table priority + rowid tie-breaking.
10. **Add Windows-specific notes** — uvicorn proactor loop, PRAGMA data_version consideration.
11. **Add performance targets** — target hardware (Surface Pro 7), fps target, max node count.
12. **Add accessibility notes** — reduced motion, keyboard navigation.
