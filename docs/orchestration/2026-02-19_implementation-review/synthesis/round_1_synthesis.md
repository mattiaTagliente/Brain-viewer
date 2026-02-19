# Round 1 Synthesis — Implementation Review

## Cross-Model Consensus

### 1. BLOCKING: `setPositions` marks `positionsValid=true` on progress updates
- **Codex**: `graphStore.ts:132` + `GraphScene.tsx:88,110` — progress updates set `positionsValid=true`, causing effect to exit early and terminate the worker before convergence.
- **Agreement**: direct control-flow conflict. Worker never reaches final positions.
- **Fix**: split into `setIntermediatePositions` (positions only) and `setFinalPositions` (positions + positionsValid).

### 2. BLOCKING: NodeMesh instanced coloring approach
- **Codex**: using geometry attribute `"color"` instead of `mesh.setColorAt()` — incorrect for InstancedMesh.
- **Gemini**: full buffer update on every hover (2000+ iterations) causes jank and violates >30fps target.
- **Fix**: use `mesh.setColorAt(i, color)` + `instanceColor.needsUpdate = true`. Only update changed instances for hover.

### 3. MAJOR: WebSocket error handling
- **Codex**: `ws.py:83` — client-provided `last_seen_rowids` with missing keys causes KeyError.
- **Gemini**: `ws.py:46` — `WebSocketDisconnect` during initial handshake proceeds to main loop, causing noisy errors.
- **Fix**: merge client watermarks onto defaults, catch WebSocketDisconnect explicitly.

## Codex-Only Findings (confidence: MEDIUM)

### 4. BLOCKING: Scoped hash vs unscoped sidecar
- `sidecar.py:83` — `get_layout_hash()` has no scope, `LIMIT 1` with no order.
- **Fix**: add scope parameter to sidecar position/hash storage and retrieval.

### 5. BLOCKING: Observation counts are global
- `db.py:161` — `get_observation_counts()` has no scope filter.
- **Fix**: add scope parameter to match entities/relations filtering.

### 6. MAJOR: EntityDetail type mismatch
- Backend detail endpoint doesn't return `observation_count` or `community_id`.
- Frontend `EntityDetail extends Entity` expects these fields.
- **Fix**: return these fields from backend or redefine the type.

### 7. MAJOR: Similarity matrix unused in layout worker
- `layoutWorker.ts:141` — `similarityMatrix` in types but ignored.
- Design calls for embedding-similarity attraction.
- **Decision**: Phase 2 feature. Document as deferred.

### 8. MAJOR: Timeline ordering and compression incomplete
- Tie-breaker uses entity_id instead of rowid. Compression lacks virtual playback timeline.
- **Decision**: Phase 2 feature. Document as deferred.

### 9. MINOR: Missing Phase 2 features
- troika-three-text labels, keyboard navigation, timeline UI, realtime subscription frontend.
- **Decision**: Phase 2. Already installed dependencies (troika, react-window).

## Gemini-Only Findings (confidence: MEDIUM)

### 10. MAJOR: EdgeLines geometry memory leak
- `EdgeLines.tsx:29-57` — `useMemo` creates new `BufferGeometry` without disposing old.
- **Fix**: use `useEffect` with cleanup to call `geometry.dispose()`.

### 11. MAJOR: np.frombuffer dtype assumption
- `api.py:193` — assumes embeddings are float32 blobs.
- **Fix**: validate blob length and wrap in try/except.

## Decision

**CORRECTIONS_NEEDED** — apply all BLOCKING and critical MAJOR fixes before testing.

## Corrections Plan

| # | Issue | Severity | Action |
|---|---|---|---|
| 1 | setPositions / positionsValid | BLOCKING | Fix graphStore + GraphScene |
| 2 | NodeMesh coloring | BLOCKING | Rewrite with setColorAt |
| 3 | Scoped sidecar hash | BLOCKING | Add scope to sidecar methods |
| 4 | Scoped observation counts | BLOCKING | Add scope to db method |
| 5 | EdgeLines disposal | MAJOR | Add cleanup effect |
| 6 | WebSocket error handling | MAJOR | Fix watermarks + disconnect |
| 7 | EntityDetail type | MAJOR | Fix backend detail endpoint |
| 8 | np.frombuffer safety | MAJOR | Add validation |
| 9-11 | Phase 2 features | DEFERRED | Document scope |

Corrections applied: see below.
