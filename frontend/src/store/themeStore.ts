import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThemeManifest {
  id: string;
  name: string;
  description: string;
  preview: string; // hex color for swatch
  hasComponentOverrides: boolean;
}

interface ThemeStore {
  activeTheme: string;
  availableThemes: ThemeManifest[];
  pendingReload: boolean; // true when a Tier 2 theme was selected but not yet reloaded
  setAvailableThemes: (themes: ThemeManifest[]) => void;
  setTheme: (id: string) => void;
  confirmReload: () => void;
  dismissReload: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      activeTheme: import.meta.env.VITE_THEME ?? "default",
      availableThemes: [],
      pendingReload: false,
      setAvailableThemes: (themes) => set({ availableThemes: themes }),
      setTheme: (id) => {
        const manifest = get().availableThemes.find((t) => t.id === id);
        if (manifest?.hasComponentOverrides) {
          // Save selection, flag for reload notice — don't remount
          set({ activeTheme: id, pendingReload: true });
        } else {
          // Instant switch — ThemeProvider handles CSS injection
          set({ activeTheme: id, pendingReload: false });
        }
      },
      confirmReload: () => window.location.reload(),
      dismissReload: () => set({ pendingReload: false }),
    }),
    { name: "televault-theme" },
  ),
);
