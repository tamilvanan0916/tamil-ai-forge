import { create } from 'zustand';

interface SelectionStore {
  selectedClipIds: Set<string>;
  primaryClipId: string | null;

  selectClip: (id: string, addToSelection?: boolean) => void;
  toggleClipSelected: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedClipIds: new Set<string>(),
  primaryClipId: null,

  selectClip: (id: string, addToSelection = false) => {
    set((state) => {
      if (addToSelection) {
        const next = new Set(state.selectedClipIds);
        next.add(id);
        return { selectedClipIds: next, primaryClipId: id };
      }
      return { selectedClipIds: new Set([id]), primaryClipId: id };
    });
  },

  toggleClipSelected: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedClipIds);
      if (next.has(id)) {
        next.delete(id);
        const primary = next.size > 0 ? [...next][next.size - 1] : null;
        return { selectedClipIds: next, primaryClipId: primary };
      } else {
        next.add(id);
        return { selectedClipIds: next, primaryClipId: id };
      }
    });
  },

  clearSelection: () => set({ selectedClipIds: new Set(), primaryClipId: null }),

  isSelected: (id: string) => get().selectedClipIds.has(id),
}));
