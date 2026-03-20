import { useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { moveFiles, fileKeys } from "../api/files";
import { moveFolders, folderKeys } from "../api/folders";
import { useSelectionStore } from "../store/selectionStore";
import { toast } from "../lib/toast";
import type { DragPayload } from "../types/dnd";

export function useDragAndDrop(currentSlug: string | null) {
  const queryClient = useQueryClient();
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const [activeDragPayload, setActiveDragPayload] =
    useState<DragPayload | null>(null);

  function onDragStart(event: DragStartEvent) {
    setActiveDragPayload(event.active.data.current as DragPayload);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveDragPayload(null);

    const { active, over } = event;
    if (!over) return;

    const payload = active.data.current as DragPayload;
    const { folderSlug: targetSlug } = over.data.current as {
      folderSlug: string | null;
    };

    // No-op: dropping onto the folder we're already in
    const normalizedCurrent = currentSlug || null;
    if (targetSlug === normalizedCurrent) return;

    // Prevent a folder being dropped into itself
    const safeFolderSlugs = payload.folderSlugs.filter(
      (s) => s !== targetSlug,
    );

    const moves: Promise<unknown>[] = [];
    if (payload.fileIds.length > 0) {
      moves.push(moveFiles(payload.fileIds, targetSlug));
    }
    if (safeFolderSlugs.length > 0) {
      moves.push(moveFolders(safeFolderSlugs, targetSlug));
    }
    if (moves.length === 0) return;

    const results = await Promise.allSettled(moves);
    const failures = results.filter((r) => r.status === "rejected").length;

    if (failures > 0) {
      if (failures === moves.length) {
        toast.error("Move failed");
      } else {
        toast.error(`${failures} item(s) could not be moved`);
      }
      return;
    }

    // Invalidate source folder contents (folders + files)
    const sourceSlug = currentSlug ?? "";
    await Promise.all([
      currentSlug
        ? queryClient.invalidateQueries({ queryKey: folderKeys.children(currentSlug) })
        : queryClient.invalidateQueries({ queryKey: folderKeys.root() }),
      queryClient.invalidateQueries({ queryKey: fileKeys.byFolder(sourceSlug) }),
    ]);

    // Invalidate target folder contents
    if (targetSlug) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: folderKeys.children(targetSlug) }),
        queryClient.invalidateQueries({ queryKey: fileKeys.byFolder(targetSlug) }),
      ]);
    } else {
      // Dropping to root — invalidate root view
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: folderKeys.root() }),
        queryClient.invalidateQueries({ queryKey: fileKeys.byFolder("") }),
      ]);
    }

    // Always refresh sidebar
    await queryClient.invalidateQueries({
      queryKey: folderKeys.sidebarRoot(),
    });

    clearSelection();
  }

  return { onDragStart, onDragEnd, activeDragPayload };
}
