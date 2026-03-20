// Context menu for folder items.
// Includes all file actions plus the Color sub-section (via ColorSwatchRow).

import { useState } from "react";
import * as CM from "@radix-ui/react-context-menu";
import {
  FolderOpen20Regular,
  Rename20Regular,
  ArrowMove20Regular,
  Copy20Regular,
  ClipboardPaste20Regular,
  Info20Regular,
  Share20Regular,
  Delete20Regular,
  Color20Regular,
  FolderAdd20Regular,
} from "@fluentui/react-icons";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ContextMenuBase";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { cn } from "../../../lib/cn";

import { useClipboardStore } from "../../../store/clipboardStore";

// ── Color sub-section ─────────────────────────────────────────────────────────

interface ColorRowProps {
  currentColor?: string;
  onColorChange?: (color: string) => void;
}

function ColorRow({ currentColor, onColorChange }: ColorRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <CM.Sub open={open} onOpenChange={setOpen}>
      <CM.SubTrigger
        className={cn(
          "relative flex items-center gap-2 px-2 h-8 rounded-[var(--tv-radius-sm)]",
          "cursor-pointer select-none outline-none",
          "text-[var(--tv-text-primary)]",
          "data-[state=open]:bg-[rgba(255,255,255,0.08)]",
          "data-[highlighted]:bg-[rgba(255,255,255,0.08)]",
          "transition-colors duration-[80ms]",
        )}
        style={{ font: "var(--tv-type-body-sm)" }}
      >
        <span
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 16, height: 16, color: "var(--tv-text-secondary)" }}
        >
          <Color20Regular />
        </span>
        <span className="flex-1">Color</span>
        {currentColor && (
          <span
            className="flex-shrink-0 w-3 h-3 rounded-full"
            style={{ background: currentColor, border: "1px solid var(--tv-border-default)" }}
          />
        )}
        {/* Chevron */}
        <span style={{ color: "var(--tv-text-disabled)", fontSize: 10 }}>›</span>
      </CM.SubTrigger>
      <CM.Portal>
        <CM.SubContent
          className={cn(
            "z-50 min-w-[200px] p-3",
            "rounded-[var(--tv-radius-md)]",
            "border border-[var(--tv-border-strong)]",
            "shadow-[var(--tv-shadow-md)]",
            "data-[state=open]:animate-[tv-menu-in_120ms_ease-out]",
            "data-[state=closed]:animate-[tv-menu-out_100ms_ease-in]",
          )}
          style={{
            background: "var(--tv-bg-overlay)",
            backdropFilter: "blur(var(--tv-glass-blur))",
          }}
          sideOffset={4}
          alignOffset={-4}
        >
          <ColorSwatchRow
            value={currentColor}
            onChange={(color) => {
              if (color !== undefined) onColorChange?.(color);
            }}
          />
        </CM.SubContent>
      </CM.Portal>
    </CM.Sub>
  );
}

// ── FolderContextMenu ─────────────────────────────────────────────────────────

export interface FolderContextMenuProps {
  children: React.ReactNode;
  currentColor?: string;
  onOpen?: () => void;
  onNewFolder?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onColorChange?: (color: string) => void;
  onProperties?: () => void;
  onDelete?: () => void;
}

export function FolderContextMenu({
  children,
  currentColor,
  onOpen,
  onNewFolder,
  onRename,
  onMove,
  onCopy,
  onPaste,
  onColorChange,
  onProperties,
  onDelete,
}: FolderContextMenuProps) {
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
          icon={<FolderAdd20Regular />}
          label="New Folder"
          onSelect={onNewFolder}
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
        <ColorRow currentColor={currentColor} onColorChange={onColorChange} />
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
