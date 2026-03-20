// Context menu for empty area of the file browser.
// Items: New Folder, Upload Files. No Paste in v1.

import {
  FolderAdd20Regular,
  ArrowUpload20Regular,
  ClipboardPaste20Regular,
} from "@fluentui/react-icons";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ContextMenuBase";
import { useClipboardStore } from "../../../store/clipboardStore";

export interface EmptyAreaContextMenuProps {
  children: React.ReactNode;
  onNewFolder?: () => void;
  onUpload?: () => void;
  onPaste?: () => void;
}

export function EmptyAreaContextMenu({
  children,
  onNewFolder,
  onUpload,
  onPaste,
}: EmptyAreaContextMenuProps) {
  const hasClipboardItems = useClipboardStore((s) => s.items.length > 0);

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          icon={<FolderAdd20Regular />}
          label="New Folder"
          shortcut="Ctrl+Shift+N"
          onSelect={onNewFolder}
        />
        <ContextMenuItem
          icon={<ArrowUpload20Regular />}
          label="Upload Files"
          shortcut="Ctrl+U"
          onSelect={onUpload}
        />
        {hasClipboardItems && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={<ClipboardPaste20Regular />}
              label="Paste"
              shortcut="Ctrl+V"
              onSelect={onPaste}
            />
          </>
        )}
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
