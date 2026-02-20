## TASK

Implement 5 fixes in the Brain Viewer frontend. Output your COMPLETE deliverable as your final response — do NOT write to any file. For each fix, output the exact file path and a unified diff (or the complete replacement code for the changed section with enough context to locate it unambiguously).

## SKILL

No specific skill — use general-purpose analysis and implementation.

## INPUT

Read these files (all under `C:/Users/matti/Dev/Brain_viewer/frontend/src/`):
- `App.tsx` — HUD overlay layout (HomeButton, SettingsButton, StatusBar, SpeedIndicator)
- `components/SpeedIndicator.tsx` — transient and persistent speed badges
- `components/Timeline.tsx` — Start Replay button and active timeline bar
- `components/GraphScene.tsx` — TrackballControls config (rotateSpeed, CameraController)
- `components/NodeMesh.tsx` — node drag + elastic return (positionOverridesRef, elastic return animation)
- `components/EdgeLines.tsx` — edge position updates during drag (reads draggedEntityId/dragPosition from store)
- `store/settingsStore.ts` — settings (navSpeed, zoomSensitivity)
- `store/graphStore.ts` — drag state (draggedEntityId, dragPosition, endDrag)
- `CLAUDE.md` (project root) — architecture overview
- `AGENTS.md` (project root) — agent instructions

## FIXES REQUIRED

### Fix 1: HUD region layout system (prevents all overlaps)

Replace the scattered absolute-positioned HUD elements with a structured HUD overlay component. Use a CSS grid or flex-based layout with named regions:

```
┌─────────────────────────────────────┐
│ [top-left]              [top-right] │
│                                     │
│                                     │
│                                     │
│          [bottom-center]            │
│ [bottom-left]        [bottom-right] │
└─────────────────────────────────────┘
```

Region assignments:
- **top-left**: (empty for now)
- **top-right**: SettingsButton, Filters (stacked vertically)
- **bottom-left**: StatusBar
- **bottom-center**: SpeedIndicator (transient), Timeline/Start Replay
- **bottom-right**: SpeedIndicator (persistent badge), HomeButton (stacked vertically or side by side)

Requirements:
- The HUD overlay div uses `position: absolute; inset: 0; pointer-events: none; z-index: 20` with a CSS grid
- Each region is a flex container with `pointer-events: auto` on interactive children only
- Elements within a region stack naturally (no magic pixel offsets that could collide)
- Padding from viewport edges: 12px
- The transient speed indicator should appear ABOVE the timeline, not overlapping it — use flex column ordering within the bottom-center region
- The persistent speed badge should sit next to (left of) the Home button, not overlap it — use flex row within bottom-right

### Fix 2: Edges must follow elastic return animation

**Root cause**: when `endDrag()` is called in `graphStore`, it sets `draggedEntityId=null` and `dragPosition=null`. EdgeLines reads these in its `useFrame` and stops tracking the dragged node. But the elastic return animation lives only in `NodeMesh.positionOverridesRef` — EdgeLines has no access to it.

**Solution**: instead of clearing drag state immediately on pointer up, keep the drag state alive during elastic return. The elastic return animation should update `dragPosition` in the store each frame (not just `positionOverridesRef`). Only call `endDrag()` when the elastic return completes (t >= 1).

Concretely:
1. In `NodeMesh.tsx`, in the `onPointerUpLike` handler: do NOT call `endDrag()` immediately. Instead, start the elastic return and let it run.
2. In the `useFrame` that handles elastic returns: call `updateDrag({ x, y, z })` each frame to keep the store's `dragPosition` in sync.
3. When the elastic return completes (t >= 1): call `endDrag()` to clear both the store and the override.
4. EdgeLines already reads `draggedEntityId` and `dragPosition` in its `useFrame` — no changes needed there.

### Fix 3: Orbit (rotation) speed control

**Current state**: `rotateSpeed={3}` is hardcoded in GraphScene.tsx line 256. There's no user setting for it.

**Solution**: add `orbitSensitivity` to settingsStore (analogous to `zoomSensitivity`):
- Default: 1.5 (half the current 3, which the user finds "too fast")
- Range: 0.1 to 5.0
- Step: 0.1
- The TrackballControls `rotateSpeed` prop should use this value
- Add it to the persisted state partialize
- Add `setOrbitSensitivity` action
- In the SettingsPanel, add an orbit sensitivity slider below the existing zoom sensitivity slider (follow the same pattern)

Also read `components/SettingsPanel.tsx` for the slider pattern to follow.

### Fix 4: Speed indicator positioning (part of Fix 1)

This is addressed by the HUD region system in Fix 1. The transient indicator goes in bottom-center (above timeline). The persistent badge goes in bottom-right (next to Home button, not overlapping).

### Fix 5: Orbit damping factor review

The current `dynamicDampingFactor={0.15}` with `staticMoving={false}` means the orbit has momentum/inertia. With a lower `rotateSpeed` from Fix 3, this should feel better. But also consider exposing `dynamicDampingFactor` as a secondary tuning parameter (optional — only if it's simple to add alongside orbit sensitivity).

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file. Structure your output as:

```
## Fix N: [title]

### [filename]
[Complete replacement code for the file, or a clear diff showing old → new]
```

For each changed file, provide the COMPLETE file content (not just snippets) so the orchestrator can apply changes without ambiguity.

## CONSTRAINTS

- Do NOT change the visual styling (colors, fonts, border-radius, etc.) — only layout/positioning
- Do NOT change the z-index hierarchy for LoadingOverlay (100), DetailPanel (50), SettingsPanel (30) — only the HUD elements at z-index 20-25
- The HUD overlay must NOT intercept pointer events for the 3D canvas (use pointer-events: none on the container)
- The elastic return fix must NOT break: click detection, orbit controls re-enable, replay mode reset
- Keep TypeScript strict — no `any` types introduced
- Minimize changes to files that don't need modification

For each claim, decision, or implementation choice:
(a) identify evidence supporting it
(b) identify evidence contradicting it or potential failure modes
(c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

Flag any claim where you cannot find supporting evidence.
