import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

function formatSpeed(value: number): string {
  const rounded = Number(value.toFixed(2));
  if (Number.isInteger(rounded)) return `${rounded.toFixed(1)}x`;
  return `${rounded}x`;
}

export function SpeedIndicator({ mode }: { mode: "transient" | "persistent" }) {
  const navSpeed = useSettingsStore((s) => s.navSpeed);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const previousRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== "transient") return;

    if (previousRef.current === null) {
      previousRef.current = navSpeed;
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      timeoutRef.current = null;
    }, 1500);

    previousRef.current = navSpeed;
  }, [mode, navSpeed]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const speedLabel = formatSpeed(navSpeed);
  const showBadge = Math.abs(navSpeed - 1.0) > 1e-6;

  if (mode === "persistent") {
    if (!showBadge) return null;
    return (
      <div
        style={{
          pointerEvents: "none",
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          fontSize: 11,
          borderRadius: 999,
          padding: "3px 8px",
          fontFamily: "'Inter', system-ui, sans-serif",
          alignSelf: "center",
        }}
      >
        {speedLabel}
      </div>
    );
  }

  return (
    <div
      style={{
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontSize: 12,
        borderRadius: 999,
        padding: "4px 10px",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {speedLabel}
    </div>
  );
}
