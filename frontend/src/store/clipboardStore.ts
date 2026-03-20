import { create } from "zustand";

export type ClipboardAction = "copy" | "cut";

interface ClipboardItem {
  id: string;
  type: "file" | "folder";
  name: string;
}

interface ClipboardStore {
  items: ClipboardItem[];
  action: ClipboardAction | null;
  sourceSlug: string; // The folder slug where items were copied from
  copy: (items: ClipboardItem[], sourceSlug: string) => void;
  cut: (items: ClipboardItem[], sourceSlug: string) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  items: [],
  action: null,
  sourceSlug: "",
  copy: (items, sourceSlug) => set({ items, action: "copy", sourceSlug }),
  cut: (items, sourceSlug) => set({ items, action: "cut", sourceSlug }),
  clear: () => set({ items: [], action: null, sourceSlug: "" }),
}));
