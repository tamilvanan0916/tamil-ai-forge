import { create } from 'zustand';

interface SelectionStore {
  selectedClipIds: Set<string>;
  primaryClipId: string | null;

  selectClip: (id: string, addToSelection?: boolean) => void;
  selectClips: (ids: string[], primaryId?: string) => void;
  selectRange: (ids: string[], primaryId?: string) => void;
  selectAll: (ids: string[]) => void;
  toggleClipSelected: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: () => number;
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

  selectClips: (ids: string[], primaryId?: string) => {
    const next = new Set(ids);
    const primary = primaryId || (ids.length > 0 ? ids[ids.length - 1] : null);
    set({ selectedClipIds: next, primaryClipId: primary });
  },

  selectRange: (ids: string[], primaryId?: string) => {
    set((state) => {
      const next = new Set(state.selectedClipIds);
      for (const id of ids) {
        next.add(id);
      }
      const primary = primaryId || (ids.length > 0 ? ids[ids.length - 1] : state.primaryClipId);
      return { selectedClipIds: next, primaryClipId: primary };
    });
  },

  selectAll: (ids: string[]) => {
    set({
      selectedClipIds: new Set(ids),
      primaryClipId: ids.length > 0 ? ids[0] : null,
    });
  },

  toggleClipSelected: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedClipIds);
      if (next.has(id)) {
        next.delete(id);
        const remaining = Array.from(next);
        const primary = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        return { selectedClipIds: next, primaryClipId: primary };
      } else {
        next.add(id);
        return { selectedClipIds: next, primaryClipId: id };
      }
    });
  },

  clearSelection: () => set({ selectedClipIds: new Set(), primaryClipId: null }),

  isSelected: (id: string) => get().selectedClipIds.has(id),

  selectedCount: () => get().selectedClipIds.size,
}));

if (typeof window !== 'undefined') {
  (window as any).__selectionStore = useSelectionStore;
}
