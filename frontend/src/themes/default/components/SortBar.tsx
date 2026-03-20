import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp12Regular, ArrowDown12Regular } from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import { springSnappy } from "../../../lib/springs";
import type { SortField, SortDirection } from "../../../store/uiStore";

// ── SortBar ───────────────────────────────────────────────────────────────────

export interface SortBarProps {
  field: SortField;
  direction: SortDirection;
  onChange: (field: SortField, direction: SortDirection) => void;
  className?: string;
}

const FIELDS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "date", label: "Date" },
  { field: "size", label: "Size" },
];

export function SortBar({ field, direction, onChange, className }: SortBarProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  function handleFieldClick(f: SortField) {
    if (f === field) {
      // Toggle direction
      onChange(f, direction === "asc" ? "desc" : "asc");
    } else {
      // Switch field, reset to asc
      onChange(f, "asc");
    }
  }

  const Arrow = direction === "asc" ? ArrowUp12Regular : ArrowDown12Regular;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label="Sort options"
    >
      <span
        style={{
          font: "var(--tv-type-label-sm)",
          color: "var(--tv-text-disabled)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginRight: 4,
        }}
      >
        Sort:
      </span>

      {FIELDS.map(({ field: f, label }) => {
        const isActive = field === f;
        return (
          <motion.button
            key={f}
            type="button"
            onClick={() => handleFieldClick(f)}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
            transition={springSnappy}
            className={cn(
              "relative flex items-center gap-1 px-2 h-7",
              "rounded-[var(--tv-radius-xs)] border-0 cursor-pointer",
              "transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]",
              isActive
                ? "bg-[var(--tv-accent-container)] text-[var(--tv-accent-on-container)]"
                : "bg-transparent text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)] hover:bg-[rgba(255,255,255,0.06)]",
            )}
            style={{ font: "var(--tv-type-body-sm)" }}
            aria-pressed={isActive}
          >
            {label}
            {isActive && (
              <Arrow
                style={{ width: 10, height: 10, flexShrink: 0 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
