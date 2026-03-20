import { create } from "zustand";

interface SelectionStore {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  select: (id: string) => void;
  toggleSelect: (id: string) => void;
  rangeSelect: (ids: string[], anchorId: string, targetId: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionStore>()((set, get) => ({
  selectedIds: new Set(),
  lastSelectedId: null,
  select: (id) =>
    set({ selectedIds: new Set([id]), lastSelectedId: id }),
  toggleSelect: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next, lastSelectedId: id });
  },
  rangeSelect: (ids, anchorId, targetId) => {
    const anchorIdx = ids.indexOf(anchorId);
    const targetIdx = ids.indexOf(targetId);
    if (anchorIdx === -1 || targetIdx === -1) return;
    const [start, end] = anchorIdx < targetIdx
      ? [anchorIdx, targetIdx]
      : [targetIdx, anchorIdx];
    const rangeIds = ids.slice(start, end + 1);
    set({ selectedIds: new Set(rangeIds), lastSelectedId: targetId });
  },
  selectMany: (ids) =>
    set({ selectedIds: new Set(ids), lastSelectedId: ids[ids.length - 1] ?? null }),
  clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),
}));
