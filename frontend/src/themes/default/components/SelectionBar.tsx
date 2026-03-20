import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Delete20Regular,
  ArrowMove20Regular,
  Copy20Regular,
  ArrowDownload20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import { springStandard, exitTransition } from "../../../lib/springs";
import { Tooltip } from "./Tooltip";
import { Badge } from "./Badge";
import { cn } from "../../../lib/cn";

// ── SelectionBar ──────────────────────────────────────────────────────────────
// Appears (slides up) when one or more items are selected.
// All batch action buttons are disabled in v1 — API does not support them yet.

export interface SelectionBarProps {
  count: number;
  onClearSelection: () => void;
  onDownload?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  downloadDisabledReason?: string;
}

export function SelectionBar({
  count,
  onClearSelection,
  onDownload,
  onMove,
  onCopy,
  onDelete,
  downloadDisabledReason,
}: SelectionBarProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const isVisible = count > 0;

  const actions = [
    {
      icon: ArrowDownload20Regular,
      label: "Download selected",
      onClick: onDownload,
      disabled: !!downloadDisabledReason,
      disabledTooltip: downloadDisabledReason,
    },
    { icon: ArrowMove20Regular, label: "Move selected", onClick: onMove, disabled: false, disabledTooltip: undefined },
    { icon: Copy20Regular, label: "Copy selected", onClick: onCopy, disabled: false, disabledTooltip: undefined },
    { icon: Delete20Regular, label: "Delete selected", onClick: onDelete, disabled: false, disabledTooltip: undefined },
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="selection-bar"
          initial={
            shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 16, transition: exitTransition }
          }
          transition={springStandard}
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 z-30",
            "flex items-center gap-2 px-4 h-12",
            "rounded-[var(--tv-radius-lg)]",
            "border border-[var(--tv-border-strong)]",
            "shadow-[var(--tv-shadow-md)]",
          )}
          style={{
            background: "var(--tv-bg-overlay)",
            backdropFilter: "blur(var(--tv-glass-blur))",
          }}
        >
          {/* Count badge */}
          <Badge variant="info">
            {count} selected
          </Badge>

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--tv-border-default)",
              flexShrink: 0,
            }}
          />

          {/* Batch actions */}
          {actions.map(({ icon: Icon, label, onClick, disabled, disabledTooltip }) => (
            <Tooltip
              key={label}
              content={disabled && disabledTooltip ? disabledTooltip : label}
              side="top"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                aria-label={label}
                className={cn(
                  "flex items-center justify-center w-8 h-8",
                  "rounded-[var(--tv-radius-sm)] border-0",
                  disabled
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-[rgba(255,255,255,0.06)]",
                  "bg-transparent transition-colors duration-[120ms]",
                )}
              >
                <Icon
                  style={{
                    width: 18,
                    height: 18,
                    color: disabled
                      ? "var(--tv-text-secondary)"
                      : "var(--tv-text-primary)",
                  }}
                />
              </button>
            </Tooltip>
          ))}

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--tv-border-default)",
              flexShrink: 0,
            }}
          />

          {/* Clear selection */}
          <Tooltip content="Clear selection" side="top">
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Clear selection"
              className={cn(
                "flex items-center justify-center w-8 h-8",
                "rounded-[var(--tv-radius-sm)] border-0 cursor-pointer",
                "bg-transparent text-[var(--tv-text-secondary)]",
                "transition-colors duration-[120ms]",
                "hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]",
              )}
            >
              <Dismiss20Regular style={{ width: 18, height: 18 }} />
            </button>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
