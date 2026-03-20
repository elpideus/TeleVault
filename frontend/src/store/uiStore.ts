import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "grid" | "list" | "details";
export type SortField = "name" | "date" | "size";
export type SortDirection = "asc" | "desc";

export interface SortPref {
  field: SortField;
  direction: SortDirection;
}

export type ActivePanel = "activity" | null;

interface UIStore {
  sidebarWidth: number;
  activePanel: ActivePanel;
  commandPaletteOpen: boolean;
  searchOpen: boolean;
  folderViewModes: Record<string, ViewMode>;
  folderSortPrefs: Record<string, SortPref>;
  visibleColumns: string[];
  toggleColumn: (column: string) => void;
  setSidebarWidth: (width: number) => void;
  setActivePanel: (panel: ActivePanel) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  getViewMode: (slug: string) => ViewMode;
  setViewMode: (slug: string, mode: ViewMode) => void;
  getSortPref: (slug: string) => SortPref;
  setSortPref: (slug: string, pref: SortPref) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  hasSeenDisclaimer: boolean;
  setHasSeenDisclaimer: (value: boolean) => void;
  hasSeenDonationModal: boolean;
  setHasSeenDonationModal: (value: boolean) => void;
  resetOnboarding: () => void;
}

const DEFAULT_SORT_PREF: SortPref = { field: "name", direction: "asc" };
const DEFAULT_VISIBLE_COLUMNS = ["name", "size", "type", "modified"];

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarWidth: 240,
      activePanel: null,
      commandPaletteOpen: false,
      searchOpen: false,
      folderViewModes: {},
      folderSortPrefs: {},
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      toggleColumn: (column) =>
        set((s) => ({
          visibleColumns: s.visibleColumns.includes(column)
            ? s.visibleColumns.filter((c) => c !== column)
            : [...s.visibleColumns, column],
        })),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSearchOpen: (open) => set({ searchOpen: open }),
      getViewMode: (slug) => get().folderViewModes[slug] ?? "grid",
      setViewMode: (slug, mode) =>
        set((s) => ({
          folderViewModes: { ...s.folderViewModes, [slug]: mode },
        })),
      getSortPref: (slug) => get().folderSortPrefs[slug] ?? DEFAULT_SORT_PREF,
      setSortPref: (slug, pref) =>
        set((s) => ({
          folderSortPrefs: { ...s.folderSortPrefs, [slug]: pref },
        })),
      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      hasSeenDisclaimer: false,
      setHasSeenDisclaimer: (value) => set({ hasSeenDisclaimer: value }),
      hasSeenDonationModal: false,
      setHasSeenDonationModal: (value) => set({ hasSeenDonationModal: value }),
      resetOnboarding: () =>
        set({
          hasSeenDisclaimer: false,
          hasSeenDonationModal: false,
        }),
    }),
    {
      name: "televault-ui",
      partialize: (s) => ({
        sidebarWidth: s.sidebarWidth,
        folderViewModes: s.folderViewModes,
        folderSortPrefs: s.folderSortPrefs,
        visibleColumns: s.visibleColumns,
        hasSeenDisclaimer: s.hasSeenDisclaimer,
        hasSeenDonationModal: s.hasSeenDonationModal,
      }),
    },
  ),
);
