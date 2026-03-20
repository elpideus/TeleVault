import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpload24Regular } from "@fluentui/react-icons";
import { springGentle } from "../../../lib/springs";
import { cn } from "../../../lib/cn";
import { Tooltip } from "./Tooltip";

// ── DropZone ──────────────────────────────────────────────────────────────────
// Full-area overlay shown when the user drags desktop files over the app.
// When no channels are configured, the overlay still appears but shows a
// disabled state with an explanatory tooltip.

export interface DropZoneProps {
  /** Whether at least one channel is configured. When false, drop is disabled. */
  hasChannels?: boolean;
  /** Called with the dropped File list when channels are available. */
  onDrop?: (files: File[]) => void;
  /** Called when the internal drag-over state changes. */
  onDragOverChange?: (isOver: boolean) => void;
  children: React.ReactNode;
}

export function DropZone({
  hasChannels = true,
  onDrop,
  onDragOverChange,
  children,
}: DropZoneProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [isDragOver, setIsDragOver] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);

  // Fallback for "Esc" key or other unexpected drag terminations.
  // When a drag ends without a drop/leave, mousemove will fire again.
  useEffect(() => {
    if (!isDragOver) return;

    const handleMouseMove = () => {
      setIsDragOver(false);
      setDragCounter(0);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isDragOver]);

  useEffect(() => {
    onDragOverChange?.(isDragOver);
  }, [isDragOver, onDragOverChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => c + 1);
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter((c) => {
      const next = Math.max(0, c - 1);
      if (next === 0) setIsDragOver(false);
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = hasChannels ? "copy" : "none";
  }, [hasChannels]);

  const handleOverlayDragLeave = useCallback((e: React.DragEvent) => {
    // Since the overlay covers the whole zone and has no pointer-interactive children,
    // leaving it means we've left the dropzone entirely.
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setDragCounter(0);

      if (!hasChannels) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onDrop?.(files);
      }
    },
    [hasChannels, onDrop],
  );

  return (
    <div
      className="relative flex-1 flex flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            key="drop-overlay"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.08, ease: "linear" }}
            className={cn(
              "absolute inset-0 z-50 flex flex-col items-center justify-center gap-4",
            )}
            style={{
              pointerEvents: "auto", // Shield handles all drag events once active
              background: hasChannels
                ? "rgba(59, 130, 246, 0.10)"
                : "rgba(22, 22, 24, 0.80)",
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleOverlayDragLeave}
            onDrop={handleDrop}
          >
            {/* Border inset */}
            <div
              className={cn(
                "absolute inset-3 rounded-[var(--tv-radius-xl)]",
                "border-2 border-dashed pointer-events-none",
                hasChannels
                  ? "border-[var(--tv-accent-primary)]"
                  : "border-[var(--tv-border-default)]",
              )}
            />

            {/* Center badge */}
            <Tooltip
              content="Connect a channel first to upload files"
              side="bottom"
              // Force open when no channels — overlay is pointer-events-none
              // so we render the message inline instead of via tooltip
            >
              <motion.div
                initial={shouldReduceMotion ? false : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springGentle}
                className={cn(
                  "flex flex-col items-center gap-3 pointer-events-none",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-16 h-16 rounded-full",
                    hasChannels
                      ? "bg-[var(--tv-accent-primary)]"
                      : "bg-[var(--tv-bg-overlay)] border border-[var(--tv-border-default)]",
                  )}
                >
                  <ArrowUpload24Regular
                    style={{
                      width: 28,
                      height: 28,
                      color: hasChannels
                        ? "var(--tv-accent-on)"
                        : "var(--tv-text-disabled)",
                    }}
                  />
                </div>

                <div className="flex flex-col items-center gap-1 text-center">
                  <span
                    style={{
                      font: "var(--tv-type-title-lg)",
                      color: hasChannels
                        ? "var(--tv-text-primary)"
                        : "var(--tv-text-secondary)",
                    }}
                  >
                    {hasChannels ? "Drop to upload" : "No channel configured"}
                  </span>
                  {!hasChannels && (
                    <span
                      style={{
                        font: "var(--tv-type-body-sm)",
                        color: "var(--tv-text-secondary)",
                      }}
                    >
                      Connect a Telegram channel in Settings first
                    </span>
                  )}
                </div>
              </motion.div>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
