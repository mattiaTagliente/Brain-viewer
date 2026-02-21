# Plan Review: Search Bar + Camera Fly-To Animation

## TASK

Review the implementation plan for adding a search bar with camera fly-to animation to the Brain Viewer app. Evaluate feasibility, correctness of the Three.js/R3F animation math, potential edge cases, and architectural fit with the existing codebase.

For each claim, decision, or implementation choice:
(a) identify evidence supporting it
(b) identify evidence contradicting it or potential failure modes
(c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

Flag any claim where you cannot find supporting evidence.

## INPUT

- Plan file: `C:/Users/matti/.claude/plans/greedy-popping-pinwheel.md`
- Project instructions: `C:/Users/matti/Dev/Brain_viewer/CLAUDE.md`
- GraphScene (camera system): `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx`
- Graph store (state): `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts`
- Settings store: `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/settingsStore.ts`
- App layout (HUD grid): `C:/Users/matti/Dev/Brain_viewer/frontend/src/App.tsx`
- Filters panel (UI pattern reference): `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/Filters.tsx`
- NodeMesh (rendering, drag system): `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx`
- Node sizing: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/nodeSize.ts`
- Types: `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts`

## REVIEW FOCUS AREAS

1. **Spline animation math**: is the CatmullRomCurve3 construction correct? Will the lift direction degenerate when travel direction is nearly vertical? Is the standoff distance reasonable (`GEOM_RADIUS * nodeScale * 8`)?

2. **R3F integration**: will the FlyToController's useFrame conflict with CameraController's useFrame? Is disabling TrackballControls during flight sufficient? Any risk of the debounced camera save firing during animation?

3. **Store architecture**: is adding flyTo state to graphStore the right choice, or should it be a separate ref-based mechanism? Does this introduce unnecessary re-renders?

4. **Search filtering**: is the three-tier scoring (exact/prefix/substring) sufficient, or should fuzzy matching be considered? Performance with 500+ entities?

5. **Interruption handling**: is canceling on any keydown/pointerdown correct? Should WASD keys during flight cancel or be ignored?

6. **Edge cases**: fly-to during replay mode, fly-to to a filtered-out entity, concurrent fly-to requests, entity at camera's current position, very long travel distances.

7. **Missing considerations**: anything the plan doesn't address that could cause issues.

## OUTPUT

Output your COMPLETE review as your final response. Do NOT write to any file. Structure it as:

```
## Summary
[1-2 sentence overall assessment]

## Findings
### [BLOCKING/MAJOR/MINOR] Finding title
- Evidence for: ...
- Evidence against / failure mode: ...
- Confidence: HIGH/MEDIUM/LOW
- Recommendation: ...

## Overall Verdict
[APPROVE / APPROVE_WITH_CORRECTIONS / REJECT]
```

## CONSTRAINTS

- Read all input files before reviewing — do not review from brief summaries alone
- Focus on feasibility and correctness, not code style
- The plan will be implemented in TypeScript with React Three Fiber v9 and Three.js
- Known pitfall: R3F v9.5.0 swapInstances bug (see CLAUDE.md) — verify plan doesn't trigger it
- Known pitfall: elastic return edge tracking requires keeping drag state alive (see CLAUDE.md)
