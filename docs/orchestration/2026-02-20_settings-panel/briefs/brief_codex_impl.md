## TASK

Implement the settings panel, navigation speed control, zoom sensitivity fix, and theme customization system for the Brain Viewer project. Output the COMPLETE source code for every file that needs to be created or modified.

## SKILL

No specific skill — use React/TypeScript/Three.js best practices.

## INPUT

Read and understand these files before writing any code:

- **Design document** (corrected, post-review): `C:/Users/matti/Dev/Brain_viewer/docs/plans/2026-02-20-settings-panel-design.md`
- **Review findings**: `C:/Users/matti/Dev/Brain_viewer/docs/orchestration/2026-02-20_settings-panel/synthesis/round_1_synthesis.md`
- **Current source files** (read ALL of these):
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/graphStore.ts`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/store/uiStore.ts`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/App.tsx`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/GraphScene.tsx`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/NodeMesh.tsx`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/EdgeLines.tsx`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/components/ThemePicker.tsx`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/lib/types.ts`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/neural.json`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/clean.json`
  - `C:/Users/matti/Dev/Brain_viewer/frontend/src/themes/organic.json`

## OUTPUT

Output your COMPLETE deliverable as your final response. Do NOT write to any file.

For each file, output the COMPLETE file content (not diffs, not fragments) in this format:

```
=== FILE: frontend/src/themes/registry.ts ===
[complete file content]

=== FILE: frontend/src/store/settingsStore.ts ===
[complete file content]

=== FILE: frontend/src/components/SettingsPanel.tsx ===
[complete file content]

=== FILE: frontend/src/components/SpeedIndicator.tsx ===
[complete file content]

=== FILE: frontend/src/store/graphStore.ts ===
[complete modified file content]

=== FILE: frontend/src/App.tsx ===
[complete modified file content]

=== FILE: frontend/src/components/GraphScene.tsx ===
[complete modified file content]

=== FILE: frontend/src/components/NodeMesh.tsx ===
[complete modified file content]

=== FILE: frontend/src/components/EdgeLines.tsx ===
[complete modified file content]
```

## IMPLEMENTATION SPEC

### 1. `frontend/src/themes/registry.ts` (NEW)

Extract from graphStore.ts:
- Export `ThemeConfig` interface (exact same shape as current)
- Export `BUILTIN_THEMES: Record<string, ThemeConfig>` (import all 3 JSON files)
- Export `ENTITY_TYPES: EntityType[]` — all 9 types for validation
- Export `validateThemeConfig(obj: unknown): obj is ThemeConfig` — validates full schema: checks name (string), background (string), ambientLight ({color, intensity}), directionalLight ({color, intensity}), nodeColors (all 9 entity types present as strings), edgeStyle ({color, opacity, linewidth}), nodeMaterial ({emissive, metalness, roughness}). Clamp numeric ranges. Return false on any failure.
- Export `mergeTheme(base: ThemeConfig, overrides: Partial<ThemeConfig> | null): ThemeConfig` — deep merge for nested objects (nodeColors, nodeMaterial, edgeStyle, postProcessing, ambientLight, directionalLight, fog)
- Export `getCleanDefaults(): ThemeConfig` — returns the clean theme as the default fallback

Import EntityType from `../lib/types`.

### 2. `frontend/src/store/settingsStore.ts` (NEW)

Zustand store with `persist` middleware:

```typescript
interface SettingsState {
  navSpeed: number;           // multiplier, default 1.0
  zoomSensitivity: number;    // default 0.5
  activeTheme: string;        // key into BUILTIN_THEMES or customThemes, default "clean"
  themeOverrides: Partial<ThemeConfig> | null;  // live edits, null when clean
  customThemes: Record<string, ThemeConfig>;    // user-saved themes
  showSettings: boolean;      // panel visibility

  // Actions
  setNavSpeed: (speed: number) => void;        // clamp to [0.1, 10.0]
  incrementNavSpeed: () => void;               // +0.25, clamped
  decrementNavSpeed: () => void;               // -0.25, clamped
  setZoomSensitivity: (v: number) => void;     // clamp to [0.1, 2.0]
  setActiveTheme: (name: string) => void;      // clears overrides
  setThemeOverride: <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => void;
  clearOverrides: () => void;
  saveCustomTheme: (name: string) => void;     // merges base+overrides, stores in customThemes
  overwriteCustomTheme: () => void;            // overwrite current custom theme in place
  deleteCustomTheme: (name: string) => void;   // falls back to "clean" if active
  importTheme: (config: ThemeConfig) => void;  // validate first, reject if invalid
  resetToDefaults: () => void;                 // clears overrides, reverts to base theme values
  setShowSettings: (v: boolean) => void;
}
```

Constants:
```typescript
export const NAV_SPEED_BASE = 500;
export const NAV_SPEED_STEP = 0.25;
export const NAV_SPEED_MIN = 0.1;
export const NAV_SPEED_MAX = 10.0;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2.0;
export const ZOOM_DEFAULT = 0.5;
```

Persist config:
- `name: "brain-viewer-settings"`
- `version: 1`
- `partialize`: exclude `showSettings` (don't persist panel visibility)
- Custom `storage` that wraps localStorage in try/catch

Export a derived selector:
```typescript
export function useResolvedTheme(): ThemeConfig
```
This reads `activeTheme`, looks it up in `BUILTIN_THEMES` or `customThemes`, falls back to clean, then applies `mergeTheme(base, themeOverrides)`.

Also export:
```typescript
export function useActiveThemeName(): string  // with asterisk if overrides exist
export function useIsCustomTheme(): boolean   // true if activeTheme is in customThemes
```

### 3. `frontend/src/components/SpeedIndicator.tsx` (NEW)

Two elements:
- **Toast**: absolutely positioned at `bottom: 60px, left: 50%, transform: translateX(-50%)`. Shows `"{navSpeed}x"`. Visible for 1.5s after any speed change, then fades out (CSS opacity transition). Use a local `visible` state + timeout ref. Reset timeout on every navSpeed change.
- **Corner badge**: absolutely positioned at `bottom: 12px, right: 52px` (left of the Home button). Shows `"{navSpeed}x"`. Only visible when `navSpeed !== 1.0`. Semi-transparent, small font (11px).

Style: dark pill background `rgba(0,0,0,0.7)`, white text, `Inter` font, `zIndex: 20`.

Subscribe to `useSettingsStore((s) => s.navSpeed)`.

### 4. `frontend/src/components/SettingsPanel.tsx` (NEW)

Slide-out drawer from the right:
- Width: 300px
- CSS transition: `transform 0.2s ease` (translateX(100%) when hidden, 0 when shown)
- Position: absolute, top 0, right 0, bottom 0
- Background: `rgba(20, 20, 20, 0.95)`, border-left: `1px solid #333`
- zIndex: 30 (above everything)
- Overflow-y: auto, custom scrollbar styling

Header: "Settings" + close button (X icon, top-right)

**Navigation section** (collapsible):
- Speed slider: range [0.1, 10.0], step 0.25, shows value like "1.0x"
- Zoom slider: range [0.1, 2.0], step 0.1, shows value like "0.5"

**Theme section** (collapsible):
- Theme dropdown: lists all built-in + custom themes. Shows asterisk on active if overrides exist. Custom themes have a delete (trash) icon.
- Action buttons row: "Save as..." (prompts via window.prompt), "Save" (only if custom theme), "Export" (downloads JSON), "Import" (file input)
- Background color picker
- Ambient light: color picker + intensity slider (0-2, step 0.1)
- Directional light: color picker + intensity slider (0-3, step 0.1)
- Node colors: 9 color pickers, one per entity type (capitalize label)
- Node material: 3 sliders — emissive (0-1, step 0.05), metalness (0-1, step 0.05), roughness (0-1, step 0.05)
- Edge style: color picker + opacity slider (0-1, step 0.05)
- Post-processing: bloom enabled checkbox + intensity slider (0-3, step 0.1) + threshold slider (0-1, step 0.05)
- Fog: enabled checkbox (null vs object) + color picker + near slider + far slider

"Reset to defaults" button at bottom.

**Slider component**: inline — label on left, slider in middle, value display on right. Use native `<input type="range">`. Apply throttling with requestAnimationFrame: store the pending value in a ref, only call the setter in a rAF callback. This prevents flooding the store on rapid slider movement.

**Color picker**: small square swatch + native `<input type="color">` (hidden, triggered by click on swatch). Show hex value next to swatch.

**Collapsible section**: clickable header with chevron (> / v), CSS transition on max-height.

### 5. Modify `frontend/src/store/graphStore.ts`

- REMOVE: `import neuralTheme`, `import cleanTheme`, `import organicTheme`
- REMOVE: `ThemeConfig` interface (moved to registry.ts)
- REMOVE: `THEMES` constant (moved to registry.ts as `BUILTIN_THEMES`)
- REMOVE from GraphState interface: `theme: string`, `themeConfig: ThemeConfig`, `setTheme`
- REMOVE from initial state: `theme: "clean"`, `themeConfig: cleanTheme as unknown as ThemeConfig`
- REMOVE: `setTheme` action implementation
- KEEP everything else unchanged (entities, relations, positions, selections, etc.)
- Import `ThemeConfig` from `../themes/registry` for any remaining type references if needed (but there should be none since NodeMesh/EdgeLines will import from registry directly)

### 6. Modify `frontend/src/App.tsx`

- REMOVE: `import { ThemePicker }` and `<ThemePicker />` from JSX
- ADD: `import { SettingsPanel }` and `import { SpeedIndicator }`
- ADD: `import { useSettingsStore }` for `showSettings` and `setShowSettings`
- ADD gear button in HUD (top-right, where ThemePicker was):
  ```tsx
  <button onClick={() => setShowSettings(!showSettings)} title="Settings" style={{
    position: "absolute", top: 12, right: 12, zIndex: 20,
    background: "rgba(0,0,0,0.6)", border: "1px solid #555", borderRadius: 8,
    padding: "6px 12px", color: "#aaa", fontSize: 14, cursor: "pointer",
    fontFamily: "'Inter', system-ui, sans-serif"
  }}>⚙</button>
  ```
- ADD `<SettingsPanel />` and `<SpeedIndicator />` to JSX
- Modify Escape handler: if `showSettings` is true, close settings first (before other Escape cascades)
- ADD `showSettings` and `setShowSettings` to the useEffect dependency array

### 7. Modify `frontend/src/components/GraphScene.tsx`

In `CameraController`:
- Import `useSettingsStore` and read `navSpeed`, `zoomSensitivity`, `incrementNavSpeed`, `decrementNavSpeed`, `showSettings`
- Change `NAV_SPEED = 150` to `NAV_SPEED = 500`
- Expand `NAV_KEYS` to include `"r"` and `"f"`
- In the keydown handler: if key is `"r"`, call `incrementNavSpeed()`. If `"f"`, call `decrementNavSpeed()`. Only process R/F if `showSettings` is false (don't change speed while typing in settings).
- In `useFrame`: change `const speed = NAV_SPEED * delta` to `const speed = NAV_SPEED * navSpeed * delta`
- Change `zoomSpeed={2}` to `zoomSpeed={zoomSensitivity}` on TrackballControls

In `SceneContent`:
- Replace `const themeConfig = useGraphStore((s) => s.themeConfig)` with `const themeConfig = useResolvedTheme()` from settingsStore
- Import `useResolvedTheme` from `../store/settingsStore`

In `GraphScene` (the outer component):
- Replace `const themeConfig = useGraphStore((s) => s.themeConfig)` with `const themeConfig = useResolvedTheme()` from settingsStore

### 8. Modify `frontend/src/components/NodeMesh.tsx`

- Change `import { useGraphStore, type ThemeConfig } from "../store/graphStore"` to:
  - `import { useGraphStore } from "../store/graphStore"`
  - `import type { ThemeConfig } from "../themes/registry"`
  - `import { useResolvedTheme } from "../store/settingsStore"`
- In the `NodeMesh` component: replace `const themeConfig = useGraphStore((s) => s.themeConfig)` with `const themeConfig = useResolvedTheme()`
- Everything else stays the same (TypeGroup receives themeConfig as prop)

### 9. Modify `frontend/src/components/EdgeLines.tsx`

- Change `import { useGraphStore } from "../store/graphStore"` — keep it but also add:
  - `import { useResolvedTheme } from "../store/settingsStore"`
- Replace `const themeConfig = useGraphStore((s) => s.themeConfig)` with `const themeConfig = useResolvedTheme()`

## CONSTRAINTS

1. **DO NOT change InstancedMesh args.** The current fix for R3F v9 swapInstances bug relies on stable `args` (sharedGeom, materialRef.current, maxCount). Theme changes must only update material properties in-place — never recreate the material or change the geometry/maxCount args.

2. **Material updates must be in-place.** In TypeGroup's `useEffect([themeConfig, type])`, the existing pattern of `mat.color.set(...)`, `mat.emissive.set(...)` etc. is correct. Do not change this to create a new material.

3. **No new dependencies.** Use only native HTML elements and existing zustand features.

4. **Preserve all existing functionality.** WASD navigation, drag, selection, focus, replay, timeline, filters — all must continue to work.

5. **TypeScript strict mode.** No `any` types except where the existing code already uses them (e.g., TrackballControls refs).

6. **Edge geometry rebuild is OK for color changes.** EdgeLines rebuilds geometry in `useMemo` when themeConfig changes — this is acceptable. The concern is only about InstancedMesh stability.

7. **Consistent styling.** Match the existing HUD component style: dark semi-transparent backgrounds, #aaa text, Inter font, 12px base size, 8px border-radius.
