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
