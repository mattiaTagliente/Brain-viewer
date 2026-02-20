# Round 1 Synthesis

## Cross-Model Consensus
Only Codex review available (Gemini failed exit 3 — cold-start crash).

## Codex Findings

### BLOCKING (1)
- **B1: Store cycle during theme migration** — keeping THEMES in graphStore while theme state moves to settingsStore creates circular import risk. Fix: extract to `themes/registry.ts`.

### MAJOR (4)
- **M1: Import validation too weak** — design only validates name/nodeColors/edgeStyle/nodeMaterial but scene accesses background, ambientLight, directionalLight, bloom. Fix: validate full ThemeConfig, clamp ranges.
- **M2: Live slider performance** — continuous updates can trigger full geometry rebuilds in EdgeLines and per-instance color loops in NodeMesh. Fix: granular selectors, throttle sliders 50-100ms.
- **M3: localStorage schema versioning** — no version/migrate/partialize specified. Fix: add version field and migration function.
- **M4: Wrong App.tsx path** — design says `components/App.tsx`, actual is `src/App.tsx`. Fix: correct paths.

### MINOR (3)
- **m1: R/F keyboard conflicts** — need precedence spec when settings panel is open.
- **m2: Cross-tab sync** — accept last-write-wins, document explicitly.
- **m3: NodeLabels doesn't use theme** — remove from modified files list.

## Decision
CORRECTIONS_NEEDED — apply B1, M1-M4, m1, m3 to design, then proceed to implementation.
