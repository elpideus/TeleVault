import { useEffect, useRef } from "react";
import { createProgressSource } from "../api/progress";
import { useUploadStore } from "../store/uploadStore";
import { useAuthStore } from "../store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { fileKeys, fetchFiles } from "../api/files";
import { getBaseUrl } from "../api/client";
import { toast } from "../lib/toast";

interface ProgressEvent {
  operation_id: string;
  pct: number;
  status?: "done" | "complete" | "error" | "progress" | "ping" | "cancelled";
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

    /**
     * After SSE reconnects, query the DB status for any uploads that are still
     * stuck in "processing" or "staged" state in the frontend store. This
     * recovers "done" / "error" events that were emitted while SSE was down.
     */
    const reconcileProcessingUploads = async () => {
      const uploads = useUploadStore.getState().uploads;
      const inFlight = Array.from(uploads.values()).filter(
        (u) =>
          (u.status === "processing" || u.status === "staged") && u.fileId,
      );
      if (inFlight.length === 0) return;

      try {
        const files = await fetchFiles(inFlight.map((u) => u.fileId!));
        for (const file of files) {
          const fileIdStr = file.id.toString();
          const upload = inFlight.find((u) => u.fileId === fileIdStr);
          if (!upload) continue;

          if (file.status === "complete") {
            setStatus(upload.operationId, "complete");
            void queryClient.invalidateQueries({ queryKey: fileKeys.all });
            toast.success(`Uploaded ${upload.fileName}`);
          } else if (file.status === "failed") {
            setStatus(upload.operationId, "error", "Upload failed");
            toast.error(`Failed to upload ${upload.fileName}`);
          }
        }
      } catch {
        // Reconciliation is best-effort; ignore errors
      }
    };

    const connect = () => {
      if (stopped) return;

      // Always read the most current token — it may have been refreshed since
      // the effect was set up or since the last reconnect.
      const currentToken = useAuthStore.getState().accessToken;
      if (!currentToken) return;

      const source = createProgressSource("", currentToken);
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
            updateProgress(opId, Math.min(100, Math.max(0, data.pct)));
          }

          if (data.status === "done" || data.status === "complete") {
            setStatus(opId, "complete");
            void queryClient.invalidateQueries({ queryKey: fileKeys.all });
            toast.success(`Uploaded ${current.fileName}`);
            retryDelay = 1000;
          } else if (data.status === "error") {
            setStatus(opId, "error", data.message ?? "Upload failed");
            toast.error(
              `Failed to upload ${current.fileName}: ${data.message ?? "Unknown error"}`,
            );
            retryDelay = 1000;
          } else if (data.status === "cancelled") {
            setStatus(opId, "cancelled");
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

          void (async () => {
            // Proactively refresh the token before reconnecting. If the SSE
            // dropped because the access token expired, the reconnect would
            // fail silently with a 401 that never appears in the browser
            // console — this prevents that cycle.
            const { refreshToken, setTokens, logout } =
              useAuthStore.getState();
            if (refreshToken) {
              try {
                const res = await fetch(
                  `${getBaseUrl()}/api/v1/auth/refresh`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                  },
                );
                if (res.ok) {
                  const { access_token, refresh_token } = await res.json();
                  setTokens(access_token, refresh_token);
                } else if (res.status === 401) {
                  logout();
                  return;
                }
              } catch {
                /* fall through — connect() will use the existing token */
              }
            }

            connect();

            // Reconcile any uploads that may have finished while SSE was down.
            void reconcileProcessingUploads();
          })();
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
