# Brain Viewer — Design Document

## Purpose

A 3D interactive visualizer for the Knowledge Graph MCP server's SQLite database. Lets the user explore entities as nodes in 3D space, inspect their observations and relations, watch the graph's history replay as an animation, and monitor live changes in realtime.

### Performance targets

- Target hardware: Surface Pro 7 (Intel Iris Plus, 8 GB RAM)
- Smooth interaction (>30 fps) with up to 2000 nodes and 5000 edges
- Default theme must be GPU-friendly (clean/minimal on low-end hardware)
- Initial load under 3 seconds for a 1000-node graph

## Architecture

Two-process system:

- **Python FastAPI backend** reads the KG's single SQLite database directly (read-only, WAL mode) and serves a REST + WebSocket API. Maintains its own sidecar SQLite database for persisted positions, preferences, and timeline cache. Performs structural hash computation and serves/stores position data. Does NOT run the force simulation — that runs client-side.
- **React + Vite + TypeScript frontend** renders the 3D graph using React Three Fiber, runs the force-directed layout in a **Web Worker**, and connects to the backend for data and realtime events.

### Data source

The KG lives in one file: `~/.llm_harness/knowledge.db` (or the path in `KNOWLEDGE_GLOBAL_DB`). Project vs global data is distinguished by the `scope` column (`'global'` or `'project:{Name}'`), not separate files. The backend can filter by scope if the user wants to visualize only one project's entities.

The backend never writes to the KG database. It opens the KG database in read-only mode (`uri=file:...?mode=ro`) with a busy timeout to handle concurrent reads safely. Its own sidecar (`brain_viewer.db`) stores computed node positions, layout state hashes, user preferences, and timeline cache.

### Realtime mode

The backend polls the KG database every 1-2 seconds using a high-water mark strategy: tracks the last-seen `rowid` per table (entities, observations, relations) rather than relying solely on `date_added` timestamps, since `date_added` columns are not indexed in the KG schema. Alternatively, uses `PRAGMA data_version` to detect any change cheaply, then queries for new rows only when a change is detected. New events are pushed to the frontend via WebSocket, triggering animated node spawns, edge appearances, and highlight effects.

Note: the KG schema does not index `date_added`. If polling by timestamp is needed, consider adding indexes to the KG (LLM_Harness change) or using the rowid/data_version approach.

### Windows-specific notes

- Backend uses `uvicorn` with `loop="auto"` (which selects the proactor event loop on Windows) to avoid socket exhaustion
- SQLite connections use `check_same_thread=False` for safe cross-thread access
- OneDrive sync may interfere with WAL side files — sidecar DB lives in the project directory, not in a synced folder

## Layout Engine and Position Persistence

The layout runs entirely in the **frontend** via a dedicated **Web Worker**. The backend only stores and serves persisted positions, and computes the structural hash to detect when relayout is needed.

### Layout Web Worker

The force simulation runs in a Web Worker to keep the main thread (and React Three Fiber's render loop) responsive. The worker receives graph data (nodes, edges, communities, embeddings) via `postMessage`, runs `d3-force-3d` to convergence, and posts back final `(x, y, z)` positions. During simulation, the worker periodically posts intermediate positions so the user can see nodes settling into place.

**Determinism**: `d3-force-3d` uses internal randomness in some forces (collision, initial placement). To guarantee deterministic output, the simulation must use `simulation.randomSource()` with a seeded PRNG (e.g., `seedrandom` library), not just a constant initial seed. Same graph data + same seed = identical positions every time.

### Initial computation (first run)

1. **Community placement**: each community gets a centroid position on a sphere, spaced to maximize inter-community distance. Communities are sorted by ID and placed using a Fibonacci sphere distribution (evenly spaced points, no randomness).

2. **Intra-community refinement**: within each community, entities are positioned near their community centroid. Embedding cosine similarity between entities (computed by the backend from the stored embeddings) controls attractive forces — similar entities sit closer.

3. **Global repulsion**: a charge force keeps all nodes from overlapping, bounded within a configurable radius. Relations add weak attractive springs between connected nodes.

4. **Convergence and persistence**: the simulation runs until energy drops below a threshold (alpha < 0.001). Final `(x, y, z)` positions are sent back to the main thread, which persists them to the backend via `POST /api/layout/positions`. The backend writes them to the sidecar DB alongside the structural hash.

### Structural hash

SHA-256 of the sorted list of `(entity_id, scope, community_id)` tuples plus `(subject_id, predicate, object_id)` relation triples, plus `(entity_id, observation_count)` tuples to detect changes that affect node size. Same hash = identical visual. Positions only change when the data actually changes.

### Incremental updates

On subsequent loads, the backend compares the current structural hash against the persisted one. If they match, positions are served as-is (zero computation, no Web Worker needed). If they differ, it diffs the graph to find added/removed nodes and edges, and sends the updated graph + last stable positions to the Web Worker. The worker seeds new nodes at their community centroid, and runs the simulation from the last stable positions with explicit stability controls:

- **Freeze radius**: nodes more than 3 hops away from any changed node/edge have their positions fixed (`fx`, `fy`, `fz` pinned)
- **Max displacement cap**: no node may move more than 20% of its distance from its community centroid per relayout
- **Convergence from warm start**: simulation starts at low alpha (0.1) rather than 1.0, limiting total energy and movement

This prevents the chaotic cascade behavior inherent to force-directed layouts, where a small change could otherwise ripple across the entire graph.

## Frontend — 3D Scene and Interaction

### Three layers

- **3D canvas**: React Three Fiber with `@react-three/drei` OrbitControls (zoom, pan, rotate). Nodes use **`InstancedMesh`** (one draw call for all nodes of the same type). Edges use **`LineSegments`** (batched line geometry, not individual Line objects). This is mandatory for performance at the target node count.
- **UI overlay**: detail panel, timeline bar, theme picker, filters — all standard React components rendered on top of the canvas.
- **State manager**: Zustand stores for graph data, replay state, and UI state.

### Node appearance

- Color maps to entity type (concept, method, parameter, tool, etc.)
- Size maps to observation count (more observations = larger node), with quantized size buckets (small/medium/large/xlarge) to avoid imperceptible differences
- Opacity maps to verification status (human-verified = fully opaque, unverified = slightly translucent). Note: translucent nodes require careful depth sorting — use `depthWrite={false}` and render translucent nodes in a separate pass after opaque nodes to avoid WebGL depth artifacts.
- All mappings are defined per-theme

### Label rendering

Text labels in 3D are expensive. Strategy: labels are hidden by default and shown only on hover or when a node is selected. At high zoom levels (camera distance < threshold), labels for nearby nodes appear using `troika-three-text` (SDF font rendering, GPU-efficient). This keeps the scene clean at overview zoom and readable at detail zoom.

### Interaction model

- **Click**: selects node, opens detail panel showing entity name, type, all observations with severity/source/tags, and connected relations.
- **Hover**: highlights node and its immediate neighbors + edges, shows label.
- **Double-click**: focus mode — camera smoothly animates to center on node, non-connected nodes fade to low opacity. Escape or click empty space to exit.
- **Filters**: filter by entity type, scope, severity, community.
- **Keyboard**: arrow keys to cycle through nodes, Enter to select, Escape to deselect/exit focus mode.

### Accessibility

- `prefers-reduced-motion` media query disables animations (instant transitions instead of eased)
- Detail panel is fully keyboard-navigable and screen-reader-friendly (semantic HTML, ARIA labels)
- Color encodings are supplemented by shape or icon variants for colorblind accessibility

## Theme System

JSON-driven configuration layer. Each theme defines: node colors per entity type, material properties (emissive, metalness, roughness), edge style (line vs tube, color, opacity, glow), background, lighting, and post-processing effects (bloom, depth of field, tone mapping). Each theme declares a `gpuCost` field ("low", "medium", "high") so the app can auto-select the clean theme on low-end hardware.

### Built-in themes

- **Neural / sci-fi dark** (gpuCost: high): black background, neon-glow nodes with bloom, luminous edge tubes with particle flow, subtle fog for depth.
- **Clean / minimal** (gpuCost: low): neutral gray background, solid matte spheres, thin lines, no post-processing. Maximum readability. Default on first launch.
- **Organic / biological** (gpuCost: medium): dark warm background, soft translucent spheres, pulsing edges, warm amber/coral/teal palette.

### Extensibility

Themes live in a `themes/` directory as JSON files. Adding a custom theme means dropping a new JSON file — no code changes. Schema validated at load time with graceful fallback (missing fields filled from the clean theme defaults). Last-selected theme persisted in sidecar DB.

## Replay System and Activity Timeline

### Event stream

The backend queries `date_added` fields across entities, observations, and relations tables, unions results into a single chronological stream: `{timestamp, event_type, entity_id, data}` with event types `ENTITY_CREATED`, `OBSERVATION_ADDED`, `RELATION_CREATED`.

**Ordering**: events are sorted by `(date_added ASC, table_priority ASC, rowid ASC)` where table_priority is: ENTITY_CREATED=0, RELATION_CREATED=1, OBSERVATION_ADDED=2. This ensures deterministic ordering even when multiple events share the same timestamp (common during `kg_extract` bursts). The gap threshold for idle time compression refers to wall-clock difference between consecutive `date_added` timestamps.

### Timeline bar

Horizontal scrubber at the bottom of the screen showing the full KG history time range. Controls: play/pause, step forward/back, speed multiplier slider (0.1x to 100x).

### Idle time compression

A "Compress idle time" toggle (on by default) collapses any gap longer than a configurable threshold (default: 60 seconds) down to a brief visual pause (0.5s of playback). The timeline bar shows skip markers at each compressed gap ("14h skipped"). The gap threshold is adjustable ("Compress gaps longer than __ seconds"). Toggle off to revert to real-time proportional spacing. Compression is computed in the Python backend (generator-based, not SQL) to keep the logic testable and avoid complex SQL window functions.

### Replay animations

- Entity creation: node fades in from zero scale with elastic bounce.
- Relation creation: edge draws itself from subject to object.
- Observation added: existing node pulses with a glow ring colored by severity (red = blocking, amber = major, blue = info).
- All animations use eased transitions. When `prefers-reduced-motion` is active, animations are replaced by instant state changes.
- Animation budget: during bursty event windows (>10 events/second at playback speed), animations are batched — nodes appear in groups rather than individually to maintain frame rate.

### Realtime mode

Replay with no end — backend polls every 1-2 seconds, new events animate immediately. Timeline bar extends rightward. Heartbeat indicator shows polling is active. Auto-follows unless user has manually scrubbed to an earlier point. A "rejoin live" button appears when the user is viewing historical data while realtime events arrive.

### Activity log

The timeline bar doubles as the activity log. Clicking any point shows a tooltip with events at that timestamp. A collapsible side panel lists the full event log as a virtualized scrollable table (react-window) with filters (event type, entity type, time range). Server-side pagination for logs exceeding 10,000 entries.

## Backend API

### REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/graph` | GET | Full graph: entities (without embeddings), observations, relations, communities, positions. Params: `?scope=global`, `?include=observations,relations` |
| `/api/timeline` | GET | Chronological event stream. Params: `?compress=true&gap_threshold=60&since={iso}&limit=1000&offset=0` |
| `/api/entity/{id}` | GET | Full entity detail (observations, relations, aliases) |
| `/api/status` | GET | KG stats: counts, last modified, DB file size |
| `/api/layout/positions` | GET | Current persisted positions + structural hash |
| `/api/layout/positions` | POST | Save new positions from the Web Worker after layout computation |
| `/api/layout/recompute` | POST | Invalidate cached positions, forcing relayout on next frontend load |
| `/api/embeddings/similarity` | POST | Compute pairwise cosine similarity for a set of entity IDs (used by Web Worker for intra-community forces) |

### WebSocket endpoint

| Endpoint | Description |
|---|---|
| `WS /ws/realtime` | Polls KG DB every 1-2s via data_version/rowid watermark, diffs against last state, pushes new events as JSON. Reconnect protocol: on disconnect, client sends `last_seen_rowid` to resume without duplicates. |

### Error contract

All REST endpoints return JSON with `{data, error, meta}` envelope. Errors include a machine-readable `code` field. WebSocket messages include a `seq` field for ordering and dedup.

### Sidecar DB schema (`brain_viewer.db`)

```sql
CREATE TABLE node_positions (
    entity_id TEXT PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    layout_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE timeline_cache (
    scope TEXT NOT NULL,
    params_hash TEXT NOT NULL,
    compressed_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, params_hash)
);

CREATE TABLE schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Initial row: INSERT INTO schema_metadata VALUES ('version', '1');
```

## Project Structure

```
Brain_viewer/
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   └── brain_viewer/
│   │       ├── __init__.py
│   │       ├── main.py         # FastAPI app, CORS, startup, uvicorn config
│   │       ├── api.py          # REST endpoints
│   │       ├── ws.py           # WebSocket realtime handler + polling
│   │       ├── db.py           # KG SQLite reader (read-only)
│   │       ├── hashing.py      # Structural hash computation
│   │       ├── timeline.py     # Event stream builder, gap compression
│   │       └── sidecar.py      # brain_viewer.db management
│   └── brain_viewer.db         # created at runtime
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/
│   │   │   ├── graphStore.ts
│   │   │   ├── replayStore.ts
│   │   │   └── uiStore.ts
│   │   ├── components/
│   │   │   ├── Canvas3D.tsx
│   │   │   ├── GraphScene.tsx
│   │   │   ├── NodeMesh.tsx    # InstancedMesh-based node rendering
│   │   │   ├── EdgeLines.tsx   # LineSegments-based edge rendering
│   │   │   ├── NodeLabels.tsx  # troika-three-text labels (LOD)
│   │   │   ├── DetailPanel.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── ThemePicker.tsx
│   │   │   └── Filters.tsx
│   │   ├── workers/
│   │   │   └── layoutWorker.ts # d3-force-3d simulation in Web Worker
│   │   ├── themes/
│   │   │   ├── neural.json
│   │   │   ├── clean.json
│   │   │   └── organic.json
│   │   ├── hooks/              # useGraphData, useRealtime, useReplay
│   │   └── lib/                # API client, types, worker protocol
│   └── index.html
├── docs/
│   └── plans/
├── scripts/
│   └── delegate.sh
└── README.md
```

## Tech Stack

**Backend**: Python 3.11, FastAPI, uvicorn (proactor loop on Windows), numpy (embedding similarity). Venv at `C:\Users\matti\venvs\brain_viewer\`.

**Frontend**: React 19, TypeScript, Vite, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three`, `d3-force-3d`, `seedrandom`, `troika-three-text`, `zustand`, `react-window`, `tailwindcss`.

## KG Database Schema Reference

The backend reads these tables (all have `scope TEXT` column):

- `entities(id, name, entity_type, metadata_json, embedding, merged_into, date_added, date_modified, scope)`
- `observations(id, entity_id, text, severity, source_type, source_ref, verification_status, date_added, tags_json, deprecated, superseded_by, embedding, scope)`
- `relations(id, subject_id, predicate, object_id, source_type, source_ref, date_added, scope)`
- `communities(id, level, member_entity_ids, summary, summary_embedding, date_computed, scope)`
- `aliases(entity_id, alias, scope)`

Valid entity types: concept, method, parameter, dataset, finding, pitfall, tool, decision, person.
Valid predicates: requires, contradicts, extends, uses, measures, corrects, produces, references.
Valid severities: blocking, major, minor, info.

Note: `date_added` columns are NOT indexed in the KG schema. Polling queries should use rowid watermarks or `PRAGMA data_version` rather than timestamp range scans.

## Implementation Phases (MVP-first)

1. **Phase 1 — Static graph + detail panel**: backend serves graph data, frontend renders nodes/edges with InstancedMesh/LineSegments, click to inspect. Web Worker layout with position persistence.
2. **Phase 2 — Replay system**: timeline bar, event stream, idle time compression, replay animations.
3. **Phase 3 — Realtime mode**: WebSocket polling, live event animation, rejoin-live button.
4. **Phase 4 — Theme system**: JSON-driven themes, theme picker, GPU cost detection.
5. **Phase 5 — Polish**: accessibility, keyboard navigation, reduced motion, label rendering, animation budgeting.
