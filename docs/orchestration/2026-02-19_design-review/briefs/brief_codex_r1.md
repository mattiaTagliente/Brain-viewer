## TASK
Review the implementation plan at C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md for feasibility, completeness, and risk.

For each design decision:
(a) identify why it is a good choice
(b) identify alternatives that might be better and why
(c) rate feasibility (HIGH / MEDIUM / LOW)

Flag any requirement that is ambiguous or underspecified.

## SKILL
No specific skill — use architectural reasoning.

## INPUT
- Plan document: C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-19-brain-viewer-design.md
- Project context: C:/Users/matti/Dev/Brain_viewer/AGENTS.md
- KG database schema (the data source this app reads): C:/Users/matti/Dev/LLM_Harness/src/llm_harness/mcp_servers/knowledge_graph/graph.py (lines 83-206, SQL schema)
- Known pitfalls: the KG uses a single-database architecture (schema v5) — no project-scoped .db files. All data is in one knowledge.db with a scope column. The backend must open only ONE SQLite file.

## OUTPUT
IMPORTANT: output your COMPLETE review as your final response. Do NOT write to any file — your response text will be captured automatically. Include the full content, not a summary or confirmation.

Structure as:
1. Feasibility assessment (overall)
2. Per-section analysis (for each section in the design document)
3. Risk inventory (probability x impact)
4. Missing considerations
5. Recommendations (prioritized)

## CONSTRAINTS
- Be specific about risks — "this might fail" is not useful; "step 3 assumes X but X might not hold because Y" is useful
- Pay special attention to:
  - The deterministic layout approach (Fibonacci sphere + d3-force-3d with fixed seed + structural hash)
  - Performance with the expected graph size (hundreds to low thousands of entities)
  - The replay system design (using date_added fields, idle time compression)
  - WebSocket-based realtime mode with SQLite WAL polling
  - The theme system architecture (JSON-driven, switchable at runtime)
- Check that all referenced libraries exist and are appropriate for the use case
- Verify the sidecar DB schema is sufficient for the stated requirements
- Flag any dependency that might cause issues on Windows 11 (the target platform)
