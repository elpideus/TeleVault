import { useRef, useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal20Regular } from "@fluentui/react-icons";
import { useDraggable, useDndContext } from "@dnd-kit/core";
import { cn } from "../../../lib/cn";
import { springStandard } from "../../../lib/springs";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "../../../lib/formatBytes";
import { formatDate } from "../../../lib/formatDate";
import { triggerContextMenu } from "../../../lib/contextMenu";
import type { FileItem } from "../../../types/files";
import type { DragPayload } from "../../../types/dnd";
import { splitFilename } from "../../../lib/filenames";
import { FileContextMenu } from "./FileContextMenu";
import { IconButton } from "./Button";
import { getFileTypeLabel } from "../../../lib/fileTypes";
import { Checkbox } from "./Checkbox";

// ── FileRow ───────────────────────────────────────────────────────────────────
// Used in both List (compact) and Details (multi-column) view modes.

export interface FileRowProps {
  file: FileItem;
  isSelected: boolean;
  dragPayload: DragPayload;
  showColumns?: boolean;
  visibleColumns?: string[];
  onSelect: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onOpen?: (id: string) => void;
  onDownload?: (id: string) => void;
  onRename?: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
  onDelete?: (file: FileItem) => void;
  onProperties?: (file: FileItem) => void;
  onCopy?: (file: FileItem) => void;
  onPaste?: (file: FileItem) => void;
}

export function FileRow({
  file,
  isSelected,
  dragPayload,
  showColumns = false,
  visibleColumns = ["name", "size", "type", "modified"],
  onSelect,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
  onProperties,
  onCopy,
  onPaste,
}: FileRowProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: dragPayload,
  });
  const { active } = useDndContext();
  const isDimmed = isDragging || (active !== null && isSelected);

  const mergeRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      (triggerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [setNodeRef],
  );

  const typeLabel = getFileTypeLabel(file.mime_type, file.name ?? file.original_name);

  return (
    <FileContextMenu
      onOpen={onOpen ? () => onOpen(file.id) : undefined}
      onDownload={onDownload ? () => onDownload(file.id) : undefined}
      onRename={onRename ? () => onRename(file) : undefined}
      onMove={onMove ? () => onMove(file) : undefined}
      onDelete={onDelete ? () => onDelete(file) : undefined}
      onProperties={onProperties ? () => onProperties(file) : undefined}
      onCopy={onCopy ? () => onCopy(file) : undefined}
      onPaste={onPaste ? () => onPaste(file) : undefined}
    >
    <motion.div
      ref={mergeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDimmed ? 0.4 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springStandard}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(file.id, e); return; }
        onOpen?.(file.id);
      }}
      onDoubleClick={() => onOpen?.(file.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(file.id);
        if (e.key === " ") { e.preventDefault(); onSelect(file.id, e); }
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
          onChange={() => onSelect(file.id, { ctrlKey: true } as any)}
        />
      </div>

      {/* Icon */}
      <FileIcon mimeType={file.mime_type} size={16} className="flex-shrink-0" />

      {/* Name */}
      {(() => {
        const fullName = file.name ?? file.original_name;
        const { base, ext } = splitFilename(fullName);
        return (
          <span
            className="flex-1 truncate pointer-events-none"
            title={fullName}
            style={{ 
              font: "var(--tv-type-body)", 
              color: "var(--tv-text-primary)",
              minWidth: 200,
            }}
          >
            <span className="truncate">{base}</span>
            <span className="shrink-0">{ext}</span>
          </span>
        );
      })()}

      {/* Details columns */}
      {showColumns && (
        <>
          {visibleColumns.includes("items") && (
            <span
              className="flex-shrink-0 text-right"
              style={{
                width: 80,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              —
            </span>
          )}

          {visibleColumns.includes("size") && (
            <span
              className="flex-shrink-0 text-right"
              style={{
                width: 80,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {formatBytes(file.size)}
            </span>
          )}

          {visibleColumns.includes("type") && (
            <span
              className="flex-shrink-0 text-right truncate"
              title={typeLabel}
              style={{
                width: 100,
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {typeLabel}
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
              {formatDate(file.created_at)}
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
              {formatDate(file.created_at)}
            </span>
          )}
        </>
      )}

      {/* List view — size only */}
      {!showColumns && (
        <span
          className="flex-shrink-0 text-right"
          style={{
            font: "var(--tv-type-body-sm)",
            color: "var(--tv-text-secondary)",
          }}
        >
          {formatBytes(file.size)}
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
    </FileContextMenu>
  );
}
