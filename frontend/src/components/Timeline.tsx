import { useEffect, useMemo } from "react";
import { useReplayStore } from "../store/replayStore";

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 50, 100];

function formatTime(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function gapHours(data: Record<string, unknown>): string {
  const seconds =
    asNumber(data.skipped_seconds) ??
    asNumber(data.gap_seconds) ??
    asNumber(data.skipped_duration_seconds);
  if (seconds === null) return "gap skipped";
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)}h skipped`;
  const minutes = seconds / 60;
  if (minutes >= 1) return `${minutes.toFixed(0)}m skipped`;
  return `${seconds.toFixed(0)}s skipped`;
}

export function Timeline() {
  const replayActive = useReplayStore((s) => s.replayActive);
  const playing = useReplayStore((s) => s.playing);
  const loading = useReplayStore((s) => s.loading);
  const events = useReplayStore((s) => s.events);
  const currentIndex = useReplayStore((s) => s.currentIndex);
  const speed = useReplayStore((s) => s.speed);
  const compressIdle = useReplayStore((s) => s.compressIdle);
  const gapThreshold = useReplayStore((s) => s.gapThreshold);

  const tick = useReplayStore((s) => s.tick);
  const loadTimeline = useReplayStore((s) => s.loadTimeline);
  const startReplay = useReplayStore((s) => s.startReplay);
  const exitReplay = useReplayStore((s) => s.exitReplay);
  const togglePlay = useReplayStore((s) => s.togglePlay);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBackward = useReplayStore((s) => s.stepBackward);
  const seekTo = useReplayStore((s) => s.seekTo);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setCompressIdle = useReplayStore((s) => s.setCompressIdle);
  const setGapThreshold = useReplayStore((s) => s.setGapThreshold);
  const reset = useReplayStore((s) => s.reset);

  useEffect(() => {
    if (!replayActive) return;
    let rafId = 0;
    const frame = (t: number) => {
      tick(t);
      rafId = window.requestAnimationFrame(frame);
    };
    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [replayActive, tick]);

  const progress = useMemo(() => {
    if (events.length <= 1 || currentIndex < 0) return 0;
    return Math.max(0, Math.min(1, currentIndex / (events.length - 1)));
  }, [events.length, currentIndex]);

  const gapMarkers = useMemo(() => {
    if (events.length <= 1) return [];
    return events
      .map((event, index) => ({ event, index }))
      .filter((item) => item.event.event_type === "GAP_SKIPPED")
      .map((item) => ({
        index: item.index,
        left: (item.index / (events.length - 1)) * 100,
        title: gapHours(item.event.data),
      }));
  }, [events]);

  if (!replayActive) {
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "auto",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <button
          onClick={() => {
            void startReplay();
          }}
          style={{
            background: "rgba(0,0,0,0.7)",
            color: "#888",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Start Replay
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        background: "rgba(0,0,0,0.7)",
        border: "1px solid #333",
        borderRadius: 8,
        padding: "8px 10px",
        color: "#888",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 330px", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={togglePlay}
            disabled={events.length === 0 || loading}
            title={playing ? "Pause" : "Play"}
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#4a90d9",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {playing ? "||" : "\u25B6"}
          </button>
          <button
            onClick={stepBackward}
            disabled={currentIndex <= -1 || loading}
            title="Step backward"
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            |&lt;
          </button>
          <button
            onClick={stepForward}
            disabled={events.length === 0 || currentIndex >= events.length - 1 || loading}
            title="Step forward"
            style={{
              minWidth: 34,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            &gt;|
          </button>
          <button
            onClick={reset}
            disabled={loading}
            style={{
              minWidth: 50,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Reset
          </button>
        </div>

        <div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Timeline scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, events.length - 1)}
            aria-valuenow={Math.max(0, currentIndex)}
            aria-valuetext={`Event ${Math.max(0, currentIndex + 1)} of ${events.length}`}
            onClick={(e) => {
              if (events.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
              const clamped = Math.max(0, Math.min(1, ratio));
              const targetIndex = Math.round(clamped * (events.length - 1));
              seekTo(targetIndex);
            }}
            onKeyDown={(e) => {
              if (events.length === 0) return;
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                seekTo(Math.min(events.length - 1, currentIndex + step));
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                seekTo(Math.max(0, currentIndex - step));
              } else if (e.key === "Home") {
                e.preventDefault();
                seekTo(0);
              } else if (e.key === "End") {
                e.preventDefault();
                seekTo(events.length - 1);
              }
            }}
            style={{
              position: "relative",
              height: 16,
              borderRadius: 8,
              background: "#1f1f1f",
              border: "1px solid #333",
              cursor: "pointer",
              overflow: "hidden",
              outline: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${progress * 100}%`,
                background: "rgba(74,144,217,0.35)",
              }}
            />
            {gapMarkers.map((marker) => (
              <div
                key={`gap-${marker.index}`}
                title={marker.title}
                style={{
                  position: "absolute",
                  left: `${marker.left}%`,
                  top: 1,
                  bottom: 1,
                  width: 1,
                  background: "#d8b45b",
                  opacity: 0.9,
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                left: `calc(${progress * 100}% - 5px)`,
                top: 2,
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#4a90d9",
                boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 5,
              display: "flex",
              justifyContent: "space-between",
              color: "#888",
              fontSize: 12,
            }}
          >
            <span>{Math.max(0, currentIndex + 1).toLocaleString()} / {events.length.toLocaleString()}</span>
            <span>{formatTime(events[currentIndex]?.timestamp)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <label style={{ color: "#888", fontSize: 12 }}>speed</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{
              height: 28,
              background: "#1b1b1b",
              color: "#888",
              border: "1px solid #444",
              borderRadius: 6,
              fontSize: 12,
              padding: "0 6px",
            }}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}x
              </option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 4, color: "#888", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={compressIdle}
              onChange={(e) => setCompressIdle(e.target.checked)}
              style={{ accentColor: "#4a90d9" }}
            />
            compress
          </label>

          <input
            type="number"
            min={0}
            step={1}
            value={gapThreshold}
            disabled={!compressIdle}
            onChange={(e) => setGapThreshold(Number(e.target.value))}
            title="Compress gaps longer than N seconds"
            style={{
              width: 68,
              height: 28,
              background: "#1b1b1b",
              color: "#888",
              border: "1px solid #444",
              borderRadius: 6,
              fontSize: 12,
              padding: "0 6px",
            }}
          />
          <span style={{ color: "#666", fontSize: 12 }}>s</span>

          <button
            onClick={() => {
              void loadTimeline();
            }}
            disabled={loading}
            style={{
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#888",
              fontSize: 12,
              cursor: "pointer",
              padding: "0 10px",
            }}
          >
            reload
          </button>

          <button
            onClick={exitReplay}
            style={{
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#4a90d9",
              fontSize: 12,
              cursor: "pointer",
              padding: "0 10px",
            }}
          >
            Exit Replay
          </button>
        </div>
      </div>
    </div>
  );
}
