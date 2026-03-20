import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  updateFolder, 
  uploadFolderIcon,
  deleteFolders, 
  createFolder, 
  moveFolders, 
  copyFolders, 
  folderKeys 
} from "../api/folders";
import { 
  deleteFiles, 
  updateFile, 
  moveFiles, 
  copyFiles, 
  fileKeys 
} from "../api/files";
import { useExplorerStore } from "../store/explorerStore";
import { useClipboardStore } from "../store/clipboardStore";
import { useSelectionStore } from "../store/selectionStore";
import { toast } from "../lib/toast";
import type { FileItem, FolderItem } from "../types/files";
import type { FolderOut, FileOut } from "../api/schema";

export function useExplorerActions(currentSlug: string = "") {
  const queryClient = useQueryClient();
  const explorerStore = useExplorerStore();
  const clipboard = useClipboardStore();
  const isRoot = !currentSlug;

  // ── Folders ──────────────────────────────────────────────────────────────

  const renameFolder = useMutation({
    mutationFn: ({ slug, name }: { slug: string; name: string }) =>
      updateFolder(slug, { name }),
    onSuccess: (updated) => {
      const cacheKey = isRoot ? folderKeys.root() : folderKeys.children(currentSlug);
      queryClient.setQueryData(cacheKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((f: FolderOut) => (f.id === updated?.id ? updated : f)),
          })),
        };
      });
      explorerStore.setRenameTarget(null);
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("Folder renamed");
    },
    onError: () => toast.error("Rename failed"),
  });

  const deleteFolder = useMutation({
    mutationFn: (slug: string) => deleteFolders([slug]),
    onSuccess: (_, folderSlug) => {
      const cacheKey = isRoot ? folderKeys.root() : folderKeys.children(currentSlug);
      queryClient.setQueryData(cacheKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((f: FolderOut) => f.slug !== folderSlug),
          })),
        };
      });
      explorerStore.setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("Folder deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const changeFolderColor = useMutation({
    mutationFn: ({ slug, color }: { slug: string; color: string }) =>
      updateFolder(slug, { icon_color: color }),
    onSuccess: (updated) => {
      const cacheKey = isRoot ? folderKeys.root() : folderKeys.children(currentSlug);
      queryClient.setQueryData(cacheKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((f: FolderOut) => (f.id === updated?.id ? updated : f)),
          })),
        };
      });
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
    },
    onError: () => toast.error("Color change failed"),
  });

  const updateFolderProperties = useMutation({
    mutationFn: async ({ 
      slug, 
      name, 
      icon_color, 
      icon_image, 
      icon_image_file 
    }: { 
      slug: string; 
      name?: string; 
      icon_color?: string; 
      icon_image?: string | null;
      icon_image_file?: File | null;
    }) => {
      let updated: FolderOut | undefined;
      
      // 1. Update basic properties (and icon removal if icon_image is null)
      if (name || icon_color || icon_image === null) {
        updated = await updateFolder(slug, { 
          name, 
          icon_color, 
          icon_image: icon_image === null ? null : undefined 
        });
      }

      // 2. Upload icon if provided
      if (icon_image_file) {
        updated = await uploadFolderIcon(slug, icon_image_file);
      }

      return updated;
    },
    onSuccess: (updated) => {
      if (!updated) return;
      
      const cacheKey = isRoot ? folderKeys.root() : folderKeys.children(currentSlug);
      queryClient.setQueryData(cacheKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((f: FolderOut) => (f.id === updated?.id ? updated : f)),
          })),
        };
      });
      
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("Folder properties updated");
    },
    onError: () => toast.error("Failed to update folder properties"),
  });

  const createNewFolder = useMutation({
    mutationFn: ({ name, parentSlug }: { name: string; parentSlug?: string | null }) =>
      createFolder({ 
        name, 
        parent_slug: (parentSlug !== undefined && parentSlug !== "") ? parentSlug : (isRoot ? null : currentSlug) 
      }),
    onSuccess: (created, variables) => {
      const effectiveParentSlug = (variables.parentSlug !== undefined && variables.parentSlug !== "") ? variables.parentSlug : (isRoot ? null : currentSlug);
      const isCurrentFolder = effectiveParentSlug === (isRoot ? null : currentSlug);

      if (isCurrentFolder) {
        const cacheKey = isRoot ? folderKeys.root() : folderKeys.children(currentSlug);
        queryClient.setQueryData(cacheKey, (old: any) => {
          const newItem = created!;
          if (!old) return { pages: [{ items: [newItem], total: 1, page: 1, page_size: 50 }], pageParams: [1] };
          return {
            ...old,
            pages: [
              { ...old.pages[0], items: [newItem, ...(old.pages[0]?.items ?? [])] },
              ...old.pages.slice(1),
            ],
          };
        });
      }
      
      if (effectiveParentSlug) {
        explorerStore.setExpanded(effectiveParentSlug, true);
      }
      
      explorerStore.setNewFolderOpen(false);
      explorerStore.setNewFolderParentSlug(null);
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("Folder created");
    },
    onError: () => toast.error("Create folder failed"),
  });

  const moveFolder = useMutation({
    mutationFn: ({ slug, targetParentSlug }: { slug: string; targetParentSlug: string | null }) =>
      moveFolders([slug], targetParentSlug),
    onSuccess: () => {
      explorerStore.setMoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("Folder moved");
    },
    onError: () => toast.error("Move failed"),
  });

  // ── Files ────────────────────────────────────────────────────────────────

  const renameFile = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateFile(id, { name }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        fileKeys.byFolder(currentSlug),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: page.items.map((f: FileOut) => (f.id === updated?.id ? updated : f)),
            })),
          };
        },
      );
      explorerStore.setRenameTarget(null);
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      toast.success("File renamed");
    },
    onError: () => toast.error("Rename failed"),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => deleteFiles([id]),
    onSuccess: (_, fileId) => {
      queryClient.setQueryData(
        fileKeys.byFolder(currentSlug),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              items: page.items.filter((f: FileOut) => f.id !== fileId),
            })),
          };
        },
      );
      explorerStore.setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      toast.success("File deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const moveFile = useMutation({
    mutationFn: ({ id, targetFolderSlug }: { id: string; targetFolderSlug: string | null }) =>
      moveFiles([id], targetFolderSlug),
    onSuccess: () => {
      explorerStore.setMoveTarget(null);
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      toast.success("File moved");
    },
    onError: () => toast.error("Move failed"),
  });

  // ── Bulk Actions ─────────────────────────────────────────────────────────

  const bulkDelete = useMutation({
    mutationFn: async ({ fileIds, folderSlugs }: { fileIds: string[]; folderSlugs: string[] }) => {
      const results = await Promise.allSettled([
        fileIds.length ? deleteFiles(fileIds) : Promise.resolve(null),
        folderSlugs.length ? deleteFolders(folderSlugs) : Promise.resolve(null),
      ]);
      return results;
    },
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      useSelectionStore.getState().clearSelection();
      const anyFailed =
        results.some((r) => r.status === "rejected") ||
        results.some(
          (r) =>
            r.status === "fulfilled" &&
            r.value &&
            "failed" in r.value &&
            (r.value as any).failed.length > 0,
        );
      if (anyFailed) toast.error("Some items could not be deleted");
      else toast.success("Items deleted");
    },
  });

  const bulkMove = useMutation({
    mutationFn: async ({
      fileIds,
      folderSlugs,
      targetSlug,
    }: {
      fileIds: string[];
      folderSlugs: string[];
      targetSlug: string | null;
    }) => {
      const results = await Promise.allSettled([
        fileIds.length ? moveFiles(fileIds, targetSlug) : Promise.resolve(null),
        folderSlugs.length ? moveFolders(folderSlugs, targetSlug) : Promise.resolve(null),
      ]);
      return results;
    },
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
      useSelectionStore.getState().clearSelection();
      const anyFailed =
        results.some((r) => r.status === "rejected") ||
        results.some(
          (r) =>
            r.status === "fulfilled" &&
            r.value &&
            "failed" in r.value &&
            (r.value as any).failed.length > 0,
        );
      if (anyFailed) toast.error("Some items could not be moved");
      else toast.success("Items moved");
    },
  });

  // ── Clipboard Handlers ───────────────────────────────────────────────────

  const handleCopy = useCallback((item: { type: "folder"; item: FolderItem } | { type: "file"; item: FileItem }) => {
    clipboard.copy([{ 
      id: item.item.id, 
      type: item.type, 
      name: item.type === "folder" ? item.item.name : (item.item.name ?? item.item.original_name) 
    }], currentSlug);
    toast.success("Copied to clipboard");
  }, [clipboard, currentSlug]);

  const handlePaste = useCallback(async (targetFolderSlug: string | null) => {
    if (clipboard.items.length === 0) return;

    const fileIds = clipboard.items.filter(i => i.type === "file").map(i => i.id);
    const folderSlugs = clipboard.items.filter(i => i.type === "folder").map(i => i.id);

    try {
      if (fileIds.length > 0) {
        await copyFiles(fileIds, targetFolderSlug);
      }
      if (folderSlugs.length > 0) {
        await copyFolders(folderSlugs, targetFolderSlug);
      }
    } catch (err) {
      toast.error("Paste failed");
      return;
    }

    void queryClient.invalidateQueries({ queryKey: folderKeys.all });
    void queryClient.invalidateQueries({ queryKey: fileKeys.all });
    void queryClient.invalidateQueries({ queryKey: folderKeys.sidebar });
    toast.success("Items pasted");
  }, [clipboard, queryClient]);

  return {
    renameFolder,
    deleteFolder,
    changeFolderColor,
    updateFolderProperties,
    createNewFolder,
    moveFolder,
    renameFile,
    deleteFile,
    moveFile,
    handleCopy,
    handlePaste,
    bulkDelete,
    bulkMove,
  };
}
