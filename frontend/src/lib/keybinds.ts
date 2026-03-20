export type ActionId =
  | "rename"
  | "delete"
  | "newFolder"
  | "upload"
  | "copy"
  | "paste"
  | "selectAll"
  | "openProperties"
  | "toggleSidebar"
  | "openCommandPalette"
  | "openSearch"
  | "viewGrid"
  | "viewList"
  | "viewDetails"
  | "navigateBack"
  | "navigateForward";

export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  rename: "F2",
  delete: "Delete",
  newFolder: "Ctrl+Shift+N",
  upload: "Ctrl+U",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  selectAll: "Ctrl+A",
  openProperties: "Alt+Enter",
  toggleSidebar: "Ctrl+B",
  openCommandPalette: "Ctrl+K",
  openSearch: "Ctrl+F",
  viewGrid: "Ctrl+Shift+1",
  viewList: "Ctrl+Shift+2",
  viewDetails: "Ctrl+Shift+3",
  navigateBack: "Alt+Left",
  navigateForward: "Alt+Right",
};
