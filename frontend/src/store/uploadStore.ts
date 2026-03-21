import { create } from "zustand";

export type UploadStatus = "queued" | "hashing" | "uploading" | "processing" | "complete" | "error" | "cancelled";

export interface UploadState {
  id: string; // Stable key for React UI
  operationId: string;
  fileId?: string; // Real file ID from backend (set after XHR upload)
  fileName: string;
  fileSize: number;
  progress: number; // 0–100
  status: UploadStatus;
  error?: string;
  folderId?: string;
  isDuplicate?: boolean;
}

interface UploadStore {
  uploads: Map<string, UploadState>;
  addUpload: (upload: UploadState) => void;
  promoteUpload: (tempId: string, realId: string, fileId?: string) => void;
  updateProgress: (operationId: string, progress: number) => void;
  setStatus: (operationId: string, status: UploadStatus, error?: string, isDuplicate?: boolean) => void;
  removeUpload: (operationId: string) => void;
}

export const useUploadStore = create<UploadStore>()((set, get) => ({
  uploads: new Map(),
  addUpload: (upload) => {
    const next = new Map(get().uploads);
    next.set(upload.operationId, upload);
    set({ uploads: next });
  },
  promoteUpload: (tempId, realId, fileId) => {
    const current = get().uploads;
    const existing = current.get(tempId);
    if (existing) {
      const next = new Map<string, UploadState>();
      for (const [key, value] of current.entries()) {
        if (key === tempId) {
          next.set(realId, { ...existing, operationId: realId, fileId });
        } else {
          next.set(key, value);
        }
      }
      set({ uploads: next });
    }
  },
  updateProgress: (operationId, progress) => {
    const next = new Map(get().uploads);
    const existing = next.get(operationId);
    if (existing) {
      next.set(operationId, { ...existing, progress });
      set({ uploads: next });
    }
  },
  setStatus: (operationId, status, error, isDuplicate) => {
    const next = new Map(get().uploads);
    const existing = next.get(operationId);
    if (existing) {
      next.set(operationId, { ...existing, status, error, isDuplicate });
      set({ uploads: next });
    }
  },
  removeUpload: (operationId) => {
    const next = new Map(get().uploads);
    next.delete(operationId);
    set({ uploads: next });
  },
}));
