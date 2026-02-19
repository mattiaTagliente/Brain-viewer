### BLOCKING issues (must fix before testing)

1. `frontend/src/store/graphStore.ts:132` + `frontend/src/components/GraphScene.tsx:88` + `frontend/src/components/GraphScene.tsx:110`
- what's wrong: layout computation can terminate early on the first progress event.
- evidence supporting the current decision: progress updates call `setPositions(...)` to render live settling (`GraphScene.tsx:110-113`).
- evidence contradicting / failure mode: `setPositions` sets `positionsValid: true` (`graphStore.ts:132`), then the effect exits early when `positionsValid && positions` (`GraphScene.tsx:90`) and cleanup terminates the worker (`GraphScene.tsx:122`). final convergence and persistence may never happen.
- suggested fix: split `setPositions` into `setIntermediatePositions` (does not mark valid) and `setFinalPositions` (marks valid), and only set `positionsValid=true` on final worker message.
- confidence: HIGH (direct control-flow conflict).

2. `backend/src/brain_viewer/api.py:57` + `backend/src/brain_viewer/sidecar.py:80` + `backend/src/brain_viewer/sidecar.py:83`
- what's wrong: scoped graph hash is compared against an unscoped, nondeterministic sidecar hash.
- evidence supporting the current decision: API computes current hash from scoped graph and reuses sidecar positions if hash matches (`api.py:53-58`).
- evidence contradicting / failure mode: `get_layout_hash()` does `SELECT layout_hash ... LIMIT 1` with no `scope` and no order (`sidecar.py:83`), so `positions_valid` can be wrong when multiple scopes/layouts exist.
- suggested fix: make `get_layout_hash(scope)` and `get_positions(scope)`, add composite key/index by scope, and compare scoped hash to scoped sidecar data.
- confidence: HIGH (query semantics are explicit).

3. `backend/src/brain_viewer/api.py:50` + `backend/src/brain_viewer/db.py:161`
- what's wrong: structural hash for scoped `/api/graph` uses global observation counts.
- evidence supporting the current decision: hash includes observation counts to catch node-size changes.
- evidence contradicting / failure mode: `get_observation_counts()` has no `scope` parameter (`db.py:161-167`), but entities/relations/communities are scope-filtered in `/api/graph`; hash can change due to out-of-scope updates, causing unnecessary relayout or invalid cache decisions.
- suggested fix: add `get_observation_counts(scope)` and pass the same scope used for entities/relations.
- confidence: HIGH.

4. `frontend/src/components/NodeMesh.tsx:98` + `frontend/src/components/NodeMesh.tsx:147`
- what's wrong: instanced per-node coloring is implemented incorrectly.
- evidence supporting the current decision: it uses `InstancedMesh` (good for performance) and tries to update colors in bulk.
- evidence contradicting / failure mode: code sets a `"color"` attribute on geometry, not per-instance color data for `InstancedMesh`; this can produce incorrect coloring and unnecessary allocations each update.
- suggested fix: use `mesh.setColorAt(i, color)` and set `mesh.instanceColor!.needsUpdate = true` (or preallocated `InstancedBufferAttribute` attached as proper instanced attribute).
- confidence: MEDIUM-HIGH (Three.js instancing behavior is well-known; implementation is suspicious).

---

### MAJOR issues (should fix)

1. `frontend/src/lib/types.ts:78` + `backend/src/brain_viewer/db.py:131`
- what's wrong: `EntityDetail` type extends `Entity` but backend detail payload omits required `observation_count` and `community_id`.
- evidence supporting the current decision: detail API returns rich fields (`observations`, `relations`, `aliases`).
- evidence contradicting / failure mode: runtime payload from `get_entity_detail` has no `observation_count`/`community_id`; contract drift is hidden by usage patterns but can break future code.
- suggested fix: either return those fields from backend detail endpoint or redefine `EntityDetail` not to extend full `Entity`.
- confidence: HIGH.

2. `backend/src/brain_viewer/timeline.py:60`
- what's wrong: tie-breaker ordering does not match design requirement.
- evidence supporting the current decision: events are sorted by timestamp + priority.
- evidence contradicting / failure mode: design requires `(date_added, table_priority, rowid)` deterministic order; code uses `entity_id` as final key, which is unrelated to insertion order.
- suggested fix: include source table rowid in event construction and sort by it.
- confidence: HIGH.

3. `backend/src/brain_viewer/timeline.py:69`
- what's wrong: idle-time compression behavior is partial.
- evidence supporting the current decision: long gaps emit `GAP_SKIPPED` markers.
- evidence contradicting / failure mode: `compressed_pause_seconds` is unused; no compressed playback timeline is generated, so behavior does not meet the “collapse to 0.5s” design.
- suggested fix: add a computed playback timestamp axis (virtual time) honoring `compressed_pause_seconds`.
- confidence: HIGH.

4. `frontend/src/workers/layoutWorker.ts:141`
- what's wrong: worker ignores backend similarity matrix and does not implement max displacement cap.
- evidence supporting the current decision: it has centroid pull, charge, link, collide, seeded determinism, and incremental pinning.
- evidence contradicting / failure mode: `similarityMatrix` exists in types but is unused; design calls for embedding-similarity attraction and 20% displacement cap in incremental relayout.
- suggested fix: add similarity-based pairwise force (bounded/sparse) and enforce displacement clamping per node relative to centroid.
- confidence: HIGH.

5. `frontend/src/lib/api.ts:70` + `frontend/src/components/GraphScene.tsx:97`
- what's wrong: similarity endpoint exists but is never used by layout pipeline.
- evidence supporting the current decision: backend provides `/api/embeddings/similarity`.
- evidence contradicting / failure mode: `GraphScene` does not call `fetchSimilarity`; worker input omits populated `similarityMatrix`, so intended semantic layout signal is missing.
- suggested fix: request similarity for current entities before worker launch (possibly batched/subsampled) and pass matrix to worker.
- confidence: HIGH.

6. `backend/src/brain_viewer/ws.py:47` + `backend/src/brain_viewer/ws.py:83`
- what's wrong: resume watermarks are not validated.
- evidence supporting the current decision: reconnect protocol allows client-provided `last_seen_rowids`.
- evidence contradicting / failure mode: if client sends incomplete keys, code uses `watermarks["entities"]` etc and can raise KeyError; this becomes repeated error frames.
- suggested fix: merge client data onto defaults from `get_max_rowids()` and validate numeric values.
- confidence: HIGH.

---

### MINOR issues (nice to fix)

1. `backend/src/brain_viewer/api.py:39` + `backend/src/brain_viewer/api.py:92`
- what's wrong: error contract differs from design (`{data,error,meta}` with machine code).
- evidence supporting: successful responses follow envelope.
- evidence contradicting / failure mode: `HTTPException` responses use FastAPI default `{"detail":...}` and no machine `code`.
- suggested fix: add global exception handlers returning unified envelope and error code taxonomy.
- confidence: HIGH.

2. `backend/src/brain_viewer/main.py:64`
- what's wrong: CORS origin is hardcoded to one dev origin.
- evidence supporting: safe default for local dev.
- evidence contradicting / failure mode: breaks alternate local ports/hosts and deployment environments.
- suggested fix: make allowed origins configurable via env.
- confidence: HIGH.

3. `backend/src/brain_viewer/api.py:43`
- what's wrong: design mentions `include=observations,relations`; endpoint ignores `include`.
- evidence supporting: endpoint always returns full graph.
- evidence contradicting / failure mode: unnecessary payload for large graphs; misses documented API behavior.
- suggested fix: implement `include` filtering to reduce payload and startup latency.
- confidence: HIGH.

4. `frontend/src/components/NodeMesh.tsx:104` + `frontend/src/components/NodeMesh.tsx:113`
- what's wrong: event args are typed `any`, reducing TS safety on critical interaction paths.
- evidence supporting: implementation is concise and works at runtime.
- evidence contradicting / failure mode: regressions in R3F event shapes won’t be caught by compiler.
- suggested fix: use `ThreeEvent<MouseEvent>` from `@react-three/fiber`.
- confidence: MEDIUM.

5. no supporting evidence found for several design claims in provided implementation
- claim examples: reduced-motion handling, keyboard navigation, label LOD via `troika-three-text`, realtime frontend subscription, timeline/activity log UI.
- evidence supporting: dependencies include `troika-three-text` and `react-window` in `frontend/package.json`.
- evidence contradicting / failure mode: none of the reviewed frontend files implement these behaviors; likely incomplete adherence.
- suggested fix: either implement or explicitly scope current delivery to phase 1 in docs and API.
- confidence: MEDIUM (could exist outside provided files, but not in listed sources).

---

### Positive observations

- `backend/src/brain_viewer/db.py:31`: KG DB opens in read-only URI mode (`mode=ro`), aligned with single-database read-only constraint.
- `backend/src/brain_viewer/db.py:58`, `backend/src/brain_viewer/db.py:97`, `backend/src/brain_viewer/db.py:127`: user inputs are parameterized in SQL, so direct SQL-injection risk is low.
- `backend/src/brain_viewer/ws.py:58` + `backend/src/brain_viewer/db.py:188`: realtime polling uses `PRAGMA data_version` + rowid watermark strategy, matching design intent.
- `frontend/src/workers/layoutWorker.ts:155` + `frontend/src/workers/layoutWorker.ts:156`: layout is in Web Worker and uses `seedrandom` with `simulation.randomSource()`, satisfying deterministic-layout requirement.
- `frontend/src/components/NodeMesh.tsx:138` and `frontend/src/components/EdgeLines.tsx:68`: uses `InstancedMesh` and batched `LineSegments`, aligned with performance architecture.

I could not execute `tsc`/`vite build` in this session (read-only sandbox), so build cleanliness was assessed statically from code and config rather than runtime execution.