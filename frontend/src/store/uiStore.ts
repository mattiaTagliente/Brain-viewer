import { create } from "zustand";

interface UIState {
  showDetailPanel: boolean;
  showFilters: boolean;
  showTimeline: boolean;
  showActivityLog: boolean;

  setShowDetailPanel: (v: boolean) => void;
  setShowFilters: (v: boolean) => void;
  setShowTimeline: (v: boolean) => void;
  setShowActivityLog: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showDetailPanel: true,
  showFilters: false,
  showTimeline: true,
  showActivityLog: false,

  setShowDetailPanel: (v) => set({ showDetailPanel: v }),
  setShowFilters: (v) => set({ showFilters: v }),
  setShowTimeline: (v) => set({ showTimeline: v }),
  setShowActivityLog: (v) => set({ showActivityLog: v }),
}));
