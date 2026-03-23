import { create } from "zustand";

export type UploadStatus = "queued" | "hashing" | "upload_queued" | "uploading" | "staged" | "processing" | "complete" | "error" | "cancelled";

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
  location?: string;
  speed?: number; // bytes per second
  lastUpdate?: number; // timestamp
}

interface UploadStore {
  uploads: Map<string, UploadState>;
  // AbortControllers for the XHR (TeleVault upload) phase, keyed by operationId/tempId
  _abortControllers: Map<string, AbortController>;
  addUpload: (upload: UploadState) => void;
  promoteUpload: (tempId: string, realId: string, fileId?: string) => void;
  updateProgress: (operationId: string, progress: number) => void;
  setStatus: (operationId: string, status: UploadStatus, error?: string, isDuplicate?: boolean) => void;
  removeUpload: (operationId: string) => void;
  /** Register an AbortController for the XHR upload phase. */
  registerAbort: (operationId: string, controller: AbortController) => void;
  /** Abort the XHR upload for a single operation (no-op if already done). */
  abortUpload: (operationId: string) => void;
  /** Abort all active XHR uploads. */
  abortAll: () => void;
}

export const useUploadStore = create<UploadStore>()((set, get) => ({
  uploads: new Map(),
  _abortControllers: new Map(),

  addUpload: (upload) => {
    const next = new Map(get().uploads);
    next.set(upload.operationId, {
      ...upload,
      lastUpdate: Date.now(),
      speed: 0,
    });
    set({ uploads: next });
  },

  promoteUpload: (tempId, realId, fileId) => {
    const current = get().uploads;
    const existing = current.get(tempId);
    if (existing) {
      const next = new Map<string, UploadState>();
      for (const [key, value] of current.entries()) {
        if (key === tempId) {
          next.set(realId, { 
            ...existing, 
            operationId: realId, 
            fileId,
            lastUpdate: Date.now(), // Reset timing on promotion
            location: existing.location,
          });
        } else {
          next.set(key, value);
        }
      }
      set({ uploads: next });

      // Move the abort controller to the new key
      const controllers = new Map(get()._abortControllers);
      const ctrl = controllers.get(tempId);
      if (ctrl) {
        controllers.delete(tempId);
        controllers.set(realId, ctrl);
        set({ _abortControllers: controllers });
      }
    }
  },

  updateProgress: (operationId, progress) => {
    const next = new Map(get().uploads);
    const existing = next.get(operationId);
    if (existing) {
      const now = Date.now();
      const lastUpdate = existing.lastUpdate ?? now;
      const deltaTime = (now - lastUpdate) / 1000; // seconds

      let speed = existing.speed ?? 0;

      if (deltaTime >= 0.5) { // Update speed every 500ms
        const deltaProgress = progress - existing.progress;
        if (deltaProgress > 0) {
          const deltaBytes = (deltaProgress / 100) * existing.fileSize;
          const currentSpeed = deltaBytes / deltaTime;
          
          // Smooth the speed
          speed = speed === 0 ? currentSpeed : speed * 0.7 + currentSpeed * 0.3;
        } else if (deltaProgress < 0) {
          // Progress reset (e.g. starting a new phase)
          speed = 0;
        }
        next.set(operationId, { ...existing, progress, speed, lastUpdate: now });
      } else {
        next.set(operationId, { ...existing, progress });
      }
      
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
    // Clean up abort controller too
    const controllers = new Map(get()._abortControllers);
    controllers.delete(operationId);
    set({ _abortControllers: controllers });
  },

  registerAbort: (operationId, controller) => {
    const controllers = new Map(get()._abortControllers);
    controllers.set(operationId, controller);
    set({ _abortControllers: controllers });
  },

  abortUpload: (operationId) => {
    const controllers = get()._abortControllers;
    const ctrl = controllers.get(operationId);
    if (ctrl && !ctrl.signal.aborted) {
      ctrl.abort();
    }
  },

  abortAll: () => {
    const controllers = get()._abortControllers;
    for (const ctrl of controllers.values()) {
      if (!ctrl.signal.aborted) ctrl.abort();
    }
  },
}));
