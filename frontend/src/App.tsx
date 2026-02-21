import { useEffect, useState } from "react";
import { GraphScene } from "./components/GraphScene";
import { DetailPanel } from "./components/DetailPanel";
import { Filters } from "./components/Filters";
import { SearchBar } from "./components/SearchBar";
import { Timeline } from "./components/Timeline";
import { SettingsPanel } from "./components/SettingsPanel";
import { SpeedIndicator } from "./components/SpeedIndicator";
import { useGraphStore } from "./store/graphStore";
import { useUIStore } from "./store/uiStore";
import { useReplayStore } from "./store/replayStore";
import { useSettingsStore } from "./store/settingsStore";
import { useRealtime } from "./hooks/useRealtime";

function LoadingOverlay() {
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const layoutProgress = useGraphStore((s) => s.layoutProgress);
  const sceneReady = useGraphStore((s) => s.sceneReady);
  const isEmbedded = (() => {
    try {
      return window.parent !== window;
    } catch {
      return false;
    }
  })();
  const [fadingOut, setFadingOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Trigger fade-out when scene becomes ready
  useEffect(() => {
    if (sceneReady && !error) {
      setFadingOut(true);
      const timer = setTimeout(() => setHidden(true), 600);
      return () => clearTimeout(timer);
    }
    // Reset when scene goes back to not-ready (e.g. recalculate layout)
    if (!sceneReady) {
      setFadingOut(false);
      setHidden(false);
    }
  }, [sceneReady, error]);

  useEffect(() => {
    if (!isEmbedded) return;
    if (window.parent && window.parent !== window) {
      if (error) {
        window.parent.postMessage({ type: "brain-viewer-error" }, "*");
        return;
      }
      let status = "connecting";
      if (loading) {
        status = "loading graph data";
      } else if (entities.length > 0 && layoutProgress < 1) {
        status = `computing layout ${Math.round(layoutProgress * 100)}%`;
      } else if (entities.length > 0) {
        status = "preparing scene";
      }
      window.parent.postMessage({ type: "brain-viewer-status", status }, "*");
      if (sceneReady) {
        window.parent.postMessage({ type: "brain-viewer-ready" }, "*");
      }
    }
  }, [isEmbedded, loading, entities.length, layoutProgress, sceneReady, error]);

  if (error) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.92)", color: "#ef4444",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
        flexDirection: "column", gap: 8,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Error</div>
        <div style={{ maxWidth: 500, textAlign: "center" }}>{error}</div>
        <div style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
          Check the browser console (F12) for details
        </div>
      </div>
    );
  }

  if (isEmbedded) return null;

  if (hidden) return null;

  // Determine status message
  let status: string;
  if (loading) {
    status = "Loading graph data...";
  } else if (entities.length > 0 && layoutProgress < 1) {
    status = `Computing layout for ${entities.length} entities...`;
  } else if (entities.length > 0) {
    status = "Preparing scene...";
  } else {
    status = "Connecting...";
  }

  const showProgress = !loading && entities.length > 0 && layoutProgress < 1;
  const pct = Math.round(layoutProgress * 100);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#000",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      flexDirection: "column", gap: 14,
      opacity: fadingOut ? 0 : 1,
      transition: "opacity 0.5s ease-out",
      pointerEvents: fadingOut ? "none" : "auto",
    }}>
      <div
        style={{
          fontSize: "2.4rem",
          fontWeight: 300,
          letterSpacing: "0.3em",
          color: "#00ccff",
          textShadow: "0 0 30px rgba(0,204,255,0.5), 0 0 60px rgba(0,204,255,0.2)",
          marginBottom: 8,
        }}
      >
        BRAIN VIEWER
      </div>

      {entities.length > 0 && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, display: "flex", gap: 12 }}>
          <span>{entities.length} entities</span>
          <span>{relations.length} relations</span>
        </div>
      )}

      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, letterSpacing: "0.15em", textTransform: "lowercase" }}>
        {status}
      </div>

      <div style={{ display: "inline-flex", gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ccff", opacity: 0.35 }} />
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ccff", opacity: 0.55 }} />
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ccff", opacity: 0.8 }} />
      </div>

      {showProgress && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ width: 220, height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 2 }}>
            <div style={{
              width: `${pct}%`, height: "100%", background: "#00ccff",
              borderRadius: 2, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{pct}%</div>
        </div>
      )}
    </div>
  );
}

function HomeButton() {
  return (
    <button
      onClick={() => (window as any).__brainViewerGoHome?.()}
      title="Reset camera to home view"
      style={{
        background: "rgba(0,0,0,0.6)",
        border: "1px solid #555",
        borderRadius: 8,
        padding: "6px 14px",
        color: "#aaa",
        fontSize: 12,
        cursor: "pointer",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      Home
    </button>
  );
}

function SettingsButton() {
  const showSettings = useSettingsStore((s) => s.showSettings);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  return (
    <button
      onClick={() => setShowSettings(!showSettings)}
      title="Settings"
      style={{
        background: "rgba(0,0,0,0.6)",
        border: "1px solid #555",
        borderRadius: 8,
        padding: "6px 12px",
        color: "#aaa",
        fontSize: 14,
        cursor: "pointer",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      &#9881;
    </button>
  );
}

function StatusBar({ realtimeConnected }: { realtimeConnected: boolean }) {
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const layoutProgress = useGraphStore((s) => s.layoutProgress);

  const pct = Math.round(layoutProgress * 100);

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.6)",
        padding: "4px 12px",
        borderRadius: 8,
        fontSize: 12,
        color: "#888",
        display: "flex",
        gap: 16,
        alignItems: "center",
      }}
    >
      <span>{entities.length} entities</span>
      <span>{relations.length} relations</span>
      {layoutProgress < 1 && <span>layout: {pct}%</span>}
      {realtimeConnected && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#7cd992" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#22c55e",
              boxShadow: "0 0 8px rgba(34,197,94,0.8)",
            }}
          />
          Live
        </span>
      )}
    </div>
  );
}

function HUDOverlay({
  realtimeConnected,
  showTimeline,
}: {
  realtimeConnected: boolean;
  showTimeline: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        pointerEvents: "none",
        padding: 12,
      }}
    >
      {/* top-right: settings button + filters */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <SettingsButton />
        </div>
        <div style={{ pointerEvents: "auto" }}>
          <Filters />
        </div>
        <div style={{ pointerEvents: "auto" }}>
          <SearchBar />
        </div>
      </div>

      {/* bottom-left: status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          pointerEvents: "none",
        }}
      >
        <StatusBar realtimeConnected={realtimeConnected} />
      </div>

      {/* bottom-center: speed indicator (transient) + timeline */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(980px, calc(100vw - 24px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <SpeedIndicator mode="transient" />
        {showTimeline && (
          <div style={{ width: "100%", pointerEvents: "auto" }}>
            <Timeline />
          </div>
        )}
      </div>

      {/* bottom-right: speed badge + home button */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <SpeedIndicator mode="persistent" />
        <div style={{ pointerEvents: "auto" }}>
          <HomeButton />
        </div>
      </div>
    </div>
  );
}

function shouldIgnoreKeyEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
}

export default function App() {
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const entities = useGraphStore((s) => s.entities);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);

  const showDetailPanel = useUIStore((s) => s.showDetailPanel);
  const setShowDetailPanel = useUIStore((s) => s.setShowDetailPanel);
  const showTimeline = useUIStore((s) => s.showTimeline);

  const showSettings = useSettingsStore((s) => s.showSettings);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  const replayActive = useReplayStore((s) => s.replayActive);
  const toggleReplayPlay = useReplayStore((s) => s.togglePlay);

  const { connected: realtimeConnected } = useRealtime(!replayActive);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (selectedEntityId) {
          void selectEntity(null);
          return;
        }
        if (focusedEntityId) {
          focusEntity(null);
          return;
        }
        if (showDetailPanel) {
          setShowDetailPanel(false);
        }
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        toggleReplayPlay();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (entities.length === 0) return;
        event.preventDefault();

        const direction = event.key === "ArrowDown" ? 1 : -1;
        const currentId = focusedEntityId ?? selectedEntityId;
        let index = entities.findIndex((entity) => entity.id === currentId);
        if (index < 0) index = direction > 0 ? -1 : 0;

        const next = entities[(index + direction + entities.length) % entities.length];
        if (next) {
          focusEntity(next.id);
        }
        return;
      }

      if (event.key === "Enter") {
        const currentId = focusedEntityId ?? selectedEntityId;
        if (!currentId) return;
        event.preventDefault();
        setShowDetailPanel(true);
        void selectEntity(currentId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    entities,
    focusedEntityId,
    selectedEntityId,
    selectEntity,
    focusEntity,
    showDetailPanel,
    setShowDetailPanel,
    showSettings,
    setShowSettings,
    toggleReplayPlay,
  ]);

  return (
    <>
      <GraphScene />
      <LoadingOverlay />
      {showDetailPanel && <DetailPanel />}
      <SettingsPanel />
      <HUDOverlay realtimeConnected={realtimeConnected} showTimeline={showTimeline} />
    </>
  );
}
