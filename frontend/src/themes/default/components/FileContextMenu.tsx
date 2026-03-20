// Context menu for file items.
// Wraps ContextMenuBase with file-specific actions.

import {
  FolderOpen20Regular,
  ArrowDownload20Regular,
  Rename20Regular,
  ArrowMove20Regular,
  Copy20Regular,
  ClipboardPaste20Regular,
  Info20Regular,
  Share20Regular,
  Delete20Regular,
  Eye20Regular,
} from "@fluentui/react-icons";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ContextMenuBase";
import { useClipboardStore } from "../../../store/clipboardStore";

// ── FileContextMenu ───────────────────────────────────────────────────────────

export interface FileContextMenuProps {
  children: React.ReactNode;
  onOpen?: () => void;
  onDownload?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onProperties?: () => void;
  onDelete?: () => void;
}

export function FileContextMenu({
  children,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onCopy,
  onPaste,
  onProperties,
  onDelete,
}: FileContextMenuProps) {
  const hasClipboardItems = useClipboardStore((s) => s.items.length > 0);
  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          icon={<FolderOpen20Regular />}
          label="Open"
          onSelect={onOpen}
        />
        <ContextMenuItem
          icon={<ArrowDownload20Regular />}
          label="Download"
          onSelect={onDownload}
        />
        <ContextMenuItem
          icon={<Eye20Regular />}
          label="Preview"
          comingSoon
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Rename20Regular />}
          label="Rename"
          shortcut="F2"
          onSelect={onRename}
        />
        <ContextMenuItem
          icon={<ArrowMove20Regular />}
          label="Move"
          onSelect={onMove}
        />
        <ContextMenuItem
          icon={<Copy20Regular />}
          label="Copy"
          onSelect={onCopy}
        />
        {hasClipboardItems && (
          <ContextMenuItem
            icon={<ClipboardPaste20Regular />}
            label="Paste"
            shortcut="Ctrl+V"
            onSelect={onPaste}
          />
        )}
        <ContextMenuItem
          icon={<Share20Regular />}
          label="Share"
          comingSoon
        />
        <ContextMenuItem
          icon={<Info20Regular />}
          label="Properties"
          shortcut="Alt+Enter"
          onSelect={onProperties}
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={<Delete20Regular />}
          label="Delete"
          shortcut="Del"
          danger
          onSelect={onDelete}
        />
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
