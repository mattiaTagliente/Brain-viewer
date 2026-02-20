# Settings Panel, Navigation Speed & Theme Customization

**Date**: 2026-02-20
**Status**: corrected (post-review round 1)

## Overview

Add a settings panel, keyboard-controlled navigation speed, reduced zoom sensitivity, and a full theme customization system with save/load to the Brain Viewer 3D knowledge graph visualizer.

## Features

### 1. Navigation Speed Control (R/F keys)

- Base speed: `NAV_SPEED = 500` units/s (up from 150)
- `navSpeed` multiplier in settingsStore, default 1.0
- Range: 0.1x (50 u/s) to 10x (5000 u/s), 0.25x increments
- `R` key increases, `F` key decreases (added to CameraController keydown handler)
- Speed HUD (`SpeedIndicator.tsx`):
  - **Toast**: centered-bottom label (e.g. "1.5x") on R/F press, fades out after ~1s (CSS animation, timeout reset on repeated press)
  - **Corner badge**: subtle bottom-right indicator when `navSpeed !== 1.0`, disappears at default speed

### 2. Zoom Sensitivity Fix

- Current `zoomSpeed={2}` on TrackballControls is too sensitive
- New `zoomSensitivity` setting in settingsStore, default 0.5 (effective zoomSpeed = 0.5, a 4x reduction)
- Range: 0.1 to 2.0
- `<TrackballControls zoomSpeed={zoomSensitivity}>` reads directly from store
- Adjustable via slider in settings panel

### 3. Settings Panel (slide-out drawer)

A `SettingsPanel.tsx` slide-out drawer from the right edge, toggled by a gear icon button in the top-right HUD.

**Layout**:
```
┌─ Settings ──────────── [x] ─┐
│                              │
│ > Navigation                 │
│   Speed: ══════●══ 1.0x      │
│   Zoom:  ══●══════ 0.5       │
│                              │
│ > Theme                      │
│   Active: [Neural v]         │
│   [Save as...] [Export] [Import]│
│                              │
│   Background: [# #000000]    │
│                              │
│   Node colors:               │
│     concept:   [# #00ccff]   │
│     method:    [# #ff6600]   │
│     parameter: [# #00ff88]   │
│     dataset:   [# #ffcc00]   │
│     finding:   [# #ff3366]   │
│     pitfall:   [# #ff0044]   │
│     tool:      [# #9966ff]   │
│     decision:  [# #33cccc]   │
│     person:    [# #ff99cc]   │
│                              │
│   Node material:             │
│     Emissive:  ══●══ 0.5     │
│     Metalness: ══●══ 0.3     │
│     Roughness: ══●══ 0.4     │
│                              │
│   Edges:                     │
│     Color:   [# #5599ff]     │
│     Opacity: ══════●═ 0.7    │
│                              │
│   Post-processing:           │
│     Bloom: [v]               │
│     Intensity: ══●══ 1.0     │
│     Threshold: ══●══ 0.4     │
│                              │
│ [Reset to defaults]          │
└──────────────────────────────┘
```

**Behaviors**:
- Collapsible sections (Navigation, Theme), both expanded by default
- Width ~280px, consistent with detail panel styling
- All sliders update the 3D scene live via store subscription, throttled at 50ms to prevent render storms on large graphs
- Color pickers use native `<input type="color">` (no extra dependencies)
- "Reset to defaults" restores built-in theme's original values

### 4. Theme Customization & Save/Load

**Data model**:
- Built-in themes (read-only): `THEMES` map in `frontend/src/themes/registry.ts` (neural, clean, organic) — extracted to a neutral module to avoid circular imports between graphStore and settingsStore
- Custom themes (read-write): `settingsStore.customThemes` persisted to localStorage
- Active theme: `settingsStore.activeTheme` (key string)
- Live edits: `settingsStore.themeOverrides` (partial delta, null when no unsaved changes)

**Editing flow**:
1. User selects a base theme from the dropdown (built-in or custom)
2. Any slider/color change creates `themeOverrides` delta; scene renders `merge(baseTheme, overrides)` in real time
3. Dropdown label shows `"Neural*"` (asterisk) when unsaved overrides exist
4. "Save as..." prompts for name, stores merged theme as new `customThemes` entry, clears overrides, switches activeTheme
5. If active theme is already custom, an additional "Save" button overwrites in place

**Export**: serializes resolved theme (base + overrides merged) to `.json` via `URL.createObjectURL` + anchor click. Filename: `brain-viewer-theme-{name}.json`.

**Import**: `<input type="file" accept=".json">` -> parse -> validate against full `ThemeConfig` schema (all required fields: `name`, `background`, `ambientLight`, `directionalLight`, `nodeColors` with all 9 entity types, `edgeStyle`, `nodeMaterial`; clamp numeric ranges) -> reject with user-visible error if invalid -> add to `customThemes` -> switch to it. Missing optional fields (`fog`, `postProcessing`) filled from clean theme defaults.

**Delete**: custom themes get a trash icon in the dropdown. Built-in themes cannot be deleted. Deleting active theme falls back to `"clean"`.

## Architecture

### New files
- `frontend/src/themes/registry.ts` — `ThemeConfig` type, `THEMES` built-in map, `validateThemeConfig()` function, `mergeTheme()` helper. Neutral module imported by both stores — prevents circular imports (B1 fix).
- `frontend/src/store/settingsStore.ts` — Zustand store with `persist` middleware (version: 1, with migrate function for forward compat)
- `frontend/src/components/SettingsPanel.tsx` — slide-out drawer with all settings UI
- `frontend/src/components/SpeedIndicator.tsx` — toast + corner badge for nav speed

### Modified files
- `frontend/src/components/GraphScene.tsx` — CameraController reads `navSpeed` and `zoomSensitivity` from settingsStore; R/F key handlers added (ignored when settings panel is open or focus is on input); `NAV_SPEED` changed to 500
- `frontend/src/store/graphStore.ts` — `theme`/`themeConfig`/`setTheme` removed; `THEMES` map moved to `themes/registry.ts`. Theme access now via settingsStore's `resolvedTheme` selector.
- `frontend/src/App.tsx` — render `<SettingsPanel>` and `<SpeedIndicator>`, add gear button to HUD, `Escape` closes settings panel if open (priority over other Escape actions)
- `frontend/src/components/ThemePicker.tsx` — removed (subsumed by settings panel theme section)
- `frontend/src/components/NodeMesh.tsx` — reads theme from new resolved selector
- `frontend/src/components/EdgeLines.tsx` — reads theme from new resolved selector

### Not changed
- Backend (no API changes)
- Web Worker (layout unchanged)
- replayStore, timeline, detail panel

### Dependencies
- None added. Native `<input type="color">` and `<input type="range">` for UI controls. Zustand `persist` middleware ships with zustand.

### Render subscription strategy
- settingsStore exposes granular selectors: `useNavSpeed()`, `useZoomSensitivity()`, `useResolvedTheme()`, `useActiveThemeName()`
- Components subscribe only to the slice they need (e.g., NodeMesh subscribes to `useResolvedTheme().nodeColors` via shallow compare)
- Slider onChange handlers are throttled at 50ms using a local ref + requestAnimationFrame pattern
- Material property changes (emissive, metalness, roughness) update the existing material in-place via `material.emissive.setScalar()` etc. — no material recreation, no InstancedMesh args change
- Edge opacity/color changes update the existing LineBasicMaterial in-place — no geometry rebuild

## Settings Store Schema

```typescript
interface SettingsState {
  // Navigation
  navSpeed: number;           // multiplier, default 1.0
  zoomSensitivity: number;    // default 0.5

  // Theme
  activeTheme: string;        // key into THEMES (built-in) or customThemes
  themeOverrides: Partial<ThemeConfig> | null;
  customThemes: Record<string, ThemeConfig>;

  // Panel
  showSettings: boolean;

  // Actions
  setNavSpeed: (speed: number) => void;
  incrementNavSpeed: () => void;
  decrementNavSpeed: () => void;
  setZoomSensitivity: (sensitivity: number) => void;
  setActiveTheme: (name: string) => void;
  setThemeOverride: (path: string, value: any) => void;
  clearOverrides: () => void;
  saveCustomTheme: (name: string) => void;
  deleteCustomTheme: (name: string) => void;
  importTheme: (config: ThemeConfig) => void;
  resetToDefaults: () => void;
  setShowSettings: (show: boolean) => void;
}
```

## Constants

```typescript
const NAV_SPEED = 500;              // base units/second
const NAV_SPEED_STEP = 0.25;        // multiplier increment
const NAV_SPEED_MIN = 0.1;          // minimum multiplier
const NAV_SPEED_MAX = 10.0;         // maximum multiplier
const ZOOM_SENSITIVITY_MIN = 0.1;
const ZOOM_SENSITIVITY_MAX = 2.0;
const ZOOM_SENSITIVITY_DEFAULT = 0.5;
```
