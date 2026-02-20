## TASK

Review the design document for adding a settings panel, navigation speed control, zoom sensitivity fix, and theme customization system to the Brain Viewer 3D knowledge graph visualizer. Evaluate the design from a UX, architecture, and React/Three.js best practices perspective.

## SKILL

No specific skill — use general-purpose architecture and UX review.

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
- Known pitfall: R3F v9.5.0 swapInstances bug — when `args` change on `<instancedMesh>`, click detection breaks. Current fix uses stable material refs and pre-allocated maxCount. Theme changes must NOT cause InstancedMesh args to change.

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
1. UX: is the settings panel layout intuitive? Are there accessibility concerns (keyboard nav, screen readers)?
2. React performance: will live color picker / slider changes cause excessive re-renders of the 3D scene?
3. Theme override merging: is the `merge(base, overrides)` approach robust? What about nested objects (nodeColors, postProcessing)?
4. R/F key conflict: could R/F conflict with any existing keybindings or browser defaults?
5. CSS/layout: will the drawer animation conflict with the existing detail panel on the left?
6. Three.js material updates: changing emissive/metalness/roughness live — does this work with InstancedMesh or does it require material recreation?
