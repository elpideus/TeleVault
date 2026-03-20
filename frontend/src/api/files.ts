import { apiClient, getBaseUrl } from "./client";
import { queryClient } from "../app/providers";
import { storageKeys } from "./storage";
import { useAuthStore } from "../store/authStore";
import type { BulkDeleteFileResult, BulkFileResult, FileOut } from "./schema";

export const fileKeys = {
  all: ["files"] as const,
  list: () => [...fileKeys.all, "list"] as const,
  byFolder: (slug: string) => [...fileKeys.all, "folder", slug] as const,
  byId: (id: string) => [...fileKeys.all, id] as const,
};

function getToken(): string {
  return useAuthStore.getState().accessToken ?? "";
}

export async function listFiles(folderSlug?: string, page = 1, pageSize = 50) {
  const { data, error } = await apiClient.GET("/api/v1/files/", {
    params: {
      query: { folder_slug: folderSlug, page, page_size: pageSize },
    },
  });
  if (error) throw error;
  return data;
}

export async function fetchFiles(ids: string[]): Promise<FileOut[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/files/fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`fetchFiles failed: ${res.status}`);
  return res.json();
}

export async function deleteFiles(ids: string[]): Promise<BulkDeleteFileResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/files/`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`deleteFiles failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function moveFiles(
  ids: string[],
  targetFolderSlug: string | null,
): Promise<BulkFileResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/files/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ ids, target_folder_slug: targetFolderSlug }),
  });
  if (!res.ok) throw new Error(`moveFiles failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function copyFiles(
  ids: string[],
  targetFolderSlug: string | null,
): Promise<BulkFileResult> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/files/copy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ ids, target_folder_slug: targetFolderSlug }),
  });
  if (!res.ok) throw new Error(`copyFiles failed: ${res.status}`);
  const data = await res.json();
  queryClient.invalidateQueries({ queryKey: storageKeys.stats() });
  return data;
}

export async function updateFile(fileId: string, data: { name?: string | null }) {
  const { data: updated, error } = await apiClient.PATCH("/api/v1/files/{file_id}", {
    params: { path: { file_id: fileId } },
    body: data,
  });
  if (error) throw error;
  return updated;
}

export async function uploadFile(
  file: File,
  folderSlug: string | null,
  onProgress?: (operationId: string) => void,
  onHashProgress?: (progress: number) => void,
) {
  const token = getToken();
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v1/files/upload`;

  // 1. Compute Hash via Worker
  const hash = await new Promise<string>((resolve, reject) => {
    const worker = new Worker('/hash-worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        onHashProgress?.(data.value * 100);
      } else if (data.type === 'done') {
        worker.terminate();
        resolve(data.hash);
      } else if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Worker error processing file hash"));
    };
    worker.postMessage(file);
  });

  const form = new FormData();
  form.append("file", file);
  form.append("filename", file.name);
  if (folderSlug) {
    form.append("folder_slug", folderSlug);
  }
  form.append("file_hash", hash);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let errMsg = "Upload failed";
    try {
      const errBody = await res.json();
      errMsg = errBody.detail?.message || errBody.detail || JSON.stringify(errBody);
    } catch {
      errMsg = await res.text();
    }
    throw new Error(`Upload failed: ${res.status} ${errMsg}`);
  }
  const data = await res.json() as { operation_id: string };
  onProgress?.(data.operation_id);
  return data;
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const baseUrl = getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/v1/files/${fileId}/download`,
    { headers: { Authorization: `Bearer ${getToken()}` } },
  );
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}
