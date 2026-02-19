# Brain Viewer

3D interactive visualizer for the Knowledge Graph MCP server's SQLite database.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, uvicorn, numpy
- **Frontend**: React 19, TypeScript, Vite, React Three Fiber, Zustand, Tailwind CSS
- **Data source**: single SQLite database at `~/.llm_harness/knowledge.db` (read-only)

## Project Structure

```
Brain_viewer/
├── backend/           # FastAPI Python backend
│   ├── pyproject.toml
│   └── src/brain_viewer/
├── frontend/          # React + Vite + TypeScript
│   └── src/
├── docs/plans/        # design documents
└── scripts/           # delegation scripts
```

## Key Design Decisions

- Single KG database (schema v5, scope column for project isolation — no separate project DBs)
- Sidecar SQLite (`brain_viewer.db`) for persisted node positions, user preferences, timeline cache
- Deterministic layout: Fibonacci sphere for community placement, d3-force-3d with fixed seed, structural SHA-256 hash for change detection
- Switchable themes via JSON definitions (neural/sci-fi, clean/minimal, organic)
- Replay system reconstructs timeline from existing `date_added` fields, with idle time compression
- Realtime mode via SQLite WAL polling every 1-2 seconds, pushed to frontend via WebSocket

## KG Database Schema (read-only)

Core tables (all have `scope TEXT` column):
- `entities(id, name, entity_type, embedding, merged_into, date_added, date_modified, scope)`
- `observations(id, entity_id, text, severity, source_type, source_ref, verification_status, date_added, tags_json, deprecated, scope)`
- `relations(id, subject_id, predicate, object_id, source_type, source_ref, date_added, scope)`
- `communities(id, level, member_entity_ids, summary, date_computed, scope)`
