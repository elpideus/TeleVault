import { ClockRegular } from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "coming-soon";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

// ── Variant styles ────────────────────────────────────────────────────────────

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--tv-bg-overlay)] text-[var(--tv-text-secondary)] border-[var(--tv-border-default)]",
  success:
    "bg-[var(--tv-success-container)] text-[var(--tv-success)] border-transparent",
  warning:
    "bg-[var(--tv-warning-container)] text-[var(--tv-warning)] border-transparent",
  error:
    "bg-[var(--tv-error-container)] text-[var(--tv-error)] border-transparent",
  info:
    "bg-[var(--tv-info-container)] text-[var(--tv-info)] border-transparent",
  "coming-soon":
    "bg-[var(--tv-bg-overlay)] text-[var(--tv-text-disabled)] border-[var(--tv-border-subtle)]",
};

// ── Badge ─────────────────────────────────────────────────────────────────────

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        "px-2 py-0.5",
        "rounded-[var(--tv-radius-xs)]",
        "border",
        "select-none whitespace-nowrap shrink-0",
        variantStyles[variant],
        className,
      )}
      style={{ font: "var(--tv-type-label)" }}
    >
      {variant === "coming-soon" && (
        <ClockRegular
          style={{ fontSize: "11px", flexShrink: 0 }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
