import { useEffect, useRef } from "react";
import { createProgressSource } from "../api/progress";
import { useUploadStore } from "../store/uploadStore";

interface ProgressEvent {
  pct: number;
  status?: "done" | "complete" | "error" | "progress";
  message?: string;
}

/**
 * Connects an SSE stream for a given operationId to the uploadStore.
 * Automatically tears down the EventSource on unmount or when the upload
 * reaches a terminal state (complete / error / cancelled).
 */
export function useUploadSSE(operationId: string, token: string) {
  const updateProgress = useUploadStore((s) => s.updateProgress);
  const setStatus = useUploadStore((s) => s.setStatus);
  const uploads = useUploadStore((s) => s.uploads);
  const sourceRef = useRef<EventSource | null>(null);

  const upload = uploads.get(operationId);
  const isTerminal =
    !upload ||
    upload.status === "complete" ||
    upload.status === "error" ||
    upload.status === "cancelled";

  useEffect(() => {
    // Temp placeholder IDs (prefixed "temp-") are used while the file is
    // still being uploaded to the server. The real operation ID isn't known
    // yet, so there's nothing to connect to — skip SSE for these.
    if (!operationId || operationId.startsWith("temp-") || operationId.startsWith("hashing-") || !token || isTerminal) return;

    const source = createProgressSource(operationId, token);
    sourceRef.current = source;

    // Track whether the server sent a terminal event so onerror can
    // distinguish a clean server-side close from a real connection failure.
    let receivedTerminal = false;
    let errorTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as ProgressEvent;
        if (typeof data.pct === "number") {
          updateProgress(operationId, Math.min(100, Math.max(0, data.pct)));
        }
        // Backend sends status "done" on success (not "complete")
        if (data.status === "done" || data.status === "complete") {
          receivedTerminal = true;
          setStatus(operationId, "complete");
          source.close();
        } else if (data.status === "error") {
          receivedTerminal = true;
          setStatus(operationId, "error", data.message ?? "Upload failed");
          source.close();
        }
      } catch {
        // Malformed SSE data — ignore
      }
    };

    // The backend emits plain `data:` frames (no named event type), so
    // onmessage is the real handler. The named listener is kept as a safety net.
    source.addEventListener("progress", handleMessage);
    source.onmessage = handleMessage;

    source.onerror = () => {
      // Some browsers dispatch onerror before flushing buffered message events
      // (e.g. a "done" frame sent in the same TCP segment as the server close).
      // A 150 ms grace window lets any pending onmessage handlers fire first so
      // receivedTerminal is set before we decide this is a real failure.
      // The timeout ID is stored so the cleanup can cancel it — without this,
      // React StrictMode's mount→cleanup→remount cycle causes the old timeout
      // to fire with a stale receivedTerminal=false after the new effect has
      // already received "done", producing a spurious error flash.
      errorTimeoutId = setTimeout(() => {
        if (!receivedTerminal) {
          setStatus(operationId, "error", "Connection lost");
        }
        source.close();
      }, 150);
    };

    return () => {
      if (errorTimeoutId !== null) clearTimeout(errorTimeoutId);
      source.close();
      sourceRef.current = null;
    };
  }, [operationId, token, isTerminal, updateProgress, setStatus]);
}
