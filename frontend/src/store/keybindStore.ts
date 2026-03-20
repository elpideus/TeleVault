import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ActionId, DEFAULT_BINDINGS } from "../lib/keybinds";

interface KeybindStore {
  bindings: Record<ActionId, string>;
  setBinding: (action: ActionId, combo: string) => void;
  resetBindings: () => void;
}

export const useKeybindStore = create<KeybindStore>()(
  persist(
    (set) => ({
      bindings: { ...DEFAULT_BINDINGS },
      setBinding: (action, combo) =>
        set((s) => ({ bindings: { ...s.bindings, [action]: combo } })),
      resetBindings: () => set({ bindings: { ...DEFAULT_BINDINGS } }),
    }),
    { name: "televault-keybinds" },
  ),
);
