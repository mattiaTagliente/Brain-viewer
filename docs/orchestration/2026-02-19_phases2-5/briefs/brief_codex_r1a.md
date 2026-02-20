## TASK

Create 4 NEW TypeScript files for the Brain Viewer frontend. These implement the replay system (Phase 2), realtime mode (Phase 3), and node labels (Phase 5). The existing codebase has Phase 1 complete (static graph, detail panel, layout worker, themes, filters).

## INPUT

- Design doc: `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md`
- Types: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts`
- API client: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/api.ts`
- Graph store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts`
- UI store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts`

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file. Use this exact delimiter format per file:

```
=== FILE: path ===
[contents]
=== END FILE ===
```

Provide these 4 files:

### 1. `frontend/src/store/replayStore.ts`

Zustand store for replay state. Fields:
- events: TimelineEvent[], currentIndex: number, playing: boolean, speed: number (default 1)
- compressIdle: boolean (default true), gapThreshold: number (default 60)
- visibleEntityIds: Set<string>, visibleRelationIds: Set<string>
- animatingEntities: Set<string>, animatingRelations: Set<string>
- pulsingEntities: Map<string, string> (entity_id -> severity)
- replayActive: boolean, loading: boolean

Actions: loadTimeline(), play(), pause(), togglePlay(), stepForward(), stepBackward(), seekTo(index), setSpeed(n), setCompressIdle(v), setGapThreshold(n), startReplay(), exitReplay(), reset()

The tick() action advances events based on timing. When playing, a requestAnimationFrame loop in the component calls tick(). tick() checks the time delta between the current event and the next, divides by speed, and waits that duration. GAP_SKIPPED events pause briefly (0.5s). Animation batching: if >10 events would fire within one frame, batch them.

When an event fires:
- ENTITY_CREATED: add entity_id to visibleEntityIds + animatingEntities (remove from animating after 500ms)
- RELATION_CREATED: add relation data to visibleRelationIds + animatingRelations (remove after 300ms)
- OBSERVATION_ADDED: add to pulsingEntities with severity (remove after 800ms)

Import from `../lib/types` and `../lib/api` (fetchTimeline).

### 2. `frontend/src/components/Timeline.tsx`

Timeline bar component. Positioned at bottom, above the status bar. Dark semi-transparent background (rgba(0,0,0,0.7)). Contains:
- Left section: play/pause button (triangle/pause icon), step back/forward buttons (|< >| icons)
- Center section: scrubber track (full width, clickable, shows progress fill + playhead + gap markers as small vertical lines with tooltip showing "Xh skipped")
- Right section: speed selector (dropdown with 0.1x, 0.25x, 0.5x, 1x, 2x, 5x, 10x, 50x, 100x), compress toggle checkbox + threshold input
- Below track: event counter "42 / 1,234" and current timestamp

"Start Replay" button when not active. "Exit Replay" button when active.

All inline styles matching existing UI (Inter font, 12px text, #888 text color, #4a90d9 accent). Use replayStore for all state.

### 3. `frontend/src/hooks/useRealtime.ts`

Custom React hook for WebSocket at ws://localhost:8000/ws/realtime:
- Parameters: enabled: boolean
- Returns: { connected: boolean, lastHeartbeat: Date | null }
- Manages connection lifecycle with reconnect (exponential backoff: 1s, 2s, 4s, max 30s)
- Stores lastSeenRowids in a ref, sends on reconnect
- On ENTITY_CREATED: imports useGraphStore, adds entity to entities array, places it near community centroid with random offset (reads existing positions to compute centroid)
- On RELATION_CREATED: adds to relations array
- On OBSERVATION_ADDED: increments matching entity's observation_count
- On heartbeat: updates lastHeartbeat timestamp
- Cleans up WebSocket on unmount or when enabled=false

### 4. `frontend/src/components/NodeLabels.tsx`

LOD text labels using troika-three-text:
- Import { Text } from troika-three-text — but since we're in R3F, use a custom R3F component that wraps troika Text mesh
- For each visible entity, check distance from camera. If distance < 150 or entity is hovered/selected, show label
- Billboard mode: labels face camera (set quaternion from camera each frame via useFrame)
- Max 30 labels visible at once (prioritize selected > hovered > closest)
- Style: white text, fontSize 3, anchorX 'center', anchorY 'bottom', offset above the node
- Semi-transparent background: use a small plane behind text
- Import positions, entities, selectedEntityId, hoveredEntityId from graphStore

## CONSTRAINTS

- TypeScript strict — minimize `any`
- Use existing Zustand pattern (create with set/get)
- Use only installed packages (zustand, three, @react-three/fiber, troika-three-text, react-window)
- All inline styles, no Tailwind classes
- No new npm installs
