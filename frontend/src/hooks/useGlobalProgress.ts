import { useEffect, useRef } from "react";
import { createProgressSource } from "../api/progress";
import { useUploadStore } from "../store/uploadStore";
import { useQueryClient } from "@tanstack/react-query";
import { fileKeys } from "../api/files";
import { toast } from "../lib/toast";

interface ProgressEvent {
  operation_id: string;
  pct: number;
  status?: "done" | "complete" | "error" | "progress" | "ping";
  message?: string;
}

export function useGlobalProgress(token: string | null) {
  const updateProgress = useUploadStore((s) => s.updateProgress);
  const setStatus = useUploadStore((s) => s.setStatus);
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;

    let stopped = false;
    let retryDelay = 1000;
    const MAX_RETRY_DELAY = 16_000;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;

      const source = createProgressSource("", token);
      sourceRef.current = source;

      const handleMessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as ProgressEvent;
          const opId = data.operation_id;
          if (!opId) return; // ping event

          const current = useUploadStore.getState().uploads.get(opId);
          if (!current) return;

          if (typeof data.pct === "number") {
            if (current.status === "staged") {
              setStatus(opId, "processing");
            }
            // Only update progress if the backend sent a reasonable value, 
            // and we rely on 'done' purely for completion.
            updateProgress(opId, Math.min(100, Math.max(0, data.pct)));
          }

          if (data.status === "done" || data.status === "complete") {
            setStatus(opId, "complete");
            void queryClient.invalidateQueries({ queryKey: fileKeys.all });
            toast.success(`Uploaded ${current.fileName}`);
            retryDelay = 1000;
          } else if (data.status === "error") {
            setStatus(opId, "error", data.message ?? "Upload failed");
            toast.error(`Failed to upload ${current.fileName}: ${data.message ?? "Unknown error"}`);
            retryDelay = 1000;
          }
        } catch {
          // malformed or ignored
        }
      };

      source.addEventListener("progress", handleMessage);
      source.onmessage = handleMessage;

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        if (stopped) return;
        
        retryTimeoutId = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimeoutId !== null) clearTimeout(retryTimeoutId);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [token, updateProgress, setStatus, queryClient]);
}
