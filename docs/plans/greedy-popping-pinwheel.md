# Search Bar + Camera Fly-To Animation

## Context

The Brain Viewer currently has no way to find a specific entity in the 3D graph without manually navigating. With hundreds of entities, locating a specific one is tedious. This adds a search bar that filters entities by name and flies the camera to the selected result along a smooth spline path with acceleration/deceleration.

Reviewed by Codex (round 1): `APPROVE_WITH_CORRECTIONS`. All findings addressed below.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/store/graphStore.ts` | Add `flyToEntityId`, `flyToActive`, `requestFlyTo`, `clearFlyTo`, `setFlyToActive` |
| `frontend/src/components/SearchBar.tsx` | **NEW** — search input + dropdown results list |
| `frontend/src/components/GraphScene.tsx` | Add `FlyToController` inner component; guard WASD + suppress onChange when `flyToActive` |
| `frontend/src/App.tsx` | Import `SearchBar`, render below `Filters` in top-right HUD cell |

## Step 1 — Store additions (`graphStore.ts`)

Add to `GraphState` interface:
```ts
flyToEntityId: string | null;   // just the ID, not a position snapshot (Codex M4)
flyToActive: boolean;
requestFlyTo: (entityId: string) => void;
clearFlyTo: () => void;
setFlyToActive: (v: boolean) => void;
```

`requestFlyTo(entityId)` sets `flyToEntityId`. Position is resolved at flight start by `FlyToController` from the live `positions` map (avoids stale snapshot — Codex M4).

## Step 2 — SearchBar component (`SearchBar.tsx`)

**Search logic** — case-insensitive scoring with three tiers: exact match (3), prefix match (2), substring match (1). Sort by score then alphabetically. Return top 10. Only search **visible** entities: respect `filterEntityTypes` and replay `visibleEntityIds` (Codex M3). Also exclude entities with no position.

**UI** — matches existing panel style (`rgba(0,0,0,0.6)`, borderRadius 8, fontSize 12). Contains:
- Text input with placeholder "Search entities..." (width ~200px)
- Dropdown list of up to 10 results, each showing entity name + entity type colored badge
- Results list only appears when query is non-empty and results exist

**Keyboard** — ArrowDown/Up to navigate results, Enter to select, Escape to clear/close. All keyboard events call `stopPropagation()` to prevent WASD/App-level handlers. The existing `shouldIgnoreKeyEvent` in App.tsx already skips `<input>` elements, so WASD is naturally suppressed while typing.

**Selection** — on click or Enter: call `graphStore.selectEntity(entityId)` to open detail panel, call `graphStore.requestFlyTo(entityId)` to trigger camera animation, clear query and close dropdown.

**Dismiss** — click-outside listener via `useEffect` + ref, or Escape key.

## Step 3 — FlyToController (`GraphScene.tsx`)

New inner component rendered in `SceneContent` alongside `CameraController`. Receives `controlsRef` as prop. Uses `useFrame` + `useThree`.

### Spline construction (when `flyToEntityId` becomes non-null)

1. Resolve position from live `positions[entityId]` — bail if missing
2. Find the entity in `entities[]` to get `observation_count` for sizing
3. `P0` = current camera position
4. Compute standoff distance: `clamp(GEOM_RADIUS * nodeScale * 8, 20, 80)` (Codex m3)
5. `P2` = target position + standoff offset along approach direction (camera→target normalized)
6. `P1` = midpoint of P0↔P2, lifted perpendicular to travel direction:
   - Compute `liftDir = cross(cross(travelDir, worldUp), travelDir).normalize()`
   - **Robust fallback** (Codex M2): if `liftDir.lengthSq() < 0.001` (travel nearly vertical), use `cross(cross(travelDir, Vector3(1,0,0)), travelDir).normalize()` instead
   - Lift amount: `min(travelLength * 0.25, 150)`
7. Build `THREE.CatmullRomCurve3([P0, P1, P2], false, 'catmullrom', 0.5)` — explicit curveType and tension (Codex M1)

### Easing

Quintic ease-in-out: `t < 0.5 ? 16t^5 : 1 - (-2t+2)^5/2`. Zero velocity at both ends, smooth acceleration then deceleration.

### Animation loop (`useFrame`)

- Increment elapsed time, compute `rawT = elapsed / DURATION` (1.8s)
- Apply easing to get `t`
- Set `camera.position` to `spline.getPoint(t)`
- Lerp `controls.target` from start target to entity position using same `t`
- Call `controls.update()`
- On completion (`rawT >= 1`): call `clearFlyTo()`, save camera to localStorage, re-enable controls

### During animation

- Set `controlsRef.current.enabled = false` to disable orbit
- Set `flyToActive = true` so CameraController's WASD useFrame returns early
- **Cancel listeners on `window`** (not canvas — Codex B1): bind `pointerdown` and `keydown` on `window` with editable-target guard (same pattern as `shouldIgnoreKeyEvent`). On cancel: restore controls, call `clearFlyTo()`, save current camera state.

### Short distance

If distance < 20, snap camera directly (set position + target, no spline).

### CameraController changes

- Add `const flyToActive = useGraphStore(s => s.flyToActive);`
- **WASD useFrame**: early return when `flyToActive` is true
- **onChange handler** (Codex m1): skip debounced save when `flyToActive` — the FlyToController does a single explicit save at end/cancel

## Step 4 — HUD integration (`App.tsx`)

In the top-right grid cell, add `<SearchBar />` below `<Filters />`:
```tsx
<div style={{ pointerEvents: "auto" }}>
  <SearchBar />
</div>
```

## Verification

1. Start backend + frontend (`npm run dev`)
2. Type in search bar — results appear with matching entity names and colored type badges
3. Arrow keys navigate results, Enter selects
4. Click a result — camera smoothly arcs from current position to near the entity, decelerates, and stops
5. Detail panel opens for the selected entity
6. WASD is disabled during flight, re-enabled after landing
7. Clicking or pressing a key mid-flight cancels the animation
8. Escape clears search, clicking outside closes dropdown
9. Searching for entity with no position gracefully shows no result
10. Search only shows entities matching current type filters / replay visibility
11. Near-vertical travel path doesn't produce degenerate arc
12. Very short distance snaps instead of animating
