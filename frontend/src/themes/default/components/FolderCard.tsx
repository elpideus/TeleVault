import { useRef, useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import type { DragPayload } from "../../../types/dnd";
import { Checkmark12Regular, MoreVertical20Regular } from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { springSnappy, springStandard } from "../../../lib/springs";
import { triggerContextMenu } from "../../../lib/contextMenu";
import { FolderIcon } from "./FolderIcon";
import type { FolderItem } from "../../../types/files";
import { FolderContextMenu } from "./FolderContextMenu";
import { IconButton } from "./Button";
import { formatBytes } from "../../../lib/formatBytes";

// ── FolderCard ────────────────────────────────────────────────────────────────

export interface FolderCardProps {
  folder: FolderItem;
  isSelected: boolean;
  dragPayload: DragPayload;
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

export function FolderCard({ folder, isSelected, dragPayload, onSelect, onOpen, onNewFolder, onRename, onMove, onDelete, onProperties, onCopy, onPaste, onColorChange }: FolderCardProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const _pressRef = useRef(false);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: dragPayload,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder-${folder.slug}`,
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

  const itemCountLabel = (() => {
    const total = (folder.file_count ?? 0) + (folder.subfolder_count ?? 0);
    const size = folder.total_size ?? 0;

    if (total === 0) return "Empty";

    let label = `${total} element${total !== 1 ? "s" : ""}`;
    if (size > 0) {
      label += ` • ${formatBytes(size)}`;
    }
    return label;
  })();

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
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springStandard}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.018 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(folder.id, e); } else { onOpen?.(folder.slug); }
      }}
      onDoubleClick={() => onOpen?.(folder.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(folder.slug);
        if (e.key === " ") {
          e.preventDefault();
          onSelect(folder.id, e);
        }
      }}
      onMouseDown={() => { _pressRef.current = true; }}
      className={cn(
        "relative flex flex-col gap-2 p-3 rounded-[var(--tv-radius-md)]",
        "cursor-pointer select-none outline-none",
        "border transition-colors duration-[120ms]",
        isSelected
          ? "bg-[var(--tv-accent-container)] border-[var(--tv-accent-border)]"
          : "bg-[var(--tv-bg-elevated)] border-[var(--tv-border-subtle)] hover:border-[var(--tv-border-default)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--tv-accent-primary)] focus-visible:ring-offset-1",
        "focus-visible:ring-offset-[var(--tv-bg-base)]",
        "after:absolute after:inset-0 after:rounded-[inherit]",
        "after:content-[''] after:pointer-events-none after:transition-[background] after:duration-[120ms]",
        !isSelected && "hover:after:bg-[rgba(255,255,255,0.06)] active:after:bg-[rgba(255,255,255,0.10)]",
        isSelected && "after:bg-[rgba(59,130,246,0.08)]",
      )}
    >
      <motion.div
        className="absolute top-2 left-2 z-10"
        animate={
          shouldReduceMotion
            ? { opacity: isSelected || isHovered ? 1 : 0 }
            : { scale: isSelected || isHovered ? 1 : 0.8, opacity: isSelected || isHovered ? 1 : 0 }
        }
        transition={springSnappy}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect(folder.id, { ctrlKey: true } as React.MouseEvent);
          }}
          className="cursor-pointer"
        >
          <_Checkbox checked={isSelected} />
        </div>
      </motion.div>

      {/* More actions button — revealed on hover */}
      <motion.div
        className="absolute top-2 right-2 z-10"
        animate={
          shouldReduceMotion
            ? { opacity: isSelected || isHovered ? 1 : 0 }
            : { scale: isSelected || isHovered ? 1 : 0.8, opacity: isSelected || isHovered ? 1 : 0 }
        }
        transition={springSnappy}
      >
        <IconButton
          icon={<MoreVertical20Regular />}
          label="More actions"
          size="sm"
          onClick={(e) => triggerContextMenu(e, triggerRef)}
        />
      </motion.div>

      {/* Icon — open when hovered */}
      <div className="flex items-center justify-center h-12 pointer-events-none">
        <FolderIcon iconColor={folder.icon_color} iconImage={folder.icon_image} open={isHovered} size={32} />
      </div>

      {/* Name */}
      <p
        className="truncate text-center pointer-events-none"
        title={folder.name}
        style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-primary)" }}
      >
        {folder.name}
      </p>

      {/* Item count */}
      <p
        className="truncate text-center pointer-events-none"
        style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}
      >
        {itemCountLabel}
      </p>
    </motion.div>
    </FolderContextMenu>
  );
}

// ── Internal checkbox ─────────────────────────────────────────────────────────

function _Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center w-4 h-4 rounded-[var(--tv-radius-xs)]",
        "border transition-colors duration-[120ms]",
        checked
          ? "bg-[var(--tv-accent-primary)] border-[var(--tv-accent-primary)]"
          : "bg-[var(--tv-bg-overlay)] border-[var(--tv-border-default)]",
      )}
    >
      {checked && (
        <Checkmark12Regular
          style={{ color: "var(--tv-accent-on)", width: 10, height: 10 }}
        />
      )}
    </span>
  );
}
