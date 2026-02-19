# Brain Viewer — Design Document

## Purpose

A 3D interactive visualizer for the Knowledge Graph MCP server's SQLite database. Lets the user explore entities as nodes in 3D space, inspect their observations and relations, watch the graph's history replay as an animation, and monitor live changes in realtime.

## Architecture

Two-process system:

- **Python FastAPI backend** reads the KG's single SQLite database directly (read-only, WAL mode) and serves a REST + WebSocket API. Maintains its own sidecar SQLite database for positions, preferences, and timeline cache.
- **React + Vite + TypeScript frontend** renders the 3D graph using React Three Fiber and connects to the backend for data and realtime events.

### Data source

The KG lives in one file: `~/.llm_harness/knowledge.db` (or the path in `KNOWLEDGE_GLOBAL_DB`). Project vs global data is distinguished by the `scope` column (`'global'` or `'project:{Name}'`), not separate files. The backend can filter by scope if the user wants to visualize only one project's entities.

The backend never writes to the KG database. Its own sidecar (`brain_viewer.db`) stores computed node positions, layout state hashes, user preferences, and timeline cache.

### Realtime mode

The backend polls the KG database every 1-2 seconds for rows with `date_added` newer than the last check. New events are pushed to the frontend via WebSocket, triggering animated node spawns, edge appearances, and highlight effects.

## Layout Engine and Position Persistence

The layout system has two phases: initial computation and incremental updates.

### Initial computation (first run)

1. **Community placement**: each community gets a centroid position on a sphere, spaced to maximize inter-community distance. Communities are sorted by ID and placed using a Fibonacci sphere distribution (evenly spaced points, no randomness).

2. **Intra-community refinement**: within each community, entities are positioned near their community centroid. Embedding cosine similarity between entities controls attractive forces — similar entities sit closer. The force simulation uses `d3-force-3d` with a fixed seed (deterministic).

3. **Global repulsion**: a charge force keeps all nodes from overlapping, bounded within a configurable radius. Relations add weak attractive springs between connected nodes.

4. **Convergence and persistence**: the simulation runs until energy drops below a threshold. Final `(x, y, z)` positions are written to the sidecar DB's `node_positions` table, keyed by entity ID, alongside a structural hash.

### Structural hash

SHA-256 of the sorted list of `(entity_id, scope, community_id)` tuples plus `(subject_id, predicate, object_id)` relation triples. Same hash = identical visual. Positions only change when the data actually changes.

### Incremental updates

On subsequent loads, the backend compares the current structural hash against the persisted one. If they match, positions are served as-is (zero computation). If they differ, it diffs the graph to find added/removed nodes and edges, seeds new nodes at their community centroid, and runs the simulation from the last stable positions. Only the neighborhood of changed nodes moves significantly; distant nodes stay nearly still.

## Frontend — 3D Scene and Interaction

### Three layers

- **3D canvas**: React Three Fiber with `@react-three/drei` OrbitControls (zoom, pan, rotate). Nodes and edges use instanced rendering for performance up to several thousand entities.
- **UI overlay**: detail panel, timeline bar, theme picker, filters — all standard React components rendered on top of the canvas.
- **State manager**: Zustand stores for graph data, replay state, and UI state.

### Node appearance

- Color maps to entity type (concept, method, parameter, tool, etc.)
- Size maps to observation count (more observations = larger node)
- Opacity maps to verification status (human-verified = fully opaque, unverified = slightly translucent)
- All mappings are defined per-theme

### Interaction model

- **Click**: selects node, opens detail panel showing entity name, type, all observations with severity/source/tags, and connected relations.
- **Hover**: highlights node and its immediate neighbors + edges.
- **Double-click**: focus mode — camera smoothly animates to center on node, non-connected nodes fade to low opacity. Escape or click empty space to exit.
- **Filters**: filter by entity type, scope, severity, community.

## Theme System

JSON-driven configuration layer. Each theme defines: node colors per entity type, material properties (emissive, metalness, roughness), edge style (line vs tube, color, opacity, glow), background, lighting, and post-processing effects (bloom, depth of field, tone mapping).

### Built-in themes

- **Neural / sci-fi dark**: black background, neon-glow nodes with bloom, luminous edge tubes with particle flow, subtle fog for depth.
- **Clean / minimal**: neutral gray background, solid matte spheres, thin lines, no post-processing. Maximum readability.
- **Organic / biological**: dark warm background, soft translucent spheres, pulsing edges, warm amber/coral/teal palette.

### Extensibility

Themes live in a `themes/` directory as JSON files. Adding a custom theme means dropping a new JSON file — no code changes. Schema validated at load time with graceful fallback. Last-selected theme persisted in sidecar DB.

## Replay System and Activity Timeline

### Event stream

The backend queries `date_added` fields across entities, observations, and relations tables, unions results into a single chronological stream: `{timestamp, event_type, entity_id, data}` with event types `ENTITY_CREATED`, `OBSERVATION_ADDED`, `RELATION_CREATED`.

### Timeline bar

Horizontal scrubber at the bottom of the screen showing the full KG history time range. Controls: play/pause, step forward/back, speed multiplier slider (0.1x to 100x).

### Idle time compression

A "Compress idle time" toggle (on by default) collapses any gap longer than a configurable threshold (default: 60 seconds) down to a brief visual pause (0.5s of playback). The timeline bar shows skip markers at each compressed gap ("14h skipped"). The gap threshold is adjustable ("Compress gaps longer than __ seconds"). Toggle off to revert to real-time proportional spacing.

### Replay animations

- Entity creation: node fades in from zero scale with elastic bounce.
- Relation creation: edge draws itself from subject to object.
- Observation added: existing node pulses with a glow ring colored by severity (red = blocking, amber = major, blue = info).
- All animations use eased transitions.

### Realtime mode

Replay with no end — backend polls every 1-2 seconds, new events animate immediately. Timeline bar extends rightward. Heartbeat indicator shows polling is active. Auto-follows unless user has manually scrubbed to an earlier point.

### Activity log

The timeline bar doubles as the activity log. Clicking any point shows a tooltip with events at that timestamp. A collapsible side panel lists the full event log as a scrollable table with filters (event type, entity type, time range).

## Backend API

### REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/graph` | GET | Full graph: entities, observations, relations, communities, positions. Params: `?scope=global` |
| `/api/timeline` | GET | Chronological event stream. Params: `?compress=true&gap_threshold=60&since={iso}` |
| `/api/entity/{id}` | GET | Full entity detail (observations, relations, aliases) |
| `/api/status` | GET | KG stats: counts, last modified, DB file size |
| `/api/layout/recompute` | POST | Force full layout recomputation |

### WebSocket endpoint

| Endpoint | Description |
|---|---|
| `WS /ws/realtime` | Polls KG DB every 1-2s, diffs against last state, pushes new events + position updates |

### Sidecar DB schema (`brain_viewer.db`)

- `node_positions(entity_id TEXT PK, x REAL, y REAL, z REAL, layout_hash TEXT)`
- `user_preferences(key TEXT PK, value TEXT)`
- `timeline_cache(hash TEXT PK, compressed_json TEXT)`

## Project Structure

```
Brain_viewer/
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   └── brain_viewer/
│   │       ├── __init__.py
│   │       ├── main.py         # FastAPI app, CORS, startup
│   │       ├── api.py          # REST endpoints
│   │       ├── ws.py           # WebSocket realtime handler
│   │       ├── db.py           # KG SQLite reader (read-only)
│   │       ├── layout.py       # Force simulation, hashing, persistence
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
│   │   │   ├── NodeMesh.tsx
│   │   │   ├── EdgeLines.tsx
│   │   │   ├── DetailPanel.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── ThemePicker.tsx
│   │   │   └── Filters.tsx
│   │   ├── themes/
│   │   │   ├── neural.json
│   │   │   ├── clean.json
│   │   │   └── organic.json
│   │   ├── hooks/
│   │   └── lib/
│   └── index.html
├── docs/
│   └── plans/
└── README.md
```

## Tech Stack

**Backend**: Python 3.11, FastAPI, uvicorn, numpy (embedding similarity). Venv at `C:\Users\matti\venvs\brain_viewer\`.

**Frontend**: React 19, TypeScript, Vite, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `d3-force-3d`, Zustand, Tailwind CSS.

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
