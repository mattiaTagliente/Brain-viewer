# Round 1 Synthesis

## Cross-Model Consensus (Codex only — single-agent review)

### Accepted Findings

| ID | Severity | Finding | Action |
|---|---|---|---|
| B1 | BLOCKING | Cancel listeners on `window`, not canvas | Update plan: bind keydown/pointerdown cancel on `window` with editable-target guard |
| M1 | MAJOR | CatmullRom tension under-specified | Update plan: explicitly set `curveType: 'catmullrom'`, tension 0.5 |
| M2 | MAJOR | Lift-vector degeneration for vertical travel | Update plan: add robust fallback when cross product near-zero |
| M3 | MAJOR | Fly-to can target invisible entities | Update plan: search only visible entities (respect filterEntityTypes + replay filter) |
| M4 | MAJOR | Snapshot position brittle — store only entityId | Update plan: store only entityId in flyToTarget, resolve position at flight start |
| m1 | MINOR | Debounced save fires during flight | Update plan: suppress onChange while flyToActive, single save at end |
| m2 | MINOR | Fuzzy search not needed now | Accept: ship exact/prefix/substring, defer fuzzy |
| m3 | MINOR | Standoff distance should be clamped | Update plan: clamp to [20, 80] |

## Decision
CORRECTIONS_NEEDED — all findings addressable in plan update, no architectural changes required.
