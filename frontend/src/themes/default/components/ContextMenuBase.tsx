// Shared Radix ContextMenu primitives styled to the TeleVault design system.
// FileContextMenu, FolderContextMenu, and EmptyAreaContextMenu all compose
// from these atoms — never from Radix directly.

import * as CM from "@radix-ui/react-context-menu";
import { cn } from "../../../lib/cn";
import { Badge } from "./Badge";

// ── Re-export trigger + root so consumers don't import from radix directly ───

export const ContextMenuRoot = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

// ── Shared content container ──────────────────────────────────────────────────

export interface ContextMenuContentProps {
  children: React.ReactNode;
}

export function ContextMenuContent({ children }: ContextMenuContentProps) {
  return (
    <CM.Portal>
      <CM.Content
        className={cn(
          "z-50 min-w-[180px] overflow-hidden",
          "rounded-[var(--tv-radius-md)]",
          "bg-[var(--tv-bg-overlay)]",
          "border border-[var(--tv-border-strong)]",
          "shadow-[var(--tv-shadow-md)]",
          "p-1",
          // Radix open/close animations (CSS keyframes in index.css)
          "data-[state=open]:animate-[tv-menu-in_120ms_ease-out]",
          "data-[state=closed]:animate-[tv-menu-out_100ms_ease-in]",
          "origin-[--radix-context-menu-content-transform-origin]",
        )}
        style={{
          backdropFilter: "blur(var(--tv-glass-blur))",
          background: "var(--tv-bg-glass)",
        }}
      >
        {children}
      </CM.Content>
    </CM.Portal>
  );
}

// ── Menu item ─────────────────────────────────────────────────────────────────

export interface ContextMenuItemProps {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  comingSoon?: boolean;
  onSelect?: () => void;
}

export function ContextMenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  danger = false,
  comingSoon = false,
  onSelect,
}: ContextMenuItemProps) {
  const isDisabled = disabled || comingSoon;

  return (
    <CM.Item
      disabled={isDisabled}
      onSelect={onSelect}
      className={cn(
        "relative flex items-center gap-2 px-2 h-8 rounded-[var(--tv-radius-sm)]",
        "cursor-pointer select-none outline-none",
        "transition-colors duration-[80ms]",
        isDisabled
          ? "opacity-40 cursor-not-allowed"
          : danger
            ? "text-[var(--tv-error)] data-[highlighted]:bg-[var(--tv-error-container)]"
            : "text-[var(--tv-text-primary)] data-[highlighted]:bg-[rgba(255,255,255,0.08)]",
      )}
      style={{ font: "var(--tv-type-body-sm)" }}
    >
      {/* Icon slot — 16×16 */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 16, height: 16, color: danger ? "var(--tv-error)" : "var(--tv-text-secondary)" }}
      >
        {icon}
      </span>

      {/* Label */}
      <span className="flex-1 truncate">{label}</span>

      {/* Shortcut or Coming soon badge */}
      {comingSoon ? (
        <Badge variant="coming-soon" className="flex-shrink-0 text-[10px] px-1 py-0">
          Soon
        </Badge>
      ) : shortcut ? (
        <span
          className="flex-shrink-0"
          style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-disabled)" }}
        >
          {shortcut}
        </span>
      ) : null}
    </CM.Item>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────────

export function ContextMenuSeparator() {
  return (
    <CM.Separator
      className="my-1 h-px"
      style={{ background: "var(--tv-border-subtle)" }}
    />
  );
}

// ── Label ─────────────────────────────────────────────────────────────────────

export function ContextMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <CM.Label
      className="px-2 py-1"
      style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-disabled)" }}
    >
      {children}
    </CM.Label>
  );
}
