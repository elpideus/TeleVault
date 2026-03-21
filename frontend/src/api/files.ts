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
  onProgress?: (operationId: string, fileId: string) => void,
  onHashProgress?: (progress: number) => void,
  onUploadProgress?: (progress: number) => void,
) {
  const token = getToken();
  const baseUrl = getBaseUrl();

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

  // 2. Pre-check for duplicate before uploading the full file
  const checkRes = await fetch(`${baseUrl}/api/v1/files/check-hash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ file_hash: hash }),
  });

  if (checkRes.status === 409) {
    try {
      const errBody = await checkRes.json();
      if (errBody.detail?.error === "DUPLICATE_FILE" && errBody.detail?.detail?.file_id) {
        // Already exists — fake a success response and return immediately
        const fileId = errBody.detail.detail.file_id;
        onUploadProgress?.(100);
        onProgress?.("ALREADY_EXISTS", fileId);
        return { operation_id: "ALREADY_EXISTS", file_id: fileId };
      }
    } catch { /* fallback to error below */ }
  }

  if (!checkRes.ok) {
    let errMsg = "Duplicate check failed";
    try {
      const raw = await checkRes.text();
      try {
        const errBody = JSON.parse(raw);
        errMsg = errBody.detail?.message || errBody.detail || JSON.stringify(errBody);
      } catch {
        errMsg = raw;
      }
    } catch { /* ignore */ }
    throw new Error(`Upload failed: ${checkRes.status} ${errMsg}`);
  }

  // 3. Choose upload strategy: direct (small) or chunked (large)
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks for better granularity
  const USE_CHUNKING = file.size > 50 * 1024 * 1024; // Use chunks for files > 50MB

  if (USE_CHUNKING) {
    // --- CHUNKED UPLOAD PATH ---
    const doAuthXhr = (
      url: string, 
      options: { 
        method: string; 
        headers?: Record<string, string>; 
        body?: any; 
        onProgress?: (loaded: number, total: number) => void 
      }
    ) => new Promise<{ status: number; body: string }>(async (resolve, reject) => {
      const initialToken = getToken();
      const firstTry = await new Promise<{ status: number; body: string }>((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method, url);
        xhr.setRequestHeader("Authorization", `Bearer ${initialToken}`);
        if (options.headers) {
          for (const [k, v] of Object.entries(options.headers)) {
            xhr.setRequestHeader(k, v);
          }
        }
        if (options.onProgress && xhr.upload) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) options.onProgress?.(e.loaded, e.total);
          };
        }
        xhr.onload = () => res({ status: xhr.status, body: xhr.responseText });
        xhr.onerror = () => rej(new Error("Network error"));
        xhr.send(options.body);
      });

      if (firstTry.status === 401) {
        const { refreshToken, setTokens, logout } = useAuthStore.getState();
        if (refreshToken) {
          try {
            const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (refreshRes.ok) {
              const { access_token, refresh_token } = await refreshRes.json();
              setTokens(access_token, refresh_token);
              // Retry with new token
              const secondXhr = new XMLHttpRequest();
              secondXhr.open(options.method, url);
              secondXhr.setRequestHeader("Authorization", `Bearer ${access_token}`);
              if (options.headers) {
                for (const [k, v] of Object.entries(options.headers)) {
                  secondXhr.setRequestHeader(k, v);
                }
              }
              if (options.onProgress && secondXhr.upload) {
                secondXhr.upload.onprogress = (e) => {
                  if (e.lengthComputable) options.onProgress?.(e.loaded, e.total);
                };
              }
              secondXhr.onload = () => resolve({ status: secondXhr.status, body: secondXhr.responseText });
              secondXhr.onerror = () => reject(new Error("Network error"));
              secondXhr.send(options.body);
              return;
            }
          } catch { /* login below */ }
        }
        logout();
        reject(new Error("Session expired"));
      } else {
        resolve(firstTry);
      }
    });

    const initRes = await doAuthXhr(`${baseUrl}/api/v1/files/upload/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        file_hash: hash,
        total_size: file.size,
        mime_type: file.type,
        folder_slug: folderSlug,
      }),
    });
    if (initRes.status !== 200) throw new Error(`Chunk initialization failed: ${initRes.status}`);
    const { upload_id } = JSON.parse(initRes.body);

    let totalUploadedPreviousChunks = 0;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const chunkRes = await doAuthXhr(`${baseUrl}/api/v1/files/upload/chunk/${upload_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
          onProgress: (loaded) => {
            const currentTotalUploaded = totalUploadedPreviousChunks + loaded;
            onUploadProgress?.(Math.round((currentTotalUploaded / file.size) * 100));
          }
        });

        if (chunkRes.status !== 204) throw new Error(`Chunk ${i} upload failed: ${chunkRes.status}`);
        totalUploadedPreviousChunks += chunk.size;
    }

    const finalizeRes = await doAuthXhr(`${baseUrl}/api/v1/files/upload/finalize/${upload_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        file_hash: hash,
        total_size: file.size,
        mime_type: file.type,
        folder_slug: folderSlug,
      }),
    });

    if (finalizeRes.status < 200 || finalizeRes.status >= 300) throw new Error(`Finalization failed: ${finalizeRes.status}`);
    const data = JSON.parse(finalizeRes.body);
    onProgress?.(data.operation_id, data.file_id);
    return data;
  }

  // --- DIRECT UPLOAD PATH (Legacy/Small files) ---
  const form = new FormData();
  form.append("file", file);
  form.append("filename", file.name);
  if (folderSlug) {
    form.append("folder_slug", folderSlug);
  }
  form.append("file_hash", hash);

  const doXhr = (authToken: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl}/api/v1/files/upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onUploadProgress?.(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));

      xhr.send(form);
    });

  let xhrResult = await doXhr(token);

  // If the token expired during the (potentially very long) upload, refresh and retry once.
  if (xhrResult.status === 401) {
    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const { access_token, refresh_token } = (await refreshRes.json()) as {
            access_token: string;
            refresh_token: string;
          };
          setTokens(access_token, refresh_token);
          xhrResult = await doXhr(access_token);
        }
      } catch {
        // If refresh fails, fall through to the error below
      }
    }
    if (xhrResult.status === 401) {
      logout();
      throw new Error("Upload failed: session expired");
    }
  }

  const data = await ((): { operation_id: string; file_id: string } => {
    if (xhrResult.status >= 200 && xhrResult.status < 300) {
      try {
        return JSON.parse(xhrResult.body);
      } catch {
        throw new Error("Invalid response from server");
      }
    } else {
      let errMsg = "Upload failed";
      try {
        const errBody = JSON.parse(xhrResult.body);
        errMsg = errBody.detail?.message || errBody.detail || JSON.stringify(errBody);
      } catch {
        errMsg = xhrResult.body || errMsg;
      }
      throw new Error(`Upload failed: ${xhrResult.status} ${errMsg}`);
    }
  })();

  onProgress?.(data.operation_id, data.file_id);
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
