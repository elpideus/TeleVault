import { useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Spinner } from "./Spinner";
import { FileRow } from "./FileRow";
import { FolderRow } from "./FolderRow";
import { RowSkeleton } from "./Skeletons";
import type { FileItem, FolderItem } from "../../../types/files";
import type { DragPayload } from "../../../types/dnd";

// ── FileList ──────────────────────────────────────────────────────────────────

export interface FileListProps {
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

const SKELETON_COUNT = 12;

export function FileList({
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
}: FileListProps) {
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

  const sentinelCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
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

  if (isLoading) {
    return (
      <_ListWrapper>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <RowSkeleton key={i} columns={2} />
        ))}
      </_ListWrapper>
    );
  }

  return (
    <_ListWrapper>
      <AnimatePresence>
        {folders.map((folder) => {
          const isSelected = selectedIds.has(folder.id);
          const dragPayload: DragPayload = isSelected
            ? selectionPayload
            : { fileIds: [], folderSlugs: [folder.slug], itemCount: 1, label: folder.name };
          return (
            <div key={folder.id} data-item-id={folder.id}>
              <FolderRow
                folder={folder}
                isSelected={isSelected}
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
        {files.map((file) => {
          const isSelected = selectedIds.has(file.id);
          const dragPayload: DragPayload = isSelected
            ? selectionPayload
            : { fileIds: [file.id], folderSlugs: [], itemCount: 1, label: file.name ?? file.original_name, mimeType: file.mime_type };
          return (
            <div key={file.id} data-item-id={file.id}>
              <FileRow
                file={file}
                isSelected={isSelected}
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

      {(hasNextPage || isFetchingNextPage) && (
        <div ref={sentinelCallbackRef} className="flex justify-center py-3">
          {isFetchingNextPage && (
            <Spinner size="sm" className="text-[var(--tv-text-secondary)]" />
          )}
        </div>
      )}
    </_ListWrapper>
  );
}

function _ListWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      aria-label="Files and folders"
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--tv-radius-md)",
        border: "1px solid var(--tv-border-subtle)",
        margin: "16px",
        overflow: "hidden",
        background: "var(--tv-bg-elevated)",
      }}
    >
      {children}
    </div>
  );
}
