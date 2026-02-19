import { create } from "zustand";
import type { Entity, Relation, Community, Observation, NodePosition, EntityDetail, EntityType } from "../lib/types";
import { fetchGraph, fetchEntity, savePositions } from "../lib/api";

import neuralTheme from "../themes/neural.json";
import cleanTheme from "../themes/clean.json";
import organicTheme from "../themes/organic.json";

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

export const THEMES: Record<string, ThemeConfig> = {
  neural: neuralTheme as ThemeConfig,
  clean: cleanTheme as unknown as ThemeConfig,
  organic: organicTheme as ThemeConfig,
};

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
  theme: string;
  themeConfig: ThemeConfig;
  loading: boolean;
  error: string | null;
  layoutProgress: number;

  // Filters
  filterEntityTypes: Set<string>;
  filterScope: string | null;

  // Actions
  loadGraph: (scope?: string) => Promise<void>;
  selectEntity: (id: string | null) => Promise<void>;
  hoverEntity: (id: string | null) => void;
  focusEntity: (id: string | null) => void;
  setTheme: (name: string) => void;
  setIntermediatePositions: (positions: Record<string, NodePosition>) => void;
  setFinalPositions: (positions: Record<string, NodePosition>) => void;
  persistPositions: () => Promise<void>;
  setLayoutProgress: (p: number) => void;
  toggleEntityTypeFilter: (type: string) => void;
  setFilterScope: (scope: string | null) => void;
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
  theme: "clean",
  themeConfig: cleanTheme as unknown as ThemeConfig,
  loading: false,
  error: null,
  layoutProgress: 0,
  filterEntityTypes: new Set(),
  filterScope: null,

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
    try {
      const detail = await fetchEntity(id);
      set({ selectedEntityDetail: detail });
    } catch {
      // Keep selection but no detail
    }
  },

  hoverEntity: (id) => set({ hoveredEntityId: id }),

  focusEntity: (id) => set({ focusedEntityId: id }),

  setTheme: (name) => {
    const config = THEMES[name];
    if (config) set({ theme: name, themeConfig: config });
  },

  setIntermediatePositions: (positions) => set({ positions }),

  setFinalPositions: (positions) => set({ positions, positionsValid: true }),

  persistPositions: async () => {
    const { positions, layoutHash } = get();
    if (Object.keys(positions).length > 0) {
      await savePositions(positions, layoutHash);
    }
  },

  setLayoutProgress: (p) => set({ layoutProgress: p }),

  toggleEntityTypeFilter: (type) => {
    const current = new Set(get().filterEntityTypes);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    set({ filterEntityTypes: current });
  },

  setFilterScope: (scope) => set({ filterScope: scope }),
}));
