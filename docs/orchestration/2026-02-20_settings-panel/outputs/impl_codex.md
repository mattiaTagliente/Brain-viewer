=== FILE: frontend/src/themes/registry.ts ===
```typescript
import type { EntityType } from "../lib/types";
import neuralTheme from "./neural.json";
import cleanTheme from "./clean.json";
import organicTheme from "./organic.json";

export interface ThemeConfig {
  name: string;
  gpuCost: string;
  background: string;
  fog: { color: string; near: number; far: number } | null;
  ambientLight: { color: string; intensity: number };
  directionalLight: { color: string; intensity: number };
  nodeColors: Record<EntityType, string>;
  nodeMaterial: { emissive: number; metalness: number; roughness: number };
  edgeStyle: { color: string; opacity: number; linewidth: number };
  postProcessing: { bloom: { enabled: boolean; intensity: number; luminanceThreshold: number } };
}

export const BUILTIN_THEMES: Record<string, ThemeConfig> = {
  neural: neuralTheme as ThemeConfig,
  clean: cleanTheme as ThemeConfig,
  organic: organicTheme as ThemeConfig,
};

export const ENTITY_TYPES: EntityType[] = [
  "concept",
  "method",
  "parameter",
  "dataset",
  "finding",
  "pitfall",
  "tool",
  "decision",
  "person",
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function deepCloneTheme(theme: ThemeConfig): ThemeConfig {
  return {
    ...theme,
    fog: theme.fog ? { ...theme.fog } : null,
    ambientLight: { ...theme.ambientLight },
    directionalLight: { ...theme.directionalLight },
    nodeColors: { ...theme.nodeColors },
    nodeMaterial: { ...theme.nodeMaterial },
    edgeStyle: { ...theme.edgeStyle },
    postProcessing: {
      ...theme.postProcessing,
      bloom: { ...theme.postProcessing.bloom },
    },
  };
}

export function validateThemeConfig(obj: unknown): obj is ThemeConfig {
  if (!isObject(obj)) return false;
  const theme = obj as Record<string, unknown>;

  if (!isString(theme.name)) return false;
  if (!isString(theme.gpuCost)) return false;
  if (!isString(theme.background)) return false;

  if (!("fog" in theme)) return false;
  if (theme.fog !== null) {
    if (!isObject(theme.fog)) return false;
    const fog = theme.fog as Record<string, unknown>;
    if (!isString(fog.color) || !isNumber(fog.near) || !isNumber(fog.far)) return false;
    const near = clamp(fog.near, 0, 1000000);
    const far = clamp(fog.far, near + 1, 10000000);
    fog.near = near;
    fog.far = far;
  }

  if (!isObject(theme.ambientLight)) return false;
  const ambientLight = theme.ambientLight as Record<string, unknown>;
  if (!isString(ambientLight.color) || !isNumber(ambientLight.intensity)) return false;
  ambientLight.intensity = clamp(ambientLight.intensity, 0, 2);

  if (!isObject(theme.directionalLight)) return false;
  const directionalLight = theme.directionalLight as Record<string, unknown>;
  if (!isString(directionalLight.color) || !isNumber(directionalLight.intensity)) return false;
  directionalLight.intensity = clamp(directionalLight.intensity, 0, 3);

  if (!isObject(theme.nodeColors)) return false;
  const nodeColors = theme.nodeColors as Record<string, unknown>;
  for (const entityType of ENTITY_TYPES) {
    if (!isString(nodeColors[entityType])) return false;
  }

  if (!isObject(theme.nodeMaterial)) return false;
  const nodeMaterial = theme.nodeMaterial as Record<string, unknown>;
  if (
    !isNumber(nodeMaterial.emissive) ||
    !isNumber(nodeMaterial.metalness) ||
    !isNumber(nodeMaterial.roughness)
  ) {
    return false;
  }
  nodeMaterial.emissive = clamp(nodeMaterial.emissive, 0, 1);
  nodeMaterial.metalness = clamp(nodeMaterial.metalness, 0, 1);
  nodeMaterial.roughness = clamp(nodeMaterial.roughness, 0, 1);

  if (!isObject(theme.edgeStyle)) return false;
  const edgeStyle = theme.edgeStyle as Record<string, unknown>;
  if (!isString(edgeStyle.color) || !isNumber(edgeStyle.opacity) || !isNumber(edgeStyle.linewidth)) {
    return false;
  }
  edgeStyle.opacity = clamp(edgeStyle.opacity, 0, 1);
  edgeStyle.linewidth = clamp(edgeStyle.linewidth, 0.1, 10);

  if (!isObject(theme.postProcessing)) return false;
  const postProcessing = theme.postProcessing as Record<string, unknown>;
  if (!isObject(postProcessing.bloom)) return false;
  const bloom = postProcessing.bloom as Record<string, unknown>;
  if (!("enabled" in bloom) || typeof bloom.enabled !== "boolean") return false;
  if (!isNumber(bloom.intensity) || !isNumber(bloom.luminanceThreshold)) return false;
  bloom.intensity = clamp(bloom.intensity, 0, 3);
  bloom.luminanceThreshold = clamp(bloom.luminanceThreshold, 0, 1);

  return true;
}

export function mergeTheme(base: ThemeConfig, overrides: Partial<ThemeConfig> | null): ThemeConfig {
  if (!overrides) return deepCloneTheme(base);

  const merged: ThemeConfig = {
    ...base,
    ...overrides,
    fog:
      overrides.fog === undefined
        ? base.fog
          ? { ...base.fog }
          : null
        : overrides.fog === null
          ? null
          : {
              ...(base.fog ?? { color: base.background, near: 1000, far: 15000 }),
              ...overrides.fog,
            },
    ambientLight: { ...base.ambientLight, ...(overrides.ambientLight ?? {}) },
    directionalLight: { ...base.directionalLight, ...(overrides.directionalLight ?? {}) },
    nodeColors: { ...base.nodeColors, ...(overrides.nodeColors ?? {}) },
    nodeMaterial: { ...base.nodeMaterial, ...(overrides.nodeMaterial ?? {}) },
    edgeStyle: { ...base.edgeStyle, ...(overrides.edgeStyle ?? {}) },
    postProcessing: {
      ...base.postProcessing,
      ...(overrides.postProcessing ?? {}),
      bloom: {
        ...base.postProcessing.bloom,
        ...(overrides.postProcessing?.bloom ?? {}),
      },
    },
  };

  if (!validateThemeConfig(merged)) {
    return getCleanDefaults();
  }

  return merged;
}

export function getCleanDefaults(): ThemeConfig {
  const fallback = BUILTIN_THEMES.clean ?? Object.values(BUILTIN_THEMES)[0];
  return deepCloneTheme(fallback);
}
```

=== FILE: frontend/src/store/settingsStore.ts ===
```typescript
import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  BUILTIN_THEMES,
  getCleanDefaults,
  mergeTheme,
  validateThemeConfig,
  type ThemeConfig,
} from "../themes/registry";

export const NAV_SPEED_BASE = 500;
export const NAV_SPEED_STEP = 0.25;
export const NAV_SPEED_MIN = 0.1;
export const NAV_SPEED_MAX = 10.0;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2.0;
export const ZOOM_DEFAULT = 0.5;

interface SettingsState {
  navSpeed: number;
  zoomSensitivity: number;
  activeTheme: string;
  themeOverrides: Partial<ThemeConfig> | null;
  customThemes: Record<string, ThemeConfig>;
  showSettings: boolean;

  setNavSpeed: (speed: number) => void;
  incrementNavSpeed: () => void;
  decrementNavSpeed: () => void;
  setZoomSensitivity: (v: number) => void;
  setActiveTheme: (name: string) => void;
  setThemeOverride: <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => void;
  clearOverrides: () => void;
  saveCustomTheme: (name: string) => void;
  overwriteCustomTheme: () => void;
  deleteCustomTheme: (name: string) => void;
  importTheme: (config: ThemeConfig) => void;
  resetToDefaults: () => void;
  setShowSettings: (v: boolean) => void;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function safeThemeKey(rawName: string): string {
  const cleaned = rawName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
  return cleaned || "custom-theme";
}

function getBaseTheme(activeTheme: string, customThemes: Record<string, ThemeConfig>): ThemeConfig {
  return customThemes[activeTheme] ?? BUILTIN_THEMES[activeTheme] ?? getCleanDefaults();
}

function resolveThemeFromState(state: Pick<SettingsState, "activeTheme" | "customThemes" | "themeOverrides">): ThemeConfig {
  const base = getBaseTheme(state.activeTheme, state.customThemes);
  return mergeTheme(base, state.themeOverrides);
}

const storage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(name, value);
    } catch {
      // ignore quota/security errors
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(name);
    } catch {
      // ignore quota/security errors
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      navSpeed: 1.0,
      zoomSensitivity: ZOOM_DEFAULT,
      activeTheme: "clean",
      themeOverrides: null,
      customThemes: {},
      showSettings: false,

      setNavSpeed: (speed) => set({ navSpeed: clamp(speed, NAV_SPEED_MIN, NAV_SPEED_MAX) }),

      incrementNavSpeed: () =>
        set((state) => ({
          navSpeed: clamp(state.navSpeed + NAV_SPEED_STEP, NAV_SPEED_MIN, NAV_SPEED_MAX),
        })),

      decrementNavSpeed: () =>
        set((state) => ({
          navSpeed: clamp(state.navSpeed - NAV_SPEED_STEP, NAV_SPEED_MIN, NAV_SPEED_MAX),
        })),

      setZoomSensitivity: (v) => set({ zoomSensitivity: clamp(v, ZOOM_MIN, ZOOM_MAX) }),

      setActiveTheme: (name) => {
        const { customThemes } = get();
        const exists = Boolean(BUILTIN_THEMES[name] || customThemes[name]);
        set({
          activeTheme: exists ? name : "clean",
          themeOverrides: null,
        });
      },

      setThemeOverride: (key, value) =>
        set((state) => ({
          themeOverrides: {
            ...(state.themeOverrides ?? {}),
            [key]: value,
          } as Partial<ThemeConfig>,
        })),

      clearOverrides: () => set({ themeOverrides: null }),

      saveCustomTheme: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        const key = safeThemeKey(trimmed);
        if (BUILTIN_THEMES[key]) return;

        set((state) => {
          const resolved = resolveThemeFromState(state);
          const merged = mergeTheme(resolved, { name: trimmed });
          return {
            customThemes: {
              ...state.customThemes,
              [key]: merged,
            },
            activeTheme: key,
            themeOverrides: null,
          };
        });
      },

      overwriteCustomTheme: () => {
        set((state) => {
          if (!state.customThemes[state.activeTheme]) return state;
          const resolved = resolveThemeFromState(state);
          const merged = mergeTheme(resolved, { name: state.customThemes[state.activeTheme].name });
          return {
            customThemes: {
              ...state.customThemes,
              [state.activeTheme]: merged,
            },
            themeOverrides: null,
          };
        });
      },

      deleteCustomTheme: (name) =>
        set((state) => {
          if (!state.customThemes[name]) return state;
          const next = { ...state.customThemes };
          delete next[name];
          return {
            customThemes: next,
            activeTheme: state.activeTheme === name ? "clean" : state.activeTheme,
            themeOverrides: state.activeTheme === name ? null : state.themeOverrides,
          };
        }),

      importTheme: (config) => {
        if (!validateThemeConfig(config)) return;

        set((state) => {
          const baseKey = safeThemeKey(config.name);
          let key = baseKey;
          let i = 2;
          while (BUILTIN_THEMES[key] || state.customThemes[key]) {
            key = `${baseKey}-${i}`;
            i += 1;
          }

          const normalized = mergeTheme(config, null);

          return {
            customThemes: {
              ...state.customThemes,
              [key]: normalized,
            },
            activeTheme: key,
            themeOverrides: null,
          };
        });
      },

      resetToDefaults: () =>
        set((state) => ({
          activeTheme:
            state.customThemes[state.activeTheme] || BUILTIN_THEMES[state.activeTheme]
              ? state.activeTheme
              : "clean",
          themeOverrides: null,
        })),

      setShowSettings: (v) => set({ showSettings: v }),
    }),
    {
      name: "brain-viewer-settings",
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        navSpeed: state.navSpeed,
        zoomSensitivity: state.zoomSensitivity,
        activeTheme: state.activeTheme,
        themeOverrides: state.themeOverrides,
        customThemes: state.customThemes,
      }),
    }
  )
);

export function useResolvedTheme(): ThemeConfig {
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const themeOverrides = useSettingsStore((s) => s.themeOverrides);

  return useMemo(() => {
    const base = getBaseTheme(activeTheme, customThemes);
    return mergeTheme(base, themeOverrides);
  }, [activeTheme, customThemes, themeOverrides]);
}

export function useActiveThemeName(): string {
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const hasOverrides = useSettingsStore((s) => s.themeOverrides !== null);
  return hasOverrides ? `${activeTheme}*` : activeTheme;
}

export function useIsCustomTheme(): boolean {
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const customThemes = useSettingsStore((s) => s.customThemes);
  return Boolean(customThemes[activeTheme]);
}
```

=== FILE: frontend/src/components/SettingsPanel.tsx ===
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  NAV_SPEED_MAX,
  NAV_SPEED_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  useActiveThemeName,
  useIsCustomTheme,
  useResolvedTheme,
  useSettingsStore,
} from "../store/settingsStore";
import {
  BUILTIN_THEMES,
  ENTITY_TYPES,
  validateThemeConfig,
  type ThemeConfig,
} from "../themes/registry";

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function formatSliderValue(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  return String(rounded);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function ControlButton({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: disabled ? "rgba(80,80,80,0.5)" : "rgba(0,0,0,0.55)",
        border: "1px solid #555",
        borderRadius: 8,
        padding: "6px 8px",
        color: disabled ? "#666" : "#aaa",
        fontSize: 11,
        fontFamily: "'Inter', system-ui, sans-serif",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const flushPending = () => {
    if (pendingRef.current === null) {
      frameRef.current = null;
      return;
    }
    onChange(pendingRef.current);
    frameRef.current = null;
  };

  const schedule = (nextValue: number) => {
    pendingRef.current = nextValue;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flushPending);
  };

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr 48px", gap: 8, alignItems: "center" }}>
      <span style={{ color: "#aaa", fontSize: 12 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => schedule(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <span style={{ color: "#888", fontSize: 12, textAlign: "right" }}>
        {formatValue ? formatValue(value) : formatSliderValue(value)}
      </span>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const safeValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px auto 1fr", gap: 8, alignItems: "center" }}>
      <span style={{ color: "#aaa", fontSize: 12 }}>{label}</span>
      <button
        onClick={() => colorInputRef.current?.click()}
        title={`Choose ${label}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: "1px solid #666",
          background: safeValue,
          cursor: "pointer",
        }}
      />
      <span style={{ color: "#888", fontSize: 12 }}>{safeValue.toUpperCase()}</span>
      <input
        ref={colorInputRef}
        type="color"
        value={safeValue}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: "none" }}
      />
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section style={{ borderBottom: "1px solid #2f2f2f", paddingBottom: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          color: "#ccc",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: "10px 0",
          textAlign: "left",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <span style={{ width: 14, textAlign: "center", color: "#888" }}>{open ? "v" : ">"}</span>
        {title}
      </button>
      <div
        style={{
          maxHeight: open ? 4000 : 0,
          overflow: "hidden",
          transition: "max-height 0.2s ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>{children}</div>
      </div>
    </section>
  );
}

export function SettingsPanel() {
  const showSettings = useSettingsStore((s) => s.showSettings);
  const setShowSettings = useSettingsStore((s) => s.setShowSettings);

  const navSpeed = useSettingsStore((s) => s.navSpeed);
  const zoomSensitivity = useSettingsStore((s) => s.zoomSensitivity);
  const setNavSpeed = useSettingsStore((s) => s.setNavSpeed);
  const setZoomSensitivity = useSettingsStore((s) => s.setZoomSensitivity);

  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const setActiveTheme = useSettingsStore((s) => s.setActiveTheme);
  const setThemeOverride = useSettingsStore((s) => s.setThemeOverride);
  const clearOverrides = useSettingsStore((s) => s.clearOverrides);
  const saveCustomTheme = useSettingsStore((s) => s.saveCustomTheme);
  const overwriteCustomTheme = useSettingsStore((s) => s.overwriteCustomTheme);
  const deleteCustomTheme = useSettingsStore((s) => s.deleteCustomTheme);
  const importTheme = useSettingsStore((s) => s.importTheme);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  const resolvedTheme = useResolvedTheme();
  const activeThemeName = useActiveThemeName();
  const isCustomTheme = useIsCustomTheme();

  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () => [
      ...Object.entries(BUILTIN_THEMES).map(([key, config]) => ({ key, config, custom: false })),
      ...Object.entries(customThemes).map(([key, config]) => ({ key, config, custom: true })),
    ],
    [customThemes]
  );

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const onExportTheme = () => {
    const payload = JSON.stringify(resolvedTheme, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `brain-viewer-theme-${activeTheme}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const onImportThemeFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!validateThemeConfig(parsed)) {
        window.alert("Invalid theme JSON schema.");
        return;
      }
      importTheme(parsed as ThemeConfig);
    } catch {
      window.alert("Failed to import theme file.");
    }
  };

  const onSaveAs = () => {
    const name = window.prompt("Save current theme as:", resolvedTheme.name);
    if (!name) return;
    const keyCandidate = name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "") || "custom-theme";
    if (BUILTIN_THEMES[keyCandidate]) {
      window.alert("This name conflicts with a built-in theme key. Choose a different name.");
      return;
    }
    saveCustomTheme(name);
  };

  const fogEnabled = resolvedTheme.fog !== null;
  const fog = resolvedTheme.fog ?? { color: resolvedTheme.background, near: 1000, far: 15000 };

  return (
    <>
      <style>
        {`
          .settings-panel {
            scrollbar-width: thin;
            scrollbar-color: #555 #1f1f1f;
          }
          .settings-panel::-webkit-scrollbar {
            width: 8px;
          }
          .settings-panel::-webkit-scrollbar-track {
            background: #1f1f1f;
          }
          .settings-panel::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 999px;
          }
        `}
      </style>

      <aside
        className="settings-panel"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 300,
          zIndex: 30,
          transform: showSettings ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.2s ease",
          background: "rgba(20, 20, 20, 0.95)",
          borderLeft: "1px solid #333",
          overflowY: "auto",
          padding: "12px 12px 16px",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            position: "sticky",
            top: 0,
            background: "rgba(20, 20, 20, 0.95)",
            paddingBottom: 10,
            zIndex: 1,
          }}
        >
          <h2 style={{ margin: 0, color: "#ddd", fontSize: 16, fontWeight: 600 }}>Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            title="Close settings"
            style={{
              border: "1px solid #555",
              borderRadius: 8,
              background: "rgba(0,0,0,0.55)",
              color: "#aaa",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            X
          </button>
        </header>

        <CollapsibleSection title="Navigation" defaultOpen>
          <SliderRow
            label="Speed"
            min={NAV_SPEED_MIN}
            max={NAV_SPEED_MAX}
            step={0.25}
            value={navSpeed}
            onChange={(value) => setNavSpeed(value)}
            formatValue={(value) => `${formatSliderValue(value)}x`}
          />
          <SliderRow
            label="Zoom"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.1}
            value={zoomSensitivity}
            onChange={(value) => setZoomSensitivity(value)}
            formatValue={(value) => formatSliderValue(value)}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Theme" defaultOpen>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ color: "#aaa", fontSize: 12 }}>Theme</span>
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setThemeMenuOpen((v) => !v)}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid #555",
                  borderRadius: 8,
                  color: "#aaa",
                  padding: "7px 10px",
                  textAlign: "left",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                {activeThemeName}
              </button>
              {themeMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "rgba(18,18,18,0.98)",
                    border: "1px solid #444",
                    borderRadius: 8,
                    zIndex: 5,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {entries.map((entry) => {
                    const isActive = entry.key === activeTheme;
                    return (
                      <div
                        key={entry.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          alignItems: "center",
                          padding: "4px",
                          gap: 6,
                        }}
                      >
                        <button
                          onClick={() => {
                            setActiveTheme(entry.key);
                            setThemeMenuOpen(false);
                          }}
                          style={{
                            border: "none",
                            borderRadius: 6,
                            textAlign: "left",
                            background: isActive ? "rgba(70,70,70,0.5)" : "transparent",
                            color: isActive ? "#fff" : "#aaa",
                            padding: "6px 8px",
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "'Inter', system-ui, sans-serif",
                          }}
                        >
                          {entry.config.name}
                        </button>
                        {entry.custom && (
                          <button
                            title="Delete custom theme"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteCustomTheme(entry.key);
                              if (entry.key === activeTheme) setThemeMenuOpen(false);
                            }}
                            style={{
                              border: "1px solid #555",
                              borderRadius: 6,
                              background: "rgba(0,0,0,0.4)",
                              color: "#c88",
                              padding: "4px 6px",
                              cursor: "pointer",
                              fontSize: 11,
                              fontFamily: "'Inter', system-ui, sans-serif",
                            }}
                          >
                            Trash
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <ControlButton onClick={onSaveAs}>Save as...</ControlButton>
            {isCustomTheme && <ControlButton onClick={overwriteCustomTheme}>Save</ControlButton>}
            <ControlButton onClick={onExportTheme}>Export</ControlButton>
            <ControlButton onClick={() => importInputRef.current?.click()}>Import</ControlButton>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await onImportThemeFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <ColorRow
            label="Background"
            value={resolvedTheme.background}
            onChange={(hex) => setThemeOverride("background", hex)}
          />

          <ColorRow
            label="Ambient"
            value={resolvedTheme.ambientLight.color}
            onChange={(hex) =>
              setThemeOverride("ambientLight", { ...resolvedTheme.ambientLight, color: hex })
            }
          />
          <SliderRow
            label="Ambient I"
            value={resolvedTheme.ambientLight.intensity}
            min={0}
            max={2}
            step={0.1}
            onChange={(value) =>
              setThemeOverride("ambientLight", {
                ...resolvedTheme.ambientLight,
                intensity: clamp(value, 0, 2),
              })
            }
          />

          <ColorRow
            label="Dir light"
            value={resolvedTheme.directionalLight.color}
            onChange={(hex) =>
              setThemeOverride("directionalLight", {
                ...resolvedTheme.directionalLight,
                color: hex,
              })
            }
          />
          <SliderRow
            label="Dir I"
            value={resolvedTheme.directionalLight.intensity}
            min={0}
            max={3}
            step={0.1}
            onChange={(value) =>
              setThemeOverride("directionalLight", {
                ...resolvedTheme.directionalLight,
                intensity: clamp(value, 0, 3),
              })
            }
          />

          {ENTITY_TYPES.map((entityType) => (
            <ColorRow
              key={entityType}
              label={capitalize(entityType)}
              value={resolvedTheme.nodeColors[entityType]}
              onChange={(hex) =>
                setThemeOverride("nodeColors", {
                  ...resolvedTheme.nodeColors,
                  [entityType]: hex,
                })
              }
            />
          ))}

          <SliderRow
            label="Emissive"
            value={resolvedTheme.nodeMaterial.emissive}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) =>
              setThemeOverride("nodeMaterial", {
                ...resolvedTheme.nodeMaterial,
                emissive: clamp(value, 0, 1),
              })
            }
          />
          <SliderRow
            label="Metalness"
            value={resolvedTheme.nodeMaterial.metalness}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) =>
              setThemeOverride("nodeMaterial", {
                ...resolvedTheme.nodeMaterial,
                metalness: clamp(value, 0, 1),
              })
            }
          />
          <SliderRow
            label="Roughness"
            value={resolvedTheme.nodeMaterial.roughness}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) =>
              setThemeOverride("nodeMaterial", {
                ...resolvedTheme.nodeMaterial,
                roughness: clamp(value, 0, 1),
              })
            }
          />

          <ColorRow
            label="Edge color"
            value={resolvedTheme.edgeStyle.color}
            onChange={(hex) =>
              setThemeOverride("edgeStyle", {
                ...resolvedTheme.edgeStyle,
                color: hex,
              })
            }
          />
          <SliderRow
            label="Edge alpha"
            value={resolvedTheme.edgeStyle.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) =>
              setThemeOverride("edgeStyle", {
                ...resolvedTheme.edgeStyle,
                opacity: clamp(value, 0, 1),
              })
            }
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="bloom-enabled"
              type="checkbox"
              checked={resolvedTheme.postProcessing.bloom.enabled}
              onChange={(e) =>
                setThemeOverride("postProcessing", {
                  ...resolvedTheme.postProcessing,
                  bloom: {
                    ...resolvedTheme.postProcessing.bloom,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <label htmlFor="bloom-enabled" style={{ color: "#aaa", fontSize: 12 }}>
              Bloom enabled
            </label>
          </div>
          <SliderRow
            label="Bloom I"
            value={resolvedTheme.postProcessing.bloom.intensity}
            min={0}
            max={3}
            step={0.1}
            onChange={(value) =>
              setThemeOverride("postProcessing", {
                ...resolvedTheme.postProcessing,
                bloom: {
                  ...resolvedTheme.postProcessing.bloom,
                  intensity: clamp(value, 0, 3),
                },
              })
            }
          />
          <SliderRow
            label="Bloom thr"
            value={resolvedTheme.postProcessing.bloom.luminanceThreshold}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) =>
              setThemeOverride("postProcessing", {
                ...resolvedTheme.postProcessing,
                bloom: {
                  ...resolvedTheme.postProcessing.bloom,
                  luminanceThreshold: clamp(value, 0, 1),
                },
              })
            }
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="fog-enabled"
              type="checkbox"
              checked={fogEnabled}
              onChange={(e) => {
                if (!e.target.checked) {
                  setThemeOverride("fog", null);
                  return;
                }
                setThemeOverride("fog", {
                  color: fog.color,
                  near: fog.near,
                  far: fog.far,
                });
              }}
            />
            <label htmlFor="fog-enabled" style={{ color: "#aaa", fontSize: 12 }}>
              Fog enabled
            </label>
          </div>

          {fogEnabled && (
            <>
              <ColorRow
                label="Fog color"
                value={fog.color}
                onChange={(hex) =>
                  setThemeOverride("fog", {
                    ...fog,
                    color: hex,
                  })
                }
              />
              <SliderRow
                label="Fog near"
                value={fog.near}
                min={0}
                max={50000}
                step={50}
                onChange={(value) =>
                  setThemeOverride("fog", {
                    ...fog,
                    near: clamp(value, 0, Math.max(0, fog.far - 1)),
                  })
                }
                formatValue={(value) => String(Math.round(value))}
              />
              <SliderRow
                label="Fog far"
                value={fog.far}
                min={100}
                max={100000}
                step={100}
                onChange={(value) =>
                  setThemeOverride("fog", {
                    ...fog,
                    far: Math.max(Math.round(value), Math.round(fog.near + 1)),
                  })
                }
                formatValue={(value) => String(Math.round(value))}
              />
            </>
          )}
        </CollapsibleSection>

        <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
          <ControlButton onClick={resetToDefaults}>Reset to defaults</ControlButton>
          <ControlButton onClick={clearOverrides}>Clear overrides</ControlButton>
        </div>
      </aside>
    </>
  );
}
```

=== FILE: frontend/src/components/SpeedIndicator.tsx ===
```tsx
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

function formatSpeed(value: number): string {
  const rounded = Number(value.toFixed(2));
  if (Number.isInteger(rounded)) return `${rounded.toFixed(1)}x`;
  return `${rounded}x`;
}

export function SpeedIndicator() {
  const navSpeed = useSettingsStore((s) => s.navSpeed);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const previousRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, [navSpeed]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const speedLabel = formatSpeed(navSpeed);
  const showBadge = Math.abs(navSpeed - 1.0) > 1e-6;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 60,
          transform: "translateX(-50%)",
          zIndex: 20,
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

      {showBadge && (
        <div
          style={{
            position: "absolute",
            right: 52,
            bottom: 12,
            zIndex: 20,
            pointerEvents: "none",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 11,
            borderRadius: 999,
            padding: "3px 8px",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {speedLabel}
        </div>
      )}
    </>
  );
}
```

=== FILE: frontend/src/store/graphStore.ts ===
```typescript
import { create } from "zustand";
import type { Entity, Relation, Community, Observation, NodePosition, EntityDetail } from "../lib/types";
import { fetchGraph, fetchEntity, savePositions } from "../lib/api";
import { useUIStore } from "./uiStore";

const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
const initialReducedMotion = reducedMotionQuery?.matches ?? false;

interface GraphState {
  // Data
  entities: Entity[];
  relations: Relation[];
  communities: Community[];
  observations: Observation[];
  layoutHash: string;
  positionsValid: boolean;
  positions: Record<string, NodePosition>;

  // UI state
  selectedEntityId: string | null;
  selectedEntityDetail: EntityDetail | null;
  hoveredEntityId: string | null;
  focusedEntityId: string | null;
  loading: boolean;
  error: string | null;
  layoutProgress: number;
  reducedMotion: boolean;

  // Filters
  filterEntityTypes: Set<string>;
  filterScope: string | null;

  // Drag state
  nodePointerActive: boolean;
  draggedEntityId: string | null;
  dragPosition: NodePosition | null;

  // Actions
  loadGraph: (scope?: string) => Promise<void>;
  selectEntity: (id: string | null) => Promise<void>;
  hoverEntity: (id: string | null) => void;
  focusEntity: (id: string | null) => void;
  setIntermediatePositions: (positions: Record<string, NodePosition>) => void;
  setFinalPositions: (positions: Record<string, NodePosition>) => void;
  persistPositions: () => Promise<void>;
  setLayoutProgress: (p: number) => void;
  setError: (error: string | null) => void;
  toggleEntityTypeFilter: (type: string) => void;
  setFilterScope: (scope: string | null) => void;
  addEntity: (entity: Entity) => void;
  addRelation: (relation: Relation) => void;
  updateEntityObsCount: (entityId: string, delta: number) => void;
  setNodePointerActive: (v: boolean) => void;
  startDrag: (entityId: string, position: NodePosition) => void;
  updateDrag: (position: NodePosition) => void;
  endDrag: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  entities: [],
  relations: [],
  communities: [],
  observations: [],
  layoutHash: "",
  positionsValid: false,
  positions: {},
  selectedEntityId: null,
  selectedEntityDetail: null,
  hoveredEntityId: null,
  focusedEntityId: null,
  loading: false,
  error: null,
  layoutProgress: 0,
  reducedMotion: initialReducedMotion,
  filterEntityTypes: new Set(),
  filterScope: null,
  nodePointerActive: false,
  draggedEntityId: null,
  dragPosition: null,

  loadGraph: async (scope?: string) => {
    set({ loading: true, error: null });
    try {
      const data = await fetchGraph(scope);
      const positions: Record<string, NodePosition> = {};
      for (const e of data.entities) {
        if (e.position) positions[e.id] = e.position;
      }
      set({
        entities: data.entities,
        observations: data.observations,
        relations: data.relations,
        communities: data.communities,
        layoutHash: data.layout_hash,
        positionsValid: data.positions_valid,
        positions,
        loading: false,
        layoutProgress: data.positions_valid ? 1 : 0,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  selectEntity: async (id: string | null) => {
    if (!id) {
      set({ selectedEntityId: null, selectedEntityDetail: null });
      return;
    }
    set({ selectedEntityId: id });
    useUIStore.getState().setShowDetailPanel(true);
    try {
      const detail = await fetchEntity(id);
      set({ selectedEntityDetail: detail });
    } catch {
      // Keep selection but no detail
    }
  },

  hoverEntity: (id) => set({ hoveredEntityId: id }),

  focusEntity: (id) => set({ focusedEntityId: id }),

  setIntermediatePositions: (positions) => set({ positions }),

  setFinalPositions: (positions) => set({ positions, positionsValid: true }),

  persistPositions: async () => {
    const { positions, layoutHash } = get();
    if (Object.keys(positions).length > 0) {
      await savePositions(positions, layoutHash);
    }
  },

  setLayoutProgress: (p) => set({ layoutProgress: p }),

  setError: (error: string | null) => set({ error }),

  toggleEntityTypeFilter: (type) => {
    const current = new Set(get().filterEntityTypes);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    set({ filterEntityTypes: current });
  },

  setFilterScope: (scope) => set({ filterScope: scope }),

  addEntity: (entity) =>
    set((state) => ({
      entities: [...state.entities, entity],
    })),

  addRelation: (relation) =>
    set((state) => ({
      relations: [...state.relations, relation],
    })),

  updateEntityObsCount: (entityId, delta) =>
    set((state) => ({
      entities: state.entities.map((entity) =>
        entity.id === entityId
          ? { ...entity, observation_count: Math.max(0, entity.observation_count + delta) }
          : entity
      ),
      selectedEntityDetail:
        state.selectedEntityDetail && state.selectedEntityDetail.id === entityId
          ? {
              ...state.selectedEntityDetail,
              observation_count: Math.max(0, state.selectedEntityDetail.observation_count + delta),
            }
          : state.selectedEntityDetail,
    })),

  setNodePointerActive: (v) => set({ nodePointerActive: v }),

  startDrag: (entityId, position) =>
    set({ draggedEntityId: entityId, dragPosition: position }),

  updateDrag: (position) =>
    set({ dragPosition: position }),

  endDrag: () =>
    set({ draggedEntityId: null, dragPosition: null, nodePointerActive: false }),
}));

// Subscribe to prefers-reduced-motion changes at runtime
if (reducedMotionQuery) {
  reducedMotionQuery.addEventListener("change", (e: MediaQueryListEvent) => {
    useGraphStore.setState({ reducedMotion: e.matches });
  });
}
```

=== FILE: frontend/src/App.tsx ===
```tsx
import { useEffect } from "react";
import { GraphScene } from "./components/GraphScene";
import { DetailPanel } from "./components/DetailPanel";
import { Filters } from "./components/Filters";
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
  const layoutProgress = useGraphStore((s) => s.layoutProgress);
  const positionsValid = useGraphStore((s) => s.positionsValid);

  if (error) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.85)", color: "#ef4444",
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

  if (loading) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.85)", color: "#888",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
      }}>
        Loading graph data...
      </div>
    );
  }

  if (entities.length > 0 && !positionsValid && layoutProgress < 1) {
    const pct = Math.round(layoutProgress * 100);
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", color: "#aaa",
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14,
        flexDirection: "column", gap: 8,
      }}>
        <div>Computing layout for {entities.length} entities...</div>
        <div style={{
          width: 200, height: 4, background: "#333", borderRadius: 2,
        }}>
          <div style={{
            width: `${pct}%`, height: "100%", background: "#4a90d9",
            borderRadius: 2, transition: "width 0.3s",
          }} />
        </div>
        <div style={{ color: "#666", fontSize: 12 }}>{pct}%</div>
      </div>
    );
  }

  return null;
}

function HomeButton() {
  return (
    <button
      onClick={() => (window as any).__brainViewerGoHome?.()}
      title="Reset camera to home view"
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 20,
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
    <button onClick={() => setShowSettings(!showSettings)} title="Settings" style={{
      position: "absolute", top: 12, right: 12, zIndex: 20,
      background: "rgba(0,0,0,0.6)", border: "1px solid #555", borderRadius: 8,
      padding: "6px 12px", color: "#aaa", fontSize: 14, cursor: "pointer",
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>⚙</button>
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
      <SettingsButton />
      <SettingsPanel />
      <SpeedIndicator />
      <Filters />
      {showTimeline && <Timeline />}
      <HomeButton />
      <StatusBar realtimeConnected={realtimeConnected} />
    </>
  );
}
```

=== FILE: frontend/src/components/GraphScene.tsx ===
```tsx
/**
 * Main 3D scene: nodes, edges, lighting, camera controls.
 */

import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { NodeMesh } from "./NodeMesh";
import { EdgeLines } from "./EdgeLines";
import { NodeLabels } from "./NodeLabels";
import { useGraphStore } from "../store/graphStore";
import { useReplayStore } from "../store/replayStore";
import { useResolvedTheme, useSettingsStore } from "../store/settingsStore";
import type { LayoutWorkerInput, LayoutWorkerOutput } from "../lib/types";

const CAMERA_STORAGE_KEY = "brain-viewer-camera";
const SAVE_DEBOUNCE_MS = 500;

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

function saveCameraState(state: CameraState) {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

function loadCameraState(): CameraState | null {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Compute bounding sphere of all positions, return camera distance to fit. */
function computeAutoFit(
  positions: Record<string, { x: number; y: number; z: number }>,
  fov: number
): { center: THREE.Vector3; distance: number } {
  const pts = Object.values(positions);
  if (pts.length === 0) {
    return { center: new THREE.Vector3(), distance: 300 };
  }

  const box = new THREE.Box3();
  for (const p of pts) {
    box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
  }
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  const halfFov = (fov / 2) * (Math.PI / 180);
  const distance = sphere.radius / Math.sin(halfFov) * 1.2;

  return { center: sphere.center, distance: Math.max(distance, 50) };
}

// WASD navigation speed (units per second)
const NAV_SPEED = 500;

// Keys tracked for WASD+QE navigation (+R/F handled in keydown)
const NAV_KEYS = new Set(["w", "a", "s", "d", "q", "e", "r", "f"]);

/** Manages camera: auto-fit, persistence, home reset, WASD navigation. */
function CameraController({
  controlsEnabled = true,
  controlsRefExternal,
}: {
  controlsEnabled?: boolean;
  controlsRefExternal?: MutableRefObject<any | null>;
}) {
  const { camera, gl, events } = useThree();
  const controlsRef = useRef<any>(null);
  const positions = useGraphStore((s) => s.positions);
  const positionsValid = useGraphStore((s) => s.positionsValid);
  const navSpeed = useSettingsStore((s) => s.navSpeed);
  const zoomSensitivity = useSettingsStore((s) => s.zoomSensitivity);
  const incrementNavSpeed = useSettingsStore((s) => s.incrementNavSpeed);
  const decrementNavSpeed = useSettingsStore((s) => s.decrementNavSpeed);
  const showSettings = useSettingsStore((s) => s.showSettings);
  const hasAutoFit = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  // Store home view for reset
  const homeView = useRef<CameraState | null>(null);

  // Forward controls ref to parent so NodeMesh can imperatively toggle enabled
  const setControlsRef = useCallback((instance: any | null) => {
    controlsRef.current = instance;
    if (controlsRefExternal) {
      controlsRefExternal.current = instance;
    }
  }, [controlsRefExternal]);

  // Explicit DOM target for TrackballControls — same element R3F uses
  const controlsDomElement = (events.connected ?? gl.domElement) as HTMLElement;

  // Expose goHome on the window for the Home button
  useEffect(() => {
    (window as any).__brainViewerGoHome = () => {
      if (homeView.current && controlsRef.current) {
        const h = homeView.current;
        camera.position.set(...h.position);
        camera.up.set(...h.up);
        controlsRef.current.target.set(...h.target);
        controlsRef.current.update();
        saveCameraState(h);
      }
    };
    return () => { delete (window as any).__brainViewerGoHome; };
  }, [camera]);

  // WASD+QE key tracking + speed controls (R/F)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return;
      }

      const key = e.key.toLowerCase();

      if (key === "r" || key === "f") {
        if (showSettings) return;
        e.preventDefault();
        if (key === "r") incrementNavSpeed();
        else decrementNavSpeed();
        return;
      }

      if (NAV_KEYS.has(key)) {
        keysPressed.current.add(key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    const onBlur = () => keysPressed.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [decrementNavSpeed, incrementNavSpeed, showSettings]);

  // Apply WASD movement each frame
  const _forward = useRef(new THREE.Vector3());
  const _right = useRef(new THREE.Vector3());
  const _up = useRef(new THREE.Vector3());
  const _move = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (keysPressed.current.size === 0) return;
    const controls = controlsRef.current;
    if (!controls) return;

    // Compute camera-relative axes
    _forward.current.subVectors(controls.target, camera.position).normalize();
    _right.current.crossVectors(_forward.current, camera.up).normalize();
    // Up is perpendicular to both forward and right (camera-relative)
    _up.current.crossVectors(_right.current, _forward.current).normalize();

    const speed = NAV_SPEED * navSpeed * delta;
    _move.current.set(0, 0, 0);

    if (keysPressed.current.has("w")) _move.current.addScaledVector(_forward.current, speed);
    if (keysPressed.current.has("s")) _move.current.addScaledVector(_forward.current, -speed);
    if (keysPressed.current.has("d")) _move.current.addScaledVector(_right.current, speed);
    if (keysPressed.current.has("a")) _move.current.addScaledVector(_right.current, -speed);
    if (keysPressed.current.has("e")) _move.current.addScaledVector(_up.current, speed);
    if (keysPressed.current.has("q")) _move.current.addScaledVector(_up.current, -speed);

    camera.position.add(_move.current);
    controls.target.add(_move.current);
    controls.update();
  });

  // Auto-fit camera when positions first become valid
  useEffect(() => {
    if (!positionsValid || hasAutoFit.current) return;
    if (Object.keys(positions).length === 0) return;

    // Check for saved camera state first
    const saved = loadCameraState();
    if (saved) {
      camera.position.set(...saved.position);
      camera.up.set(...saved.up);
      if (controlsRef.current) {
        controlsRef.current.target.set(...saved.target);
        controlsRef.current.update();
      }
      // Still compute home view for the reset button
      const { center, distance } = computeAutoFit(positions, 60);
      homeView.current = {
        position: [center.x, center.y, center.z + distance],
        target: [center.x, center.y, center.z],
        up: [0, 1, 0],
      };
      hasAutoFit.current = true;
      return;
    }

    // No saved state — auto-fit to graph bounds
    const { center, distance } = computeAutoFit(positions, 60);
    camera.position.set(center.x, center.y, center.z + distance);
    camera.up.set(0, 1, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(center.x, center.y, center.z);
      controlsRef.current.update();
    }
    homeView.current = {
      position: [center.x, center.y, center.z + distance],
      target: [center.x, center.y, center.z],
      up: [0, 1, 0],
    };
    hasAutoFit.current = true;
  }, [positionsValid, positions, camera]);

  // Debounced save on camera change
  const handleChange = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos = camera.position;
      const up = camera.up;
      const target = controlsRef.current?.target;
      if (target) {
        saveCameraState({
          position: [pos.x, pos.y, pos.z],
          target: [target.x, target.y, target.z],
          up: [up.x, up.y, up.z],
        });
      }
    }, SAVE_DEBOUNCE_MS);
  }, [camera]);

  return (
    <TrackballControls
      ref={setControlsRef}
      domElement={controlsDomElement}
      enabled={controlsEnabled}
      rotateSpeed={3}
      zoomSpeed={zoomSensitivity}
      panSpeed={1}
      noRotate={false}
      noZoom={false}
      noPan={false}
      staticMoving={false}
      dynamicDampingFactor={0.15}
      minDistance={1}
      maxDistance={50000}
      onChange={handleChange}
    />
  );
}

function SceneContent() {
  const themeConfig = useResolvedTheme();
  const reducedMotion = useGraphStore((s) => s.reducedMotion);
  const focusEntity = useGraphStore((s) => s.focusEntity);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const nodePointerActive = useGraphStore((s) => s.nodePointerActive);

  const replayActive = useReplayStore((s) => s.replayActive);
  const visibleEntityIds = useReplayStore((s) => s.visibleEntityIds);
  const visibleRelationIds = useReplayStore((s) => s.visibleRelationIds);

  const controlsRef = useRef<any>(null);

  const handleMissClick = useCallback(() => {
    void selectEntity(null);
    focusEntity(null);
  }, [selectEntity, focusEntity]);

  const bloom = themeConfig.postProcessing.bloom;

  return (
    <>
      <ambientLight
        color={themeConfig.ambientLight.color}
        intensity={themeConfig.ambientLight.intensity}
      />
      <directionalLight
        color={themeConfig.directionalLight.color}
        intensity={themeConfig.directionalLight.intensity}
        position={[100, 100, 100]}
      />

      {themeConfig.fog && (
        <fog attach="fog" args={[themeConfig.fog.color, themeConfig.fog.near, themeConfig.fog.far]} />
      )}

      <NodeMesh
        replayFilter={replayActive ? visibleEntityIds : null}
        controlsRef={controlsRef}
      />
      <EdgeLines replayFilter={replayActive ? visibleRelationIds : null} />
      <NodeLabels replayFilter={replayActive ? visibleEntityIds : null} />

      {/* Invisible click plane for deselection */}
      <mesh onClick={handleMissClick} visible={false}>
        <sphereGeometry args={[50000, 8, 8]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>

      <CameraController controlsEnabled={!nodePointerActive} controlsRefExternal={controlsRef} />

      {bloom.enabled && !reducedMotion && (
        <EffectComposer>
          <Bloom
            intensity={bloom.intensity}
            luminanceThreshold={bloom.luminanceThreshold}
            luminanceSmoothing={0.9}
          />
        </EffectComposer>
      )}
    </>
  );
}

export function GraphScene() {
  const themeConfig = useResolvedTheme();
  const entities = useGraphStore((s) => s.entities);
  const relations = useGraphStore((s) => s.relations);
  const communities = useGraphStore((s) => s.communities);
  const positions = useGraphStore((s) => s.positions);
  const positionsValid = useGraphStore((s) => s.positionsValid);
  const setIntermediatePositions = useGraphStore((s) => s.setIntermediatePositions);
  const setFinalPositions = useGraphStore((s) => s.setFinalPositions);
  const persistPositions = useGraphStore((s) => s.persistPositions);
  const setLayoutProgress = useGraphStore((s) => s.setLayoutProgress);
  const setError = useGraphStore((s) => s.setError);

  // Run layout worker when positions are not valid
  useEffect(() => {
    if (entities.length === 0) return;
    if (positionsValid && Object.keys(positions).length > 0) return;

    const posCount = Object.keys(positions).length;
    const missingCount = entities.length - posCount;

    // Fast path: if most entities already have positions (stale cache),
    // just place the few missing ones near their community centroids
    // and skip the expensive force simulation entirely.
    if (posCount > 0 && missingCount / entities.length < 0.1) {
      console.log(`[GraphScene] Fast-placing ${missingCount} new entities (${posCount} cached)`);

      // Build community centroid map from existing positions
      const commMembers: Record<string, { x: number; y: number; z: number }[]> = {};
      for (const entity of entities) {
        const pos = positions[entity.id];
        const cid = entity.community_id;
        if (pos && cid) {
          if (!commMembers[cid]) commMembers[cid] = [];
          commMembers[cid].push(pos);
        }
      }
      const commCentroids: Record<string, { x: number; y: number; z: number }> = {};
      for (const [cid, pts] of Object.entries(commMembers)) {
        const n = pts.length;
        commCentroids[cid] = {
          x: pts.reduce((s, p) => s + p.x, 0) / n,
          y: pts.reduce((s, p) => s + p.y, 0) / n,
          z: pts.reduce((s, p) => s + p.z, 0) / n,
        };
      }

      const merged = { ...positions };
      for (const entity of entities) {
        if (!merged[entity.id]) {
          const centroid = entity.community_id ? commCentroids[entity.community_id] : null;
          merged[entity.id] = {
            x: (centroid?.x ?? 0) + (Math.random() - 0.5) * 30,
            y: (centroid?.y ?? 0) + (Math.random() - 0.5) * 30,
            z: (centroid?.z ?? 0) + (Math.random() - 0.5) * 30,
          };
        }
      }

      setFinalPositions(merged);
      setLayoutProgress(1);
      void persistPositions();
      return;
    }

    // Full/incremental layout via Web Worker
    console.log("[GraphScene] Starting layout worker for", entities.length, "entities",
      posCount > 0 ? `(incremental, ${posCount} cached)` : "(full)");

    const worker = new Worker(
      new URL("../workers/layoutWorker.ts", import.meta.url),
      { type: "module" }
    );

    const input: LayoutWorkerInput = {
      type: "compute",
      entities,
      relations,
      communities,
      existingPositions: positions,
      isIncremental: posCount > 0,
    };

    worker.postMessage(input);

    worker.onmessage = (event: MessageEvent<LayoutWorkerOutput>) => {
      const msg = event.data;
      if (msg.type === "progress" && msg.positions) {
        setIntermediatePositions(msg.positions);
        setLayoutProgress(msg.progress || 0);
      } else if (msg.type === "positions" && msg.positions) {
        console.log("[GraphScene] Layout complete:", Object.keys(msg.positions).length, "positions");
        setFinalPositions(msg.positions);
        setLayoutProgress(1);
        void persistPositions();
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error("[GraphScene] Layout worker error:", err);
      setError(`Layout worker failed: ${err.message}`);
    };

    return () => worker.terminate();
  }, [entities, positionsValid]);

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 300], fov: 60, near: 0.1, far: 100000 }}
        style={{ background: themeConfig.background }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
```

=== FILE: frontend/src/components/NodeMesh.tsx ===
```tsx
/**
 * InstancedMesh-based node rendering, grouped by entity type.
 * One InstancedMesh per entity type (9 draw calls max) — each group
 * uses a MeshStandardMaterial with the type's color.
 */

import { useRef, useMemo, useEffect, useCallback, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";
import { useResolvedTheme } from "../store/settingsStore";
import type { ThemeConfig } from "../themes/registry";
import { useReplayStore } from "../store/replayStore";
import type { Entity, EntityType, Severity, NodePosition } from "../lib/types";

const ENTITY_ANIM_MS = 500;
const OBSERVATION_PULSE_MS = 800;
const ELASTIC_RETURN_MS = 400;
const DRAG_THRESHOLD_PX = 5;

const SIZE_BUCKETS = [0.8, 1.2, 1.8, 2.5];
function getNodeSize(obsCount: number): number {
  if (obsCount <= 1) return SIZE_BUCKETS[0];
  if (obsCount <= 5) return SIZE_BUCKETS[1];
  if (obsCount <= 15) return SIZE_BUCKETS[2];
  return SIZE_BUCKETS[3];
}

const PULSE_COLORS: Record<Severity, THREE.Color> = {
  blocking: new THREE.Color("#ef4444"),
  major: new THREE.Color("#f59e0b"),
  minor: new THREE.Color("#3b82f6"),
  info: new THREE.Color("#60a5fa"),
};

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

// Shared sphere geometry
const sharedGeom = new THREE.SphereGeometry(3, 16, 16);

interface EntityGroup {
  type: EntityType;
  entities: Entity[];
  /** Maps local instance index to global entity id */
  entityIds: string[];
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

interface TrackballControlsLike {
  enabled: boolean;
}

/** Single InstancedMesh for one entity type */
function TypeGroup({
  group,
  maxCount,
  positions,
  positionOverrides,
  themeConfig,
  hoveredEntityId,
  selectedEntityId,
  focusedConnected,
  onSelect,
  onNodePointerDown,
  onHover,
  onFocus,
  animatingEntities,
  pulsingEntities,
  reducedMotion,
  didDragRef,
}: {
  group: EntityGroup;
  maxCount: number;
  positions: Record<string, { x: number; y: number; z: number }>;
  positionOverrides: Map<string, NodePosition>;
  themeConfig: ThemeConfig;
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  focusedConnected: Set<string> | null;
  onSelect: (id: string | null) => void;
  onNodePointerDown: (entityId: string, hitPoint: THREE.Vector3, screenX: number, screenY: number) => void;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  animatingEntities: Set<string>;
  pulsingEntities: Map<string, Severity>;
  reducedMotion: boolean;
  didDragRef: MutableRefObject<boolean>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spawnStartRef = useRef<Map<string, number>>(new Map());
  const pulseStartRef = useRef<Map<string, { start: number; severity: Severity }>>(new Map());

  const { entities, entityIds, type } = group;

  // Stable material ref — properties updated in place to avoid changing args
  // (R3F v9 swapInstances has a bug: it doesn't call removeInteractivity for
  // the old mesh or add the new mesh to the interaction list when eventCount
  // stays the same, permanently breaking raycasting/click detection.)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  if (!materialRef.current) {
    const hex = themeConfig.nodeColors[type] || "#888888";
    const color = new THREE.Color(hex);
    materialRef.current = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: themeConfig.nodeMaterial.emissive,
      metalness: themeConfig.nodeMaterial.metalness,
      roughness: themeConfig.nodeMaterial.roughness,
    });
  }

  // Update material properties when theme changes (without recreating the object)
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const hex = themeConfig.nodeColors[type] || "#888888";
    const color = new THREE.Color(hex);
    mat.color.set(color);
    mat.emissive.set(color);
    mat.emissiveIntensity = themeConfig.nodeMaterial.emissive;
    mat.metalness = themeConfig.nodeMaterial.metalness;
    mat.roughness = themeConfig.nodeMaterial.roughness;
    mat.needsUpdate = true;
  }, [themeConfig, type]);

  // Dispose material only on component unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
    };
  }, []);

  const updateInstances = useCallback((nowMs: number) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Set visible instance count (mesh is allocated with maxCount but we
    // only render/raycast the entities currently in this group)
    mesh.count = entities.length;

    const baseColor = new THREE.Color(themeConfig.nodeColors[type] || "#888888");

    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      const override = positionOverrides.get(entity.id);
      const pos = override ?? positions[entity.id];
      if (!pos) continue;

      const baseScale = getNodeSize(entity.observation_count);
      let scale = baseScale;

      if (!reducedMotion) {
        const spawnStart = spawnStartRef.current.get(entity.id);
        if (spawnStart !== undefined) {
          const t = clamp01((nowMs - spawnStart) / ENTITY_ANIM_MS);
          scale = baseScale * t;
        }
      }

      tempObject.position.set(pos.x, pos.y, pos.z);
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      tempColor.copy(baseColor);

      if (focusedConnected && !focusedConnected.has(entity.id)) {
        tempColor.multiplyScalar(0.3);
      }

      if (!reducedMotion) {
        const pulse = pulseStartRef.current.get(entity.id);
        if (pulse) {
          const pulseT = clamp01((nowMs - pulse.start) / OBSERVATION_PULSE_MS);
          const pulseStrength = 1 - pulseT;
          if (pulseStrength > 0) {
            tempColor.lerp(PULSE_COLORS[pulse.severity], 0.7 * pulseStrength);
            tempColor.multiplyScalar(1 + 0.35 * pulseStrength);
          }
        }
      }

      if (entity.id === hoveredEntityId || entity.id === selectedEntityId) {
        tempColor.multiplyScalar(1.5);
      }

      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Recompute bounding sphere so raycasting works after instance matrices change.
    // Without this, InstancedMesh caches a stale bounding sphere from identity matrices
    // (computed before useEffect sets real positions), permanently breaking hit-testing.
    mesh.computeBoundingSphere();
  }, [
    entities,
    focusedConnected,
    hoveredEntityId,
    positions,
    positionOverrides,
    reducedMotion,
    selectedEntityId,
    themeConfig,
    type,
  ]);

  useEffect(() => {
    if (reducedMotion) {
      spawnStartRef.current.clear();
      pulseStartRef.current.clear();
      updateInstances(performance.now());
      return;
    }

    const now = performance.now();

    for (const entityId of animatingEntities) {
      if (!spawnStartRef.current.has(entityId)) {
        spawnStartRef.current.set(entityId, now);
      }
    }
    for (const id of Array.from(spawnStartRef.current.keys())) {
      if (!animatingEntities.has(id)) {
        spawnStartRef.current.delete(id);
      }
    }

    for (const [entityId, severity] of pulsingEntities) {
      const existing = pulseStartRef.current.get(entityId);
      if (!existing || existing.severity !== severity) {
        pulseStartRef.current.set(entityId, { start: now, severity });
      }
    }
    for (const id of Array.from(pulseStartRef.current.keys())) {
      if (!pulsingEntities.has(id)) {
        pulseStartRef.current.delete(id);
      }
    }

    updateInstances(now);
  }, [animatingEntities, pulsingEntities, reducedMotion, updateInstances]);

  useEffect(() => {
    updateInstances(performance.now());
  }, [positions, themeConfig, hoveredEntityId, selectedEntityId, focusedConnected, updateInstances]);

  useFrame(() => {
    const hasOverrides = positionOverrides.size > 0;
    if (!hasOverrides && reducedMotion) return;
    if (!hasOverrides && spawnStartRef.current.size === 0 && pulseStartRef.current.size === 0) return;
    updateInstances(performance.now());
  });

  const handlePointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      // Block other DOM listeners on the same target (notably TrackballControls)
      // for this pointerdown before they can start orbit mode.
      if (e.nativeEvent?.stopImmediatePropagation) {
        e.nativeEvent.stopImmediatePropagation();
      }
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId && e.point) {
          onNodePointerDown(
            entityId,
            e.point as THREE.Vector3,
            e.nativeEvent?.clientX ?? 0,
            e.nativeEvent?.clientY ?? 0,
          );
        }
      }
    },
    [entityIds, onNodePointerDown]
  );

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onSelect(entityId);
      }
    },
    [didDragRef, entityIds, onSelect]
  );

  const handleDoubleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onFocus(entityId);
      }
    },
    [entityIds, onFocus]
  );

  const handlePointerOver = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const entityId = entityIds[e.instanceId];
        if (entityId) onHover(entityId);
      }
    },
    [entityIds, onHover]
  );

  const handlePointerOut = useCallback(() => {
    onHover(null);
  }, [onHover]);

  if (entities.length === 0) return null;

  return (
    <instancedMesh
      key={maxCount}
      ref={meshRef}
      args={[sharedGeom, materialRef.current, maxCount]}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

interface PendingInteraction {
  entityId: string;
  hitPoint: THREE.Vector3;
  originalPos: NodePosition;
  screenX: number;
  screenY: number;
}

interface ElasticReturn {
  entityId: string;
  from: NodePosition;
  to: NodePosition;
  startTime: number;
}

export function NodeMesh({
  replayFilter = null,
  controlsRef = null,
}: {
  replayFilter?: Set<string> | null;
  controlsRef?: MutableRefObject<TrackballControlsLike | null> | null;
}) {
  const entities = useGraphStore((s) => s.entities);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useResolvedTheme();
  const hoveredEntityId = useGraphStore((s) => s.hoveredEntityId);
  const selectedEntityId = useGraphStore((s) => s.selectedEntityId);
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const filterEntityTypes = useGraphStore((s) => s.filterEntityTypes);
  const reducedMotion = useGraphStore((s) => s.reducedMotion);
  const draggedEntityId = useGraphStore((s) => s.draggedEntityId);
  const dragPosition = useGraphStore((s) => s.dragPosition);

  const selectEntity = useGraphStore((s) => s.selectEntity);
  const hoverEntity = useGraphStore((s) => s.hoverEntity);
  const focusEntity = useGraphStore((s) => s.focusEntity);
  const setNodePointerActive = useGraphStore((s) => s.setNodePointerActive);
  const startDrag = useGraphStore((s) => s.startDrag);
  const updateDrag = useGraphStore((s) => s.updateDrag);
  const endDrag = useGraphStore((s) => s.endDrag);

  const replayActive = useReplayStore((s) => s.replayActive);
  const animatingEntities = useReplayStore((s) => s.animatingEntities);
  const pulsingEntities = useReplayStore((s) => s.pulsingEntities);

  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const dragPlane = useRef(new THREE.Plane());
  const pendingRef = useRef<PendingInteraction | null>(null);
  const dragActiveRef = useRef(false);
  const didDragRef = useRef(false);
  const returningEntities = useRef<Map<string, ElasticReturn>>(new Map());
  const positionOverridesRef = useRef<Map<string, NodePosition>>(new Map());
  const prevReplayActiveRef = useRef(replayActive);

  // Synchronously toggle TrackballControls + store flag
  const setControlsEnabled = useCallback((enabled: boolean) => {
    const controls = controlsRef?.current;
    if (controls) {
      controls.enabled = enabled;
    }
    setNodePointerActive(!enabled);
  }, [controlsRef, setNodePointerActive]);

  // Reset all interaction state (used on replay toggle and unmount)
  const resetInteractionState = useCallback(() => {
    pendingRef.current = null;
    dragActiveRef.current = false;
    didDragRef.current = false;
    returningEntities.current.clear();
    positionOverridesRef.current.clear();
    endDrag();
    setControlsEnabled(true);
  }, [endDrag, setControlsEnabled]);

  // Called by TypeGroup on pointerDown — records state for potential drag
  const handleNodePointerDown = useCallback(
    (entityId: string, hitPoint: THREE.Vector3, screenX: number, screenY: number) => {
      const pos = positions[entityId];
      if (!pos) return;

      pendingRef.current = {
        entityId,
        hitPoint: hitPoint.clone(),
        originalPos: { ...pos },
        screenX,
        screenY,
      };
      dragActiveRef.current = false;
      didDragRef.current = false;

      // Disable controls synchronously so a node click doesn't enter orbit mode.
      setControlsEnabled(false);
    },
    [positions, setControlsEnabled]
  );

  // Canvas-level pointer handlers for drag
  useEffect(() => {
    const domElement = gl.domElement;
    const mouse = new THREE.Vector2();
    const intersection = new THREE.Vector3();

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const dx = e.clientX - pending.screenX;
      const dy = e.clientY - pending.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Only activate drag after exceeding threshold
      if (!dragActiveRef.current) {
        if (dist < DRAG_THRESHOLD_PX) return;
        dragActiveRef.current = true;
        didDragRef.current = true;

        // Create drag plane perpendicular to camera at the hit point
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        dragPlane.current.setFromNormalAndCoplanarPoint(cameraDir, pending.hitPoint);

        startDrag(pending.entityId, pending.originalPos);
      }

      // Update drag position
      const rect = domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse, camera);
      if (raycaster.current.ray.intersectPlane(dragPlane.current, intersection)) {
        updateDrag({ x: intersection.x, y: intersection.y, z: intersection.z });
      }
    };

    const onPointerUpLike = () => {
      const pending = pendingRef.current;
      if (!pending) return;

      if (dragActiveRef.current) {
        // Was a drag — start elastic return
        const state = useGraphStore.getState();
        const currentDragPos = state.dragPosition;

        endDrag();

        if (currentDragPos) {
          returningEntities.current.set(pending.entityId, {
            entityId: pending.entityId,
            from: { ...currentDragPos },
            to: { ...pending.originalPos },
            startTime: performance.now(),
          });
        }
      }

      // For both click and drag, re-enable controls on pointer end.
      setControlsEnabled(true);

      pendingRef.current = null;
      dragActiveRef.current = false;
    };

    domElement.addEventListener("pointermove", onPointerMove);
    domElement.addEventListener("pointerup", onPointerUpLike);
    domElement.addEventListener("pointercancel", onPointerUpLike);

    return () => {
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.removeEventListener("pointerup", onPointerUpLike);
      domElement.removeEventListener("pointercancel", onPointerUpLike);
    };
  }, [camera, gl, setControlsEnabled, startDrag, updateDrag, endDrag]);

  // Reset interaction state when replay mode toggles
  useEffect(() => {
    if (prevReplayActiveRef.current !== replayActive) {
      resetInteractionState();
      prevReplayActiveRef.current = replayActive;
    }
  }, [replayActive, resetInteractionState]);

  // Ensure controls are restored if this component unmounts mid-interaction
  useEffect(() => {
    return () => {
      resetInteractionState();
    };
  }, [resetInteractionState]);

  // Build position overrides map (drag + elastic returns) each frame
  useFrame(() => {
    const overrides = positionOverridesRef.current;

    // Apply drag position
    if (draggedEntityId && dragPosition) {
      const existing = overrides.get(draggedEntityId);
      if (!existing || existing.x !== dragPosition.x || existing.y !== dragPosition.y || existing.z !== dragPosition.z) {
        overrides.set(draggedEntityId, dragPosition);
      }
    }

    // Animate elastic returns
    const now = performance.now();
    for (const [entityId, ret] of returningEntities.current) {
      const elapsed = now - ret.startTime;
      const t = Math.min(1, elapsed / ELASTIC_RETURN_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = ret.from.x + (ret.to.x - ret.from.x) * eased;
      const y = ret.from.y + (ret.to.y - ret.from.y) * eased;
      const z = ret.from.z + (ret.to.z - ret.from.z) * eased;
      overrides.set(entityId, { x, y, z });

      if (t >= 1) {
        returningEntities.current.delete(entityId);
        overrides.delete(entityId);
      }
    }

    // Clean up stale overrides
    if (!draggedEntityId) {
      for (const id of Array.from(overrides.keys())) {
        if (!returningEntities.current.has(id)) {
          overrides.delete(id);
        }
      }
    }
  });

  // Pre-compute max counts per entity type from the FULL entity list.
  // This lets InstancedMesh allocate once and avoid R3F's buggy swapInstances
  // when the visible count grows during replay.
  const maxCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entity of entities) {
      counts.set(entity.entity_type, (counts.get(entity.entity_type) || 0) + 1);
    }
    return counts;
  }, [entities]);

  // Filter entities
  const visibleEntities = useMemo(() => {
    let next = entities;

    if (filterEntityTypes.size > 0) {
      next = next.filter((e) => filterEntityTypes.has(e.entity_type));
    }

    if (replayFilter) {
      next = next.filter((e) => replayFilter.has(e.id));
    }

    return next;
  }, [entities, filterEntityTypes, replayFilter]);

  // Group by entity type
  const entityGroups = useMemo(() => {
    const groups = new Map<EntityType, Entity[]>();
    for (const entity of visibleEntities) {
      const t = entity.entity_type;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(entity);
    }
    return Array.from(groups.entries()).map(
      ([type, ents]): EntityGroup => ({
        type,
        entities: ents,
        entityIds: ents.map((e) => e.id),
      })
    );
  }, [visibleEntities]);

  // Build connected set for focus mode
  const focusedConnected = useMemo(() => {
    if (!focusedEntityId) return null;
    const relations = useGraphStore.getState().relations;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of relations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId]);

  if (visibleEntities.length === 0) return null;

  return (
    <>
      {entityGroups.map((group) => (
        <TypeGroup
          key={group.type}
          group={group}
          maxCount={maxCounts.get(group.type) || group.entities.length}
          positions={positions}
          positionOverrides={positionOverridesRef.current}
          themeConfig={themeConfig}
          hoveredEntityId={hoveredEntityId}
          selectedEntityId={selectedEntityId}
          focusedConnected={focusedConnected}
          onSelect={(id) => { void selectEntity(id); }}
          onNodePointerDown={handleNodePointerDown}
          onHover={hoverEntity}
          onFocus={focusEntity}
          animatingEntities={animatingEntities}
          pulsingEntities={pulsingEntities}
          reducedMotion={reducedMotion}
          didDragRef={didDragRef}
        />
      ))}
    </>
  );
}
```

=== FILE: frontend/src/components/EdgeLines.tsx ===
```tsx
/**
 * LineSegments-based edge rendering.
 * Batched geometry for all edges — one draw call.
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGraphStore } from "../store/graphStore";
import { useResolvedTheme } from "../store/settingsStore";
import { useReplayStore } from "../store/replayStore";
import type { Relation } from "../lib/types";

const RELATION_ANIM_MS = 300;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function EdgeLines({ replayFilter = null }: { replayFilter?: Set<string> | null }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const animationStartRef = useRef<Map<string, number>>(new Map());

  const relations = useGraphStore((s) => s.relations);
  const positions = useGraphStore((s) => s.positions);
  const themeConfig = useResolvedTheme();
  const focusedEntityId = useGraphStore((s) => s.focusedEntityId);
  const reducedMotion = useGraphStore((s) => s.reducedMotion);

  const animatingRelations = useReplayStore((s) => s.animatingRelations);

  const visibleRelations = useMemo(() => {
    if (!replayFilter) return relations;
    return relations.filter((relation) => replayFilter.has(relation.id));
  }, [relations, replayFilter]);

  // Connected set for focus mode
  const connectedToFocused = useMemo(() => {
    if (!focusedEntityId) return null;
    const connected = new Set<string>([focusedEntityId]);
    for (const r of visibleRelations) {
      if (r.subject_id === focusedEntityId) connected.add(r.object_id);
      if (r.object_id === focusedEntityId) connected.add(r.subject_id);
    }
    return connected;
  }, [focusedEntityId, visibleRelations]);

  // Build geometry with final positions only — animation handled in useFrame
  const geometry = useMemo(() => {
    const edgeColor = new THREE.Color(themeConfig.edgeStyle.color);
    const dimColor = edgeColor.clone().multiplyScalar(0.2);

    const validRelations: Relation[] = [];
    for (const rel of visibleRelations) {
      const pA = positions[rel.subject_id];
      const pB = positions[rel.object_id];
      if (!pA || !pB) continue;
      validRelations.push(rel);
    }

    const verts = new Float32Array(validRelations.length * 6);
    const colors = new Float32Array(validRelations.length * 6);

    for (let i = 0; i < validRelations.length; i += 1) {
      const rel = validRelations[i];
      const pA = positions[rel.subject_id]!;
      const pB = positions[rel.object_id]!;

      let color = edgeColor;
      if (connectedToFocused) {
        const isConnected =
          connectedToFocused.has(rel.subject_id) && connectedToFocused.has(rel.object_id);
        color = isConnected ? edgeColor : dimColor;
      }

      const base = i * 6;
      verts[base] = pA.x;
      verts[base + 1] = pA.y;
      verts[base + 2] = pA.z;
      verts[base + 3] = pB.x;
      verts[base + 4] = pB.y;
      verts[base + 5] = pB.z;

      colors[base] = color.r;
      colors[base + 1] = color.g;
      colors[base + 2] = color.b;
      colors[base + 3] = color.r;
      colors[base + 4] = color.g;
      colors[base + 5] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.userData.validRelations = validRelations;
    return geo;
  }, [visibleRelations, positions, themeConfig, connectedToFocused]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.geometry = geometry;
    }
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // Animation handled entirely in useFrame — no useEffect needed for tracking start times
  useFrame(() => {
    const validRelations = (geometry.userData.validRelations as Relation[] | undefined) ?? [];
    if (validRelations.length === 0) return;

    // Check for drag overrides from the store
    const { draggedEntityId, dragPosition } = useGraphStore.getState();

    if (reducedMotion && !draggedEntityId) {
      if (animationStartRef.current.size > 0) animationStartRef.current.clear();
      return;
    }

    const hasAnimating = animatingRelations.size > 0 || animationStartRef.current.size > 0;
    if (!hasAnimating && !draggedEntityId) return;

    const positionAttr = geometry.getAttribute("position");
    if (!(positionAttr instanceof THREE.BufferAttribute)) return;

    const now = performance.now();
    let changed = false;

    // Clean up finished animations no longer in the animating set
    for (const id of Array.from(animationStartRef.current.keys())) {
      if (!animatingRelations.has(id)) {
        animationStartRef.current.delete(id);
      }
    }

    for (let i = 0; i < validRelations.length; i += 1) {
      const rel = validRelations[i];
      let pA = positions[rel.subject_id];
      let pB = positions[rel.object_id];
      if (!pA || !pB) continue;

      // Apply drag position override
      if (draggedEntityId && dragPosition) {
        if (rel.subject_id === draggedEntityId) pA = dragPosition;
        if (rel.object_id === draggedEntityId) pB = dragPosition;
      }

      const base = i * 6;
      const isAnimating = animatingRelations.has(rel.id);

      if (isAnimating) {
        // Register start time on first encounter
        if (!animationStartRef.current.has(rel.id)) {
          animationStartRef.current.set(rel.id, now);
        }
        const start = animationStartRef.current.get(rel.id)!;
        const t = clamp01((now - start) / RELATION_ANIM_MS);
        const endX = pA.x + (pB.x - pA.x) * t;
        const endY = pA.y + (pB.y - pA.y) * t;
        const endZ = pA.z + (pB.z - pA.z) * t;

        if (
          positionAttr.array[base + 3] !== endX ||
          positionAttr.array[base + 4] !== endY ||
          positionAttr.array[base + 5] !== endZ
        ) {
          positionAttr.array[base + 3] = endX;
          positionAttr.array[base + 4] = endY;
          positionAttr.array[base + 5] = endZ;
          changed = true;
        }
        if (t >= 1) {
          animationStartRef.current.delete(rel.id);
        }
      } else {
        // Non-animated: ensure at correct position (including drag overrides)
        if (
          positionAttr.array[base] !== pA.x ||
          positionAttr.array[base + 1] !== pA.y ||
          positionAttr.array[base + 2] !== pA.z ||
          positionAttr.array[base + 3] !== pB.x ||
          positionAttr.array[base + 4] !== pB.y ||
          positionAttr.array[base + 5] !== pB.z
        ) {
          positionAttr.array[base] = pA.x;
          positionAttr.array[base + 1] = pA.y;
          positionAttr.array[base + 2] = pA.z;
          positionAttr.array[base + 3] = pB.x;
          positionAttr.array[base + 4] = pB.y;
          positionAttr.array[base + 5] = pB.z;
          changed = true;
        }
      }
    }

    if (changed) {
      positionAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
  });

  if (visibleRelations.length === 0 || Object.keys(positions).length === 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={themeConfig.edgeStyle.opacity}
        depthWrite={false}
        fog={false}
      />
    </lineSegments>
  );
}
```