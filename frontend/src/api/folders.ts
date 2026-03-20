import { apiClient } from "./client";
import { queryClient } from "../app/providers";
import { storageKeys } from "./storage";
import { useAuthStore } from "../store/authStore";
import type {
  BulkDeleteFolderResult,
  BulkFolderResult,
  FolderIn,
  FolderOut,
  FolderUpdate,
} from "./schema";

export const folderKeys = {
  all: ["folders"] as const,
  list: () => [...folderKeys.all, "list"] as const,
  root: () => [...folderKeys.all, "root"] as const,
  bySlug: (slug: string) => [...folderKeys.all, slug] as const,
  bySlugs: (slugs: string[]) => [...folderKeys.all, "multiple", ...slugs] as const,
  children: (slug: string) => [...folderKeys.bySlug(slug), "children"] as const,
  // Sidebar-specific keys to avoid shape collision with explorer infinite queries
  sidebar: ["sidebar"] as const,
  sidebarRoot: () => [...folderKeys.sidebar, "root"] as const,
  sidebarChildren: (slug: string) => [...folderKeys.sidebar, "folder", slug, "children"] as const,
};

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  return base.endsWith("/api/v1") ? base.slice(0, -7) : base.replace(/\/$/, "");
}

function getToken(): string {
  return useAuthStore.getState().accessToken ?? "";
}

export async function getRootFolders(page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET("/api/v1/folders/", {
    params: { query: { page, page_size: pageSize } },
  });
  if (error) throw error;
  return data;
}

export async function getRootChildren(page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET("/api/v1/folders/children", {
    params: { query: { page, page_size: pageSize } },
  });
  if (error) throw error;
  return data;
}

export async function getFolderChildren(slug: string, page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET(
    "/api/v1/folders/{slug}/children",
    { params: { path: { slug }, query: { page, page_size: pageSize } } },
  );
  if (error) throw error;
  return data;
}

export async function createFolder(body: FolderIn) {
  const { data, error } = await apiClient.POST("/api/v1/folders/", { body });
  if (error) throw error;
  return data;
}

export async function updateFolder(slug: string, body: FolderUpdate) {
  const { data, error } = await apiClient.PATCH("/api/v1/folders/{slug}", {
    params: { path: { slug } },
    body,
  });
  if (error) throw error;
  return data;
}

export async function fetchFolders(slugs: string[]): Promise<FolderOut[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/folders/fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ slugs }),
  });
  if (!res.ok) throw new Error(`fetchFolders failed: ${res.status}`);
  return res.json();
}

export async function deleteFolders(slugs: string[]): Promise<BulkDeleteFolderResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/folders/`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ slugs }),
  });
  if (!res.ok) throw new Error(`deleteFolders failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function moveFolders(
  slugs: string[],
  targetParentSlug: string | null,
): Promise<BulkFolderResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/folders/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ slugs, target_parent_slug: targetParentSlug }),
  });
  if (!res.ok) throw new Error(`moveFolders failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function copyFolders(
  slugs: string[],
  targetParentSlug: string | null,
): Promise<BulkFolderResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/folders/copy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ slugs, target_parent_slug: targetParentSlug }),
  });
  if (!res.ok) throw new Error(`copyFolders failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function uploadFolderIcon(slug: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const apiOrigin = import.meta.env.VITE_API_BASE_URL
    ? new URL(import.meta.env.VITE_API_BASE_URL).origin
    : "";
  const res = await fetch(
    `${apiOrigin}/api/v1/icons/${encodeURIComponent(slug)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: form,
    },
  );
  if (!res.ok) throw new Error("Icon upload failed");
  return res.json();
}
