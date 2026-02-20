## Round 1 Synthesis

### Cross-Model Consensus (Codex only — Gemini unavailable)

Codex identified 1 BLOCKING + 7 MAJOR + 4 MINOR issues.

### Findings to Fix

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| B1 | BLOCKING | Observation count updates are non-idempotent — duplicate WS delivery drifts counts | Track last processed seq, skip duplicates |
| M1 | MAJOR | NodeLabels ignores replay visibility filter — shows labels for hidden nodes | Pass replayFilter to NodeLabels |
| M2 | MAJOR | EdgeLines recreates geometry on every animatingRelations change | Decouple animation from geometry build |
| M3 | MAJOR | Realtime events trigger per-event setState — causes render storm on bursts | Batch all events into single setState |
| M4 | MAJOR | Timeline scrubber has no ARIA role or keyboard handler | Add role="slider", keyboard handler |
| M5 | MAJOR | prefers-reduced-motion read once, not subscribed | Add mediaQuery change listener |
| M6 | MAJOR | Rejoin-live UX not implemented | Defer — Phase 3.5 feature |
| M7 | MAJOR | Timeline event ordering diverges from design (entity_id vs rowid tiebreak) | Backend-side fix, defer |

### Decision

Fix B1, M1, M2, M3, M4, M5 now. Defer M6 (rejoin-live UX) and M7 (backend ordering) as Phase 3.5.

### Corrections Applied

See individual file diffs after this synthesis.
