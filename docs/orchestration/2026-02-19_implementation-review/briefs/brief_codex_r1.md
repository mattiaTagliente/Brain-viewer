## TASK

Review the Brain Viewer implementation for correctness, security, performance, and adherence to the design document. Focus on:
1. Backend Python code: API correctness, SQL injection risks, error handling, SQLite concurrency
2. Frontend TypeScript code: React Three Fiber usage, Web Worker correctness, Zustand store design, type safety
3. Cross-stack consistency: do API response shapes match frontend types? Are all endpoints used correctly?

For each claim, decision, or implementation choice:
(a) identify evidence supporting it
(b) identify evidence contradicting it or potential failure modes
(c) rate your confidence (HIGH / MEDIUM / LOW) with reasoning

Flag any claim where you cannot find supporting evidence.

## SKILL

No specific skill — use general-purpose code review analysis.

## INPUT

Design document (requirements and architecture):
- C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md

Backend source files:
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/main.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/api.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/db.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/sidecar.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/hashing.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/timeline.py
- C:/Users/matti/Dev/Brain_viewer/backend/src/brain_viewer/ws.py
- C:/Users/matti/Dev/Brain_viewer/backend/pyproject.toml

Frontend source files:
- C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts
- C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/api.ts
- C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts
- C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts
- C:/Users/matti/Dev/Brain_viewer/frontend/src/workers/layoutWorker.ts
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/EdgeLines.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/DetailPanel.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/ThemePicker.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/components/Filters.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/App.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/src/main.tsx
- C:/Users/matti/Dev/Brain_viewer/frontend/package.json
- C:/Users/matti/Dev/Brain_viewer/frontend/tsconfig.app.json

KG database schema (source of truth for SQL queries):
- C:/Users/matti/Dev/LLM_Harness/src/llm_harness/mcp_servers/knowledge_graph/graph.py

## OUTPUT

Output your COMPLETE review as your final response. Do NOT write to any file.

Structure your review as:

### BLOCKING issues (must fix before testing)
### MAJOR issues (should fix)
### MINOR issues (nice to fix)
### Positive observations

For each issue, provide:
- File and line reference
- What's wrong
- Suggested fix
- Confidence: HIGH / MEDIUM / LOW

## CONSTRAINTS

- The KG database at ~/.llm_harness/knowledge.db is the single-database architecture (schema v5) with scope column
- The backend is read-only against the KG database; it has its own sidecar brain_viewer.db
- d3-force-3d runs in a Web Worker, NOT in the backend
- InstancedMesh is mandatory for node rendering performance
- seedrandom + simulation.randomSource() ensures deterministic layout
- The frontend build succeeds (tsc + vite build pass cleanly)
- Focus on runtime correctness, not style preferences
