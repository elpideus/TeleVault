import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

// ── Separator ─────────────────────────────────────────────────────────────────

/**
 * A thin visual divider. Defaults to horizontal.
 * Use orientation="vertical" inside flex rows.
 */
export function Separator({
  orientation = "horizontal",
  className,
}: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-[var(--tv-border-subtle)] shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
    />
  );
}
