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
  /** Allow interaction with tooltip content */
  interactive?: boolean;
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
  interactive = false,
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
            "z-50 max-w-xs px-3 py-2",
            "rounded-[var(--tv-radius-md)]",
            "border border-[var(--tv-border-strong)]",
            "text-[var(--tv-text-primary)]",
            "shadow-[var(--tv-shadow-md)]",
            "select-none",
            !interactive && "pointer-events-none",
            "overflow-hidden",
            // Transform origin — animates from Radix computed position
            "origin-[--radix-tooltip-content-transform-origin]",
            // Open animation (CSS keyframes defined in index.css)
            "data-[state=delayed-open]:animate-[tv-tooltip-in_120ms_ease-out]",
            "data-[state=instant-open]:animate-[tv-tooltip-in_120ms_ease-out]",
            // Close animation
            "data-[state=closed]:animate-[tv-tooltip-out_100ms_ease-in]",
          )}
          style={{
            font: "var(--tv-type-body-sm)",
            backdropFilter: "blur(var(--tv-glass-blur))",
            background: "var(--tv-bg-glass)",
          }}
        >
          {content}
          <TooltipPrimitive.Arrow
            className="fill-[var(--tv-border-strong)]"
            width={10}
            height={5}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
