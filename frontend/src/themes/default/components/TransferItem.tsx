import { useEffect, useRef } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Dismiss16Regular,
  CheckmarkCircle20Filled,
  ErrorCircle20Filled,
  DismissCircle20Filled,
  ArrowUpload20Regular,
  Clock20Regular,
} from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../../../lib/cn";
import { springFluid, springSnappy, exitTransition } from "../../../lib/springs";
import type { UploadState } from "../../../store/uploadStore";
import { formatBytes } from "../../../lib/formatBytes";
import { fileKeys } from "../../../api/files";

export interface TransferItemProps {
  upload: UploadState;
  onCancel?: (operationId: string) => void;
  onRemove?: (operationId: string) => void;
}

import { Tooltip } from "./Tooltip";

export function TransferItem({ upload, onCancel, onRemove }: TransferItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const { operationId, fileName, fileSize, progress, status, error, speed } = upload;

  const queryClient = useQueryClient();
  const prevStatus = useRef<string>(upload.status);

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

  const isActive =
    status === "uploading" || status === "processing" || status === "hashing";

  const progressTransition = shouldReduceMotion
    ? { duration: 0 }
    : { ...springFluid };

  // ── Tooltip Content ────────────────────────────────────────────────────────
  const remainingBytes = fileSize * (1 - progress / 100);
  const etaSeconds = speed && speed > 0 ? remainingBytes / speed : null;
  
  const formatETA = (seconds: number) => {
    if (seconds > 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (seconds > 60) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}m ${s}s`;
    }
    return `${Math.floor(seconds)}s`;
  };

  const tooltipContent = (
    <div className="flex flex-col gap-1">
      <div className="font-semibold truncate max-w-[200px]">{fileName}</div>
      <div className="flex flex-col text-[var(--tv-text-secondary)]">
        {speed && speed > 0 && (
          <div className="flex justify-between gap-4">
            <span>Speed</span>
            <span className="text-[var(--tv-text-primary)]">{formatBytes(speed)}/s</span>
          </div>
        )}
        {!isTerminal && progress < 100 && (
          <div className="flex justify-between gap-4">
            <span>Remaining</span>
            <span className="text-[var(--tv-text-primary)]">{formatBytes(remainingBytes)}</span>
          </div>
        )}
        {etaSeconds !== null && etaSeconds > 0 && !isTerminal && (
          <div className="flex justify-between gap-4">
            <span>ETA</span>
            <span className="text-[var(--tv-text-primary)]">{formatETA(etaSeconds)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span>Status</span>
          <span className="text-[var(--tv-text-primary)] capitalize">{status.replace("_", " ")}</span>
        </div>
      </div>
    </div>
  );

  // Leading icon
  const leadingIcon = (() => {
    if (status === "complete")
      return <CheckmarkCircle20Filled style={{ color: "var(--tv-success)", flexShrink: 0 }} />;
    if (status === "error")
      return <ErrorCircle20Filled style={{ color: "var(--tv-error)", flexShrink: 0 }} />;
    if (status === "cancelled")
      return <DismissCircle20Filled style={{ color: "var(--tv-text-disabled)", flexShrink: 0 }} />;
    if (status === "staged")
      return <Clock20Regular style={{ color: "var(--tv-accent-primary)", flexShrink: 0 }} />;
    if (status === "queued" || status === "upload_queued")
      return <ArrowUpload20Regular style={{ color: "var(--tv-text-disabled)", flexShrink: 0 }} />;
    // hashing / uploading / processing
    return <ArrowUpload20Regular style={{ color: "var(--tv-accent-primary)", flexShrink: 0 }} />;
  })();

  // Status label
  const statusLabel = (() => {
    if (status === "queued")
      return <span style={{ color: "var(--tv-text-disabled)", marginLeft: 6 }}>Queued</span>;
    if (status === "upload_queued")
      return <span style={{ color: "var(--tv-text-disabled)", marginLeft: 6 }}>Queued (TeleVault)</span>;
    if (status === "hashing")
      return <span style={{ color: "var(--tv-accent-primary)", marginLeft: 6 }}>Hashing {Math.round(progress)}%</span>;
    if (status === "uploading")
      return <span style={{ color: "var(--tv-accent-primary)", marginLeft: 6 }}>Uploading (TeleVault)... {Math.round(progress)}%</span>;
    if (status === "staged")
      return <span style={{ color: "var(--tv-text-secondary)", marginLeft: 6 }}>Queued (Telegram)</span>;
    if (status === "processing")
      return <span style={{ color: "var(--tv-accent-primary)", marginLeft: 6 }}>Uploading (Telegram)... {Math.round(progress)}%</span>;
    if (status === "error" && error)
      return <span style={{ color: "var(--tv-error)", marginLeft: 6 }} className="truncate block">{error}</span>;
    if (upload.isDuplicate)
      return <span style={{ color: "var(--tv-text-secondary)", marginLeft: 6 }}>(Already in Vault)</span>;
    return null;
  })();

  return (
    <Tooltip content={tooltipContent} side="left" sideOffset={12}>
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
            {leadingIcon}
          </div>

          {/* Name + size + status */}
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
              {statusLabel}
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
          {(isActive || status === "queued" || status === "upload_queued") && (
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
                style={{
                  background: (status === "queued" || status === "upload_queued") ? "var(--tv-text-disabled)" : "var(--tv-accent-primary)",
                }}
                animate={{ width: (status === "queued" || status === "upload_queued") ? "0%" : `${progress}%` }}
                transition={progressTransition}
              />
            </motion.div>
          )}

          {/* Staged: full bar at 100% with a gentle pulse to indicate "ready, waiting" */}
          {status === "staged" && (
            <motion.div
              key="progress-staged"
              initial={shouldReduceMotion ? {} : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduceMotion ? {} : { opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
              className="relative w-full h-1 rounded-full overflow-hidden"
              style={{ background: "var(--tv-bg-subtle)" }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 right-0 rounded-full"
                style={{ background: "var(--tv-accent-subtle-border)" }}
                animate={shouldReduceMotion ? {} : { opacity: [0.5, 1, 0.5] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
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
    </Tooltip>
  );
}

