## TASK

Review and fix the node click / orbit-mode conflict in a React Three Fiber (R3F) + Three.js 3D knowledge graph visualizer. The user reports that clicking on a node immediately enters orbit mode (TrackballControls starts rotating) instead of opening the detail panel. After replay mode, click stops working entirely.

**Your deliverable:** a complete, corrected version of `NodeMesh.tsx` and any required changes to `GraphScene.tsx` or `graphStore.ts`. Output the COMPLETE file contents of each modified file as your final response. Do NOT write to any file.

## SKILL

No specific skill — use general-purpose React Three Fiber expertise.

## INPUT

Read these files to understand the current architecture:

- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx` — current node rendering with click/drag handlers (3rd rewrite attempt)
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx` — scene setup, CameraController with TrackballControls
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts` — Zustand store with drag state and selectEntity
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts` — UI store (showDetailPanel toggle)
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/replayStore.ts` — replay state (animatingEntities, visibleEntityIds)
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/DetailPanel.tsx` — floating detail panel
- `C:/Users/matti/Dev/Brain_viewer/AGENTS.md` — project context

### Problem description

The core conflict is between R3F's event system and TrackballControls (from @react-three/drei). Both listen on the same canvas DOM element. When the user clicks on a node:

1. R3F's `onPointerDown` fires on the InstancedMesh
2. But the same DOM `pointerdown` event also reaches TrackballControls, which starts orbit rotation
3. By the time React re-renders with `controlsEnabled={false}`, TrackballControls has already captured the pointer

Three attempts have been made:
- Attempt 1: Set `nodePointerActive` state in store, pass as `controlsEnabled={!nodePointerActive}` to TrackballControls. **Failed** — async React state update is too slow.
- Attempt 2: Move selection from R3F `onClick` to canvas `pointerup` via DOM listener. **Failed** — broke post-replay selection because refs were lost on unmount/remount.
- Attempt 3 (current): Use `e.nativeEvent.stopImmediatePropagation()` in R3F `onPointerDown` to prevent TrackballControls from seeing the event. **Untested** — may not work because R3F may not use the same DOM listener that TrackballControls uses.

### Key technical questions to investigate

1. Does R3F's event system actually register DOM listeners on the canvas that fire before TrackballControls' listeners? Or does R3F use a separate mechanism (e.g., its own Canvas-level listener)?
2. Will `stopImmediatePropagation()` on the nativeEvent from an R3F handler actually prevent TrackballControls from receiving the event?
3. If not, what is the correct approach? Consider:
   - Imperatively calling `controls.enabled = false` synchronously in the R3F handler (ref-based, not state-based)
   - Using R3F's `onPointerMissed` for deselection instead of relying on TrackballControls
   - Preventing TrackballControls from receiving events on specific targets
4. Why does selection break after replay mode exit? The replay system mounts/unmounts components — does this affect event handler registration order?

### Architecture constraints

- Uses InstancedMesh (one per entity type, ~9 groups). R3F provides `e.instanceId` to identify which instance was clicked.
- TrackballControls (not OrbitControls) for camera — supports rotation, zoom, pan.
- Drag-to-move feature: pointerDown on node → if moved >5px, enters drag mode with elastic return. If not moved, it's a click (selection).
- The `nodePointerActive` flag in the store is set `true` on pointerDown and `false` on pointerUp (or endDrag).

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file.

For each file you modify, output the complete file content wrapped in a code block with the file path as header. If a file needs no changes, say so explicitly.

Structure your response as:
1. **Root cause analysis** — what exactly causes the orbit-mode-on-click problem
2. **Post-replay analysis** — why click breaks after replay mode
3. **Solution design** — your approach and why it works
4. **Complete modified files** — full file contents for each changed file

## CONSTRAINTS

- For each claim, decision, or implementation choice:
  (a) identify evidence supporting it
  (b) identify evidence contradicting it or potential failure modes
  (c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

  Flag any claim where you cannot find supporting evidence.

- Must preserve existing features: drag-to-move with elastic return, hover highlighting, focus mode (double-click), spawn/pulse animations, replay filtering
- Must work with InstancedMesh (not individual meshes per node)
- The fix must be synchronous — cannot rely on React state updates to block TrackballControls
- Must work after replay mode mount/unmount cycles
- Keep changes minimal — don't rewrite architecture unless necessary
- TypeScript strict mode
