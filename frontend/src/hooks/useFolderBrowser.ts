import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getRootChildren, getFolderChildren, folderKeys } from "../api/folders";
import { listFiles, fileKeys } from "../api/files";
import { mapFileOut, mapFolderOut } from "../lib/mappers";
import type { FileItem, FolderItem } from "../types/files";

const PAGE_SIZE = 50;

export interface FolderBrowserData {
  folders: FolderItem[];
  files: FileItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetchingNextFolderPage: boolean;
  isFetchingNextFilePage: boolean;
  hasFolderNextPage: boolean;
  hasFileNextPage: boolean;
  fetchNextFolderPage: () => void;
  fetchNextFilePage: () => void;
}

export function useFolderBrowser(slug: string): FolderBrowserData {
  const isRoot = slug === "" || slug === "__root__";

  // ── Folders ──────────────────────────────────────────────────────────────
  const folderQuery = useInfiniteQuery({
    queryKey: isRoot ? folderKeys.root() : folderKeys.children(slug),
    queryFn: ({ pageParam = 1 }) =>
      isRoot
        ? getRootChildren(pageParam as number, PAGE_SIZE)
        : getFolderChildren(slug, pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, page_size, total } = last!;
      return page * page_size < total ? page + 1 : undefined;
    },
  });

  // ── Files ─────────────────────────────────────────────────────────────────
  const fileQuery = useInfiniteQuery({
    queryKey: fileKeys.byFolder(isRoot ? "" : slug),
    queryFn: ({ pageParam = 1 }) =>
      listFiles(isRoot ? undefined : slug, pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, page_size, total } = last!;
      return page * page_size < total ? page + 1 : undefined;
    },
    // Poll every 3 s while any file is still processing so the list
    // automatically refreshes once the Telegram upload finishes.
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.pages.some((p) =>
        p?.items.some((f) => f.status === "pending"),
      );
      return hasProcessing ? 3000 : false;
    },
  });

  // ── Flatten pages ─────────────────────────────────────────────────────────
  const folders = useMemo(
    () =>
      (folderQuery.data?.pages ?? []).flatMap((p) =>
        (p?.items ?? []).map(mapFolderOut),
      ),
    [folderQuery.data],
  );

  const files = useMemo(
    () =>
      (fileQuery.data?.pages ?? []).flatMap((p) =>
        (p?.items ?? []).map(mapFileOut),
      ),
    [fileQuery.data],
  );

  return {
    folders,
    files,
    isLoading:
      (folderQuery.isLoading && !folderQuery.isFetchingNextPage) ||
      (fileQuery.isLoading && !fileQuery.isFetchingNextPage),
    isError: folderQuery.isError || fileQuery.isError,
    error: folderQuery.error ?? fileQuery.error,
    isFetchingNextFolderPage: folderQuery.isFetchingNextPage,
    isFetchingNextFilePage: fileQuery.isFetchingNextPage,
    hasFolderNextPage: folderQuery.hasNextPage,
    hasFileNextPage: fileQuery.hasNextPage,
    fetchNextFolderPage: folderQuery.fetchNextPage,
    fetchNextFilePage: fileQuery.fetchNextPage,
  };
}
