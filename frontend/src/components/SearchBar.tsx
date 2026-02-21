import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useGraphStore } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import { useResolvedTheme } from "../store/settingsStore";
import type { Entity } from "../lib/types";

interface ScoredEntity {
  entity: Entity;
  score: number;
}

function scoreMatch(name: string, query: string): number {
  const lower = name.toLowerCase();
  if (lower === query) return 3;
  if (lower.startsWith(query)) return 2;
  if (lower.includes(query)) return 1;
  return 0;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const requestFlyTo = useGraphStore((s) => s.requestFlyTo);

  const replayActive = useReplayStore((s) => s.replayActive);
  const visibleEntityIds = useReplayStore((s) => s.visibleEntityIds);

  const themeConfig = useResolvedTheme();

  // Filter to visible entities only (respects entity type filter + replay visibility + has position)
  const searchableEntities = useMemo(() => {
    return entities.filter((e) => {
      if (!positions[e.id]) return false;
      if (filterEntityTypes.size > 0 && !filterEntityTypes.has(e.entity_type)) return false;
      if (replayActive && visibleEntityIds && !visibleEntityIds.has(e.id)) return false;
      return true;
    });
  }, [entities, positions, filterEntityTypes, replayActive, visibleEntityIds]);

  const results = useMemo<ScoredEntity[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored: ScoredEntity[] = [];
    for (const entity of searchableEntities) {
      const s = scoreMatch(entity.name, q);
      if (s > 0) scored.push({ entity, score: s });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entity.name.localeCompare(b.entity.name);
    });

    return scored.slice(0, 10);
  }, [query, searchableEntities]);

  // Open dropdown when there are results
  useEffect(() => {
    setOpen(results.length > 0);
    setActiveIndex(0);
  }, [results]);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const handleSelect = useCallback(
    (entityId: string) => {
      void selectEntity(entityId);
      requestFlyTo(entityId);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [selectEntity, requestFlyTo],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Stop propagation so WASD/App-level handlers don't fire
      e.stopPropagation();

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[activeIndex]) {
          handleSelect(results[activeIndex].entity.id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (query) {
          setQuery("");
          setOpen(false);
        } else {
          inputRef.current?.blur();
        }
      }
    },
    [results, activeIndex, handleSelect, query],
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: 220 }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search entities..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "rgba(0,0,0,0.6)",
          border: "1px solid #555",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#ccc",
          fontSize: 12,
          fontFamily: "'Inter', system-ui, sans-serif",
          outline: "none",
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            width: 280,
            marginTop: 4,
            background: "rgba(0,0,0,0.85)",
            border: "1px solid #444",
            borderRadius: 8,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {results.map(({ entity }, i) => {
            const color = themeConfig.nodeColors[entity.entity_type] || "#888";
            return (
              <div
                key={entity.id}
                onPointerDown={() => handleSelect(entity.id)}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: i === activeIndex ? "rgba(255,255,255,0.08)" : "transparent",
                  fontSize: 12,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  color: "#ccc",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    background: color,
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 10,
                    color: "#000",
                    fontWeight: 600,
                  }}
                >
                  {entity.entity_type}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entity.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
