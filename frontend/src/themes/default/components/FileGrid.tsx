import { useCallback, useRef, forwardRef, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Spinner } from "./Spinner";
import { FileCard } from "./FileCard";
import { FolderCard } from "./FolderCard";
import { FileSkeleton, FolderSkeleton } from "./Skeletons";
import type { FileItem, FolderItem } from "../../../types/files";
import type { DragPayload } from "../../../types/dnd";

// ── FileGrid ──────────────────────────────────────────────────────────────────

export interface FileGridProps {
  folders: FolderItem[];
  files: FileItem[];
  selectedIds: Set<string>;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onSelect: (id: string, event: React.MouseEvent | React.KeyboardEvent) => void;
  onOpenFolder?: (slug: string) => void;
  onOpenFile?: (id: string) => void;
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

// Number of skeleton placeholders on initial load
const SKELETON_COUNT = 12;

export function FileGrid({
  folders,
  files,
  selectedIds,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onSelect,
  onOpenFolder,
  onOpenFile,
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
}: FileGridProps) {
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        onFetchNextPage?.();
      }
    },
    [hasNextPage, isFetchingNextPage, onFetchNextPage],
  );

  const sentinelCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(observerCallback, {
        rootMargin: "200px",
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [observerCallback],
  );

  const selectionPayload: DragPayload = useMemo(() => {
    const selectedFileIds = files
      .filter((f) => selectedIds.has(f.id))
      .map((f) => f.id);
    const selectedFolderSlugs = folders
      .filter((f) => selectedIds.has(f.id))
      .map((f) => f.slug);
    const count = selectedIds.size;
    const singleFile = count === 1 ? files.find((f) => selectedIds.has(f.id)) : null;
    const singleFolder = count === 1 ? folders.find((f) => selectedIds.has(f.id)) : null;
    const label =
      count === 1
        ? (singleFile?.name ?? singleFolder?.name ?? singleFile?.original_name ?? "1 item")
        : `${count} items`;
    return {
      fileIds: selectedFileIds,
      folderSlugs: selectedFolderSlugs,
      itemCount: count,
      label,
      mimeType: singleFile?.mime_type,
    };
  }, [files, folders, selectedIds]);

  if (isLoading) {
    return (
      <_Grid>
        {Array.from({ length: SKELETON_COUNT / 2 }).map((_, i) => (
          <FolderSkeleton key={`fsk-${i}`} />
        ))}
        {Array.from({ length: SKELETON_COUNT / 2 }).map((_, i) => (
          <FileSkeleton key={`isk-${i}`} />
        ))}
      </_Grid>
    );
  }

  return (
    <_Grid ref={gridContainerRef}>
      {/* Folders first */}
      <AnimatePresence>
        {folders.map((folder, idx) => {
          const dragPayload: DragPayload = selectedIds.has(folder.id)
            ? selectionPayload
            : { fileIds: [], folderSlugs: [folder.slug], itemCount: 1, label: folder.name };
          return (
            <div
              key={folder.id}
              data-item-id={folder.id}
              // Stagger: delay capped at 15 items × 12ms
              style={{ animationDelay: `${Math.min(idx, 15) * 12}ms` }}
            >
              <FolderCard
                folder={folder}
                isSelected={selectedIds.has(folder.id)}
                dragPayload={dragPayload}
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
            </div>
          );
        })}

        {/* Files */}
        {files.map((file, idx) => {
          const dragPayload: DragPayload = selectedIds.has(file.id)
            ? selectionPayload
            : { fileIds: [file.id], folderSlugs: [], itemCount: 1, label: file.name ?? file.original_name, mimeType: file.mime_type };
          return (
            <div
              key={file.id}
              data-item-id={file.id}
              style={{
                animationDelay: `${Math.min(folders.length + idx, 15) * 12}ms`,
              }}
            >
              <FileCard
                file={file}
                isSelected={selectedIds.has(file.id)}
                dragPayload={dragPayload}
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
            </div>
          );
        })}
      </AnimatePresence>

      {/* Infinite scroll sentinel */}
      {(hasNextPage || isFetchingNextPage) && (
        <div
          ref={sentinelCallbackRef}
          className="col-span-full flex justify-center py-4"
        >
          {isFetchingNextPage && (
            <Spinner size="sm" className="text-[var(--tv-text-secondary)]" />
          )}
        </div>
      )}
    </_Grid>
  );
}

// ── Grid layout wrapper ───────────────────────────────────────────────────────

const _Grid = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; onMouseDown?: React.MouseEventHandler<HTMLDivElement> }
>(function _Grid({ children, onMouseDown }, ref) {
  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      role="listbox"
      aria-multiselectable="true"
      aria-label="Files and folders"
      style={{
        position: "relative",
        display: "grid",
        // Responsive columns: min 120px, fill available space
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: "8px",
        padding: "16px",
        alignContent: "start",
      }}
    >
      {children}
    </div>
  );
});
