import { useState, useRef, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal20Regular } from "@fluentui/react-icons";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import type { DragPayload } from "../../../types/dnd";
import { cn } from "../../../lib/cn";
import { springStandard } from "../../../lib/springs";
import { triggerContextMenu } from "../../../lib/contextMenu";
import { FolderIcon } from "./FolderIcon";
import { formatDate } from "../../../lib/formatDate";
import type { FolderItem } from "../../../types/files";
import { FolderContextMenu } from "./FolderContextMenu";
import { IconButton } from "./Button";
import { Checkbox } from "./Checkbox";
import { formatBytes } from "../../../lib/formatBytes";

// ── FolderRow ─────────────────────────────────────────────────────────────────

export interface FolderRowProps {
  folder: FolderItem;
  isSelected: boolean;
  dragPayload: DragPayload;
  showColumns?: boolean;
  visibleColumns?: string[];
  onSelect: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onOpen?: (slug: string) => void;
  onNewFolder?: (folder: FolderItem) => void;
  onRename?: (folder: FolderItem) => void;
  onMove?: (folder: FolderItem) => void;
  onDelete?: (folder: FolderItem) => void;
  onProperties?: (folder: FolderItem) => void;
  onCopy?: (folder: FolderItem) => void;
  onPaste?: (folder: FolderItem) => void;
  onColorChange?: (folder: FolderItem, color: string) => void;
}

export function FolderRow({
  folder,
  isSelected,
  dragPayload,
  showColumns = false,
  visibleColumns = ["name", "size", "type", "modified"],
  onSelect,
  onOpen,
  onNewFolder,
  onRename,
  onMove,
  onDelete,
  onProperties,
  onCopy,
  onPaste,
  onColorChange,
}: FolderRowProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: dragPayload,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder-row-${folder.slug}`,
    data: { folderSlug: folder.slug },
  });

  const { active } = useDndContext();
  // Use the active drag's payload — not this card's own dragPayload — to determine
  // whether this folder is being dragged (prevents drop-into-self highlight).
  const activeFolderSlugs = (active?.data.current as { folderSlugs?: string[] } | undefined)?.folderSlugs ?? [];
  const isDraggedItem = activeFolderSlugs.includes(folder.slug);
  const isValidDropTarget = isOver && !isDraggedItem;
  const isDimmed = isDragging || (active !== null && isSelected);

  const mergeRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
      (triggerRef as React.MutableRefObject<HTMLElement | null>).current = el;
    },
    [setDragRef, setDropRef],
  );

  const totalItems = (folder.file_count ?? 0) + (folder.subfolder_count ?? 0);
  const itemsLabel = totalItems === 0 ? "Empty" : `${totalItems} ${totalItems === 1 ? "Item" : "Items"}`;
  const sizeLabel = !folder.total_size || folder.total_size === 0 ? "—" : formatBytes(folder.total_size);

  return (
    <FolderContextMenu
      onOpen={onOpen ? () => onOpen(folder.slug) : undefined}
      onNewFolder={onNewFolder ? () => onNewFolder(folder) : undefined}
      onRename={onRename ? () => onRename(folder) : undefined}
      onMove={onMove ? () => onMove(folder) : undefined}
      onDelete={onDelete ? () => onDelete(folder) : undefined}
      onProperties={onProperties ? () => onProperties(folder) : undefined}
      onCopy={onCopy ? () => onCopy(folder) : undefined}
      onPaste={onPaste ? () => onPaste(folder) : undefined}
      onColorChange={onColorChange ? (color) => onColorChange(folder, color) : undefined}
      currentColor={folder.icon_color}
    >
    <motion.div
      ref={mergeRef}
      {...attributes}
      {...listeners}
      style={{
        opacity: isDimmed ? 0.4 : 1,
        outline: isValidDropTarget ? "2px solid var(--tv-accent)" : "2px solid transparent",
        background: isValidDropTarget ? "color-mix(in srgb, var(--tv-accent-container) 12%, transparent)" : undefined,
        transition: "outline 80ms, background 80ms",
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springStandard}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(folder.id, e); return; }
        onOpen?.(folder.slug);
      }}
      onDoubleClick={() => onOpen?.(folder.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(folder.slug);
        if (e.key === " ") { e.preventDefault(); onSelect(folder.id, e); }
      }}
      className={cn(
        "relative group flex items-center gap-4 px-4 h-10",
        "cursor-pointer select-none outline-none",
        "border-b border-[var(--tv-border-subtle)] last:border-b-0",
        "transition-colors duration-[120ms]",
        isSelected
          ? "bg-[var(--tv-accent-container)]"
          : "bg-transparent hover:bg-[rgba(255,255,255,0.04)]",
        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--tv-accent-primary)]",
        "after:absolute after:inset-0 after:pointer-events-none after:transition-[background] after:duration-[120ms]",
        "active:after:bg-[rgba(255,255,255,0.06)]",
      )}
    >
      {/* Selection Checkbox */}
      <div 
        className="w-5 flex items-center justify-center flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onChange={() => onSelect(folder.id, { ctrlKey: true } as any)}
        />
      </div>

      {/* Icon — open when hovered */}
      <FolderIcon
        iconColor={folder.icon_color}
        iconImage={folder.icon_image}
        open={isHovered || isSelected}
        size={16}
        className="flex-shrink-0"
      />

      {/* Name */}
      <span
        className="flex-1 truncate pointer-events-none"
        title={folder.name}
        style={{ 
          font: "var(--tv-type-body)", 
          color: "var(--tv-text-primary)",
          minWidth: 200,
        }}
      >
        {folder.name}
      </span>

      {/* Details columns */}
      {showColumns && (
        <>
          {visibleColumns.includes("items") && (
            <span
              className="flex-shrink-0 text-right truncate"
              title={itemsLabel}
              style={{
                width: 80,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {itemsLabel}
            </span>
          )}

          {visibleColumns.includes("size") && (
            <span
              className="flex-shrink-0 text-right truncate"
              title={sizeLabel}
              style={{
                width: 80,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {sizeLabel}
            </span>
          )}

          {visibleColumns.includes("type") && (
            <span
              className="flex-shrink-0 text-right"
              style={{
                width: 100,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              File Folder
            </span>
          )}

          {visibleColumns.includes("modified") && (
            <span
              className="flex-shrink-0 text-right"
              style={{
                width: 120,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {formatDate(folder.created_at)}
            </span>
          )}

          {visibleColumns.includes("created") && (
            <span
              className="flex-shrink-0 text-right"
              style={{
                width: 120,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {formatDate(folder.created_at)}
            </span>
          )}
        </>
      )}

      {/* List view — item count */}
      {!showColumns && (
        <span
          className="flex-shrink-0 text-right"
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-secondary)",
          }}
        >
          {itemsLabel}
        </span>
      )}

      {/* More actions — revealed on hover */}
      <div
        className={cn(
          "w-[32px] flex-shrink-0 transition-opacity duration-[120ms]",
          isSelected || isHovered ? "opacity-100" : "opacity-0",
        )}
      >
        <IconButton
          icon={<MoreHorizontal20Regular />}
          label="More actions"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            triggerContextMenu(e, triggerRef);
          }}
        />
      </div>
      <div className="w-9 flex-shrink-0" />
    </motion.div>
    </FolderContextMenu>
  );
}
