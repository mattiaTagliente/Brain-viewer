## TASK

Modify 6 existing files in the Brain Viewer frontend to integrate Phase 2 (Replay), Phase 3 (Realtime), and Phase 5 (Polish) features. The 4 NEW files (replayStore.ts, Timeline.tsx, useRealtime.ts, NodeLabels.tsx) have already been created. You need to modify the existing files to integrate with them.

## INPUT

- Design doc: `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md`
- All existing source files in `C:/Users/matti/Dev/Brain_viewer/frontend/src/`
- New replay store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/replayStore.ts`
- New timeline component: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/Timeline.tsx`
- New realtime hook: `C:/Users/matti/Dev/Brain_viewer/frontend/src/hooks/useRealtime.ts`
- New labels component: `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeLabels.tsx`

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file. Use this delimiter:

```
=== FILE: path ===
[complete file contents]
=== END FILE ===
```

Provide COMPLETE replacement contents for these 6 files:

### 1. `frontend/src/lib/types.ts` — add types needed by replay/realtime

Add these types to the existing file:
- `RealtimeMessage`: union type for WebSocket messages (events, heartbeat, error)
- `RealtimeEvent`: { event_type, timestamp, entity_id, data }
- Ensure TimelineEvent already has GAP_SKIPPED in its union (it does)

### 2. `frontend/src/store/graphStore.ts` — add replay filtering support

Add:
- `reducedMotion: boolean` field (check `window.matchMedia('(prefers-reduced-motion: reduce)')` in initial state)
- `addEntity(entity)` action for realtime — appends to entities array
- `addRelation(relation)` action for realtime — appends to relations array
- `updateEntityObsCount(entityId, delta)` action for realtime — increments observation_count

Keep all existing state and actions intact.

### 3. `frontend/src/store/uiStore.ts` — no changes needed unless you see fit

### 4. `frontend/src/App.tsx` — integrate new components

Add:
- Import and render Timeline component (conditionally, when showTimeline from uiStore)
- Import and call useRealtime hook (enabled when NOT in replay mode)
- Render "Live" indicator (green dot) in StatusBar when realtime connected
- Render NodeLabels inside GraphScene
- Add keyboard event listener (useEffect with keydown handler):
  - Escape: deselect entity / exit focus / close detail panel (priority order)
  - Space: toggle replay play/pause
  - ArrowUp/Down: cycle through entities
  - Enter: select current entity
- Move StatusBar to accommodate timeline bar above it

### 5. `frontend/src/components/GraphScene.tsx` — integrate labels + replay filtering

Add:
- Import and render NodeLabels component inside SceneContent
- When replayStore.replayActive is true, pass visibleEntityIds/visibleRelationIds to NodeMesh and EdgeLines as filters

### 6. `frontend/src/components/NodeMesh.tsx` — replay animations

Add:
- Accept optional `replayFilter: Set<string> | null` prop — when set, only show entities in this set
- For entities in replayStore.animatingEntities: animate scale from 0 to normal using useFrame (linear 500ms)
- For entities in replayStore.pulsingEntities: apply emissive color boost by severity that fades over 800ms
- Check graphStore.reducedMotion — if true, skip animations

### 7. `frontend/src/components/EdgeLines.tsx` — replay edge animation

Add:
- Accept optional `replayFilter: Set<string> | null` prop — when set, only show relations in this set
- For relations in replayStore.animatingRelations: animate the edge by interpolating the endpoint from subject position to object position over 300ms
- Check graphStore.reducedMotion — if true, skip animations

## CONSTRAINTS

- TypeScript strict
- Keep ALL existing functionality intact — these are additions, not replacements of existing behavior
- Inline styles only (no Tailwind)
- No new package installs
- When replayStore.replayActive is false, everything should work exactly as before (Phase 1 behavior)
- Performance: no per-node React components, keep InstancedMesh pattern
