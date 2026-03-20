import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../../lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TooltipProps {
  /** The tooltip content */
  content: React.ReactNode;
  /** The trigger element — must be able to receive focus */
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  /** Override the global Provider's delayDuration for this specific tooltip */
  delayDuration?: number;
  /** Disable the tooltip */
  disabled?: boolean;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

/**
 * Wraps a Radix UI Tooltip. The TooltipProvider must be present in the
 * component tree (added to Providers in app/providers.tsx).
 */
export function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 6,
  delayDuration,
  disabled = false,
}: TooltipProps) {
  if (disabled) {
    // Render children without tooltip wrapper
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>

      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={sideOffset}
          className={cn(
            // Layout & surface
            "z-50 max-w-xs px-2.5 py-1.5",
            "rounded-[var(--tv-radius-sm)]",
            "bg-[var(--tv-bg-highest)]",
            "border border-[var(--tv-border-default)]",
            "text-[var(--tv-text-primary)]",
            "shadow-[var(--tv-shadow-sm)]",
            "select-none pointer-events-none",
            // Transform origin — animates from Radix computed position
            "origin-[--radix-tooltip-content-transform-origin]",
            // Open animation (CSS keyframes defined in index.css)
            "data-[state=delayed-open]:animate-[tv-tooltip-in_120ms_ease-out]",
            "data-[state=instant-open]:animate-[tv-tooltip-in_120ms_ease-out]",
            // Close animation
            "data-[state=closed]:animate-[tv-tooltip-out_100ms_ease-in]",
          )}
          style={{ font: "var(--tv-type-body-sm)" }}
        >
          {content}
          <TooltipPrimitive.Arrow
            className="fill-[var(--tv-bg-highest)]"
            width={8}
            height={4}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
