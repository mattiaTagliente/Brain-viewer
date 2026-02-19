/**
 * Entity detail panel — shows observations, relations, and metadata
 * for the selected entity.
 */

import { useGraphStore } from "../store/graphStore";
import type { Severity } from "../lib/types";

const severityColors: Record<Severity, string> = {
  blocking: "#ef4444",
  major: "#f59e0b",
  minor: "#3b82f6",
  info: "#6b7280",
};

export function DetailPanel() {
  const detail = useGraphStore((s) => s.selectedEntityDetail);
  const selectedId = useGraphStore((s) => s.selectedEntityId);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const entities = useGraphStore((s) => s.entities);

  if (!selectedId || !detail) return null;

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 380,
        height: "100%",
        background: "rgba(15, 15, 20, 0.95)",
        color: "#e0e0e0",
        overflowY: "auto",
        padding: 20,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
        borderLeft: "1px solid #333",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{detail.name}</h2>
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              padding: "2px 8px",
              borderRadius: 4,
              background: "#333",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {detail.entity_type}
          </span>
          <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>{detail.scope}</span>
        </div>
        <button
          onClick={() => selectEntity(null)}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 20,
            cursor: "pointer",
            padding: "4px 8px",
          }}
          aria-label="Close detail panel"
        >
          x
        </button>
      </div>

      {/* Aliases */}
      {detail.aliases.length > 0 && (
        <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
          aka: {detail.aliases.map((a) => a.alias).join(", ")}
        </div>
      )}

      {/* Observations */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 500, color: "#aaa" }}>
          Observations ({detail.observations.length})
        </h3>
        {detail.observations.map((obs) => (
          <div
            key={obs.id}
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              background: "#1a1a2e",
              borderRadius: 6,
              borderLeft: `3px solid ${severityColors[obs.severity]}`,
            }}
          >
            <div style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11 }}>
              <span style={{ color: severityColors[obs.severity], fontWeight: 600, textTransform: "uppercase" }}>
                {obs.severity}
              </span>
              <span style={{ color: "#666" }}>|</span>
              <span style={{ color: "#888" }}>
                {obs.verification_status === "human_verified"
                  ? "verified"
                  : obs.verification_status === "agent_verified"
                    ? "agent"
                    : "unverified"}
              </span>
              <span style={{ color: "#666" }}>|</span>
              <span style={{ color: "#888" }}>{obs.source_type}</span>
            </div>
            <div style={{ lineHeight: 1.5 }}>{obs.text}</div>
            {obs.tags.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {obs.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-block",
                      marginRight: 4,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "#2a2a40",
                      fontSize: 10,
                      color: "#aaa",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Relations */}
      {detail.relations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 500, color: "#aaa" }}>
            Relations ({detail.relations.length})
          </h3>
          {detail.relations.map((rel) => {
            const isSubject = rel.subject_id === selectedId;
            const otherName = entityMap.get(isSubject ? rel.object_id : rel.subject_id) || "?";
            return (
              <div
                key={rel.id}
                style={{
                  marginBottom: 6,
                  padding: "6px 10px",
                  background: "#1a1a2e",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                onClick={() => selectEntity(isSubject ? rel.object_id : rel.subject_id)}
              >
                {isSubject ? (
                  <span>
                    <span style={{ color: "#888" }}>this</span>{" "}
                    <span style={{ color: "#5588cc" }}>{rel.predicate}</span>{" "}
                    <span style={{ fontWeight: 500 }}>{otherName}</span>
                  </span>
                ) : (
                  <span>
                    <span style={{ fontWeight: 500 }}>{otherName}</span>{" "}
                    <span style={{ color: "#5588cc" }}>{rel.predicate}</span>{" "}
                    <span style={{ color: "#888" }}>this</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Metadata */}
      <div style={{ marginTop: 20, fontSize: 11, color: "#666" }}>
        <div>Added: {detail.date_added}</div>
        <div>Modified: {detail.date_modified}</div>
        <div>ID: {detail.id}</div>
      </div>
    </div>
  );
}
