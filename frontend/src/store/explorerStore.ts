import { create } from "zustand";
import type { FileItem, FolderItem } from "../types/files";

export type ExplorerTarget =
  | { type: "folder"; item: FolderItem }
  | { type: "file"; item: FileItem };

interface ExplorerStore {
  renameTarget: ExplorerTarget | null;
  deleteTarget: ExplorerTarget | null;
  moveTarget: ExplorerTarget | null;
  propertiesTarget: ExplorerTarget | null;
  newFolderOpen: boolean;
  newFolderParentSlug: string | null;
  expandedSlugs: Set<string>;

  setRenameTarget: (target: ExplorerTarget | null) => void;
  setDeleteTarget: (target: ExplorerTarget | null) => void;
  setMoveTarget: (target: ExplorerTarget | null) => void;
  setPropertiesTarget: (target: ExplorerTarget | null) => void;
  setNewFolderOpen: (open: boolean) => void;
  setNewFolderParentSlug: (slug: string | null) => void;
  setExpanded: (slug: string, expanded: boolean) => void;
  toggleExpanded: (slug: string) => void;

  clearAllTargets: () => void;
}

export const useExplorerStore = create<ExplorerStore>((set) => ({
  renameTarget: null,
  deleteTarget: null,
  moveTarget: null,
  propertiesTarget: null,
  newFolderOpen: false,
  newFolderParentSlug: null,
  expandedSlugs: new Set<string>(),

  setRenameTarget: (target) => set({ renameTarget: target }),
  setDeleteTarget: (target) => set({ deleteTarget: target }),
  setMoveTarget: (target) => set({ moveTarget: target }),
  setPropertiesTarget: (target) => set({ propertiesTarget: target }),
  setNewFolderOpen: (open) => set({ newFolderOpen: open }),
  setNewFolderParentSlug: (slug) => set({ newFolderParentSlug: slug }),
  setExpanded: (slug, expanded) =>
    set((state) => {
      const next = new Set(state.expandedSlugs);
      if (expanded) next.add(slug);
      else next.delete(slug);
      return { expandedSlugs: next };
    }),
  toggleExpanded: (slug) =>
    set((state) => {
      const next = new Set(state.expandedSlugs);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { expandedSlugs: next };
    }),

  clearAllTargets: () =>
    set({
      renameTarget: null,
      deleteTarget: null,
      moveTarget: null,
      propertiesTarget: null,
      newFolderOpen: false,
      newFolderParentSlug: null,
      expandedSlugs: new Set<string>(),
    }),
}));
