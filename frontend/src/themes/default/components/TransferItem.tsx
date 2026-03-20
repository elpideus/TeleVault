import { useEffect, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Dismiss16Regular,
  CheckmarkCircle20Filled,
  ErrorCircle20Filled,
  DismissCircle20Filled,
  ArrowUpload20Regular,
} from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../../../lib/cn";
import { springFluid, springSnappy, exitTransition } from "../../../lib/springs";
import type { UploadState } from "../../../store/uploadStore";
import { formatBytes } from "../../../lib/formatBytes";
import { fileKeys } from "../../../api/files";
import { useUploadSSE } from "../../../hooks/useUploadSSE";
import { useAuthStore } from "../../../store/authStore";

export interface TransferItemProps {
  upload: UploadState;
  onCancel?: (operationId: string) => void;
  onRemove?: (operationId: string) => void;
}

const STATUS_ICON_MAP = {
  uploading: null,
  complete: (
    <CheckmarkCircle20Filled
      style={{ color: "var(--tv-success)", flexShrink: 0 }}
    />
  ),
  error: (
    <ErrorCircle20Filled
      style={{ color: "var(--tv-error)", flexShrink: 0 }}
    />
  ),
  cancelled: (
    <DismissCircle20Filled
      style={{ color: "var(--tv-text-disabled)", flexShrink: 0 }}
    />
  ),
};

export function TransferItem({ upload, onCancel, onRemove }: TransferItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const { operationId, fileName, fileSize, progress, status, error } = upload;

  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.accessToken) ?? "";
  const prevStatus = useRef<string>(upload.status);

  // Connect to SSE for progress updates
  useUploadSSE(operationId, token);

  useEffect(() => {
    if (prevStatus.current !== "complete" && upload.status === "complete") {
      // Invalidate the specific folder's file list when upload completes
      void queryClient.invalidateQueries({
        queryKey: fileKeys.byFolder(upload.folderId ?? ""),
      });
    }
    prevStatus.current = upload.status;
  }, [upload.status, upload.folderId, queryClient]);

  const isTerminal =
    status === "complete" || status === "error" || status === "cancelled";

  const progressTransition = shouldReduceMotion
    ? { duration: 0 }
    : { ...springFluid };

  return (
    <motion.div
      layout
      initial={
        shouldReduceMotion
          ? { opacity: 1 }
          : { opacity: 0, y: 8, scale: 0.98 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        shouldReduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.97, y: -4 }
      }
      transition={shouldReduceMotion ? { duration: 0 } : { ...exitTransition }}
      className={cn(
        "relative flex flex-col gap-1.5 px-3 py-2.5 rounded-[var(--tv-radius-md)] overflow-hidden",
        "border border-[var(--tv-border-subtle)]",
        "bg-[var(--tv-bg-overlay)]",
        "flex-shrink-0",
      )}
    >
      {/* ── State layer ─────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none rounded-[var(--tv-radius-md)]"
        style={{
          background:
            status === "error"
              ? "var(--tv-error-container)"
              : status === "complete"
                ? "var(--tv-success-container)"
                : "transparent",
          opacity: 0.5,
        }}
      />

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2 min-w-0">
        {/* Leading icon */}
        <div className="flex-shrink-0 text-[var(--tv-text-secondary)]">
          {status === "uploading" || status === "hashing" ? (
            <ArrowUpload20Regular style={{ color: "var(--tv-accent-primary)" }} />
          ) : (
            STATUS_ICON_MAP[status as keyof typeof STATUS_ICON_MAP]
          )}
        </div>

        {/* Name + size */}
        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{
              font: "var(--tv-type-body)",
              color: "var(--tv-text-primary)",
            }}
          >
            {fileName}
          </p>
          <p
            style={{
              font: "var(--tv-type-label-sm)",
              color: "var(--tv-text-secondary)",
              marginTop: 1,
            }}
          >
            {formatBytes(fileSize)}
            {status === "hashing" && (
              <span style={{ color: "var(--tv-accent-primary)", marginLeft: 6 }}>
                Hashing {Math.round(progress)}%
              </span>
            )}
            {status === "uploading" && (
              <span style={{ color: "var(--tv-accent-primary)", marginLeft: 6 }}>
                {Math.round(progress)}%
              </span>
            )}
            {status === "error" && error && (
              <span
                style={{ color: "var(--tv-error)", marginLeft: 6 }}
                className="truncate block"
              >
                {error}
              </span>
            )}
          </p>
        </div>

        {/* Action button */}
        <AnimatePresence mode="wait">
          {!isTerminal && onCancel && (
            <motion.button
              key="cancel"
              initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.7 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { ...springSnappy }
              }
              onClick={() => onCancel(operationId)}
              aria-label="Cancel upload"
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-[var(--tv-radius-xs)]",
                "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
                "transition-colors duration-[var(--tv-duration-fast)]",
                "flex-shrink-0",
              )}
              style={{ position: "relative" }}
            >
              <Dismiss16Regular />
            </motion.button>
          )}
          {isTerminal && onRemove && (
            <motion.button
              key="remove"
              initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.7 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { ...springSnappy }
              }
              onClick={() => onRemove(operationId)}
              aria-label="Dismiss"
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-[var(--tv-radius-xs)]",
                "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
                "transition-colors duration-[var(--tv-duration-fast)]",
                "flex-shrink-0",
              )}
            >
              <Dismiss16Regular />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(status === "uploading" || status === "hashing") && (
          <motion.div
            key="progress-track"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
            className="relative w-full h-1 rounded-full overflow-hidden"
            style={{ background: "var(--tv-bg-subtle)" }}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: "var(--tv-accent-primary)", width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={progressTransition}
            />
          </motion.div>
        )}
        {status === "complete" && (
          <motion.div
            key="progress-complete"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
            className="w-full h-1 rounded-full"
            style={{ background: "var(--tv-success)" }}
          />
        )}
        {status === "error" && (
          <motion.div
            key="progress-error"
            initial={shouldReduceMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? {} : { opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
            className="w-full h-1 rounded-full"
            style={{ background: "var(--tv-error)" }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
