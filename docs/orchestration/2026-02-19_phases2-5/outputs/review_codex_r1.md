### BLOCKING issues (must fix before shipping)

1. Realtime event deduplication/order is not enforced, so observation counts can drift upward from duplicate delivery.
Evidence (a): `useRealtime` ignores `seq` entirely and applies every `OBSERVATION_ADDED` by incrementing count (`frontend/src/hooks/useRealtime.ts:263`, `frontend/src/hooks/useRealtime.ts:276`, `frontend/src/hooks/useRealtime.ts:213`). Backend includes `seq` specifically for ordering/dedup (`backend/src/brain_viewer/ws.py:121`, `docs/plans/2026-02-19-brain-viewer-design.md:175`).  
Evidence against / failure modes (b): server watermarks reduce duplicate risk (`backend/src/brain_viewer/ws.py:125`), and entity/relation adds are deduped by id in client (`frontend/src/hooks/useRealtime.ts:180`, `frontend/src/hooks/useRealtime.ts:204`). Observation events are still non-idempotent in client.  
Confidence (c): HIGH, because the code path is explicit and non-idempotent.

### MAJOR issues (should fix)

1. Replay filtering is inconsistent: labels can appear for nodes hidden by replay state.
Evidence (a): replay filters are applied to meshes/edges (`frontend/src/components/GraphScene.tsx:202`, `frontend/src/components/GraphScene.tsx:203`, `frontend/src/components/NodeMesh.tsx:292`, `frontend/src/components/EdgeLines.tsx:34`), but `NodeLabels` does not consume replay visibility sets (`frontend/src/components/NodeLabels.tsx:78`).  
Evidence against / failure modes (b): if replay visibility and viewport happen to align, you may not notice. In general, hidden nodes can still label-pop at close zoom.  
Confidence (c): HIGH.

2. `EdgeLines` recreates/disposes geometry too often, likely causing jank on Surface Pro 7 during bursts.
Evidence (a): geometry `useMemo` depends on `animatingRelations` and focus-derived sets (`frontend/src/components/EdgeLines.tsx:49`, `frontend/src/components/EdgeLines.tsx:99`), then swaps geometry and disposes old (`frontend/src/components/EdgeLines.tsx:101`).  
Evidence against / failure modes (b): relation count is moderate (5k), and when state is static this is fine. During replay/realtime/focus transitions it churns allocations.  
Confidence (c): HIGH.

3. Realtime processing is unbatched: one WS message can trigger many independent store updates/re-renders.
Evidence (a): loop over events calls per-event handlers (`frontend/src/hooks/useRealtime.ts:270`), each handler calls `useGraphStore.setState` (`frontend/src/hooks/useRealtime.ts:179`, `frontend/src/hooks/useRealtime.ts:203`, `frontend/src/hooks/useRealtime.ts:213`).  
Evidence against / failure modes (b): Zustand is relatively efficient, and event volume may be low most of the time. Under extract bursts this is expensive.  
Confidence (c): HIGH.

4. Timeline scrubber is pointer-only and lacks ARIA/keyboard semantics (phase 5 accessibility gap).
Evidence (a): scrubber is a clickable `div` with no `role`, `aria-*`, or keyboard handler (`frontend/src/components/Timeline.tsx:206`). Buttons mostly use `title`, not labels (`frontend/src/components/Timeline.tsx:136`).  
Evidence against / failure modes (b): core controls are still keyboard-focusable buttons/select/input. Scrubbing and marker inspection are not accessible.  
Confidence (c): HIGH.

5. `prefers-reduced-motion` is read once, not subscribed to runtime changes.
Evidence (a): initial value only in store init (`frontend/src/store/graphStore.ts:28`, `frontend/src/store/graphStore.ts:94`), no listener for media query change.  
Evidence against / failure modes (b): many users won’t toggle OS setting mid-session. Requirement says behavior should follow preference; runtime drift remains.  
Confidence (c): MEDIUM-HIGH.

6. Phase 3 “rejoin live / timeline extends while viewing history / auto-follow live” is not implemented.
Evidence (a): realtime hook updates graph store only (`frontend/src/hooks/useRealtime.ts:175`), no timeline append/rejoin logic in `Timeline`/`replayStore` (`frontend/src/components/Timeline.tsx`, `frontend/src/store/replayStore.ts`). Design requires rejoin-live and auto-follow (`docs/plans/2026-02-19-brain-viewer-design.md:146`).  
Evidence against / failure modes (b): app does show a “Live” badge (`frontend/src/App.tsx:129`) and realtime graph updates work. Timeline/live UX is incomplete.  
Confidence (c): HIGH.

7. Phase 2 ordering requirement diverges from backend behavior; frontend trusts it without guardrails.
Evidence (a): design requires `(date_added, table_priority, rowid)` ordering (`docs/plans/2026-02-19-brain-viewer-design.md:126`), backend currently sorts by `(timestamp, priority, entity_id)` (`backend/src/brain_viewer/timeline.py:60`).  
Evidence against / failure modes (b): tie cases may still look fine if entity IDs happen to correlate; deterministic replay can still break in burst writes.  
Confidence (c): HIGH for divergence, MEDIUM for visible user impact frequency.

### MINOR issues (nice to fix)

1. `NodeLabels` allocates `new THREE.Vector3` per candidate scan cycle.
Evidence (a): inside loop each entity does `camera.position.distanceTo(new THREE.Vector3(...))` (`frontend/src/components/NodeLabels.tsx:107`).  
Evidence against / failure modes (b): scan runs every 150ms and labels are capped to 30 output (`frontend/src/components/NodeLabels.tsx:89`, `frontend/src/components/NodeLabels.tsx:128`), so impact is bounded but avoidable.  
Confidence (c): HIGH.

2. Hardcoded `WS_URL` reduces deploy flexibility and can break under HTTPS/mismatched host.
Evidence (a): fixed `ws://localhost:8000/ws/realtime` (`frontend/src/hooks/useRealtime.ts:5`).  
Evidence against / failure modes (b): local dev setup matches this and works.  
Confidence (c): MEDIUM.

3. `NodeMesh` focus-neighbor set can become stale while focused because it reads relations via `getState()` and memoizes only on focused id.
Evidence (a): `useMemo` deps only `[focusedEntityId]` but reads `useGraphStore.getState().relations` (`frontend/src/components/NodeMesh.tsx:317`).  
Evidence against / failure modes (b): users may rarely add relations while in focus mode; mismatch is temporary.  
Confidence (c): MEDIUM.

4. Could not run `react-doctor` scan in this environment (policy-blocked), so lint/dead-code score evidence is missing.
Evidence (a): command execution was blocked by policy.  
Evidence against / failure modes (b): manual review still found concrete issues; automated rule coverage is incomplete.  
Confidence (c): HIGH.

### Design Compliance

- InstancedMesh + LineSegments batching: compliant. Evidence: `frontend/src/components/NodeMesh.tsx:256`, `frontend/src/components/EdgeLines.tsx:199`. Confidence HIGH.
- Replay controls (play/pause/step/speed/compress/gap threshold): compliant. Evidence: `frontend/src/components/Timeline.tsx:136`, `frontend/src/components/Timeline.tsx:279`, `frontend/src/components/Timeline.tsx:299`, `frontend/src/components/Timeline.tsx:309`. Confidence HIGH.
- Replay animations (entity/relation/observation): compliant. Evidence: `frontend/src/store/replayStore.ts:267`, `frontend/src/store/replayStore.ts:282`, `frontend/src/store/replayStore.ts:295`. Confidence HIGH.
- Animation budget for bursts: partially compliant (`firedIndices <= 10` batching heuristic). Evidence: `frontend/src/store/replayStore.ts:258`. Contradiction: not explicitly “>10 events/sec” as designed. Confidence MEDIUM.
- Realtime WS + heartbeat: partially compliant. Evidence: `frontend/src/hooks/useRealtime.ts:258`, status indicator `frontend/src/App.tsx:129`. Contradiction: no rejoin-live/auto-follow/timeline extension UX. Confidence HIGH.
- Label strategy (hover/selected + near-zoom, troika): mostly compliant. Evidence: `frontend/src/components/NodeLabels.tsx:112`, `frontend/src/components/NodeLabels.tsx:4`. Contradiction: replay-visibility mismatch. Confidence HIGH.
- Accessibility (reduced motion, keyboard nav, ARIA): partially compliant. Evidence: reduced motion flag exists (`frontend/src/store/graphStore.ts:28`), keyboard shortcuts in app (`frontend/src/App.tsx:176`), detail close has aria-label (`frontend/src/components/DetailPanel.tsx:74`). Contradiction: timeline scrubber not keyboard/ARIA; no runtime media query listener. Confidence HIGH.
- Activity log panel with virtualization/pagination: not found in reviewed implementation. Evidence: no activity log component usage in `frontend/src/App.tsx`; only `showActivityLog` state exists (`frontend/src/store/uiStore.ts:7`). Confidence HIGH.
- Design requirement “rowid tie-break ordering”: not met in backend currently (`backend/src/brain_viewer/timeline.py:60`). Confidence HIGH.

### Performance Assessment

Likely outcome on Surface Pro 7: static view should be near target; replay/realtime bursts are at risk of dropping below 30 fps.

Primary bottlenecks:
- geometry churn in edges (`frontend/src/components/EdgeLines.tsx:49`, `frontend/src/components/EdgeLines.tsx:101`)  
- per-event unbatched state updates in realtime (`frontend/src/hooks/useRealtime.ts:270`, `frontend/src/hooks/useRealtime.ts:179`)  
- full-instance matrix/color updates on hover/focus/replay changes (`frontend/src/components/NodeMesh.tsx:105`)  
- periodic label candidate scans with allocations (`frontend/src/components/NodeLabels.tsx:107`, `frontend/src/components/NodeLabels.tsx:89`)

Counter-evidence that helps:
- batched draw calls are correct for nodes/edges (`frontend/src/components/NodeMesh.tsx:256`, `frontend/src/components/EdgeLines.tsx:199`)  
- label cap to 30 reduces text cost (`frontend/src/components/NodeLabels.tsx:128`)  
- replay burst animation throttling exists (`frontend/src/store/replayStore.ts:258`)

Confidence: MEDIUM-HIGH. I did static code review only; no runtime profiler trace was possible in this environment.