import { useEffect } from "react";
import { GraphScene } from "./components/GraphScene";
import { DetailPanel } from "./components/DetailPanel";
import { ThemePicker } from "./components/ThemePicker";
import { Filters } from "./components/Filters";
import { useGraphStore } from "./store/graphStore";

function StatusBar() {
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const layoutProgress = useGraphStore((s) => s.layoutProgress);

  const pct = Math.round(layoutProgress * 100);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        zIndex: 20,
        background: "rgba(0,0,0,0.6)",
        padding: "4px 12px",
        borderRadius: 8,
        fontSize: 12,
        color: "#888",
        display: "flex",
        gap: 16,
      }}
    >
      <span>{entities.length} entities</span>
      <span>{relations.length} relations</span>
      {layoutProgress < 1 && <span>layout: {pct}%</span>}
    </div>
  );
}

export default function App() {
  const loadGraph = useGraphStore((s) => s.loadGraph);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  return (
    <>
      <GraphScene />
      <DetailPanel />
      <ThemePicker />
      <Filters />
      <StatusBar />
    </>
  );
}
