import { useGraphStore } from "../store/graphStore";
import type { EntityType } from "../lib/types";

const ALL_TYPES: EntityType[] = [
  "concept", "method", "parameter", "dataset",
  "finding", "pitfall", "tool", "decision", "person",
];

export function Filters() {
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const toggleEntityTypeFilter = useGraphStore((s) => s.toggleEntityTypeFilter);
  const entities = useGraphStore((s) => s.entities);

  // Count entities per type
  const counts = new Map<string, number>();
  for (const e of entities) {
    counts.set(e.entity_type, (counts.get(e.entity_type) || 0) + 1);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 52,
        right: 12,
        zIndex: 20,
        background: "rgba(0,0,0,0.6)",
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        color: "#ccc",
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 500, color: "#888", fontSize: 11 }}>
        ENTITY TYPES {filterEntityTypes.size > 0 ? `(${filterEntityTypes.size} active)` : "(all)"}
      </div>
      {ALL_TYPES.map((type) => {
        const count = counts.get(type) || 0;
        if (count === 0) return null;
        const active = filterEntityTypes.size === 0 || filterEntityTypes.has(type);
        return (
          <div
            key={type}
            onClick={() => toggleEntityTypeFilter(type)}
            style={{
              padding: "3px 0",
              cursor: "pointer",
              opacity: active ? 1 : 0.4,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>{type}</span>
            <span style={{ color: "#666" }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
