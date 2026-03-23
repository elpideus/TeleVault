import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowUpload20Regular,
  ArrowDownload20Regular,
  ChevronDown16Regular,
} from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { springStandard, springGentle, exitTransition } from "../../../lib/springs";
import { useUploadStore, type UploadState } from "../../../store/uploadStore";
import { TransferItem } from "./TransferItem";
import { ConfirmModal } from "./ConfirmModal";
import { cancelUpload, cancelAllUploads } from "../../../api/files";

// ── TransfersTrayToggle ─────────────────────────────────────────────────────

export interface TransfersTrayToggleProps {
  activeCount: number;
  onClick: () => void;
}

export function TransfersTrayToggle({
  activeCount,
  onClick,
}: TransfersTrayToggleProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      onClick={onClick}
      initial={shouldReduceMotion ? {} : { y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={shouldReduceMotion ? {} : { y: 80, opacity: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...springStandard }}
      whileHover={shouldReduceMotion ? {} : { scale: 1.04 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.96 }}
      className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-[var(--tv-radius-lg)]",
        "border border-[var(--tv-border-default)]",
        "shadow-[var(--tv-shadow-md)]",
        "cursor-pointer",
      )}
      style={{ background: "var(--tv-bg-glass)", backdropFilter: "blur(var(--tv-glass-blur))" }}
      aria-label={`Show transfers — ${activeCount} active`}
    >
      <div className="flex -space-x-1.5 translate-y-[1px]">
        <ArrowUpload20Regular style={{ color: "var(--tv-accent-primary)" }} />
        <ArrowDownload20Regular style={{ color: "var(--tv-accent-primary)" }} />
      </div>
      <span
        style={{
          font: "var(--tv-type-body)",
          color: "var(--tv-text-primary)",
        }}
      >
        Transfers
      </span>

      {/* Active count badge */}
      <AnimatePresence>
        {activeCount > 0 && (
          <motion.span
            key="badge"
            initial={shouldReduceMotion ? {} : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={shouldReduceMotion ? {} : { scale: 0, opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...springStandard }}
            className="flex items-center justify-center w-5 h-5 rounded-full text-center"
            style={{
              background: "var(--tv-accent-primary)",
              color: "var(--tv-accent-on)",
              font: "var(--tv-type-label-sm)",
              lineHeight: 1,
            }}
          >
            {activeCount > 9 ? "9+" : activeCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── TransfersTray ───────────────────────────────────────────────────────────

export interface TransfersTrayProps {
  /** When true the tray is shown from outside (e.g. a toolbar button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override for storybook / preview — provide uploads directly. */
  mockUploads?: UploadState[];
}

export function TransfersTray({
  open: controlledOpen,
  onOpenChange,
  mockUploads,
}: TransfersTrayProps) {
  const shouldReduceMotion = useReducedMotion();

  // Uncontrolled open state
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const storeUploads = useUploadStore((s) => s.uploads);
  const removeUpload = useUploadStore((s) => s.removeUpload);
  const setStatus = useUploadStore((s) => s.setStatus);
  const abortUpload = useUploadStore((s) => s.abortUpload);
  const abortAllUploads = useUploadStore((s) => s.abortAll);

  // States for confirmation modals
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelAllConfirm, setCancelAllConfirm] = useState(false);

  // Merge mock (preview) with real uploads
  const uploadsMap: Map<string, UploadState> = mockUploads
    ? new Map(mockUploads.map((u) => [u.operationId, u]))
    : storeUploads;

  const uploads = Array.from(uploadsMap.values());

  // "Remaining" = anything not yet at a terminal state (excludes error/cancelled too,
  // as those no longer need action from the user).
  const remainingCount = uploads.filter(
    (u) => u.status !== "complete" && u.status !== "error" && u.status !== "cancelled",
  ).length;
  const hasUploads = uploads.length > 0;

  // Terminal = fully settled: complete, error, or cancelled.
  const terminalCount = uploads.filter(
    (u) => u.status === "complete" || u.status === "error" || u.status === "cancelled",
  ).length;

  // Auto-open the tray whenever a new active upload begins
  const prevRemainingCount = useRef(0);
  useEffect(() => {
    if (remainingCount > 0 && prevRemainingCount.current === 0) {
      if (!isControlled) setUncontrolledOpen(true);
      else onOpenChange?.(true);
    }
    prevRemainingCount.current = remainingCount;
  }, [remainingCount, isControlled, onOpenChange]);

  // Auto-close when everything is cleared
  useEffect(() => {
    if (!hasUploads && isOpen) {
      if (!isControlled) setUncontrolledOpen(false);
      else onOpenChange?.(false);
    }
  }, [hasUploads, isOpen, isControlled, onOpenChange]);

  const handleCancelClick = (operationId: string) => {
    setCancelConfirmId(operationId);
  };

  const confirmCancel = async () => {
    if (!cancelConfirmId) return;
    const opId = cancelConfirmId;
    setCancelConfirmId(null);

    // Optimistically update UI
    setStatus(opId, "cancelled");
    
    // Abort active XHR (TeleVault) phase if any
    abortUpload(opId);
    
    // Call backend to cancel (Telegram) phase if any
    cancelUpload(opId).catch((err) => {
      console.error(`Failed to trigger backend cancel for ${opId}:`, err);
    });
  };

  const confirmCancelAll = async () => {
    setCancelAllConfirm(false);

    // Filter to active uploads
    const active = uploads.filter(
      (u) => u.status !== "complete" && u.status !== "error" && u.status !== "cancelled"
    );

    // Optimistically cancel all active ones locally
    active.forEach(u => setStatus(u.operationId, "cancelled"));

    // Abort XHR uploads
    abortAllUploads();

    // Call backend
    cancelAllUploads().catch((err) => {
      console.error("Failed to cancel all uploads via backend:", err);
    });
  };

  const handleRemove = (operationId: string) => {
    removeUpload(operationId);
  };

  // Only clear truly finished items (complete, error, cancelled).
  const handleClearAll = () => {
    uploads
      .filter((u) => u.status === "complete" || u.status === "error" || u.status === "cancelled")
      .forEach((u) => removeUpload(u.operationId));
  };

  // ── Resizing ──────────────────────────────────────────────────────────────

  const [height, setHeight] = useState<number>(() => Math.round(window.innerHeight * 0.4));
  const [isResizing, setIsResizing] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Use offsetHeight as the baseline when it's larger than the stored
    // height (e.g. during the entrance animation before the first resize).
    const el = trayRef.current;
    const resolvedHeight = Math.max(height, el?.offsetHeight ?? 0, 140);

    setHeight(resolvedHeight);
    setIsResizing(true);
    startY.current = e.clientY;
    startHeight.current = resolvedHeight;
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY.current - e.clientY;
      // Max height should be up to the breadcrumbs bar with 16px spacing (~166px from top)
      const maxAvailableHeight = Math.max(200, window.innerHeight - 166);
      const newHeight = Math.min(
        Math.max(140, startHeight.current + delta),
        maxAvailableHeight,
      );
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Sort: errors first → active (processing/staged/uploading/hashing) → queued → complete → cancelled
  const sortedUploads = [...uploads].sort((a, b) => {
    const priority: Record<string, number> = {
      error: 0,
      processing: 1,
      staged: 1,
      uploading: 1,
      upload_queued: 1,
      hashing: 1,
      queued: 2,
      complete: 3,
      cancelled: 4,
    };
    const pA = priority[a.status] ?? 9;
    const pB = priority[b.status] ?? 9;
    if (pA !== pB) return pA - pB;
    // Within "complete": non-duplicates before duplicates
    if (a.status === "complete" && b.status === "complete") {
      if (a.isDuplicate && !b.isDuplicate) return 1;
      if (!a.isDuplicate && b.isDuplicate) return -1;
    }
    // Stable tie-breaker: newest first
    return b.createdAt - a.createdAt;
  });

  return (
    // Fixed container — bottom-right, above everything
    <div
      className="fixed bottom-4 right-4 flex flex-col items-end gap-2"
      style={{ zIndex: 200 }}
    >
      <AnimatePresence mode="sync">
        {/* ── Expanded tray ────────────────────────────────────────────── */}
        {isOpen && (
          <motion.div
            ref={trayRef}
            key="tray"
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { y: 80, opacity: 0, scale: 0.97 }
            }
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
              height: isOpen ? height : 0,
              minHeight: isOpen ? 140 : 0,
            }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { y: 80, opacity: 0, scale: 0.97 }
            }
            transition={
              isResizing
                ? { duration: 0 }
                : shouldReduceMotion
                  ? { duration: 0 }
                  : isOpen
                    ? { ...springGentle }
                    : { ...exitTransition }
            }
            className={cn(
              "relative flex flex-col rounded-[var(--tv-radius-lg)] min-h-0",
              "border border-[var(--tv-border-default)]",
              "shadow-[var(--tv-shadow-lg)]",
              "overflow-hidden",
              isResizing && "select-none",
            )}
            style={{
              width: 320,
              background: "var(--tv-bg-glass)",
              backdropFilter: "blur(var(--tv-glass-blur))",
            }}
          >
            {/* Resize Handle */}
            <div
              onMouseDown={handleMouseDown}
              className={cn(
                "absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-50",
                "hover:bg-[var(--tv-accent-primary)]/20 transition-colors duration-200",
                isResizing && "bg-[var(--tv-accent-primary)]/30",
              )}
            />
            {/* Header */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--tv-border-subtle)" }}
            >
              <div className="flex -space-x-1 flex-shrink-0">
                <ArrowUpload20Regular
                  style={{ color: "var(--tv-accent-primary)", width: 18, height: 18 }}
                />
                <ArrowDownload20Regular
                  style={{ color: "var(--tv-accent-primary)", width: 18, height: 18 }}
                />
              </div>
              <span
                className="flex-1"
                style={{
                  font: "var(--tv-type-title-sm)",
                  color: "var(--tv-text-primary)",
                }}
              >
                Transfers
                {remainingCount > 0 && (
                  <span
                    style={{
                      font: "var(--tv-type-label-sm)",
                      color: "var(--tv-text-secondary)",
                      marginLeft: 6,
                    }}
                  >
                    {remainingCount} remaining
                  </span>
                )}
              </span>

              <AnimatePresence>
                {remainingCount > 0 && (
                  <motion.button
                    key="cancel-all"
                    initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.8 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
                    onClick={() => setCancelAllConfirm(true)}
                    style={{
                      font: "var(--tv-type-label-sm)",
                      color: "var(--tv-error-strong)",
                      padding: "2px 6px",
                      borderRadius: "var(--tv-radius-xs)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    className="hover:bg-[var(--tv-error-container)] transition-colors duration-[var(--tv-duration-fast)]"
                  >
                    Cancel {remainingCount}
                  </motion.button>
                )}
                {terminalCount > 0 && (
                  <motion.button
                    key="clear"
                    initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.8 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
                    onClick={handleClearAll}
                    style={{
                      font: "var(--tv-type-label-sm)",
                      color: "var(--tv-text-secondary)",
                      padding: "2px 6px",
                      borderRadius: "var(--tv-radius-xs)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    className="hover:text-[var(--tv-text-primary)] transition-colors duration-[var(--tv-duration-fast)]"
                  >
                    Clear
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Collapse */}
              <button
                onClick={toggle}
                aria-label="Collapse transfers"
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-[var(--tv-radius-xs)]",
                  "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
                  "transition-colors duration-[var(--tv-duration-fast)]",
                  "border-none bg-transparent cursor-pointer",
                )}
              >
                <ChevronDown16Regular />
              </button>
            </div>

            {/* Upload list */}
            <div
              className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5"
              style={{ minHeight: 0 }}
            >
              <AnimatePresence initial={false}>
                {hasUploads ? (
                  sortedUploads.map((upload) => (
                    <TransferItem
                      key={upload.id}
                      upload={upload}
                      onCancel={handleCancelClick}
                      onRemove={handleRemove}
                    />
                  ))
                ) : (
                  <motion.div
                    key="empty"
                    initial={shouldReduceMotion ? {} : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={shouldReduceMotion ? {} : { opacity: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
                    className="flex flex-col items-center justify-center py-8 gap-2"
                  >
                    <div className="flex -space-x-2 opacity-50">
                      <ArrowUpload20Regular
                        style={{ color: "var(--tv-text-disabled)", width: 32, height: 32 }}
                      />
                      <ArrowDownload20Regular
                        style={{ color: "var(--tv-text-disabled)", width: 32, height: 32 }}
                      />
                    </div>
                    <span
                      style={{
                        font: "var(--tv-type-body-sm)",
                        color: "var(--tv-text-disabled)",
                      }}
                    >
                      No transfers
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggle pill ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {isOpen ? (
          // When open, show a small close/collapse pill instead
          <motion.button
            key="collapse-pill"
            onClick={toggle}
            initial={shouldReduceMotion ? {} : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={shouldReduceMotion ? {} : { y: 80, opacity: 0 }}
            transition={
              shouldReduceMotion ? { duration: 0 } : { ...springStandard }
            }
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--tv-radius-full)] flex-shrink-0",
              "border border-[var(--tv-border-default)]",
              "shadow-[var(--tv-shadow-sm)]",
              "cursor-pointer",
              "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
              "transition-colors duration-[var(--tv-duration-fast)]",
            )}
            style={{
              background: "var(--tv-bg-glass)",
              backdropFilter: "blur(var(--tv-glass-blur))",
              border: "none",
            }}
            aria-label="Collapse transfers"
          >
            <ChevronDown16Regular style={{ width: 14, height: 14 }} />
            <span style={{ font: "var(--tv-type-label-sm)" }}>Collapse</span>
          </motion.button>
        ) : hasUploads ? (
          <TransfersTrayToggle
            key="toggle"
            activeCount={remainingCount}
            onClick={toggle}
          />
        ) : null}
      </AnimatePresence>

      <ConfirmModal
        open={cancelConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setCancelConfirmId(null);
        }}
        title="Cancel transfer"
        description="Are you sure you want to cancel this transfer? The file will not be uploaded."
        confirmLabel="Cancel Transfer"
        danger={true}
        onConfirm={confirmCancel}
      />

      <ConfirmModal
        open={cancelAllConfirm}
        onOpenChange={setCancelAllConfirm}
        title="Cancel all transfers"
        description={`Are you sure you want to cancel all ${remainingCount} active transfers? They will not be uploaded.`}
        confirmLabel="Cancel All Transfers"
        danger={true}
        onConfirm={confirmCancelAll}
      />
    </div>
  );
}
