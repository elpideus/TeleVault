import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

// ── Kbd ───────────────────────────────────────────────────────────────────────

/**
 * Keyboard shortcut pill. Renders a styled <kbd> element.
 * Commonly used to display key combos like "Ctrl+K" or single keys like "F2".
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center",
        "px-1.5 py-0.5 min-w-[20px]",
        "rounded-[var(--tv-radius-xs)]",
        "bg-[var(--tv-bg-subtle)]",
        "border border-[var(--tv-border-strong)]",
        "text-[var(--tv-text-secondary)]",
        "select-none",
        className,
      )}
      style={{ font: "var(--tv-type-mono)" }}
    >
      {children}
    </kbd>
  );
}
