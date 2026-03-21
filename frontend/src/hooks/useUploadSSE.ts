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
 * Provides UI progress updates while the upload tray is open.
 * Uses exponential backoff on connection errors to handle transient failures
 * (e.g. ERR_QUIC_PROTOCOL_ERROR) without immediately erroring the upload.
 *
 * NOTE: The upload queue in FileExplorer manages its own SSE connection for
 * completion detection, so this hook is for UI progress display only and
 * must NOT set status to "error" on transient connection failures.
 */
export function useUploadSSE(operationId: string, token: string) {
  const updateProgress = useUploadStore((s) => s.updateProgress);
  const setStatus = useUploadStore((s) => s.setStatus);
  const uploads = useUploadStore((s) => s.uploads);
  const sourceRef = useRef<EventSource | null>(null);

  const upload = uploads.get(operationId);
  // "staged" is intentionally NOT terminal — SSE must connect so we can
  // detect when the Telegram worker picks up the job and transition to "processing".
  const isTerminal =
    !upload ||
    upload.status === "queued" ||
    upload.status === "hashing" ||
    upload.status === "complete" ||
    upload.status === "error" ||
    upload.status === "cancelled";

  useEffect(() => {
    // Temp placeholder IDs are used while the file is still being uploaded
    // to the server. The real operation ID isn't known yet.
    if (
      !operationId ||
      operationId.startsWith("temp-") ||
      operationId.startsWith("hashing-") ||
      operationId.startsWith("upload-") ||
      !token ||
      isTerminal
    ) return;

    let stopped = false;
    let retryDelay = 1000;
    const MAX_RETRY_DELAY = 16_000;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let receivedTerminal = false;

    const connect = () => {
      if (stopped) return;

      const source = createProgressSource(operationId, token);
      sourceRef.current = source;

      const handleMessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as ProgressEvent;
          if (typeof data.pct === "number") {
            // Transition "staged" → "processing" the moment Telegram sends its first event.
            const current = useUploadStore.getState().uploads.get(operationId);
            if (current?.status === "staged") {
              setStatus(operationId, "processing");
            }
            updateProgress(operationId, Math.min(100, Math.max(0, data.pct)));
          }
          // Backend sends status "done" on success (not "complete")
          if (data.status === "done" || data.status === "complete") {
            receivedTerminal = true;
            retryDelay = 1000; // reset on success
            setStatus(operationId, "complete");
            source.close();
          } else if (data.status === "error") {
            receivedTerminal = true;
            retryDelay = 1000;
            setStatus(operationId, "error", data.message ?? "Upload failed");
            source.close();
          }
        } catch {
          // Malformed SSE data — ignore
        }
      };

      source.addEventListener("progress", handleMessage);
      source.onmessage = handleMessage;

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        if (stopped || receivedTerminal) return;
        // Retry with exponential backoff instead of immediately failing.
        // This handles transient QUIC errors and proxy reconnects gracefully.
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
  }, [operationId, token, isTerminal, updateProgress, setStatus]);
}
