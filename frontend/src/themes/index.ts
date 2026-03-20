// Theme resolution system.
// All components are exported from here. The active theme's `components/` folder
// is tried first; if a theme has component overrides, they replace the defaults.
// Currently all components come from the default theme.

export { ThemeProvider } from "./ThemeProvider";
export { ReloadBanner } from "./ReloadBanner";

// ── Phase 2 — Primitive components ───────────────────────────────────────────

export { Spinner } from "./default/components/Spinner";
export type { SpinnerProps } from "./default/components/Spinner";

export { Button, IconButton } from "./default/components/Button";
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  IconButtonProps,
} from "./default/components/Button";

export { Input } from "./default/components/Input";
export type { InputProps, InputVariant } from "./default/components/Input";

export { Checkbox } from "./default/components/Checkbox";
export type { CheckboxProps } from "./default/components/Checkbox";

export { Badge } from "./default/components/Badge";
export type { BadgeProps, BadgeVariant } from "./default/components/Badge";

export { Tooltip } from "./default/components/Tooltip";
export type { TooltipProps } from "./default/components/Tooltip";

export { Kbd } from "./default/components/Kbd";
export type { KbdProps } from "./default/components/Kbd";

export { Separator } from "./default/components/Separator";
export type { SeparatorProps } from "./default/components/Separator";

// ── Phase 3 — Layout shell ────────────────────────────────────────────────────

export { ResizeHandle } from "./default/components/ResizeHandle";
export type { ResizeHandleProps } from "./default/components/ResizeHandle";

export { StorageIndicator } from "./default/components/StorageIndicator";

export { FolderTree } from "./default/components/FolderTree";
export type { FolderTreeProps } from "./default/components/FolderTree";

export { Breadcrumb } from "./default/components/Breadcrumb";
export type { BreadcrumbProps, BreadcrumbSegment } from "./default/components/Breadcrumb";

export { Navbar } from "./default/components/Navbar";
export type { NavbarProps } from "./default/components/Navbar";

export { Sidebar } from "./default/components/Sidebar";
export type { SidebarProps } from "./default/components/Sidebar";

// ── Phase 5 — File browser ────────────────────────────────────────────────────

export { FileIcon } from "./default/components/FileIcon";
export type { FileIconProps } from "./default/components/FileIcon";

export { FolderIcon } from "./default/components/FolderIcon";
export type { FolderIconProps } from "./default/components/FolderIcon";

export { ColorSwatchRow } from "./default/components/ColorSwatchRow";
export type { ColorSwatchRowProps } from "./default/components/ColorSwatchRow";

export { FileCard } from "./default/components/FileCard";
export type { FileCardProps } from "./default/components/FileCard";

export { FolderCard } from "./default/components/FolderCard";
export type { FolderCardProps } from "./default/components/FolderCard";

export { FileSkeleton, FolderSkeleton, RowSkeleton } from "./default/components/Skeletons";
export * from "./default/components/ExplorerControls";

export { FileRow } from "./default/components/FileRow";
export type { FileRowProps } from "./default/components/FileRow";

export { FolderRow } from "./default/components/FolderRow";
export type { FolderRowProps } from "./default/components/FolderRow";

export { FileGrid } from "./default/components/FileGrid";
export type { FileGridProps } from "./default/components/FileGrid";

export { FileList } from "./default/components/FileList";
export type { FileListProps } from "./default/components/FileList";

export { FileDetails } from "./default/components/FileDetails";
export type { FileDetailsProps } from "./default/components/FileDetails";

export { ViewToggle } from "./default/components/ViewToggle";
export type { ViewToggleProps } from "./default/components/ViewToggle";

export { SortBar } from "./default/components/SortBar";
export type { SortBarProps } from "./default/components/SortBar";

export { EmptyState } from "./default/components/EmptyState";
export type { EmptyStateProps, EmptyStateVariant } from "./default/components/EmptyState";

export { DropZone } from "./default/components/DropZone";
export type { DropZoneProps } from "./default/components/DropZone";

export { SelectionBar } from "./default/components/SelectionBar";
export type { SelectionBarProps } from "./default/components/SelectionBar";

// ── Phase 6 — Interactions ─────────────────────────────────────────────────────

export {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "./default/components/ContextMenuBase";
export type { ContextMenuItemProps, ContextMenuContentProps } from "./default/components/ContextMenuBase";

export { FileContextMenu } from "./default/components/FileContextMenu";
export type { FileContextMenuProps } from "./default/components/FileContextMenu";

export { FolderContextMenu } from "./default/components/FolderContextMenu";
export type { FolderContextMenuProps } from "./default/components/FolderContextMenu";

export { EmptyAreaContextMenu } from "./default/components/EmptyAreaContextMenu";
export type { EmptyAreaContextMenuProps } from "./default/components/EmptyAreaContextMenu";

export {
  DialogRoot,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "./default/components/DialogBase";
export type { DialogContentProps, DialogHeaderProps } from "./default/components/DialogBase";

export { ConfirmModal } from "./default/components/ConfirmModal";
export type { ConfirmModalProps } from "./default/components/ConfirmModal";

export { DisclaimerModal } from "./default/components/DisclaimerModal";

export { DonationModal } from "./default/components/DonationModal";

export { RenameModal } from "./default/components/RenameModal";
export type { RenameModalProps } from "./default/components/RenameModal";

export { NewFolderModal } from "./default/components/NewFolderModal";
export type { NewFolderModalProps } from "./default/components/NewFolderModal";

export { MoveModal } from "./default/components/MoveModal";
export type { MoveModalProps } from "./default/components/MoveModal";

export { FilePropertiesModal, FolderPropertiesModal } from "./default/components/PropertiesModal";
export type {
  FilePropertiesModalProps,
  FolderPropertiesModalProps,
} from "./default/components/PropertiesModal";

// ── Phase 7 — Transfers Tray ───────────────────────────────────────────────

export { TransferItem } from "./default/components/TransferItem";
export type { TransferItemProps } from "./default/components/TransferItem";

export { TransfersTray, TransfersTrayToggle } from "./default/components/TransfersTray";
export type {
  TransfersTrayProps,
  TransfersTrayToggleProps,
} from "./default/components/TransfersTray";

// ── Phase 8 — Search & Command Palette ────────────────────────────────────────

export {
  SearchOverlay,
  SearchInput,
  SearchResults,
  SearchResultItem,
} from "./default/components/SearchOverlay";
export type {
  SearchOverlayProps,
  SearchInputProps,
  SearchResultsProps,
  SearchResultItemProps,
} from "./default/components/SearchOverlay";

export { CommandPalette, CommandItem } from "./default/components/CommandPalette";
export type {
  CommandPaletteProps,
  CommandItemProps,
} from "./default/components/CommandPalette";

// ── Phase 9 — Settings & Activity ─────────────────────────────────────────────

export { SettingsModal } from "./default/components/SettingsModal";
export type { SettingsModalProps, SettingsPanel } from "./default/components/SettingsModal";

export {
  ActivityFeed,
  ActivityItem,
  ActivityFeedEmpty,
} from "./default/components/ActivityFeed";
export type { ActivityItemProps } from "./default/components/ActivityFeed";

export {
  PanelSection,
  AppearancePanel,
  ChannelsPanel,
  AccountsPanel,
  KeybindsPanel,
  AboutPanel,
} from "./default/components/SettingsPanels";
