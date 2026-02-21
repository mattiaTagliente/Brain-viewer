# Brain Viewer

3D interactive visualizer for the Knowledge Graph MCP server. Explore entities as nodes in 3D space, inspect observations and relations, replay the graph's history as an animation, and monitor live changes in realtime.

## Features

- **3D force-directed graph**: entities as nodes, relations as edges, clustered by semantic community
- **Deterministic layout**: positions are persisted and only change when the data changes
- **Clickable nodes**: select any entity to see its full observations, relations, and metadata
- **Replay system**: watch the knowledge graph grow over time with animated node spawns and edge draws
- **Idle time compression**: skip overnight gaps to see only meaningful activity
- **Realtime mode**: live-poll the KG database and animate changes as they happen
- **Theme system**: switch between Neural (sci-fi dark), Clean (minimal), and Organic (biological) visual presets
- **Camera controls**: zoom, pan, rotate, orbit freely in 3D space
- **Responsive HUD controls**: search, entity filters, and home controls remain anchored inside viewport edges across desktop and mobile resolutions
- **Taskbar launcher window persistence**: app-window Chrome size is seeded once, then reuses your last manual resize on subsequent launches
- **Continuous startup splash**: launcher splash now stays visually consistent through app boot (no white flash and no style swap to a separate gray loader)

## Tech Stack

- **Backend**: Python 3.11, FastAPI, uvicorn, numpy
- **Frontend**: React 19, TypeScript, Vite, React Three Fiber, Zustand, Tailwind CSS
- **Data**: reads from `~/.llm_harness/knowledge.db` (SQLite, read-only)

## Development

```bash
# Backend
cd backend
uv sync
uvicorn brain_viewer.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT
