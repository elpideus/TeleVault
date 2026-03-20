import { useRef, useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Checkmark12Regular, MoreVertical20Regular } from "@fluentui/react-icons";
import { useDraggable, useDndContext } from "@dnd-kit/core";
import { cn } from "../../../lib/cn";
import { springSnappy, springStandard } from "../../../lib/springs";
import { triggerContextMenu } from "../../../lib/contextMenu";
import { FileIcon } from "./FileIcon";
import { formatBytes } from "../../../lib/formatBytes";
import type { FileItem } from "../../../types/files";
import type { DragPayload } from "../../../types/dnd";
import { splitFilename } from "../../../lib/filenames";
import { FileContextMenu } from "./FileContextMenu";
import { IconButton } from "./Button";

// ── FileCard ──────────────────────────────────────────────────────────────────

export interface FileCardProps {
  file: FileItem;
  isSelected: boolean;
  dragPayload: DragPayload;
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

export function FileCard({ file, isSelected, dragPayload, onSelect, onOpen, onDownload, onRename, onMove, onDelete, onProperties, onCopy, onPaste }: FileCardProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [isHovered, setIsHovered] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef(false);

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

  const statusColor =
    file.status === "ready"
      ? undefined
      : file.status === "processing"
        ? "var(--tv-warning)"
        : "var(--tv-error)";

  const statusLabel =
    file.status === "processing"
      ? "Processing"
      : file.status === "error"
        ? "Error"
        : undefined;

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
      // Mount animation — stagger is applied by parent FileGrid
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springStandard}
      // Hover lift
      whileHover={shouldReduceMotion ? undefined : { scale: 1.018 }}
      // Press sink
      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(file.id, e); } else { onOpen?.(file.id); }
      }}
      onDoubleClick={() => onOpen?.(file.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(file.id);
        if (e.key === " ") {
          e.preventDefault();
          onSelect(file.id, e);
        }
      }}
      onMouseDown={() => { pressRef.current = true; }}
      className={cn(
        // Base shape — M3 container identity
        "relative flex flex-col gap-2 p-3 rounded-[var(--tv-radius-md)]",
        "cursor-pointer select-none outline-none",
        // M3 container border — subtle at rest, brighter on hover
        "border transition-colors duration-[120ms]",
        isSelected
          ? "bg-[var(--tv-accent-container)] border-[var(--tv-accent-border)]"
          : "bg-[var(--tv-bg-elevated)] border-[var(--tv-border-subtle)] hover:border-[var(--tv-border-default)]",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-[var(--tv-accent-primary)] focus-visible:ring-offset-1",
        "focus-visible:ring-offset-[var(--tv-bg-base)]",
        // M3 state layer — ::after overlay
        "after:absolute after:inset-0 after:rounded-[inherit]",
        "after:content-[''] after:pointer-events-none after:transition-[background] after:duration-[120ms]",
        !isSelected && "hover:after:bg-[rgba(255,255,255,0.06)] active:after:bg-[rgba(255,255,255,0.10)]",
        isSelected && "after:bg-[rgba(59,130,246,0.08)]",
      )}
    >
      {/* Checkbox — revealed on hover or when selected */}
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
            onSelect(file.id, { ctrlKey: true } as React.MouseEvent);
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

      {/* Icon area */}
      <div className="flex items-center justify-center h-12 pointer-events-none">
        <FileIcon mimeType={file.mime_type} size={32} />
      </div>

      {/* Name */}
      {(() => {
        const fullName = file.name ?? file.original_name;
        const { base, ext } = splitFilename(fullName);
        return (
          <div
            className="flex justify-center min-w-0 pointer-events-none"
            title={fullName}
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-primary)",
            }}
          >
            <span className="truncate">{base}</span>
            <span className="shrink-0">{ext}</span>
          </div>
        );
      })()}

      {/* Metadata row */}
      <div
        className="flex items-center justify-between gap-1 pointer-events-none"
        style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-secondary)" }}
      >
        <span>{formatBytes(file.size)}</span>
        {statusLabel && (
          <span style={{ color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
        )}
      </div>
    </motion.div>
    </FileContextMenu>
  );
}

// ── Internal checkbox ─────────────────────────────────────────────────────────

function _Checkbox({
  checked,
}: {
  checked: boolean;
}) {
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
        <Checkmark12Regular style={{ color: "var(--tv-accent-on)", width: 10, height: 10 }} />
      )}
    </span>
  );
}
