import { forwardRef } from "react";
import { Search20Regular } from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InputVariant = "text" | "search";

export interface InputProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "prefix"> {
  variant?: InputVariant;
  error?: string;
  /** Node rendered to the left of the input text */
  prefix?: React.ReactNode;
  /** Node rendered to the right of the input text */
  suffix?: React.ReactNode;
  /** Label for the input */
  label?: string;
}

// ── Input ─────────────────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = "text",
      error,
      prefix,
      suffix,
      label,
      id,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const hasError = Boolean(error);
    const resolvedPrefix = variant === "search" ? <Search20Regular /> : prefix;

    return (
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
        {label && (
          <label
            htmlFor={id}
            style={{ font: "var(--tv-type-label)" }}
            className={cn(
              disabled
                ? "text-[var(--tv-text-disabled)]"
                : "text-[var(--tv-text-secondary)]",
            )}
          >
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div
          className={cn(
            "relative flex items-center",
            "rounded-[var(--tv-radius-sm)]",
            "bg-[var(--tv-bg-subtle)]",
            "border",
            "transition-[border-color,box-shadow] duration-[120ms]",
            // Default border
            !hasError && "border-[var(--tv-border-default)]",
            // Error border
            hasError && "border-[var(--tv-error)]",
            // Focus-within: accent border
            !hasError &&
              "focus-within:border-[var(--tv-accent-primary)] focus-within:ring-1 focus-within:ring-[var(--tv-accent-ring)]",
            hasError &&
              "focus-within:ring-1 focus-within:ring-[var(--tv-error)]/20",
            // Disabled
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {/* Prefix / search icon */}
          {resolvedPrefix && (
            <span
              className={cn(
                "flex items-center justify-center pl-2.5",
                "text-[var(--tv-text-secondary)] pointer-events-none",
                "shrink-0",
              )}
              style={{ fontSize: "16px" }}
            >
              {resolvedPrefix}
            </span>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
            className={cn(
              "w-full min-w-0 bg-transparent",
              "outline-none border-none",
              "text-[var(--tv-text-primary)] placeholder:text-[var(--tv-text-disabled)]",
              "py-1.5",
              resolvedPrefix ? "pl-2 pr-2.5" : "px-2.5",
              suffix ? "pr-2" : "",
              "disabled:cursor-not-allowed",
            )}
            style={{ font: "var(--tv-type-body)" }}
            {...rest}
          />

          {/* Suffix */}
          {suffix && (
            <span
              className="flex items-center justify-center pr-2.5 text-[var(--tv-text-secondary)] shrink-0"
              style={{ fontSize: "16px" }}
            >
              {suffix}
            </span>
          )}
        </div>

        {/* Error message */}
        {hasError && (
          <span
            id={`${id}-error`}
            role="alert"
            style={{ font: "var(--tv-type-label-sm)" }}
            className="text-[var(--tv-error)]"
          >
            {error}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
