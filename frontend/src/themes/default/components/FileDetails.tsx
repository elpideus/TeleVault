import { useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowUp12Regular, ArrowDown12Regular } from "@fluentui/react-icons";
import { Spinner } from "./Spinner";
import { FileRow } from "./FileRow";
import { FolderRow } from "./FolderRow";
import { RowSkeleton } from "./Skeletons";
import { cn } from "../../../lib/cn";
import type { FileItem, FolderItem } from "../../../types/files";
import type { SortField, SortDirection } from "../../../store/uiStore";
import { Checkbox } from "./Checkbox";
import { useUIStore } from "../../../store/uiStore";
import { Tooltip } from "./Tooltip";

// ── Column header ─────────────────────────────────────────────────────────────

interface ColHeaderProps {
  label: string;
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
  align?: "left" | "right";
  width?: number;
  onSort: (field: SortField) => void;
}

function ColHeader({
  label,
  field,
  activeField,
  direction,
  align = "left",
  width,
  onSort,
}: ColHeaderProps) {
  const isActive = activeField === field;
  const Arrow = direction === "asc" ? ArrowUp12Regular : ArrowDown12Regular;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 px-0 border-0 bg-transparent cursor-pointer",
        "transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)] rounded",
        isActive
          ? "text-[var(--tv-text-primary)]"
          : "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
        align === "right" ? "flex-row-reverse" : "flex-row",
      )}
      style={{
        font: "var(--tv-type-label)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        flexShrink: 0,
        width: width,
      }}
    >
      {label}
      {isActive && (
        <Arrow style={{ width: 10, height: 10, flexShrink: 0 }} />
      )}
    </button>
  );
}

// ── FileDetails ───────────────────────────────────────────────────────────────

export interface FileDetailsProps {
  folders: FolderItem[];
  files: FileItem[];
  selectedIds: Set<string>;
  sortField: SortField;
  sortDirection: SortDirection;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onSelect: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onOpenFolder?: (slug: string) => void;
  onOpenFile?: (id: string) => void;
  onSort: (field: SortField) => void;
  onSelectAll?: (isSelected: boolean) => void;
  onFetchNextPage?: () => void;
  // File callbacks
  onFileDownload?: (id: string) => void;
  onFileRename?: (file: FileItem) => void;
  onFileMove?: (file: FileItem) => void;
  onFileDelete?: (file: FileItem) => void;
  onFileProperties?: (file: FileItem) => void;
  onFileCopy?: (file: FileItem) => void;
  onFilePaste?: (file: FileItem) => void;
  // Folder callbacks
  onFolderRename?: (folder: FolderItem) => void;
  onFolderMove?: (folder: FolderItem) => void;
  onFolderDelete?: (folder: FolderItem) => void;
  onFolderProperties?: (folder: FolderItem) => void;
  onFolderCopy?: (folder: FolderItem) => void;
  onFolderPaste?: (folder: FolderItem) => void;
  onFolderColorChange?: (folder: FolderItem, color: string) => void;
  onFolderNew?: (folder: FolderItem) => void;
}

const SKELETON_COUNT = 12;

export function FileDetails({
  folders,
  files,
  selectedIds,
  sortField,
  sortDirection,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onSelect,
  onOpenFolder,
  onOpenFile,
  onSort,
  onSelectAll,
  onFetchNextPage,
  onFileDownload,
  onFileRename,
  onFileMove,
  onFileDelete,
  onFileProperties,
  onFileCopy,
  onFilePaste,
  onFolderRename,
  onFolderMove,
  onFolderDelete,
  onFolderProperties,
  onFolderCopy,
  onFolderPaste,
  onFolderColorChange,
  onFolderNew,
}: FileDetailsProps) {
  const visibleColumns = useUIStore((s) => s.visibleColumns);
  const totalCount = folders.length + files.length;
  const isAllSelected = totalCount > 0 && selectedIds.size >= totalCount;
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

  const sentinelCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
            onFetchNextPage?.();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, onFetchNextPage],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--tv-radius-md)",
        border: "1px solid var(--tv-border-subtle)",
        margin: "16px",
        overflow: "visible",
        background: "var(--tv-bg-elevated)",
        minWidth: "fit-content",
      }}
    >
      {/* Column header bar */}
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center gap-4 px-4 h-9",
          "border-b border-[var(--tv-border-subtle)]",
          "bg-[var(--tv-bg-overlay)]",
        )}
      >
        {/* Select All Checkbox */}
        <div 
          className="w-5 flex items-center justify-center flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Tooltip content="Coming Soon" side="top">
            <Checkbox
              checked={isAllSelected}
              indeterminate={isSomeSelected}
              disabled={true}
              onChange={(checked) => onSelectAll?.(checked)}
            />
          </Tooltip>
        </div>

        {/* Icon spacer */}
        <span style={{ width: 16, flexShrink: 0 }} />

        {/* Name — fills remaining space */}
        <ColHeader
          label="Name"
          field="name"
          activeField={sortField}
          direction={sortDirection}
          onSort={onSort}
          width={200}
        />
        {/* Spacer to push right-aligned columns */}
        <span style={{ flex: 1 }} />

        {visibleColumns.includes("items") && (
          <span
            style={{
              width: 80,
              flexShrink: 0,
              textAlign: "right",
              font: "var(--tv-type-label)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--tv-text-secondary)",
            }}
          >
            Items
          </span>
        )}

        {visibleColumns.includes("size") && (
          <ColHeader
            label="Size"
            field="size"
            activeField={sortField}
            direction={sortDirection}
            align="right"
            width={80}
            onSort={onSort}
          />
        )}

        {visibleColumns.includes("type") && (
          <span
            style={{
              width: 100,
              flexShrink: 0,
              textAlign: "right",
              font: "var(--tv-type-label)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--tv-text-secondary)",
            }}
          >
            Type
          </span>
        )}

        {visibleColumns.includes("modified") && (
          <ColHeader
            label="Modified"
            field="date"
            activeField={sortField}
            direction={sortDirection}
            align="right"
            width={120}
            onSort={onSort}
          />
        )}

        {visibleColumns.includes("created") && (
          <ColHeader
            label="Created"
            field="date"
            activeField={sortField}
            direction={sortDirection}
            align="right"
            width={120}
            onSort={onSort}
          />
        )}
        {/* Actions spacer — aligns with the ... button in rows */}
        <div style={{ width: 32, flexShrink: 0 }} />
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      {/* Rows */}
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Files and folders"
      >
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <RowSkeleton key={i} columns={4} />
          ))
        ) : (
          <AnimatePresence>
            {folders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                isSelected={selectedIds.has(folder.id)}
                dragPayload={{ fileIds: [], folderSlugs: [folder.slug], itemCount: 1, label: folder.name }}
                showColumns
                visibleColumns={visibleColumns}
                onSelect={onSelect}
                onOpen={onOpenFolder}
                onNewFolder={onFolderNew}
                onRename={onFolderRename}
                onMove={onFolderMove}
                onDelete={onFolderDelete}
                onProperties={onFolderProperties}
                onCopy={onFolderCopy}
                onPaste={onFolderPaste}
                onColorChange={onFolderColorChange}
              />
            ))}
            {files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                isSelected={selectedIds.has(file.id)}
                dragPayload={{ fileIds: [file.id], folderSlugs: [], itemCount: 1, label: file.name ?? file.original_name, mimeType: file.mime_type }}
                showColumns
                visibleColumns={visibleColumns}
                onSelect={onSelect}
                onOpen={onOpenFile}
                onDownload={onFileDownload}
                onRename={onFileRename}
                onMove={onFileMove}
                onDelete={onFileDelete}
                onProperties={onFileProperties}
                onCopy={onFileCopy}
                onPaste={onFilePaste}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {(hasNextPage || isFetchingNextPage) && (
        <div ref={sentinelCallbackRef} className="flex justify-center py-3">
          {isFetchingNextPage && (
            <Spinner size="sm" className="text-[var(--tv-text-secondary)]" />
          )}
        </div>
      )}
    </div>
  );
}
