import { useEffect, useMemo, useRef, useState } from "react";
import {
  NAV_SPEED_MAX,
  NAV_SPEED_MIN,
  ORBIT_DAMPING_MAX,
  ORBIT_DAMPING_MIN,
  ORBIT_MAX,
  ORBIT_MIN,
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
  const orbitSensitivity = useSettingsStore((s) => s.orbitSensitivity);
  const orbitDamping = useSettingsStore((s) => s.orbitDamping);
  const setNavSpeed = useSettingsStore((s) => s.setNavSpeed);
  const setZoomSensitivity = useSettingsStore((s) => s.setZoomSensitivity);
  const setOrbitSensitivity = useSettingsStore((s) => s.setOrbitSensitivity);
  const setOrbitDamping = useSettingsStore((s) => s.setOrbitDamping);

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
          <SliderRow
            label="Orbit"
            min={ORBIT_MIN}
            max={ORBIT_MAX}
            step={0.1}
            value={orbitSensitivity}
            onChange={(value) => setOrbitSensitivity(value)}
            formatValue={(value) => formatSliderValue(value)}
          />
          <SliderRow
            label="Damping"
            min={ORBIT_DAMPING_MIN}
            max={ORBIT_DAMPING_MAX}
            step={0.01}
            value={orbitDamping}
            onChange={(value) => setOrbitDamping(value)}
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
