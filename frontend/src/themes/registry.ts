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
  clean: cleanTheme as unknown as ThemeConfig,
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
