## TASK

Implement Phases 2, 3, and 5 for the Brain Viewer 3D knowledge graph visualizer. Phase 1 (static graph, detail panel, layout worker, theme system, filters) is complete. You must create new files and provide modifications to existing files to complete the remaining features.

## SKILL

No specific skill — use general-purpose React + TypeScript + Three.js expertise.

## INPUT

Read these files to understand the existing codebase:

- Design document: `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md`
- Existing store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts`
- Existing UI store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts`
- Types: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts`
- API client: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/api.ts`
- App root: `C:/Users/matti/Dev/Brain_viewer/frontend/src/App.tsx`
- GraphScene: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx`
- NodeMesh: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx`
- EdgeLines: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/EdgeLines.tsx`
- DetailPanel: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/DetailPanel.tsx`
- Backend WebSocket: `C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/ws.py`
- Backend timeline: `C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/timeline.py`

## REQUIREMENTS

### Phase 2 — Replay System

**New file: `frontend/src/store/replayStore.ts`**

Zustand store managing replay state:
- `events: TimelineEvent[]` — loaded from `/api/timeline`
- `currentIndex: number` — current position in the event stream
- `playing: boolean` — play/pause state
- `speed: number` — playback multiplier (0.1 to 100), default 1
- `compressIdle: boolean` — toggle for idle time compression, default true
- `gapThreshold: number` — seconds threshold for gap compression, default 60
- `visibleEntityIds: Set<string>` — entities visible at current replay position
- `visibleRelationIds: Set<string>` — relations visible at current replay position
- `animatingEntities: Set<string>` — entities currently animating (fade-in)
- `animatingRelations: Set<string>` — relations currently animating (draw-in)
- `pulsingEntities: Map<string, string>` — entity_id -> severity for observation pulse
- `replayActive: boolean` — whether replay mode is active (vs static view)

Actions:
- `loadTimeline(compress, gapThreshold)` — fetches from `/api/timeline` via api.ts
- `play()`, `pause()`, `togglePlay()` — playback control
- `stepForward()`, `stepBackward()` — move one event
- `seekTo(index: number)` — jump to event index
- `setSpeed(n: number)` — change playback speed
- `setCompressIdle(v: boolean)` — toggle compression
- `setGapThreshold(n: number)` — change gap seconds
- `tick()` — advance to next event based on timing. Called by a requestAnimationFrame loop when playing. Must handle:
  - GAP_SKIPPED events: brief 0.5s pause then skip
  - Normal events: compute real-time delay between consecutive events, divide by speed
  - Animation batching: if >10 events would fire within the same frame, batch them (add all at once)
- `reset()` — stop replay, clear all state
- `startReplay()` — enters replay mode: hides all entities/relations, loads timeline, begins from index 0
- `exitReplay()` — exits replay mode: shows all entities/relations normally

When replay is active, graphStore's rendering should use `visibleEntityIds`/`visibleRelationIds` to filter what's shown.

**New file: `frontend/src/components/Timeline.tsx`**

Horizontal timeline bar at the bottom of the screen (above status bar). Contains:
- Scrubber track: horizontal line showing full time range, clickable to seek
- Playhead: draggable indicator at current position
- Progress fill: colored portion showing how far through the timeline
- Play/pause button (left side)
- Step back / step forward buttons
- Speed selector: dropdown or slider (0.1x, 0.25x, 0.5x, 1x, 2x, 5x, 10x, 50x, 100x)
- "Compress gaps" toggle with threshold input
- Gap markers: small indicators on the track showing compressed gaps with tooltip ("14h skipped")
- Time display: current event timestamp + total duration
- Event counter: "Event 42 / 1,234"
- "Start Replay" button when replay is not active
- "Exit Replay" / "View Live" button when replay is active

Style: dark semi-transparent background (matching the existing UI overlay style — rgba(0,0,0,0.6)), Inter font, 12-14px text, accent color from theme.

**Replay animations (modify NodeMesh.tsx and EdgeLines.tsx):**

When replay is active:
- NodeMesh: only render entities in `visibleEntityIds`. For entities in `animatingEntities`, apply scale animation (0 → 1 with elastic easing over ~500ms). For entities in `pulsingEntities`, apply a glow ring colored by severity (red=blocking, amber=major, blue=info, gray=minor) that fades out over ~800ms.
- EdgeLines: only render relations in `visibleRelationIds`. For relations in `animatingRelations`, animate the edge drawing from subject to object over ~300ms (interpolate the endpoint).

Use `useFrame` from @react-three/fiber for animations. Check `prefers-reduced-motion` — if active, skip animations (instant state changes).

### Phase 3 — Realtime Mode

**New file: `frontend/src/hooks/useRealtime.ts`**

Custom hook for WebSocket connection to `ws://localhost:8000/ws/realtime`:
- Manages connection lifecycle (connect, reconnect with exponential backoff)
- Stores `lastSeenRowids` for reconnection resume
- Dispatches received events to graphStore (add new entities, relations, observations to the arrays)
- Provides state: `connected: boolean`, `lastHeartbeat: Date | null`
- `enabled: boolean` parameter to toggle on/off
- When new ENTITY_CREATED events arrive, add the entity to graphStore.entities and trigger a position computation (place near community centroid + small random offset, similar to the fast-path in GraphScene)
- When new RELATION_CREATED events arrive, add to graphStore.relations
- When new OBSERVATION_ADDED events arrive, update the matching entity's observation_count and trigger a brief pulse animation

**Modify App.tsx:**
- Add a "Live" indicator (green dot + "Live" text) in the status bar when realtime is connected
- Add useRealtime hook call (enabled by default)
- When replay is active, disable realtime (pause WebSocket)
- Add a "Rejoin Live" button that appears when the user is in replay mode and realtime events are arriving

### Phase 5 — Polish

**New file: `frontend/src/components/NodeLabels.tsx`**

LOD text labels using troika-three-text (already installed):
- Hidden by default at overview zoom levels
- When camera distance to a node < threshold (e.g., 150 units), show the entity name label
- Always show label for hovered or selected entity regardless of distance
- Use `Text` from troika-three-text rendered as R3F component
- Billboard mode: labels always face the camera
- Style: white text, semi-transparent dark background, small font (fontSize ~3)
- Performance: only render labels for nodes within camera frustum AND within distance threshold. Cap at max 30 visible labels to prevent text overdraw.

**Keyboard navigation (modify App.tsx or create hook):**
- Arrow Up/Down: cycle through entities (in the order they appear)
- Enter: select current entity (opens detail panel)
- Escape: deselect, exit focus mode, or close detail panel (in that priority order)
- Space: toggle replay play/pause (when timeline is visible)

**Accessibility:**
- Check `window.matchMedia('(prefers-reduced-motion: reduce)')` at app startup
- Store as `reducedMotion: boolean` in graphStore or uiStore
- When true: all animations are instant (no easing, no duration), no bloom post-processing, no glow effects
- Timeline scrubber still works but events appear instantly

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file.

Structure your output as follows — for each file, use this exact delimiter format:

```
=== FILE: relative/path/to/file.ext ===
[complete file contents]
=== END FILE ===
```

Provide COMPLETE file contents for:
1. `frontend/src/store/replayStore.ts` (NEW)
2. `frontend/src/components/Timeline.tsx` (NEW)
3. `frontend/src/hooks/useRealtime.ts` (NEW)
4. `frontend/src/components/NodeLabels.tsx` (NEW)
5. `frontend/src/store/graphStore.ts` (MODIFIED — full replacement)
6. `frontend/src/store/uiStore.ts` (MODIFIED — full replacement)
7. `frontend/src/App.tsx` (MODIFIED — full replacement)
8. `frontend/src/components/GraphScene.tsx` (MODIFIED — full replacement)
9. `frontend/src/components/NodeMesh.tsx` (MODIFIED — full replacement)
10. `frontend/src/components/EdgeLines.tsx` (MODIFIED — full replacement)
11. `frontend/src/lib/types.ts` (MODIFIED — full replacement, add any new types needed)

## CONSTRAINTS

- TypeScript strict mode — no `any` types except where unavoidable (Three.js event callbacks)
- Use existing Zustand pattern (create with set/get) — see graphStore.ts for the pattern
- All API calls go through the existing `api.ts` client functions
- Do NOT install new npm packages — use only what's already in package.json (react, three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, zustand, d3-force-3d, seedrandom, troika-three-text, react-window, tailwindcss)
- Do NOT modify backend files — the backend is complete
- Keep the existing theme system working — all visual properties come from themeConfig
- Performance target: Surface Pro 7, 30+ fps with 2000 nodes. Do not add per-node React components. Use InstancedMesh and batched geometry patterns already established.
- All style properties use inline styles (matching existing code) — NOT Tailwind classes (the existing codebase uses inline styles)
- Maintain the existing focus mode behavior (click to select, double-click to focus, Escape to exit)
- The replay system must work independently of the static graph view — when replay exits, the full graph should be visible again
