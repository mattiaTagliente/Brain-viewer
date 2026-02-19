1. **Feasibility assessment (overall)**

overall feasibility: **MEDIUM**

why:
- the plan is directionally strong and consistent with the single-db KG architecture (`docs/plans/2026-02-19-brain-viewer-design.md`, `AGENTS.md`, `C:/Users/matti/Dev/LLM_Harness/src/llm_harness/mcp_servers/knowledge_graph/graph.py:83`)
- the main blocker is a runtime mismatch: layout is assigned to Python backend but uses `d3-force-3d` (JS library)
- several performance-critical queries are underspecified given schema/index reality (notably `date_added` polling)
- frontend/backend dependency sets in repo are still minimal relative to plan (`frontend/package.json`, `backend/pyproject.toml`)

---

2. **Per-section analysis (for each section in the design document)**

1. `## Purpose`  
(a) good: clear user value and concrete capabilities.  
(b) alternative: split “MVP” vs “phase 2” to reduce delivery risk.  
(c) feasibility: **HIGH**.  
ambiguous: no success criteria (fps target, max load time, max node count with smooth UX).

2. `## Architecture`  
(a) good: clean 2-process split; backend owns data/realtime, frontend owns rendering.  
(b) alternative: move layout compute to frontend worker for simpler backend + direct use of JS graph libs.  
(c) feasibility: **MEDIUM**.  
ambiguous: where layout computation actually runs (backend Python vs frontend JS).

3. `### Data source`  
(a) good: correctly states one KG db + scope filtering, read-only behavior.  
(b) alternative: add read connection mode spec (`uri=true&mode=ro`) and busy timeout policy.  
(c) feasibility: **HIGH**.  
ambiguous: exact precedence between `~/.llm_harness/knowledge.db` and `KNOWLEDGE_GLOBAL_DB`.

4. `### Realtime mode`  
(a) good: simple polling model is robust and easy to debug.  
(b) alternative: hybrid polling with adaptive interval based on db activity.  
(c) feasibility: **MEDIUM**.  
ambiguous: polling query and watermark semantics not defined (`>=` vs `>`; tie-breakers).

5. `## Layout Engine and Position Persistence`  
(a) good: deterministic + persisted layout minimizes churn and startup cost.  
(b) alternative: deterministic graph partition + force refinement in web worker (client-side).  
(c) feasibility: **MEDIUM**.  
ambiguous: convergence thresholds, max iterations, fallback when layout diverges.

6. `### Initial computation (first run)`  
(a) good: community-first coarse placement then local refinement is scalable.  
(b) alternative: Leiden/community centroids + ForceAtlas2 (or igraph) in backend Python.  
(c) feasibility: **LOW-MEDIUM** as written.  
ambiguous: **blocking** mismatch: Python backend cannot directly run `d3-force-3d` without Node sidecar/port.

7. `### Structural hash`  
(a) good: strong idea for cache invalidation and deterministic restore.  
(b) alternative: include versioned hash inputs (`date_modified`, aliases, theme-affecting attrs).  
(c) feasibility: **MEDIUM**.  
ambiguous: hash excludes observations/aliases; visual-affecting data may change while hash remains constant.

8. `### Incremental updates`  
(a) good: preserves mental map by localizing movement.  
(b) alternative: bounded “freeze radius” policy with explicit max displacement cap.  
(c) feasibility: **MEDIUM**.  
ambiguous: “neighborhood” definition and stability guarantee are not formalized.

9. `## Frontend — 3D Scene and Interaction`  
(a) good: proper separation of canvas/overlay/state.  
(b) alternative: add workerized data transforms to keep main thread responsive.  
(c) feasibility: **HIGH** for hundreds/low-thousands.  
ambiguous: no explicit accessibility strategy for non-3D interaction path.

10. `### Three layers`  
(a) good: instancing choice is right for node count target.  
(b) alternative: instanced nodes + batched line segments; avoid tube geometry by default.  
(c) feasibility: **HIGH**.  
ambiguous: edge rendering approach for >5k edges not concretely bounded.

11. `### Node appearance`  
(a) good: semantic encodings are sensible and interpretable.  
(b) alternative: quantized sizing to avoid tiny perceptual differences.  
(c) feasibility: **HIGH**.  
ambiguous: handling for missing/invalid verification/severity values not specified.

12. `### Interaction model`  
(a) good: standard, usable interaction set.  
(b) alternative: single-click select + keyboard shortcut for focus to reduce accidental camera jumps.  
(c) feasibility: **HIGH**.  
ambiguous: behavior conflict between hover highlights and filters not defined.

13. `## Theme System`  
(a) good: JSON-driven runtime theming is maintainable.  
(b) alternative: JSON schema + theme capability flags (supportsBloom, supportsDOF).  
(c) feasibility: **HIGH**.  
ambiguous: no migration/versioning strategy for theme schema evolution.

14. `### Built-in themes`  
(a) good: provides stylistic range for different analysis modes.  
(b) alternative: make “clean/minimal” default on low-end GPUs (Surface Pro 7 class).  
(c) feasibility: **MEDIUM-HIGH**.  
ambiguous: no GPU fallback criteria for expensive postprocessing.

15. `### Extensibility`  
(a) good: drop-in theme files with validation is excellent UX.  
(b) alternative: include live theme linter endpoint.  
(c) feasibility: **HIGH**.  
ambiguous: fallback behavior on partially valid theme not specified field-by-field.

16. `## Replay System and Activity Timeline`  
(a) good: replay adds strong interpretability of KG evolution.  
(b) alternative: event-sourcing cache table in sidecar with stable ordering key.  
(c) feasibility: **MEDIUM**.  
ambiguous: replay consistency when multiple events share same timestamp.

17. `### Event stream`  
(a) good: unioning entities/observations/relations is straightforward.  
(b) alternative: include deterministic secondary sort (`table_priority`, `rowid` surrogate).  
(c) feasibility: **MEDIUM**.  
ambiguous: timezone normalization and timestamp precision assumptions not defined.

18. `### Timeline bar`  
(a) good: feature set is complete for analysis workflows.  
(b) alternative: cap max speed based on frame budget rather than fixed 100x.  
(c) feasibility: **HIGH**.  
ambiguous: semantics of stepping when multiple events at same timestamp.

19. `### Idle time compression`  
(a) good: excellent for sparse historical data.  
(b) alternative: nonlinear time warp function instead of hard gap collapsing.  
(c) feasibility: **HIGH**.  
ambiguous: how compression affects scrubber absolute time mapping is underspecified.

20. `### Replay animations`  
(a) good: event-specific animation supports cognition.  
(b) alternative: provide “reduced motion” mode by default for accessibility/perf.  
(c) feasibility: **HIGH**.  
ambiguous: animation budget limits for bursty event windows not specified.

21. `### Realtime mode` (replay section)  
(a) good: sensible auto-follow behavior with manual override.  
(b) alternative: explicit “live cursor” marker + rejoin-live button.  
(c) feasibility: **MEDIUM**.  
ambiguous: reconciling live events while user is scrubbed in historical view is not fully defined.

22. `### Activity log`  
(a) good: timeline + tabular log combo is strong for auditing.  
(b) alternative: server-side pagination/filtering to avoid large payloads.  
(c) feasibility: **HIGH**.  
ambiguous: max retained rows and virtualization strategy not specified.

23. `## Backend API`  
(a) good: API surface is minimal and coherent.  
(b) alternative: split `/api/graph` into paged endpoints for scale.  
(c) feasibility: **MEDIUM-HIGH**.  
ambiguous: no API versioning/error contract.

24. `### REST endpoints`  
(a) good: endpoint set matches UI requirements.  
(b) alternative: add `?include=` flags to trim payload (e.g., exclude embeddings).  
(c) feasibility: **HIGH**.  
ambiguous: `/api/graph` response schema and field nullability not defined.

25. `### WebSocket endpoint`  
(a) good: single channel simplifies client code.  
(b) alternative: multiplex message types with sequence IDs and ack for recovery.  
(c) feasibility: **MEDIUM**.  
ambiguous: reconnect/backfill protocol and duplicate-event handling unspecified.

26. `### Sidecar DB schema (brain_viewer.db)`  
(a) good: right concept to separate viewer state from KG source.  
(b) alternative: add normalized tables/columns: `layout_runs`, `timeline_cache(scope, params_hash, data, created_at)`, indexes.  
(c) feasibility: **MEDIUM** as currently defined.  
ambiguous: schema lacks explicit fields for scope, cache parameters, timestamps, and invalidation versioning.

27. `## Project Structure`  
(a) good: clean and conventional.  
(b) alternative: add `tests/` in both backend/frontend now (not later).  
(c) feasibility: **HIGH**.  
ambiguous: no placement for shared API types/contracts.

28. `## Tech Stack`  
(a) good: appropriate baseline stack.  
(b) alternative: if backend owns layout, choose Python-native layout lib; if frontend owns layout, keep `d3-force-3d`.  
(c) feasibility: **MEDIUM**.  
ambiguous: missing explicit dependency list for planned frontend 3D libs in current repo.

29. `## KG Database Schema Reference`  
(a) good: mostly accurate to schema source.  
(b) alternative: also document non-core tables that affect timeline/consistency (`observation_links`, etc.) when relevant.  
(c) feasibility: **HIGH**.  
ambiguous: query/index assumptions for `date_added` are not documented.

---

3. **Risk inventory (probability x impact)**

1. Python backend + `d3-force-3d` mismatch  
probability: high, impact: high, risk: **critical**  
reason: library/runtime incompatibility blocks planned layout implementation.

2. realtime polling on `date_added` without matching indexes in KG schema  
probability: medium-high, impact: high, risk: **high**  
reason: `entities/observations/relations` indexes in `graph.py` do not include `date_added`, risking repeated scans.

3. nondeterministic replay ordering for equal timestamps  
probability: medium, impact: medium-high, risk: **high**  
reason: union stream lacks defined secondary order key.

4. structural hash misses visual-affecting changes  
probability: medium, impact: medium, risk: **medium-high**  
reason: observation/alias updates may not trigger recompute despite visible changes.

5. sidecar cache schema under-specified  
probability: high, impact: medium, risk: **medium-high**  
reason: `timeline_cache(hash, compressed_json)` lacks scope/param/version columns.

6. Windows 11 + integrated GPU performance with postprocessing/tube edges  
probability: medium, impact: medium, risk: **medium**  
reason: Surface Pro 7 class hardware may drop below interactive fps with bloom/DOF + heavy geometry.

7. OneDrive/Windows file behavior around WAL side files  
probability: medium, impact: medium, risk: **medium**  
reason: sync/locking behavior can introduce transient read issues.

8. dependency drift between plan and current repo  
probability: high, impact: medium, risk: **medium-high**  
reason: frontend currently lacks planned 3D/state/theme packages.

---

4. **Missing considerations**

- deterministic ordering contract for all event/realtime streams
- explicit performance budgets: target fps, max node/edge counts, max API latency
- test strategy: deterministic layout snapshot tests, replay ordering tests, websocket reconnect tests
- fault handling: db lock/backoff, stale websocket clients, malformed theme JSON recovery path
- API contract typing shared between backend and frontend
- accessibility: reduced motion, keyboard-only exploration, screen-reader-friendly details panel
- security/cors model beyond localhost dev
- migration/versioning plan for sidecar schema and theme schema
- payload size controls (compression/pagination/chunking) for `/api/graph` and activity log
- precise definition of “live diff” algorithm and watermark persistence across backend restarts

---

5. **Recommendations (prioritized)**

1. resolve the layout runtime decision first: either
   - move force layout to frontend (web worker + `d3-force-3d`), or
   - keep backend layout but switch to Python-native layout implementation.
2. define a strict event ordering spec: `timestamp`, then deterministic tie-breakers per table and id.
3. redesign sidecar schema now: include `scope`, `params_hash`, `schema_version`, `created_at`, and indexes.
4. formalize realtime polling queries/watermarks with lock/backoff behavior and reconnect/backfill semantics.
5. add explicit perf guardrails for target hardware (Surface Pro 7): default low-cost theme, capped edge complexity, adaptive effects.
6. align dependency manifests with plan immediately (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three`, `zustand`, `tailwindcss`, and chosen layout libs).
7. tighten structural hash inputs or define separate hashes for layout vs styling to avoid stale visual state.
8. add an MVP milestone split: static graph + detail panel first, then replay, then realtime, then advanced themes.