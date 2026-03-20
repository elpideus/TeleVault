import { forwardRef, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/cn";
import { springSnappy } from "../../../lib/springs";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "onChange"> {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked = false,
      indeterminate = false,
      onChange,
      disabled = false,
      label,
      id,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const internalRef = useRef<HTMLInputElement>(null);

    // Merge the forwarded ref with our internal ref
    const setRef = (node: HTMLInputElement | null) => {
      // Update internal ref
      (internalRef as React.MutableRefObject<HTMLInputElement | null>).current =
        node;
      // Forward
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (
          forwardedRef as React.MutableRefObject<HTMLInputElement | null>
        ).current = node;
      }
    };

    // Set indeterminate state imperatively (can't be set via HTML)
    useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const isActive = checked || indeterminate;

    return (
      <label
        {...props}
        className={cn(
          "inline-flex items-center gap-2 select-none",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
          className,
        )}
      >
        {/* Hidden native checkbox (for accessibility + form semantics) */}
        <input
          ref={setRef}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate ? "mixed" : checked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="sr-only"
        />

        {/* Custom visual checkbox */}
        <motion.span
          aria-hidden="true"
          className={cn(
            "relative inline-flex items-center justify-center shrink-0",
            "w-4 h-4 rounded-[var(--tv-radius-xs)]",
            "border transition-[background-color,border-color] duration-[120ms]",
            // Unchecked state
            !isActive &&
              "bg-transparent border-[var(--tv-border-strong)]",
            // Checked/indeterminate state
            isActive &&
              "bg-[var(--tv-accent-primary)] border-[var(--tv-accent-primary)]",
          )}
          animate={
            shouldReduceMotion
              ? undefined
              : { scale: isActive ? 1 : 1 }
          }
          whileTap={
            disabled || shouldReduceMotion
              ? undefined
              : { scale: 0.88 }
          }
          transition={springSnappy}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
          >
            {/* Checkmark — animated pathLength */}
            <motion.path
              d="M1.5 5L4 7.5L8.5 2.5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: checked && !indeterminate ? 1 : 0,
                opacity: checked && !indeterminate ? 1 : 0,
              }}
              transition={
                shouldReduceMotion ? { duration: 0 } : springSnappy
              }
            />
            {/* Indeterminate dash — animated pathLength */}
            <motion.path
              d="M2 5H8"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: indeterminate ? 1 : 0,
                opacity: indeterminate ? 1 : 0,
              }}
              transition={
                shouldReduceMotion ? { duration: 0 } : springSnappy
              }
            />
          </svg>
        </motion.span>

        {/* Optional label */}
        {label && (
          <span
            style={{ font: "var(--tv-type-body)" }}
            className="text-[var(--tv-text-primary)]"
          >
            {label}
          </span>
        )}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
