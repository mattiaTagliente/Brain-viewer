## TASK

Review the Brain Viewer frontend implementation for correctness, performance, and completeness against the design document. The codebase implements a 3D knowledge graph visualizer with React 19 + Three.js/R3F. Phase 1 was implemented previously; Phases 2 (Replay), 3 (Realtime), and 5 (Polish) were just added. Focus your review on the NEW code.

## SKILL

Load and follow: C:/Users/matti/.claude/skill-sets/web-development/react-doctor/SKILL.md
Also apply react-perf patterns from: C:/Users/matti/.claude/skill-sets/web-development/react-perf/SKILL.md

## INPUT

Design document: `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md`

New files to review:
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/replayStore.ts`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/Timeline.tsx`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/hooks/useRealtime.ts`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeLabels.tsx`

Modified files to review:
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/App.tsx`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/EdgeLines.tsx`
- `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts`

Backend context (read-only, not being modified):
- `C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/ws.py` (WebSocket message format)
- `C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/timeline.py` (timeline event format)
- `C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/api.py` (REST API endpoints)

## OUTPUT

Output your COMPLETE review as your final response. Do NOT write to any file.

Structure your review as:

### BLOCKING issues (must fix before shipping)
[issues that would cause crashes, data loss, or broken features]

### MAJOR issues (should fix)
[significant quality, performance, or correctness issues]

### MINOR issues (nice to fix)
[code quality, minor performance, style]

### Design Compliance
[checklist of design doc requirements vs implementation — what's missing, what diverges]

### Performance Assessment
[specific to Surface Pro 7 target: will this achieve 30fps with 2000 nodes? Identify bottlenecks]

For each claim, decision, or implementation choice:
(a) identify evidence supporting it
(b) identify evidence contradicting it or potential failure modes
(c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

Flag any claim where you cannot find supporting evidence.

## CONSTRAINTS

- Focus on the new Phase 2/3/5 code, not re-reviewing Phase 1 code
- Check that the WebSocket message format in useRealtime.ts matches the backend ws.py format
- Check that timeline event data fields match what the backend timeline.py produces
- Check that replay filtering (visibleRelationIds) uses IDs that match the actual relation.id from the backend
- Verify accessibility: prefers-reduced-motion, keyboard navigation, ARIA labels
- Check for React rendering performance: unnecessary re-renders, missing memoization, expensive computations in render path
- Verify that troika-three-text usage in NodeLabels.tsx is compatible with R3F
