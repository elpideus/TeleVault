import { useState, useCallback, useMemo, useRef } from "react";

// Module-level serial queue — ensures all uploads across any number of
// handleDrop calls are processed one at a time globally.
let _uploadQueue: Promise<void> = Promise.resolve();
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFolders, folderKeys } from "../../api/folders";
import { springFluid } from "../../lib/springs";
import { useUIStore } from "../../store/uiStore";
import { useClipboardStore } from "../../store/clipboardStore";
import { useFolderBrowser } from "../../hooks/useFolderBrowser";
import { useUploadStore } from "../../store/uploadStore";
import { generateUUID } from "../../utils/uuid";
import { uploadFile, fileKeys } from "../../api/files";
import { useAuthStore } from "../../store/authStore";
import { getBaseUrl } from "../../api/client";
import { useExplorerStore } from "../../store/explorerStore";
import { useExplorerActions } from "../../hooks/useExplorerActions";
import { useSelectionStore } from "../../store/selectionStore";
import { useLassoSelection } from "../../hooks/useLassoSelection";
import { toast } from "../../lib/toast";
import { ConfirmModal } from "../../themes/default/components/ConfirmModal";
import { MoveModal } from "../../themes/default/components/MoveModal";
import type { FileItem, FolderItem } from "../../types/files";
import {
  FolderAdd16Regular,
  ArrowSort16Regular,
  Grid16Regular,
  List16Regular,
  Table16Regular,
  ChevronLeft16Regular,
  ArrowUpload24Regular,
  ArrowUpload16Regular,
  DismissCircle24Regular,
  TableSettings16Regular,
  ArrowUp16Regular,
  ArrowDown16Regular,
  Checkmark16Regular,
  Home16Regular,
} from "@fluentui/react-icons";

// Components from themes
import { Breadcrumb, type BreadcrumbSegment } from "../../themes/default/components/Breadcrumb";
import { FileGrid } from "../../themes/default/components/FileGrid";
import { FileList } from "../../themes/default/components/FileList";
import { FileDetails } from "../../themes/default/components/FileDetails";
import { DropZone } from "../../themes/default/components/DropZone";
import { SelectionBar } from "../../themes/default/components/SelectionBar";
import { EmptyState } from "../../themes/default/components/EmptyState";
import { EmptyAreaContextMenu } from "../../themes/default/components/EmptyAreaContextMenu";
import { Button, IconButton } from "../../themes/default/components/Button";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function FileExplorer() {
  const { "*": slug = "" } = useParams();
  const isRoot = slug === "" || slug === "__root__";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uiStore = useUIStore();
  const clipboard = useClipboardStore();
  const { user } = useAuthStore();


  const explorerStore = useExplorerStore();
  const explorerActions = useExplorerActions(slug);

  // Selection (store)
  const { selectedIds, lastSelectedId, select, toggleSelect, rangeSelect, selectMany, clearSelection } =
    useSelectionStore();
  const [isDragging, setIsDragging] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    folders: allFolders,
    files: allFiles,
    isLoading,
    isError,
    fetchNextFolderPage,
    fetchNextFilePage,
    hasFolderNextPage,
    hasFileNextPage,
    isFetchingNextFolderPage,
    isFetchingNextFilePage,
  } = useFolderBrowser(slug);

  // ── Breadcrumbs ────────────────────────────────────────────────────────────
  const { parts, ancestrySlugs } = useMemo(() => {
    const p = slug.split("/").filter(Boolean);
    let current = "";
    const s = p.map((part, i) => {
      current += (i > 0 ? "/" : "") + part;
      return current;
    });
    return { parts: p, ancestrySlugs: s };
  }, [slug]);

  const { data: ancestryData } = useQuery({
    queryKey: folderKeys.bySlugs(ancestrySlugs),
    queryFn: () => fetchFolders(ancestrySlugs),
    enabled: ancestrySlugs.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const segments = useMemo(() => {
    const list: BreadcrumbSegment[] = [
      { label: "My Vault", icon: <Home16Regular />, href: "/browse" },
    ];
    if (!slug) return list;

    let currentSlug = "";
    parts.forEach((part, i) => {
      currentSlug += (i > 0 ? "/" : "") + part;
      const folder = ancestryData?.find((f) => f.slug === currentSlug);
      list.push({
        label: folder?.name ?? part,
        href: i === parts.length - 1 ? undefined : `/browse/${currentSlug}`,
      });
    });
    return list;
  }, [slug, parts, ancestryData]);

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortPref = uiStore.folderSortPrefs[slug] || { field: "name", direction: "asc" };

  const sortedFolders = useMemo(() => {
    return [...allFolders].sort((a, b) => {
      const dir = sortPref.direction === "asc" ? 1 : -1;
      if (sortPref.field === "name") return a.name.localeCompare(b.name) * dir;
      // In Phase 10 we might have updated_at, but type says created_at
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return (dateA - dateB) * dir;
    });
  }, [allFolders, sortPref]);

  const sortedFiles = useMemo(() => {
    return [...allFiles].sort((a, b) => {
      const dir = sortPref.direction === "asc" ? 1 : -1;
      if (sortPref.field === "name")
        return (a.name ?? a.original_name).localeCompare(b.name ?? b.original_name) * dir;
      if (sortPref.field === "size") return (a.size - b.size) * dir;
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return (dateA - dateB) * dir;
    });
  }, [allFiles, sortPref]);

  // ── Selection derived state ────────────────────────────────────────────────
  const selectedFileIds = useMemo(
    () => Array.from(selectedIds).filter((id) => sortedFiles.some((f) => f.id === id)),
    [selectedIds, sortedFiles],
  );
  const selectedFolderSlugs = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => sortedFolders.find((f) => f.id === id)?.slug)
        .filter((s): s is string => s !== undefined),
    [selectedIds, sortedFolders],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSort = useCallback(
    (field: typeof sortPref.field) => {
      const current = uiStore.folderSortPrefs[slug] || { field: "name", direction: "asc" };
      uiStore.setSortPref(slug, {
        field,
        direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
      });
    },
    [slug, uiStore],
  );

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
      if (e.shiftKey && lastSelectedId) {
        const allIds = [...sortedFolders, ...sortedFiles].map((item) => item.id);
        rangeSelect(allIds, lastSelectedId, id);
      } else if (e.ctrlKey || e.metaKey) {
        toggleSelect(id);
      } else {
        select(id);
      }
    },
    [lastSelectedId, sortedFolders, sortedFiles, rangeSelect, toggleSelect, select],
  );

  const handleSelectAll = useCallback(() => {
    const allIds = [...sortedFolders.map((f) => f.id), ...sortedFiles.map((f) => f.id)];
    if (allIds.every((id) => selectedIds.has(id))) {
      clearSelection();
    } else {
      selectMany(allIds);
    }
  }, [sortedFolders, sortedFiles, selectedIds, clearSelection, selectMany]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        handleSelectAll();
      }
    },
    [handleSelectAll],
  );

  const handleLassoSelect = useCallback(
    (ids: string[], additive: boolean) => {
      if (additive) {
        const current = useSelectionStore.getState().selectedIds;
        selectMany([...Array.from(current), ...ids]);
      } else {
        selectMany(ids);
      }
    },
    [selectMany],
  );

  const lasso = useLassoSelection(
    scrollContainerRef as React.RefObject<HTMLElement>,
    handleLassoSelect,
  );

  const handleFolderClick = useCallback(
    (folderSlug: string) => {
      navigate(`/browse/${folderSlug}`);
      clearSelection();
    },
    [navigate, clearSelection],
  );

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (files: File[]) => {
      if (!user) return;

      const { addUpload, updateProgress, setStatus, promoteUpload } = useUploadStore.getState();

      // Add ALL files to the store immediately as "queued"
      const fileEntries = files.map((file) => ({
        file,
        tempId: `upload-${generateUUID()}`,
        stableId: generateUUID(),
      }));

      for (const { file, tempId, stableId } of fileEntries) {
        addUpload({
          id: stableId,
          operationId: tempId,
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          status: "queued",
          folderId: slug || undefined,
        });
      }

      // Chain onto the global queue so uploads from concurrent handleDrop calls
      // (e.g. drag + button) never run in parallel.
      _uploadQueue = _uploadQueue.then(async () => {
        for (const { file, tempId } of fileEntries) {
          setStatus(tempId, "hashing");

          let realOperationId: string | null = null;
          try {
            await uploadFile(
              file,
              isRoot ? null : slug,
              (operationId) => {
                realOperationId = operationId;
                promoteUpload(tempId, operationId);
                setStatus(operationId, "processing");
              },
              (progress) => updateProgress(tempId, progress),
              (progress) => {
                setStatus(tempId, "uploading");
                updateProgress(tempId, progress);
              },
            );

            // Wait for the server-to-Telegram phase before starting the next
            // file. Check current state first to avoid a race where the SSE
            // "done" event already arrived before we subscribe.
            if (realOperationId) {
              const opId = realOperationId;
              await new Promise<void>((resolve, reject) => {
                // Immediate check — may already be terminal
                const current = useUploadStore.getState().uploads.get(opId);
                if (!current || current.status === "complete") return resolve();
                if (current.status === "error") return reject(new Error(current.error ?? "Upload failed"));

                const unsub = useUploadStore.subscribe((state) => {
                  const u = state.uploads.get(opId);
                  if (!u || u.status === "complete") { unsub(); resolve(); }
                  else if (u.status === "error") { unsub(); reject(new Error(u.error ?? "Upload failed")); }
                });
              });
            }

            void queryClient.invalidateQueries({ queryKey: fileKeys.all });
            toast.success(`Uploaded ${file.name}`);
          } catch (err: any) {
            console.error("Upload failed:", err);
            const opId = realOperationId ?? tempId;
            setStatus(opId, "error", (err as Error).message);
            toast.error(`Failed to upload ${file.name}: ${(err as Error).message}`);
          }
        }
      });
    },
    [slug, isRoot, user, queryClient],
  );

  const openFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      handleDrop(files);
    };
    input.click();
  }, [handleDrop]);

  const handleDownload = useCallback((id: string, name: string) => {
    const token = useAuthStore.getState().accessToken;
    const baseUrl = getBaseUrl();
    
    // Construct direct download URL with token for authentication
    const downloadUrl = `${baseUrl}/api/v1/files/${id}/download?token=${token}`;
    
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = downloadUrl;
    // The download attribute is a hint; Content-Disposition from backend will take precedence
    a.download = name; 
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    document.body.removeChild(a);
  }, []);

  // ── Clipboard handlers ─────────────────────────────────────────────────────
  const handleCopy = explorerActions.handleCopy;
  const handlePaste = explorerActions.handlePaste;

  const handleSelectionCopy = useCallback(() => {
    const items = Array.from(selectedIds).map(id => {
      const folder = sortedFolders.find(f => f.id === id);
      const file = sortedFiles.find(f => f.id === id);
      if (folder) return { id: folder.id, type: "folder" as const, name: folder.name };
      return { id: file!.id, type: "file" as const, name: file!.name || file!.original_name };
    });
    clipboard.copy(items, slug);
    toast.success("Items copied to clipboard");
    clearSelection();
  }, [selectedIds, sortedFolders, sortedFiles, clipboard, slug, clearSelection]);

  const handleBulkDelete = useCallback(() => setBulkDeleteOpen(true), []);

  const handleBulkMove = useCallback(() => setBulkMoveOpen(true), []);

  const handleBulkDownload = useCallback(() => {
    if (selectedFileIds.length === 0) return;
    toast.info(`Downloading ${selectedFileIds.length} file${selectedFileIds.length > 1 ? "s" : ""}...`);
    selectedFileIds.forEach((id) => {
      const file = sortedFiles.find((f) => f.id === id);
      if (file) void handleDownload(file.id, file.name || file.original_name);
    });
  }, [selectedFileIds, sortedFiles, handleDownload]);

  // ── Context callbacks ──────────────────────────────────────────────────────
  const contextCallbacks = useMemo(() => ({
    onFileDownload: (id: string) => {
      const file = sortedFiles.find(f => f.id === id);
      if (file) void handleDownload(file.id, file.name || file.original_name);
    },
    onFileRename: (file: FileItem) => explorerStore.setRenameTarget({ type: "file", item: file }),
    onFileMove: (file: FileItem) => explorerStore.setMoveTarget({ type: "file", item: file }),
    onFileDelete: (file: FileItem) => explorerStore.setDeleteTarget({ type: "file", item: file }),
    onFileProperties: (file: FileItem) => explorerStore.setPropertiesTarget({ type: "file", item: file }),
    onFileCopy: (file: FileItem) => handleCopy({ type: "file", item: file }),
    onFilePaste: () => handlePaste(slug),
    onFolderRename: (folder: FolderItem) => explorerStore.setRenameTarget({ type: "folder", item: folder }),
    onFolderMove: (folder: FolderItem) => explorerStore.setMoveTarget({ type: "folder", item: folder }),
    onFolderDelete: (folder: FolderItem) => explorerStore.setDeleteTarget({ type: "folder", item: folder }),
    onFolderProperties: (folder: FolderItem) => explorerStore.setPropertiesTarget({ type: "folder", item: folder }),
    onFolderColorChange: (folder: FolderItem, color: string) =>
      explorerActions.changeFolderColor.mutate({ slug: folder.slug, color }),
    onFolderCopy: (folder: FolderItem) => handleCopy({ type: "folder", item: folder }),
    onFolderPaste: (folder: FolderItem) => handlePaste(folder.slug),
    onFolderNew: (folder: FolderItem) => {
      explorerStore.setNewFolderParentSlug(folder.slug);
      explorerStore.setNewFolderOpen(true);
    },
  }), [handleDownload, handleCopy, handlePaste, slug, explorerStore, explorerActions]);

  // ── Browser Props ──────────────────────────────────────────────────────────
  const viewMode = uiStore.getViewMode(slug);

  const browserProps = {
    folders: sortedFolders,
    files: sortedFiles,
    selectedIds,
    onSelect: handleSelect,
    onOpenFolder: handleFolderClick,
    ...contextCallbacks,
  };

  const hasItems = !isLoading && (sortedFolders.length > 0 || sortedFiles.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* ── Top Bar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-none items-center justify-between border-b border-white/5 bg-background/50 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-6">
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1 pr-2 w-full">
            <IconButton
              variant="ghost"
              size="sm"
              label="Back"
              disabled={isRoot}
              onClick={() => navigate(-1)}
              className="h-7 w-7 text-white/40 hover:text-white"
              icon={<ChevronLeft16Regular />}
            />
            <div className="h-3 w-[1px] bg-white/10" />
            <Breadcrumb segments={segments} className="flex-1" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
            <IconButton
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              label="Grid view"
              onClick={() => uiStore.setViewMode(slug, "grid")}
              className="h-7 w-7"
              icon={<Grid16Regular />}
            />
            <IconButton
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              label="List view"
              onClick={() => uiStore.setViewMode(slug, "list")}
              className="h-7 w-7"
              icon={<List16Regular />}
            />
            <IconButton
              variant={viewMode === "details" ? "secondary" : "ghost"}
              size="sm"
              label="Details view"
              onClick={() => uiStore.setViewMode(slug, "details")}
              className="h-7 w-7"
              icon={<Table16Regular />}
            />
          </div>

          <div className="h-4 w-[1px] bg-white/10" />

          {/* Sort Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-3 text-white/60 hover:text-white">
                <ArrowSort16Regular />
                <span>Sort</span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="w-48 z-50 rounded-xl bg-[#1a1a1b] p-1 shadow-2xl border border-white/10">
                <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Sort by</DropdownMenu.Label>
                <DropdownMenu.Separator className="my-1 h-[1px] bg-white/5" />
                {[
                  { label: "Name", field: "name" as const },
                  { label: "Modified", field: "date" as const },
                  { label: "Size", field: "size" as const },
                ].map((item) => {
                  const isActive = sortPref.field === item.field;
                  const Arrow = sortPref.direction === "asc" ? ArrowUp16Regular : ArrowDown16Regular;
                  return (
                    <DropdownMenu.Item
                      key={item.field}
                      className="relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-white/70 outline-none hover:bg-white/5 hover:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      onClick={() => handleSort(item.field)}
                    >
                      <div className="absolute left-2 flex h-4 w-4 items-center justify-center">
                        {isActive && <Arrow className="text-primary" />}
                      </div>
                      {item.label}
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {viewMode === "details" && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-3 text-white/60 hover:text-white">
                  <TableSettings16Regular />
                  <span>Columns</span>
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="w-56 z-50 rounded-xl bg-[#1a1a1b] p-1 shadow-2xl border border-white/10">
                  <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider">Display columns</DropdownMenu.Label>
                  <DropdownMenu.Separator className="my-1 h-[1px] bg-white/5" />
                  {["name", "size", "type", "modified"].map((col) => (
                    <DropdownMenu.CheckboxItem
                      key={col}
                      className="relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-white/70 outline-none hover:bg-white/5 hover:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      checked={uiStore.visibleColumns.includes(col)}
                      onCheckedChange={() => uiStore.toggleColumn(col)}
                    >
                      <DropdownMenu.ItemIndicator className="absolute left-2 flex h-4 w-4 items-center justify-center">
                        <Checkmark16Regular className="text-primary" />
                      </DropdownMenu.ItemIndicator>
                      {col.charAt(0).toUpperCase() + col.slice(1)}
                    </DropdownMenu.CheckboxItem>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}

          <div className="h-4 w-[1px] bg-white/10" />

          <Button variant="secondary" size="sm" className="gap-2 px-4" onClick={() => {
            explorerStore.setNewFolderParentSlug(slug);
            explorerStore.setNewFolderOpen(true);
          }}>
            <FolderAdd16Regular />
            <span>New Folder</span>
          </Button>

          <Button variant="secondary" size="sm" className="gap-2 px-4" onClick={openFilePicker}>
            <ArrowUpload16Regular />
            <span>Upload</span>
          </Button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <DropZone
        onDrop={handleDrop}
        onDragOverChange={setIsDragging}
      >
        <EmptyAreaContextMenu
          onNewFolder={() => {
            explorerStore.setNewFolderParentSlug(slug);
            explorerStore.setNewFolderOpen(true);
          }}
          onUpload={openFilePicker}
          onPaste={() => handlePaste(slug)}
        >
          <div ref={scrollContainerRef} onMouseDown={lasso.onMouseDown} className="relative flex-1 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {lasso.rectStyle && <div style={lasso.rectStyle} />}
            <div className="p-4 min-w-fit">
            {/* Drag overlay */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[2px]"
                >
                  <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-background/80 px-8 py-6 shadow-2xl">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <ArrowUpload24Regular />
                      </div>
                      <p className="text-lg font-medium text-white">Drop files to upload</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error state */}
            {isError && (
              <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <DismissCircle24Regular />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Failed to load content</h3>
                  <p className="text-sm text-white/40">Please try again later</p>
                </div>
              </div>
            )}

            {/* Content states */}
            <AnimatePresence mode="wait">
              {isLoading && !isFetchingNextFolderPage && !isFetchingNextFilePage ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex h-64 items-center justify-center"
                >
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </motion.div>
              ) : !hasItems ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex h-full min-h-[400px] items-center justify-center"
                >
                  <EmptyState
                    variant="empty-folder"
                    onAction={openFilePicker}
                    onSecondaryAction={() => {
                      explorerStore.setNewFolderParentSlug(slug);
                      explorerStore.setNewFolderOpen(true);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Views */}
                  {viewMode === "grid" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={springFluid}
                    >
                      <FileGrid
                        {...browserProps}
                        hasNextPage={hasFolderNextPage || hasFileNextPage}
                        isFetchingNextPage={isFetchingNextFolderPage || isFetchingNextFilePage}
                        onFetchNextPage={() => {
                          if (hasFolderNextPage) fetchNextFolderPage();
                          if (hasFileNextPage) fetchNextFilePage();
                        }}
                      />
                    </motion.div>
                  )}

                  {viewMode === "list" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={springFluid}
                    >
                      <FileList
                        {...browserProps}
                        hasNextPage={hasFolderNextPage || hasFileNextPage}
                        isFetchingNextPage={isFetchingNextFolderPage || isFetchingNextFilePage}
                        onFetchNextPage={() => {
                          if (hasFolderNextPage) fetchNextFolderPage();
                          if (hasFileNextPage) fetchNextFilePage();
                        }}
                      />
                    </motion.div>
                  )}

                  {viewMode === "details" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={springFluid}
                    >
                      <FileDetails
                        {...browserProps}
                        hasNextPage={hasFolderNextPage || hasFileNextPage}
                        isFetchingNextPage={isFetchingNextFolderPage || isFetchingNextFilePage}
                        onFetchNextPage={() => {
                          if (hasFolderNextPage) fetchNextFolderPage();
                          if (hasFileNextPage) fetchNextFilePage();
                        }}
                        sortField={sortPref.field}
                        sortDirection={sortPref.direction}
                        onSort={handleSort}
                        onSelectAll={handleSelectAll}
                      />
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        </EmptyAreaContextMenu>
      </DropZone>

      {/* ── Selection bar ────────────────────────────────────────────────── */}
      <SelectionBar
        count={selectedIds.size}
        onClearSelection={clearSelection}
        onCopy={handleSelectionCopy}
        onDelete={handleBulkDelete}
        onMove={handleBulkMove}
        onDownload={handleBulkDownload}
        downloadDisabledReason={selectedFileIds.length === 0 ? "Folders cannot be downloaded" : undefined}
      />

      {/* ── Bulk delete confirmation ──────────────────────────────────────── */}
      {(() => {
        const count = selectedIds.size;
        const fileCount = selectedFileIds.length;
        const folderCount = selectedFolderSlugs.length;
        return (
          <ConfirmModal
            open={bulkDeleteOpen}
            onOpenChange={setBulkDeleteOpen}
            title={`Delete ${count} item${count > 1 ? "s" : ""}?`}
            description={`This will permanently delete ${fileCount} file${fileCount !== 1 ? "s" : ""} and ${folderCount} folder${folderCount !== 1 ? "s" : ""} and their contents.`}
            confirmLabel="Delete"
            danger
            loading={explorerActions.bulkDelete.isPending}
            onConfirm={() => {
              explorerActions.bulkDelete.mutate(
                { fileIds: selectedFileIds, folderSlugs: selectedFolderSlugs },
                { onSettled: () => setBulkDeleteOpen(false) },
              );
            }}
          />
        );
      })()}

      {/* ── Bulk move modal ───────────────────────────────────────────────── */}
      <MoveModal
        open={bulkMoveOpen}
        onOpenChange={setBulkMoveOpen}
        itemName={selectedIds.size === 1
          ? (() => {
              const id = Array.from(selectedIds)[0];
              const folder = sortedFolders.find((f) => f.id === id);
              const file = sortedFiles.find((f) => f.id === id);
              return folder?.name ?? file?.name ?? file?.original_name ?? "item";
            })()
          : `${selectedIds.size} items`}
        disabledIds={Array.from(selectedIds)}
        loading={explorerActions.bulkMove.isPending}
        onMove={(targetSlug) => {
          explorerActions.bulkMove.mutate(
            { fileIds: selectedFileIds, folderSlugs: selectedFolderSlugs, targetSlug: targetSlug },
            { onSettled: () => setBulkMoveOpen(false) },
          );
        }}
      />
    </div>
  );
}
