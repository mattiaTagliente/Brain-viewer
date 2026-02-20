## TASK

Review the design document for adding a settings panel, navigation speed control, zoom sensitivity fix, and theme customization system to the Brain Viewer 3D knowledge graph visualizer. Evaluate architectural soundness, completeness, edge cases, and potential implementation pitfalls.

## SKILL

No specific skill — use general-purpose code review and architecture analysis.

## INPUT

- Design document: `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-20-settings-panel-design.md`
- Current project structure and key files:
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts` (current theme/state management)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts` (current UI state)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx` (camera controller, keyboard nav, TrackballControls)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/App.tsx` (HUD layout, keyboard shortcuts)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/ThemePicker.tsx` (current theme selection UI)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx` (node rendering, uses theme)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/EdgeLines.tsx` (edge rendering, uses theme)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/neural.json` (example theme JSON)
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/clean.json`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/organic.json`
- Project agents file: `C:/Users/matti/Dev/Brain_viewer/AGENTS.md`
- Known pitfall: R3F v9.5.0 swapInstances bug — when `args` change on `<instancedMesh>`, click detection breaks. The current fix uses stable refs and pre-allocated maxCount. Any theme change that causes InstancedMesh args to change will re-trigger this bug.

## OUTPUT

Output your COMPLETE review as your final response. Do NOT write to any file.

Structure your review as:

### Summary
[2-3 sentence overview of your assessment]

### Findings
For each finding:
- **[BLOCKING/MAJOR/MINOR] Title**
  - Description of the issue
  - Evidence supporting this concern
  - Evidence against / mitigating factors
  - Confidence: HIGH / MEDIUM / LOW
  - Suggested fix (if applicable)

### Positive Aspects
[What the design gets right]

### Missing Considerations
[Anything not addressed that should be]

## CONSTRAINTS

For each claim, decision, or implementation choice:
(a) identify evidence supporting it
(b) identify evidence contradicting it or potential failure modes
(c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

Flag any claim where you cannot find supporting evidence.

Focus areas:
1. State management: is the settingsStore schema complete? Are there race conditions between stores?
2. Theme migration: removing theme/themeConfig from graphStore — what breaks? Are all consumers updated?
3. InstancedMesh stability: will theme customization trigger the swapInstances bug?
4. Performance: will live slider updates cause excessive re-renders?
5. localStorage schema: is the persist configuration robust for future schema changes?
6. Edge cases: what happens with corrupted localStorage, invalid imported themes, concurrent tabs?
