/**
 * Floating entity detail panel — shows observations, relations, and metadata
 * for the selected entity. Draggable by title bar, position persisted to localStorage.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { useGraphStore } from "../store/graphStore";
import type { Severity } from "../lib/types";

const PANEL_STORAGE_KEY = "brain-viewer-detail-panel-pos";
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;

const severityColors: Record<Severity, string> = {
  blocking: "#ef4444",
  major: "#f59e0b",
  minor: "#3b82f6",
  info: "#6b7280",
};

interface PanelLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

function loadPanelLayout(): PanelLayout | null {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.x === "number" && typeof data.y === "number") {
      return {
        x: data.x,
        y: data.y,
        w: typeof data.w === "number" ? data.w : DEFAULT_WIDTH,
        h: typeof data.h === "number" ? data.h : DEFAULT_HEIGHT,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function savePanelLayout(layout: PanelLayout) {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable
  }
}

function clampLayout(x: number, y: number, w: number, h: number): PanelLayout {
  const cw = Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - 40));
  const ch = Math.max(MIN_HEIGHT, Math.min(h, window.innerHeight - 40));
  const maxX = Math.max(0, window.innerWidth - cw);
  const maxY = Math.max(0, window.innerHeight - 60);
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
    w: cw,
    h: ch,
  };
}

export function DetailPanel() {
  const detail = useGraphStore((s) => s.selectedEntityDetail);
  const selectedId = useGraphStore((s) => s.selectedEntityId);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const entities = useGraphStore((s) => s.entities);

  const [layout, setLayout] = useState<PanelLayout>(() => {
    const saved = loadPanelLayout();
    if (saved) return clampLayout(saved.x, saved.y, saved.w, saved.h);
    return { x: 20, y: 20, w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
  });

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onTitlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - layout.x,
      y: e.clientY - layout.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [layout.x, layout.y]);

  const onTitlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setLayout((prev) => clampLayout(
      e.clientX - dragOffsetRef.current.x,
      e.clientY - dragOffsetRef.current.y,
      prev.w,
      prev.h,
    ));
  }, []);

  const onTitlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setLayout((prev) => {
      const next = clampLayout(
        e.clientX - dragOffsetRef.current.x,
        e.clientY - dragOffsetRef.current.y,
        prev.w,
        prev.h,
      );
      savePanelLayout(next);
      return next;
    });
  }, []);

  // Resize handle handlers
  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: layout.w, h: layout.h };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [layout.w, layout.h]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const dw = e.clientX - resizeStartRef.current.x;
    const dh = e.clientY - resizeStartRef.current.y;
    setLayout((prev) => clampLayout(
      prev.x,
      prev.y,
      resizeStartRef.current.w + dw,
      resizeStartRef.current.h + dh,
    ));
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setLayout((prev) => {
      savePanelLayout(prev);
      return prev;
    });
  }, []);

  // Re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setLayout((prev) => clampLayout(prev.x, prev.y, prev.w, prev.h));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!selectedId || !detail) return null;

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
        background: "rgba(15, 15, 20, 0.95)",
        color: "#e0e0e0",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
        border: "1px solid #444",
        borderRadius: 10,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Drag handle / title bar */}
      <div
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          padding: "12px 16px 8px",
          cursor: "grab",
          borderBottom: "1px solid #333",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, wordBreak: "break-word", lineHeight: 1.3 }}>
            {detail.name}
          </h2>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 4,
                background: "#333",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                flexShrink: 0,
              }}
            >
              {detail.entity_type}
            </span>
            <span style={{ fontSize: 11, color: "#888" }}>{detail.scope}</span>
          </div>
        </div>
        <button
          onClick={() => selectEntity(null)}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 18,
            cursor: "pointer",
            padding: "2px 6px",
            flexShrink: 0,
            lineHeight: 1,
          }}
          aria-label="Close detail panel"
        >
          x
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ overflowY: "auto", padding: "12px 16px 16px", flex: 1 }}>
        {/* Aliases */}
        {detail.aliases.length > 0 && (
          <div style={{ marginBottom: 12, color: "#999", fontSize: 12 }}>
            aka: {detail.aliases.map((a) => a.alias).join(", ")}
          </div>
        )}

        {/* Observations */}
        <div>
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
          <div style={{ marginTop: 16 }}>
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
        <div style={{ marginTop: 16, fontSize: 11, color: "#666" }}>
          <div>Added: {detail.date_added}</div>
          <div>Modified: {detail.date_modified}</div>
          <div>ID: {detail.id}</div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          borderRadius: "0 0 10px 0",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
          <line x1="14" y1="6" x2="6" y2="14" stroke="#888" strokeWidth="1.5" />
          <line x1="14" y1="10" x2="10" y2="14" stroke="#888" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
