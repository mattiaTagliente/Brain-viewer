# Brain Viewer

3D interactive visualizer for the Knowledge Graph MCP server's SQLite database. React 19 + Three.js/React Three Fiber frontend, FastAPI backend.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, uvicorn, numpy
- **Frontend**: React 19, TypeScript, Vite, React Three Fiber, Zustand, Tailwind CSS
- **Data source**: single SQLite database at `C:/Users/matti/AppData/Local/llm_harness/knowledge.db` (read-only, via platformdirs)

## Project Structure

```
Brain_viewer/
├── backend/           # FastAPI Python backend
│   ├── pyproject.toml
│   └── src/brain_viewer/
│       ├── main.py, api.py, db.py
│       ├── sidecar.py, hashing.py
│       ├── timeline.py, ws.py
├── frontend/          # React + Vite + TypeScript
│   └── src/
│       ├── components/   # GraphScene, NodeMesh, EdgeLines, NodeLabels, Timeline, App, etc.
│       ├── store/        # graphStore, replayStore, uiStore, settingsStore (Zustand)
│       ├── workers/      # d3-force-3d Web Worker
│       ├── lib/          # utilities
│       └── themes/       # registry.ts (ThemeConfig, BUILTIN_THEMES)
├── docs/plans/        # design documents
├── scripts/           # delegation scripts
└── .claude/           # per-project agent config
```

## Key Architecture

- **Stores**: graphStore.ts (graph data + layout), replayStore.ts (replay state), uiStore.ts (panel/filter visibility), settingsStore.ts (nav speed, zoom, themes — with persist middleware). Theme state lives in settingsStore, NOT graphStore.
- **Layout**: d3-force-3d runs in Web Worker (JS lib, not backend). Params: charge -250, collide 25 (2 iter), link 80, community sphere 350.
- **Rendering**: InstancedMesh + setColorAt for nodes. Stable material via useRef + in-place property update to avoid R3F v9.5.0 swapInstances bug. Pre-allocated maxCount from full entity list + dynamic mesh.count.
- **Labels**: fixed screen-space size via inverse camera distance scaling (REFERENCE_DISTANCE=200).
- **Sidecar DB**: `backend/brain_viewer.db` (gitignored) for position persistence.
- **Realtime**: WebSocket via useRealtime.ts hook. Events batched into single setState.
- **HUD overlay**: controls are absolutely anchored to viewport edges (top-right/bottom-right/bottom-left), not grid-constrained, to prevent right-edge overflow at high-DPI and narrow viewport combinations.
- **Startup UX continuity**: taskbar launcher splash and in-app loading overlay share a single visual language; launch transition avoids intermediate white flash.
- **Launcher-ready handshake**: `scripts/loading.html` now hosts frontend in an iframe and keeps splash until frontend posts `brain-viewer-ready`; status updates flow via `postMessage`.

## Development

- **Backend venv**: `C:/Users/matti/venvs/brain_viewer/`
- **Start backend**: `PYTHONPATH="C:/Users/matti/Dev/Brain_viewer/backend/src" python -m uvicorn brain_viewer.main:app --port 8000`
- **Start frontend**: `cd frontend && npm run dev`

## KG Database Schema (read-only)

Core tables (all have `scope TEXT` column):
- `entities(id, name, entity_type, embedding, merged_into, date_added, date_modified, scope)`
- `observations(id, entity_id, text, severity, source_type, source_ref, verification_status, date_added, tags_json, deprecated, scope)`
- `relations(id, subject_id, predicate, object_id, source_type, source_ref, date_added, scope)`
- `communities(id, level, member_entity_ids, summary, date_computed, scope)`

## Key Design Decisions

- Single KG database (schema v5, scope column for project isolation — no separate project DBs)
- Sidecar SQLite for persisted node positions, user preferences, timeline cache
- Deterministic layout: Fibonacci sphere for community placement, d3-force-3d with fixed seed, structural SHA-256 hash for change detection
- Switchable themes via JSON definitions
- Replay system reconstructs timeline from existing `date_added` fields, with idle time compression
- Realtime mode via SQLite WAL polling every 1-2s, pushed to frontend via WebSocket
- Observation count dedup via seenObservationIdsRef + seq tracking

## Skill Routing Protocol

Before starting any task, check if a matching skill exists. Load the skill's `SKILL.md` using this resolution chain (first match wins):
1. `<project_root>/.claude/skills/<name>/SKILL.md` — project junctions resolve all tiers
2. `~/.claude/skills/<name>/SKILL.md` — global tier
3. `~/.claude/skill-sets/*/<name>/SKILL.md` — shared tier

Follow the skill's phased workflow. Do not skip phases. Common mappings for this project:

| User request | Skill |
|---|---|
| browser testing, viewport check, visual regression | `playwright-testing` |
| React health scan, dead code, lint | `react-doctor` |
| React performance optimization | `react-perf` |
| web quality/accessibility audit | `web-quality` |
| React component architecture | `composition-patterns` |
| Tailwind CSS styling | `tailwind-v4` |
| shadcn/ui components | `shadcn-ui` |
| creative work, new features | `brainstorming` |
| shell command fails on Windows | `shell-windows` |

## Knowledge Graph Protocol

Before starting work, check the knowledge graph:
1. `kg_check_pitfalls` with topic keywords
2. `kg_search` with relevant queries
3. Execute sequentially (not in parallel)

Before returning results, call `kg_handoff_check` to verify knowledge was persisted.

## Coding Documentation (Context7)

Context7 is available globally for up-to-date library docs. Tools:
- `resolve-library-id` — lookup library ID by name (e.g., "react", "three.js", "@react-three/fiber")
- `get-library-docs` — retrieve docs and examples for a resolved library ID
